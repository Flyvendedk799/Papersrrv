# Backlog 2.0 - Unified File Viewing Experience (Files + On-the-Go)

## Intent

Create a single, coherent file-viewing experience across:

- `Files` page (deep workspace),
- `Issue` page (contextual/on-the-go),
- `Run` surfaces (execution context),
- and `Activity` (investigation entry point).

This backlog combines missing dots from `backlog1.md` and `backlog1.5.md` into end-to-end user flows that match the current codebase foundation and product intent.

---

## Backlog relationships and supersession map

`backlog2.0.md` is the **umbrella plan**. Where overlap exists, `2.0` is canonical and the related `1` / `1.5` tickets must conform to the shared primitives defined here (especially Ticket A1).

Subsumed or refined by 2.0:
- `backlog1.md 1.1 + 1.2` search/filters → `2.0 C1` (unified server search and shared filter presets).
- `backlog1.md 1.3` run forensics polish → `2.0 A2 + C2` (navigation pivots + provenance rails).
- `backlog1.md 1.4` pin to issue summary from Files → `2.0 B4` (evidence curation lifecycle).
- `backlog1.md 2.2` server diff fallback → `2.0 B2` (inline compare uses the same diff path) and C4b.
- `backlog1.md 2.3` activity deep links → `2.0 A2 + C3`.
- `backlog1.5 A1` relevance panel → `2.0 B1`.
- `backlog1.5 A2` evidence sets → `2.0 B4`.
- `backlog1.5 A3` inline compare → `2.0 B2`.
- `backlog1.5 B1` issue-scoped filters/saved views → `2.0 C1` (preset model).
- `backlog1.5 B2` file-to-comment evidence → `2.0 B3`.

Still standalone and complementary:
- `backlog1.md 2.1` lock/conflict awareness (not in 2.0 — keep).
- `backlog1.md 3.1` files insights panel (not in 2.0 — keep).
- `backlog1.md 3.2` workflow artifact discoverability (not in 2.0 — keep).
- `backlog1.md 3.3` assistant-assisted retrieval (reference `2.0 A1` for safe deep-link construction).
- `backlog1.5 B3` issue file handoff checklist (not in 2.0 — keep).

Implementation rule: if a subsumed ticket is picked up, implement it as described in `2.0` and close the older ticket as "delivered via 2.0 X".

---

## Current foundation (validated in code)

- Files has strong core viewing primitives: list/tree/type, run/agent filters, history, modal preview/edit/diff.
- Issue detail already shows files touched and supports open-in-files behavior.
- Comment thread already deep-links run rows to run-scoped files.
- Issue properties already shows summary files with preview/remove.
- Backend already supports key file APIs: list/tree/history/content/search/diff/run-files/summary-file links/analytics/locks/conflicts.

Meaning: we do **not** need a rewrite. We need consistent cross-surface workflows and shared viewing components/behaviors.

---

## Non-negotiable constraints

- Do not disrupt existing Issue core behavior (status, assignee, comments, transitions).
- Keep all features company-scoped and permission-safe.
- Favor reusing existing routes/services before introducing new API surfaces.
- Preserve and extend existing deep links instead of replacing them.
- Keep features resilient to code drift via revalidation checkpoints.

### Content immutability invariant

Any surface that stores or renders a reference to a file version by content hash (evidence links, comment attachments, summary links, canonical file context) relies on that content remaining retrievable.

- Content referenced by issue evidence, comment attachments, summary links, or canonical file context MUST NOT be garbage-collected without reference-counting or an equivalent retention guarantee.
- If a content-GC policy exists or is introduced, any feature producing durable refs must register a retention hook or switch to server-side archival storage.
- Consumers MUST handle "content no longer available" gracefully with explicit fallback UX, not silent failures.

---

## Mandatory pre-flight revalidation (before each ticket)

1. Reconfirm current entry points and route wiring for Files, Issue, Run, Activity.
2. Reconfirm files API contracts (request/response fields) and query-cache keys.
3. Check active changes in adjacent modules to avoid merge conflicts/regressions.
4. Validate existing deep-link query params and fallback behavior.
5. Re-scope implementation details while preserving intended user outcome.

If drift is found, add an "Adjusted implementation note" to the ticket/PR before coding.

---

## Dependency fallback policy (shared with backlog1 / backlog1.5)

Most tickets assume specific backend capabilities exist. If an endpoint or component is renamed, moved, or removed before implementation, follow this policy instead of stalling:

- **Renamed or moved endpoint/component**
  - Update client paths and cache keys.
  - Record the change in "Adjusted implementation note".
- **Endpoint removed with equivalent replacement**
  - Migrate to the replacement. Preserve external behavior (same user outcome).
- **Endpoint removed with no equivalent**
  - Gate the affected feature behind a flag, surface a clear empty/error state, and open a follow-up ticket to restore or replace the capability.
- **Response shape changed**
  - Add a small adapter layer in the API client to keep UI code stable.
- **Schema change blocks ticket**
  - Convert ticket to a design-first step; do not ship half-implemented writes.

Critical dependencies to re-verify per ticket (high-drift risk):

- files list / tree / history / content / raw
- files search / diff / analytics
- run files endpoint
- issue summary file links
- file locks / conflicts
- activity event payloads and router
- comment schema (for evidence links)
- markdown renderer entry points
- feature flag infrastructure

---

## Priority policy

All phases are **required** and carry **equal priority**.  
Execution order below is for dependency and risk management, not importance.

---

## Unified user flows to support

### Flow U1 - Issue triage to evidence
- Open issue -> instantly see most relevant files -> preview/compare -> pin key files as summary evidence.

### Flow U2 - Run verification
- From run/comment -> open run-scoped files -> inspect changed files -> pivot to issue context and summary.

### Flow U3 - Investigation from activity
- From activity event -> open exact file/version context -> inspect provenance (run/agent/issue links) -> act.

### Flow U4 - Focused file review
- Start on Files page -> apply filters/search -> inspect history/diff -> jump directly to owning issue/run to resolve.

### Flow U5 - Discussion with immutable evidence
- In issue comments -> attach file evidence (path + snapshot hash) -> teammates open exact version later.

### Flow U6 - Fast markdown comprehension
- Open `.md` from any surface -> get readable structure (title/sections/toc/summary) -> jump to relevant section or linked evidence quickly.

---

## Phase A - Shared viewing model and navigation glue (equal priority)

### Ticket A1 - Canonical File Context contract

**Goal**
- Standardize how all surfaces represent selected file context.

**Implementation**
- Define shared context shape (companyId, filePath, contentHash/version, runId, agentId, issueId, source).
- Use this contract in Files page, file modal open actions, issue file cards, activity links.

**Acceptance criteria**
- Any entry point can open the same file/version deterministically.
- Deep links are stable and backward compatible.

**Revalidation focus**
- Verify existing query params and routing utilities before introducing new ones.

---

### Ticket A2 - Bidirectional deep links across Files/Issue/Run/Activity

**Goal**
- Remove navigation dead-ends between file-related surfaces.

**Implementation**
- Add explicit pivots:
  - Files -> related run(s), issue(s), activity context.
  - Issue -> richer open-in-files with hash/run preserved.
  - Run -> "view files touched" primary action.
  - Activity (file events) -> open exact file/version context.

**Acceptance criteria**
- Users can move between all four surfaces in two clicks or less.
- Missing references degrade gracefully with fallback messaging.

**Revalidation focus**
- Confirm entity IDs available in activity/run payloads and row components.

---

### Ticket A3 - Shared quick-preview behavior

**Goal**
- Make "quick look" consistent whether user is in Files or Issue.

**Implementation**
- Reuse a common preview component/state model for side preview and modal preview.
- Normalize markdown/code/plain rendering behavior and loading/error states.

**Acceptance criteria**
- Preview UX feels identical across Files and Issue contexts.
- No duplicated rendering logic diverging over time.

**Revalidation focus**
- Confirm current modal/preview components can be reused without breaking existing layout.

---

## Phase B - Issue-centered viewing value (equal priority)

### Ticket B1 - Issue file relevance panel with actionable ranking

**Goal**
- Prioritize what matters on an issue page.

**Implementation**
- Add ranked issue file cards using existing signals (recency, edit/write operation, summary-link presence, mentions).
- Provide actions: preview, compare, open in Files, pin/unpin summary.

**Acceptance criteria**
- Users identify high-value files quickly with minimal scanning.
- Ranking updates as new run snapshots appear.

**Revalidation focus**
- Confirm ranking inputs are present in available payloads.

---

### Ticket B2 - Inline compare from Issue context

**Goal**
- Enable in-context file version understanding without context switching.

**Implementation**
- Add compare tray in Issue page for selected file versions/hashes.
- Reuse existing diff logic and add server fallback for large files.

**Acceptance criteria**
- Compare works for common and large files.
- Issue page remains responsive and non-disruptive.

**Revalidation focus**
- Recheck diff endpoint and history-selection behavior before implementation.

---

### Ticket B3 - File evidence in comments (immutable references)

> **Blocking design decision:** choose comment attachment strategy (extend comment row with structured payload vs. separate `comment_file_evidence` table). Decide before implementing writes; UI rendering can proceed on mocked data until decided.

**Goal**
- Tie discussion decisions to exact file versions.

**Implementation**
- Add "attach file evidence" from Issue file cards or preview.
- Persist evidence links with file path + hash/version + optional excerpt.
- Render evidence cards in comment thread with open actions.
- Depends on the Content Immutability Invariant (retention of referenced hashes).

**Acceptance criteria**
- Evidence links open exact versions even after newer snapshots exist.
- Comment UX remains lightweight and readable.
- Handles "content no longer available" with explicit fallback UI.

**Revalidation focus**
- Confirm comment data model extension path and rendering hooks.

---

### Ticket B4 - Evidence curation lifecycle (summary + sets)

> **Blocking design decision:** choose between extending `issue_summary_files` with a nullable `set_name` vs. adding a dedicated `issue_evidence_sets` + `issue_evidence_set_items` pair. Decide before implementing writes.

**Goal**
- Create a durable issue evidence layer, not ad-hoc links.

**Implementation**
- Support both summary pinning and named evidence sets inside issue context.
- Ensure Files page can add/remove evidence when issue context is provided.
- Depends on the Content Immutability Invariant for persisted file references.

**Acceptance criteria**
- Teams can maintain structured evidence collections per issue.
- Existing summary behavior remains intact and enhanced.

**Revalidation focus**
- Decide table/schema extension strategy with minimal migration risk.

---

## Phase C - Files page as investigation cockpit (equal priority)

### Ticket C1 - Server-powered search and unified filters

**Goal**
- Make Files usable at scale and aligned with issue/run workflows.

**Implementation**
- Move to server search path, keep client fallback.
- Add unified filters shared with Issue context presets:
  - run-focused,
  - summary-only,
  - markdown/docs,
  - agent,
  - operation,
  - recency.

**Acceptance criteria**
- Search/filter behavior is fast and consistent.
- Presets can be opened via deep links from Issue/Run/Activity.

**Revalidation focus**
- Confirm search endpoint schema and current filtering model.

---

### Ticket C2 - Provenance rails in file rows/history

**Goal**
- Make each file view answer "why is this here?" and "where did it come from?"

**Implementation**
- Add provenance chips/links in file rows/history: run, agent, linked issue(s), summary membership.
- Enable one-click pivot to each context.

**Acceptance criteria**
- Users can navigate from any file entry to related run/issue context directly.
- Provenance data is visible but not visually noisy.

**Revalidation focus**
- Confirm availability of related IDs; add lightweight joins only if necessary.

---

### Ticket C3 - Activity-driven file investigation support

**Goal**
- Turn Activity into a practical entry point for file debugging/audit.

**Implementation**
- Add file entity routing in activity rows.
- Preserve file/hash context in activity-to-files navigation.

**Acceptance criteria**
- File-related activity events open meaningful file views, not generic pages.
- Broken/missing targets show understandable fallback.

**Revalidation focus**
- Confirm activity row link resolver behavior and event payload shapes.

---

### Ticket C4a - Smart markdown reader core

**Goal**
- Deliver a readable, navigable `.md` viewer used consistently across Files, Issue, Run, and Activity entry points.

**Implementation**
- Markdown-first viewing mode with clean typography and readable spacing.
- Auto-generated TOC from headings, with anchor navigation.
- Sticky "document map" for long files.
- Collapsible code blocks for very long docs (with expand).
- Overview strip: doc title, last updated snapshot metadata, estimated read time.
- Heading-level search/jump.
- Link behavior: internal heading in-viewer; file paths open file context with hash/version when available; external links open safely.
- Same markdown rendering in quick preview and full modal (single renderer).

**Acceptance criteria**
- Long `.md` files are readable without manual scrolling fatigue.
- Users can jump to important sections in one or two interactions.
- Markdown rendering is consistent across Files and on-the-go contexts.
- Broken links or unsupported markdown elements fail gracefully with clear fallback.

**Revalidation focus**
- Confirm current markdown renderer stack and extend (avoid duplicating renderers).
- Confirm available metadata for "last updated" and enough signal for read-time estimate.

---

### Ticket C4b - Version-aware markdown highlighting

> **Depends on:** `C4a` (reader core) and `B2` (diff path).

**Goal**
- Help users see what changed between selected versions at a glance.

**Implementation**
- Highlight sections recently changed between two selected versions.
- Use the same diff source of truth as `B2`; do not introduce a parallel diff model.
- Provide a low-fidelity fallback if diff data is unavailable (e.g., list changed headings).

**Acceptance criteria**
- Users can identify changed sections in long `.md` files without reading the diff.
- Works for large files via the server diff fallback.
- Gracefully degrades if content hashes or diff data are missing.

**Revalidation focus**
- Confirm diff granularity and whether sectioning can be derived reliably from the renderer's AST.

---

## Phase D - Reliability, rollout, and quality bars (equal priority)

### Ticket D1 - Feature flags and rollout controls

**Goal**
- Ship safely without destabilizing day-to-day issue/files work.

**Implementation**
- Flag major modules: issue relevance, issue compare, comment evidence, evidence sets, provenance rails, activity file links.
- Add kill switches and default rollout strategy.

**Acceptance criteria**
- Any module can be disabled independently.
- Core file viewing remains functional with all new flags off.

**Revalidation focus**
- Confirm existing feature-flag infra and operational ownership.

---

### Ticket D2 - Performance budgets and instrumentation

**Goal**
- Keep file viewing fast across all entry points.

**Implementation**
- Adopt the following initial budgets (tunable after first measurements on real data; any change requires an updated note here):
  - Issue page load delta introduced by file enhancements: < 150 ms p75.
  - Files list response handling after server response: < 100 ms p75.
  - Quick preview open time (known content): < 300 ms p75.
  - Full modal open time: < 500 ms p75.
  - Compare (diff) launch time (small file): < 400 ms p75.
  - Compare launch time (large file, server path): < 1200 ms p75.
  - Markdown reader render for <=200KB `.md`: < 400 ms p75.
- Instrument: panel open, filter switch, evidence attach, diff launch, markdown render, save.
- Add regression alerts tied to these budgets.
- Shared across `backlog1.md 3.1 (insights panel)` and `backlog1.5 C2` — both should reference these budgets rather than define their own.

**Acceptance criteria**
- Staging metrics stay within agreed budgets.
- Budget overruns trigger automatic alerting and a documented fallback behavior.

**Revalidation focus**
- Confirm telemetry tooling and metric naming conventions.

---

### Ticket D3 - Accessibility and UX consistency pass

**Goal**
- Ensure all added file-viewing features remain inclusive and predictable.

**Implementation**
- Keyboard-first navigation for previews, compare tray, evidence cards, provenance links.
- Accessible labels and focus management across context transitions.

**Acceptance criteria**
- No keyboard traps; assistive tech can traverse all new elements.
- Cross-surface behavior remains consistent and learnable.

**Revalidation focus**
- Align with existing component/system a11y patterns.

---

### Ticket D4 - File viewing UX quality bar and heuristics

**Goal**
- Enforce a consistently good file-viewing experience regardless of entry point or file type.

**Implementation**
- Define UX heuristics for file viewing:
  - time-to-first-readable-content,
  - clarity of provenance context,
  - navigation continuity (back/forward and deep-link stability),
  - visual consistency between quick preview and full view.
- Add quality checks for common file types (`.md`, `.ts/.js`, `.json`, plain text):
  - sensible defaults (wrap/line numbers/tabs),
  - safe truncation for huge files,
  - explicit loading/error/empty states.
- Add micro-interactions that reduce friction:
  - keyboard shortcuts for open/close/next-previous file,
  - preserved scroll position per file/version,
  - "recently viewed files" shortcuts within session.

**Acceptance criteria**
- Viewing experience feels consistent and predictable across surfaces.
- Users can navigate documents and file versions with minimal friction.
- UX quality checks are documented and used in PR review for file-viewing tickets.

**Revalidation focus**
- Confirm current keyboard shortcut patterns and avoid collisions.
- Confirm viewer state model can persist per-file scroll/selection safely.

---

## Suggested dependency-aware order (not priority order)

1. A1 Canonical file context
2. A2 Bidirectional deep links
3. A3 Shared preview behavior
4. B1 Issue relevance panel
5. C1 Server search + unified filters
6. B2 Inline compare
7. B3 Comment evidence links
8. C2 Provenance rails
9. C3 Activity file routing
10. C4a Markdown reader core
11. B4 Evidence curation lifecycle
12. D1 Feature flags
13. D2 Performance instrumentation
14. C4b Version-aware markdown highlighting
15. D3 Accessibility pass
16. D4 UX quality heuristics

Rationale:
- Establish shared context/navigation first.
- Layer high-value issue/files workflows next.
- Land markdown intelligence early because docs are a primary artifact format.
- Harden rollout after feature surfaces are integrated.

---

## Definition of done (per ticket)

- Existing Files and Issue core workflows are not regressed.
- New behaviors are additive and reversible.
- Company scoping and permissions are enforced.
- Cross-surface deep links are deterministic and tested.
- Performance and accessibility checks pass for touched flows.
- Ticket includes revalidation notes describing any drift adaptations.

### Shared edge and error coverage (must be handled)

Every ticket that introduces or modifies file viewing, links, or evidence references MUST handle:

- Large files exceeding preview size limits (clear truncation UX).
- Files deleted since snapshot was captured.
- Content hash no longer retrievable (see Immutability Invariant).
- Permission boundary crossing: following a link into another company / unauthorized context.
- Network/offline failure on long lists, preview, diff, or analytics calls.
- Missing or malformed deep-link params (do not crash; show usable fallback state).

---

## Ticket template (copy for implementation)

- **Objective**
- **Current-state validation findings**
- **Adjusted implementation note (if code drifted)**
- **User flows covered (U1-U6)**
- **Touched modules**
- **API/data contracts used or changed**
- **Feature flags / fallback behavior**
- **Risk and rollback plan**
- **Verification results (functional, performance, accessibility)**

