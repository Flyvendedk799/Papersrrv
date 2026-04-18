#!/usr/bin/env python3
"""
Restore uncommitted files from Claude Code session JSONL logs.

Scans all session logs under ~/.claude/projects/-Users-tobiasmastek/, extracts
every Write and Edit tool operation targeting the paperclip repo, sorts them
chronologically across sessions, and replays them to reconstruct the final
state of every file.

For files that were modified (Edit-only, no Write), we try the tool_result of
an earlier Read as the baseline; if no Read is available in the logs, we fall
back to `git show HEAD:<path>` as the baseline.

Writes files into a staging directory (NOT the repo directly) so a human can
review before moving them in.
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

SESSIONS_DIR = Path("/Users/tobiasmastek/.claude/projects/-Users-tobiasmastek")
REPO = Path("/Users/tobiasmastek/paperclip")
STAGING = Path("/tmp/paperclip_restore")
PATH_PREFIX = str(REPO) + "/"


def iter_events():
    """Yield (timestamp, session_id, tool_use|tool_result) dicts."""
    for jsonl in sorted(SESSIONS_DIR.glob("*.jsonl")):
        session = jsonl.stem
        with jsonl.open() as f:
            for lineno, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ts = obj.get("timestamp") or obj.get("ts") or ""
                msg = obj.get("message") or {}
                content = msg.get("content")
                if not isinstance(content, list):
                    continue
                for item in content:
                    if not isinstance(item, dict):
                        continue
                    t = item.get("type")
                    if t == "tool_use":
                        yield ts, session, item, "use"
                    elif t == "tool_result":
                        yield ts, session, item, "result"


def collect_ops() -> List[Dict]:
    """
    Returns a sorted list of ops. Each op is a dict:
      { ts, kind: "write"|"edit"|"read", path, content?, old?, new?, replace_all?, tool_id }
    For 'read', content is the unprefixed file text (we strip line numbers).
    """
    # Map tool_use_id -> (tool_name, input, ts, session)
    pending_use: Dict[str, Tuple[str, dict, str, str]] = {}
    ops: List[Dict] = []

    for ts, session, item, kind in iter_events():
        if kind == "use":
            name = item.get("name") or ""
            tid = item.get("id") or ""
            if name not in ("Write", "Edit", "Read"):
                continue
            pending_use[tid] = (name, item.get("input") or {}, ts, session)

            if name == "Write":
                inp = item.get("input") or {}
                path = inp.get("file_path") or ""
                if path.startswith(PATH_PREFIX):
                    ops.append({
                        "ts": ts,
                        "kind": "write",
                        "path": path[len(PATH_PREFIX):],
                        "content": inp.get("content") or "",
                        "tool_id": tid,
                        "session": session,
                    })
            elif name == "Edit":
                inp = item.get("input") or {}
                path = inp.get("file_path") or ""
                if path.startswith(PATH_PREFIX):
                    ops.append({
                        "ts": ts,
                        "kind": "edit",
                        "path": path[len(PATH_PREFIX):],
                        "old": inp.get("old_string") or "",
                        "new": inp.get("new_string") or "",
                        "replace_all": bool(inp.get("replace_all")),
                        "tool_id": tid,
                        "session": session,
                    })
        elif kind == "result":
            # Pair with tool_use to learn what file it was
            tid = item.get("tool_use_id") or ""
            use = pending_use.get(tid)
            if not use:
                continue
            name, inp, use_ts, use_session = use
            if name != "Read":
                continue
            path = inp.get("file_path") or ""
            if not path.startswith(PATH_PREFIX):
                continue
            result_content = item.get("content")
            # Result content can be a list of blocks or a string
            text = ""
            if isinstance(result_content, str):
                text = result_content
            elif isinstance(result_content, list):
                for block in result_content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text += block.get("text") or ""
            # The Read tool returns "cat -n" formatted output:
            #      1\tline one
            #      2\tline two
            # Strip the line-number prefix back off.
            stripped = strip_cat_n(text)
            ops.append({
                "ts": use_ts,
                "kind": "read",
                "path": path[len(PATH_PREFIX):],
                "content": stripped,
                "tool_id": tid,
                "session": use_session,
            })
    ops.sort(key=lambda o: (o["ts"], o["tool_id"]))
    return ops


def strip_cat_n(text: str) -> str:
    """
    Convert the Read tool's cat -n output back to raw file content.

    Lines look like '   123\\tcontent' — we strip the leading whitespace + number + tab.
    We also drop the optional "<system-reminder>...</system-reminder>" block.
    """
    # Remove trailing system-reminder block if present
    sr = text.find("<system-reminder>")
    if sr != -1:
        # Step back past any newline
        text = text[:sr].rstrip() + "\n"
    out_lines = []
    for ln in text.split("\n"):
        # Expected prefix: optional spaces, digits, tab
        i = 0
        # skip leading spaces
        while i < len(ln) and ln[i] == " ":
            i += 1
        j = i
        while j < len(ln) and ln[j].isdigit():
            j += 1
        if j > i and j < len(ln) and ln[j] == "\t":
            out_lines.append(ln[j + 1:])
        elif ln == "" and not out_lines:
            # Skip leading blank line
            continue
        else:
            # Line doesn't match the pattern — likely post-body marker or blank
            out_lines.append(ln)
    # Join preserving newlines but drop a single trailing empty
    joined = "\n".join(out_lines)
    if joined.endswith("\n"):
        joined = joined[:-1]
    return joined


def git_show_head(rel_path: str) -> Optional[str]:
    """Return the content of rel_path as of git HEAD, or None if not tracked."""
    try:
        out = subprocess.run(
            ["git", "-C", str(REPO), "show", f"HEAD:{rel_path}"],
            capture_output=True, text=True, check=False,
        )
        if out.returncode == 0:
            return out.stdout
    except Exception:
        pass
    return None


def replay(ops: List[Dict]) -> Dict[str, str]:
    """Return final content for each file that had at least one Write or Edit.

    Baseline choice for an Edit-only file:
      Read results in the logs are often PARTIAL chunks (limit/offset), not full
      file content, so using them as baseline produces broken output. We instead
      prefer `git show HEAD:path` when it's available, falling back to the
      longest Read result only if git has no copy.
    """
    files: Dict[str, str] = {}
    # Track ALL Read results per path (we'll pick the longest as baseline).
    reads_all: Dict[str, List[str]] = {}
    # Track whether the reconstruction of a file is clean (all edits applied).
    clean: Dict[str, bool] = {}

    for op in ops:
        path = op["path"]
        if op["kind"] == "read":
            reads_all.setdefault(path, []).append(op["content"])
            continue
        if op["kind"] == "write":
            files[path] = op["content"]
            clean[path] = True
            continue
        if op["kind"] == "edit":
            base = files.get(path)
            if base is None:
                # Prefer git HEAD (most likely authoritative for tracked files).
                base = git_show_head(path)
                if base is None:
                    # Fall back to the longest Read we saw.
                    cands = reads_all.get(path) or []
                    base = max(cands, key=len) if cands else None
                if base is None:
                    op["_skipped"] = "no baseline"
                    continue
                files[path] = base
                clean[path] = True
            old = op["old"]
            new = op["new"]
            replace_all = op["replace_all"]
            if replace_all:
                if old in files[path]:
                    files[path] = files[path].replace(old, new)
                else:
                    op["_skipped"] = "old_string not found (replace_all)"
                    clean[path] = False
            else:
                count = files[path].count(old)
                if count == 0:
                    op["_skipped"] = "old_string not found"
                    clean[path] = False
                elif count > 1:
                    op["_skipped"] = f"old_string not unique ({count} matches)"
                    clean[path] = False
                    # Fall back to first occurrence (matches tool's behavior when unique)
                    files[path] = files[path].replace(old, new, 1)
                else:
                    files[path] = files[path].replace(old, new, 1)
    # Attach 'clean' flag to files dict via side-channel for main()
    files["__clean__"] = clean  # type: ignore
    return files


def main() -> int:
    print(f"Scanning {SESSIONS_DIR} ...", flush=True)
    ops = collect_ops()
    print(f"Collected {len(ops)} operations across all sessions", flush=True)

    writes = sum(1 for o in ops if o["kind"] == "write")
    edits = sum(1 for o in ops if o["kind"] == "edit")
    reads = sum(1 for o in ops if o["kind"] == "read")
    print(f"  writes={writes}  edits={edits}  reads={reads}", flush=True)

    files = replay(ops)
    print(f"Reconstructed {len(files)} files", flush=True)

    skipped = [o for o in ops if o.get("_skipped")]
    if skipped:
        print(f"Skipped {len(skipped)} edits (baseline/match failures)")
        # Group by reason
        reasons: Dict[str, int] = {}
        for o in skipped:
            r = o["_skipped"]
            reasons[r] = reasons.get(r, 0) + 1
        for r, n in sorted(reasons.items(), key=lambda x: -x[1]):
            print(f"  {n:>4}  {r}")

    # Pull out the clean map we stashed in the files dict.
    clean_flags = files.pop("__clean__", {})

    # Write to staging, skipping:
    # - paths identical to git HEAD (no change needed)
    # - paths where reconstruction was not clean (broken by failed Edits) —
    #   these are safer left to the user to handle manually
    STAGING.mkdir(parents=True, exist_ok=True)
    written_count = 0
    identical_count = 0
    dirty_count = 0
    dirty_paths: List[str] = []
    for rel, content in files.items():
        head = git_show_head(rel)
        if head is not None and head == content:
            identical_count += 1
            continue
        if not clean_flags.get(rel, True):
            dirty_count += 1
            dirty_paths.append(rel)
            continue
        dest = STAGING / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content)
        written_count += 1

    print(f"Staged {written_count} files (skipped {identical_count} identical-to-HEAD, "
          f"skipped {dirty_count} dirty reconstructions) in {STAGING}")
    if dirty_paths:
        print("Dirty paths (needs manual recovery):")
        for p in sorted(dirty_paths):
            print(f"  {p}")

    manifest = STAGING / "_MANIFEST.txt"
    manifest.write_text("\n".join(sorted(files.keys())) + "\n")
    dirty_manifest = STAGING / "_DIRTY_MANIFEST.txt"
    dirty_manifest.write_text("\n".join(sorted(dirty_paths)) + "\n")
    print(f"Manifest: {manifest}")
    print(f"Dirty manifest: {dirty_manifest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
