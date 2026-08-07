# Cursor-Backed Inference Gateway

**Goal:** run a service on a VPS that speaks the OpenAI / Anthropic HTTP API, but
is backed by the Cursor CLI and a Cursor subscription — so web apps can point at
it instead of `api.openai.com` and cut inference spend.

**Status:** design / feasibility. Nothing built yet.

> **Sourcing caveat.** The Cursor-side facts below come from third-party
> summaries and search results. `cursor.com` was unreachable from the machine
> this was written on (egress proxy block), so none of it was read from Cursor's
> own docs or terms. Everything marked **[VERIFY]** must be confirmed against
> primary sources before committing to this design. The claims about *this
> repo's* code were read directly and are reliable.

---

## 1. The economics — read this first

This is the whole project. If this section doesn't hold, nothing else matters.

Cursor moved to **usage-based credit pools priced at roughly upstream API
rates**. Each paid plan includes a credit pool equal to its price:

| Plan  | Cost      | Included credits |
| ----- | --------- | ---------------- |
| Pro   | $20/mo    | $20              |
| Pro+  | $70/mo    | $70              |
| Ultra | $200/mo   | $400             |

At face value that kills the idea: paying $20 to get $20 of inference at API
rates saves nothing.

**Except for one thing — `auto` mode.** Reportedly, usage through Cursor's
`auto` model routing is **unlimited and does not draw from the credit pool**.
Named models (`opus-4.6`, `gpt-5.3-codex`, `sonnet-4.6`) bill at full API rate.

So the entire business case reduces to:

> **Run everything on `--model auto`, or there are no savings.**

**[VERIFY]** — this is the load-bearing claim in the whole document:

- Is `auto` genuinely uncapped, or is there an undocumented fair-use ceiling?
- Does sustained programmatic (non-IDE) traffic count as acceptable use?
- Does `auto` remain uncapped on the cheapest paid tier?

### Gotcha already present in this repo

The adapter and the runners disagree on the default model:

- `packages/adapters/cursor-local/src/index.ts:3` → `DEFAULT_CURSOR_LOCAL_MODEL = "auto"` ✅
- `scripts/local-runner.mjs:157` → `cursor: "composer-1.5"` ⚠️
- `scripts/local-runner-macos.mjs:117` → `cursor: "composer-1.5"` ⚠️

If `composer-1.5` is billed as a named model, the runner path silently burns
credits while the adapter path doesn't. **[VERIFY]** whether Cursor's own
Composer models draw from the pool. Pin `auto` explicitly either way.

### Sanity check before building

`auto` gives you no control over which model answers. For a lot of webapp AI
work — classify, summarize, extract, rewrite — a small cheap model on a normal
API is already inexpensive, and a coding-agent harness burns extra tokens on
its system prompt and tool loop. Price your actual monthly volume against a
small-model API first. If today's bill is under ~$20/mo, a Cursor subscription
plus a VPS costs *more*, and this project is a net loss.

Build this when the bill is real and `auto`-quality output is good enough.

---

## 2. Don't build the HTTP layer — it exists

`github.com/anyrobert/cursor-api-proxy` already does the core job:

- `/v1/chat/completions` — OpenAI shape
- `/v1/messages` — Anthropic shape
- `/v1/responses` — with semantic SSE
- `/v1/models`, `/health`
- `stream: true` on all completion endpoints, incremental SSE deltas
- Bearer auth via `CURSOR_BRIDGE_API_KEY`
- Defaults to `127.0.0.1:8765`
- Runs the CLI in an **isolated temp workspace** by default
  (`CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE=true`), so no repo or filesystem is
  attached

That last default matters — see §5.

**Its stated limitation is precisely the gap you predicted:** it does not
attach a repo, host a shell, or emit native tool calls. Tools are the caller's
problem — you implement them client-side and feed results back as follow-up
messages.

> ⚠️ **Audit before deploying.** This is a third-party project that will hold
> your Cursor credentials. Read the source, pin a commit, and don't run it
> unreviewed. I have not vetted it beyond its own README.

---

## 3. The layer you actually need to build

Your instinct was right, and the job is smaller than feared because transport,
streaming, and format translation are already handled. What's missing is
**tool-call emulation** — the shim that makes function calling work.

```
webapp ──▶ your shim ──▶ cursor-api-proxy ──▶ cursor-agent CLI ──▶ Cursor
   ▲           │
   └───────────┘  tool dispatch loop lives here
```

Per request:

1. Take the caller's `tools: [...]` JSON schemas.
2. Render them into the prompt with a strict output contract — emit
   `<tool_call>{"name": ..., "arguments": {...}}</tool_call>` and nothing else
   when calling a tool.
3. Stream the response; scan for that sentinel.
4. On a hit, stop, dispatch the tool, append the result as a follow-up message,
   re-enter the loop.
5. On no hit, pass the text through unchanged.
6. Re-emit in OpenAI `tool_calls` shape so **caller code needs no changes**.

Known costs of emulation: no parallel tool calls, weaker schema adherence than
native function calling, and occasional malformed JSON needing a retry. Budget
for a repair path.

### Also worth checking first

Cursor CLI now supports **MCP servers**, sharing the editor's config, with
tools auto-discovered. If MCP works reliably under `-p` (print mode), you may
be able to expose your tools as an MCP server and skip the emulation entirely —
a much cleaner design.

**[VERIFY]** — there is at least one community bug report claiming *MCP does
not work in CLI print mode*. Since `-p` is exactly what headless serving uses,
test this early. It's the difference between "wire up MCP" and "write a
parser."

---

## 4. Running it on a VPS

- **Auth:** set `CURSOR_API_KEY` in the environment instead of running
  `agent login`. This is the documented headless/CI path — no interactive
  browser step, which is what makes VPS deployment viable. **[VERIFY]** that a
  key on your tier permits sustained headless CLI use.
- **Process model:** the CLI spawns per request. Expect meaningful cold start.
  Pool warm processes or accept the latency.
- **Concurrency:** one subscription behind N users. Put a queue and a hard
  concurrency cap in front, and handle rate-limit errors as first-class
  responses, not 500s.
- **Failover:** keep a real API key configured as a fallback path. If the
  Cursor account is throttled or suspended, the webapp degrades instead of
  going down. Do not make this gateway a single point of failure.

## 5. Security — non-negotiable

The runner in this repo passes `--yolo` (commit `62eeb31`), which bypasses
every approval prompt and grants shell and filesystem access. Piping untrusted
end-user text into that on your VPS is a prompt-injection-to-RCE path.

For a chat gateway you don't need a workspace at all:

- Keep `CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE=true` (the proxy's default).
- Run the process in a container as a non-root user, read-only root filesystem.
- Put **no** credentials in its environment beyond `CURSOR_API_KEY`.
- Restrict network egress from the container.
- Bind to `127.0.0.1` and reverse-proxy with your own auth in front. Never
  expose `8765` publicly.

## 6. Reusable from this repo

If the third-party proxy doesn't fit and you build your own, these are directly
liftable:

| What                                   | Where                                                          |
| -------------------------------------- | -------------------------------------------------------------- |
| `stream-json` → structured events      | `packages/adapters/cursor-local/src/server/parse.ts`             |
| CLI arg construction, stdin piping     | `packages/adapters/cursor-local/src/server/execute.ts:345-353`   |
| Stream line normalization              | `packages/adapters/cursor-local/src/shared/stream.ts`            |
| Model ID list                          | `packages/adapters/cursor-local/src/index.ts`                    |
| Native (non-WSL) spawn + workspace mgmt| `scripts/local-runner-macos.mjs`                                 |

`local-runner-macos.mjs` was checked for Darwin-specific code — `darwin`,
`/opt/homebrew`, `~/Library`, `osascript` — and has **none**. It is already
POSIX-portable; the only Mac-ism is the default workspace root. It will likely
run on a Linux VPS unmodified.

Not reusable: there is no OpenAI/Anthropic-compatible HTTP surface anywhere in
this repo. `openclaw-gateway` is a WebSocket *client* to a different agent
system, not a server.

---

## 7. Order of work

1. **Confirm `auto` is uncapped and permitted for programmatic use.** If it
   isn't, stop — there are no savings and the rest is wasted effort.
2. Price current volume against a small-model API. Confirm the saving is real.
3. Test MCP under `-p`. Decides emulation vs. MCP.
4. Audit and deploy `cursor-api-proxy` on the VPS, locked down per §5.
5. Build the tool shim (or MCP server) — §3.
6. Point one low-risk workload at it. Measure quality and latency against what
   it replaced before migrating anything else.

Steps 1–3 are cheap and answer whether steps 4–6 are worth doing at all.
