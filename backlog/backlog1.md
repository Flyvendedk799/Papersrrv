# Files Tab Value Backlog (Adaptive Plan)

## Why this backlog exists

The current Files tab is a good foundation but underuses existing backend and cross-product integrations. This backlog turns Files into a high-value workspace for:

- run forensics,
- issue evidence curation,
- collaborative-safe editing,
- and artifact discoverability.

This document is intentionally **adaptive**. Before implementing any ticket, run the revalidation checklist so the plan remains correct even if the codebase changes.

> **Relationship to `backlog2.0.md`:** `backlog2.0.md` is the umbrella plan. Several tickets here are subsumed or refined by 2.0 (see the supersession map in `backlog2.0.md`). If a subsumed ticket is implemented, follow the 2.0 description and close the older ticket as "delivered via 2.0 X". Shared dependency fallback policy and performance budgets live in `backlog2.0.md` and apply here as well.

---

## Global implementation guardrails

- Keep everything company-scoped end-to-end.
- Reuse existing API contracts where possible before adding new endpoints.
- Favor additive changes over invasive rewrites.
- Preserve existing deep links (`/files?file=...`, `runId`, `agentId`) and extend them safely.
- All new mutating actions should surface clear errors and log activity where appropriate.

---

## Mandatory pre-flight revalidation (run before each ticket)

1. **Locate current Files UI entry points**
   - Confirm current page/component locations and route wiring (e.g., Files page, file modal, sidebar/masthead links).
2. **Confirm API contract status**
   - Verify active request/response shapes in files-related routes and API client wrappers.
3. **Check overlapping in-flight changes**
   - Look for nearby edits in files, issue detail/properties, run comments, activity timeline, and workflow artifact code.
4. **Reconfirm query cache keys/state model**
   - Ensure React Query keys or equivalent state cache abstractions did not change.
5. **Re-scope ticket if needed**
   - If structure changed, keep the same user outcome and adapt implementation file list/steps.

If a ticket is impacted by drift, update this backlog item with an "Adjusted implementation note" before coding.

---

## Phase 1 - Foundational capabilities (equal priority)

### Ticket 1.1 - Server-powered search in Files

**Goal**
- Replace local path-only filtering with scalable server search while preserving responsive UX.

**Implementation**
- Wire Files search box to existing files search endpoint.
- Keep local filtering as fallback only when server search unavailable.
- Add debounce and loading state for search queries.
- Add URL query persistence for search term for shareable views.

**Acceptance criteria**
- Search works on large datasets without requiring full list preload.
- Search returns ranked/filtered results from server.
- Existing run/agent filters still compose with search.
- Empty/no-results and API error states are explicit.

**Revalidation focus**
- Confirm search endpoint path/params still exist and match API client expectations.
- Confirm Files page state model still supports URL query sync.

---

### Ticket 1.2 - Files filtering and sorting that match user intent

**Goal**
- Make it easy to answer: "what changed recently, by whom, and what matters?"

**Implementation**
- Add filters: operation type, extension/type, recency window, agent.
- Add sorting: recent activity, most versions/snapshot count, path A-Z.
- Ensure tree/list/type modes reflect active filters consistently.

**Acceptance criteria**
- Same filter/sort behavior across all view modes.
- Filter chips are visible and removable.
- URL captures active filters for reproducibility.

**Revalidation focus**
- Confirm available metadata fields in list/tree payloads (operation, agent, timestamps, snapshot count).

---

### Ticket 1.3 - Run-centric forensics mode polish

**Goal**
- Make `/files?runId=...` a first-class forensic mode.

**Implementation**
- Add dedicated "Run context" header when run filter is active.
- Highlight changed files in that run and show operation timeline metadata.
- Add quick actions: clear run filter, open run detail, compare with previous snapshot.

**Acceptance criteria**
- Comment/run deep links land users in a clearly contextualized Files state.
- Users can inspect run outputs quickly without manual re-filtering.

**Revalidation focus**
- Confirm run->files linking points still exist in comments/runs UI.
- Confirm run files endpoint and payload format.

---

### Ticket 1.4 - "Pin to Issue Summary" directly from Files

> **Blocking design decision (shared with `2.0 B4`):** confirm whether summary links stay on `issue_summary_files` or move to an evidence-set model. Decide before implementing writes.

**Goal**
- Turn Files into an evidence curation flow for issues.

**Implementation**
- Add action in file list row and file modal: "Add to Issue summary".
- Add issue picker (or preselected issue if context already available).
- Reflect pinned state with badge ("In summary for X issue(s)").

**Acceptance criteria**
- Users can add/remove summary links without leaving Files.
- Issue pages immediately show newly pinned files.
- Errors (permissions/not found/duplicates) are clearly surfaced.

**Revalidation focus**
- Confirm summary file endpoints and payloads still match.
- Confirm issue detail/properties components still render summary files.

---

## Phase 2 - Collaboration and trust capabilities (equal priority)

### Ticket 2.1 - Lock/conflict awareness in Files UI

**Goal**
- Prevent accidental overwrite in multi-agent/human workflows.

**Implementation**
- Display lock status in list + modal.
- On edit/save, check lock and conflict state.
- Add guarded actions: request lock, release lock, takeover with confirmation.

**Acceptance criteria**
- Active locks are visible and understandable (owner + expiry/reason if present).
- Save flow warns/blocks appropriately when conflicts are detected.
- Conflict events are actionable, not silent failures.

**Revalidation focus**
- Confirm lock/conflict endpoints and response fields.
- Confirm edit/save flow in modal has stable interception points.

---

### Ticket 2.2 - Server-side diff fallback for large files

**Goal**
- Keep diff usable and accurate at larger content sizes.

**Implementation**
- Keep current client diff for small files.
- Add server diff fallback path for large files or expensive comparisons.
- Standardize diff output rendering regardless of source.

**Acceptance criteria**
- Diff remains responsive for large snapshots.
- Users can compare non-adjacent history entries reliably.
- Failure mode gracefully explains inability to diff.

**Revalidation focus**
- Confirm diff endpoint availability, params, and response schema.
- Confirm history UI supports selecting arbitrary versions.

---

### Ticket 2.3 - Activity feed deep links to exact file evidence

**Goal**
- Bridge "what happened" (activity) to "what changed" (files/snapshots).

**Implementation**
- Add links from file-related activity events to Files with preselected file/version context.
- Ensure modal opens directly on hash/version when available.

**Acceptance criteria**
- Clicking file activity events opens precise file evidence context.
- No dead links when referenced snapshots are missing (show fallback messaging).

**Revalidation focus**
- Confirm activity event payloads still include required identifiers.
- Confirm Files route can consume file/hash params robustly.

---

## Phase 3 - Strategic capabilities (equal priority)

### Ticket 3.1 - Files Insights panel

**Goal**
- Surface proactive intelligence (hot files, churn, ownership patterns, stale docs).

**Implementation**
- Add side panel or top cards powered by analytics endpoint.
- Show trend windows + top extensions/directories + high-churn paths.
- Include actionable jump links from insight to filtered file view.

**Acceptance criteria**
- Insights are useful and navigable, not just metrics display.
- Each insight click narrows Files to relevant subset.

**Revalidation focus**
- Confirm analytics endpoint fields and time window controls.
- Confirm filter model can represent each insight jump target.

---

### Ticket 3.2 - Workflow artifact discoverability in Files

**Goal**
- Unify generated artifacts with regular file evidence.

**Implementation**
- Expose workflow artifacts in Files via dedicated source/type facet.
- Add run-grouped artifact browsing (docs/json/media/screenshots).
- Reuse existing artifact URLs and metadata from workflow routes.

**Acceptance criteria**
- Users can find workflow outputs from Files without hunting in workflow detail pages.
- Artifact previews open correctly by file type.

**Revalidation focus**
- Confirm artifact listability/discovery paths (may require minimal aggregation endpoint if none exists).
- Confirm artifact auth/permissions remain company-safe.

---

### Ticket 3.3 - Assistant-assisted file retrieval

**Goal**
- Allow conversational jump-to-files for run/issue contexts.

**Implementation**
- Add Papee tool action(s) for "show files for run/issue" and "open top evidence files".
- Wire to Files route with encoded filters and optional preselected item.

**Acceptance criteria**
- Chat actions land users in deterministic Files views.
- No hallucinated links; every action resolves to valid route/data.

**Revalidation focus**
- Confirm current Papee tool dispatch/enact pipeline and allowed action registry.

---

## Execution policy and dependencies

All three phases are **required** and carry **equal priority**.  
There is no "nice-to-have" phase in this backlog. Sequence is for dependency/risk management only.

Recommended sequence:

1. 1.1 Search
2. 1.2 Filters/sorting
3. 1.3 Run forensics polish
4. 1.4 Pin to issue summary
5. 2.1 Locks/conflicts
6. 2.2 Server diff fallback
7. 2.3 Activity deep links
8. 3.1 Insights
9. 3.2 Artifacts discoverability
10. 3.3 Assistant-assisted retrieval

Dependency notes:

- 1.1 + 1.2 should establish final URL/query-state model used by later tickets.
- 1.4 depends on stable issue summary link APIs and UI refresh behavior.
- 2.1 should land before expanding inline editing use cases.
- 3.2 may need minimal backend listing glue if artifact metadata is currently spread across run contexts.

---

## Definition of done per ticket

A ticket is complete only when all are true:

- Feature works with company scoping intact.
- Existing Files flows are not regressed (browse, preview, history, edit, deep links).
- Query cache invalidation/state updates are correct after mutations.
- Typecheck/tests/build pass (or documented exceptions with reason).
- Ticket note includes "Revalidation result" summarizing what changed from this plan due to code drift.
- Shared edge/error coverage (see `backlog2.0.md`) is handled: large files, deleted snapshots, unretrievable hashes, permission boundaries, network failures, malformed deep-link params.

---

## Suggested implementation template (copy into each PR/ticket)

- **Objective**
- **Current-state validation findings**
- **Adjusted implementation note (if code drifted)**
- **Files/modules touched**
- **API contracts used/changed**
- **Risk + rollback plan**
- **Verification steps and outcomes**

