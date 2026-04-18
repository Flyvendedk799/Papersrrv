# Issue Page Files Enhancement Backlog (Adaptive, Non-Disruptive)

## Purpose

Enhance the Files experience **inside the Issue page** so users get more value and relevance without disturbing existing issue workflows, layout stability, or core interactions.

This backlog is intentionally designed to:

- keep issue fundamentals unchanged (status, assignee, comments, history),
- add value through practical file curation and faster issue decisions,
- avoid experimental visualization scope,
- and remain resilient to code drift before implementation.

> **Relationship to `backlog2.0.md`:** `backlog2.0.md` is the umbrella plan. Most tickets here are subsumed or refined by 2.0 (see the supersession map in `backlog2.0.md`). If a subsumed ticket is implemented, follow the 2.0 description and close the older ticket as "delivered via 2.0 X". Shared dependency fallback policy and performance budgets live in `backlog2.0.md` and apply here as well.

---

## Hard constraints (do not violate)

- Do not regress current Issue page behavior or information hierarchy.
- Do not replace core issue components; only augment with bounded modules.
- Keep all additions company-scoped and permission-safe.
- Avoid unrelated visual system overhauls.
- Use feature flags for additive modules when rollout risk exists.

---

## Mandatory pre-flight revalidation (before each ticket)

1. Verify current Issue page composition and extension points.
2. Confirm current file-related data available on issue context (run-linked files, summary files, snapshots).
3. Re-check API contracts for issue summary file links, files history/content, and run file access.
4. Confirm current route/deep-link behavior between Issue and Files pages.
5. Verify cache/query keys and mutation invalidation paths for issue + files surfaces.

If drift is found, keep user outcome identical and document an "Adjusted implementation note" before coding.

---

## Priority policy

All phases below are **required** and carry **equal priority**.  
Execution order is suggested for dependency/risk control only.

---

## Phase A - Relevance and curation on Issue page (equal priority)

### Ticket A1 - Issue file relevance panel

**Goal**

- Show the most relevant files for an issue at a glance (not just all touched files).

**Implementation**

- Add a compact relevance panel in Issue detail with ranked file cards.
- Ranking signals (initial): recency, write/edit operations, mention frequency in issue/comments, summary-link presence.
- Include quick actions: preview, open in Files, pin/unpin summary.

**Acceptance criteria**

- Users can identify top relevant files in under 5 seconds.
- Relevance list updates when new run files/snapshots arrive.
- No disruption to existing issue content order and controls.

**Revalidation focus**

- Confirm issue detail still exposes touched files and summary file state.
- Confirm ranking can be computed with available metadata before adding new backend logic.

---

### Ticket A2 - Evidence sets for issue decisions

> **Blocking design decision (shared with `2.0 B4`):** choose between extending `issue_summary_files` with `set_name` vs. adding a dedicated `issue_evidence_sets` pair. Decide before implementing writes.

**Goal**

- Let users create lightweight "evidence sets" from files tied to an issue.

**Implementation**

- Add named sets (e.g., "Root cause", "Fix proposal", "Validation artifacts").
- Allow add/remove from Issue panel and from Files page when issue context exists.
- Keep set metadata minimal and additive.

**Acceptance criteria**

- Users can build and revisit curated file collections per issue.
- Evidence sets are visible in Issue context and linkable/shareable internally.
- Existing summary file behavior remains intact.

**Revalidation focus**

- Confirm whether issue summary file schema can be extended or if separate table is cleaner.
- Confirm UI placement does not crowd existing issue properties area.

---

### Ticket A3 - Inline multi-file compare in Issue context

**Goal**

- Enable fast issue-centered compare without forcing navigation away.

**Implementation**

- Add compare tray in Issue page to select 2 file versions/hashes.
- Reuse existing diff services; include fallback for large files.
- Keep compare UI collapsible and off by default.

**Acceptance criteria**

- Compare can be launched from relevant file cards in Issue view.
- Diffs are readable, performant, and recover gracefully from missing versions.
- Issue page remains responsive during compare operations.

**Revalidation focus**

- Confirm server/client diff pathways and current file modal compare behavior.

---

## Phase B - Actionable issue-file workflows (equal priority)

### Ticket B1 - Issue-scoped file filters and saved views

**Goal**

- Let users quickly switch between meaningful file subsets for an issue.

**Implementation**

- Add issue-scoped file filters: touched in latest run, edited by specific agent, markdown/docs only, summary-linked only.
- Add "saved views" per issue (e.g., "Root cause docs", "Latest run outputs").
- Keep filter UI compact and aligned with existing issue layout.

**Acceptance criteria**

- Users can switch to a saved file view in one click.
- Filters persist within issue context and are shareable via URL/query state when appropriate.
- No regressions to existing issue loading speed.

**Revalidation focus**

- Confirm available metadata fields support targeted filters without heavy backend changes.

---

### Ticket B2 - File-to-comment evidence linking

> **Blocking design decision (shared with `2.0 B3`):** choose comment attachment strategy (structured payload on comment row vs. separate table). Decide before implementing writes. Implementation depends on the Content Immutability Invariant defined in `backlog2.0.md`.

**Goal**

- Connect specific files/versions directly to issue discussion.

**Implementation**

- Add "Attach file evidence" action in issue comment composer.
- Store link to file path + hash/version + optional selected excerpt.
- Render attached evidence cards in comment thread with preview/open actions.

**Acceptance criteria**

- Comment evidence links remain stable even when file has newer versions.
- Users can jump from comment evidence to exact file version context.
- Permissions and company scoping enforced on all fetches.

**Revalidation focus**

- Confirm comment schema/attachments model and whether extension is additive.
- Confirm file hash-based retrieval contract stability.

---

### Ticket B3 - Issue file handoff checklist

> **Blocking design decision:** decide where checklist policy and state live (issue row extension vs. new `issue_handoff_checklists` table). Decide before shipping enforcement; advisory-only UI can proceed earlier.

**Goal**

- Improve resolution quality by requiring key file checks before closing an issue.

**Implementation**

- Add optional checklist module based on selected evidence files:
  - reviewed latest version,
  - compared prior version,
  - included summary artifact,
  - validated with latest run output.
- Tie checklist completion to issue lifecycle transitions as advisory or required based on setting.

**Acceptance criteria**

- Teams can configure checklist enforcement level per company/project policy.
- Checklist state is visible in issue detail and audit-friendly.
- Does not block unrelated issue actions unless explicitly configured.

**Revalidation focus**

- Confirm issue transition hooks/policies and activity logging integration points.

---

## Phase C - Production hardening and rollout safety (equal priority)

### Ticket C1 - Feature flags and kill switches

**Goal**

- Ensure non-disruptive rollout of Issue page file enhancements.

**Implementation**

- Add flags for each module: relevance panel, evidence sets, saved views, evidence linking, handoff checklist, inline compare.
- Include runtime kill switch and default-off policy for high-risk additions.

**Acceptance criteria**

- Any enhancement can be turned off without redeploying issue core behavior.
- Flag states are observable in logs/diagnostics.

**Revalidation focus**

- Confirm existing feature-flag mechanism and preferred config location.

---

### Ticket C2 - Performance budgets and instrumentation

**Goal**

- Guarantee enhancements do not degrade issue page usability.

**Implementation**

- Define performance budgets: initial issue load, interaction latency, file preview launch, compare launch.
- Add instrumentation around panel open, filter switch, evidence attach, diff launch, and save actions.
- Add regression alerts for key thresholds.

**Acceptance criteria**

- Measured metrics stay within agreed budgets in staging.
- Clear fallback behavior when budgets are exceeded (disable heavier modules, revert to compact list).

**Revalidation focus**

- Confirm current telemetry/instrumentation stack and where to emit metrics.

---

### Ticket C3 - Accessibility and UX continuity pass

**Goal**

- Keep enhancements inclusive and consistent with existing issue workflows.

**Implementation**

- Keyboard navigation for all new file interactions.
- Screen-reader labels for relevance badges, evidence links, and checklist controls.
- Focus management and semantic announcements for dynamic state changes.

**Acceptance criteria**

- No keyboard traps or inaccessible-only visual affordances.
- Core issue actions remain primary and unaffected.

**Revalidation focus**

- Confirm current a11y patterns/components used in issue and files surfaces.

---

## Suggested dependency-aware order (not priority order)

1. A1 Relevance panel
2. A2 Evidence sets
3. A3 Inline compare
4. B1 Issue-scoped filters + saved views
5. B2 File-to-comment evidence linking
6. B3 File handoff checklist
7. C1 Feature flags
8. C2 Performance instrumentation
9. C3 Accessibility continuity pass

Rationale:

- Start with immediate user value on issue-file context.
- Add collaboration-quality workflows once curation primitives exist.
- Harden with operational safety and accessibility before broad rollout.

---

## Definition of done (per ticket)

- Existing Issue page core flows remain unchanged and stable.
- New feature is additive, discoverable, and reversible.
- Company scoping and permissions are enforced.
- Performance and a11y checks pass for touched surfaces.
- Revalidation result is recorded with any drift adaptations.
- Shared edge/error coverage (see `backlog2.0.md`) is handled: large files, deleted snapshots, unretrievable hashes, permission boundaries, network failures, malformed deep-link params.

---

## Ticket implementation template

- **Objective**
- **Current-state validation findings**
- **Adjusted implementation note (if code drifted)**
- **Touched modules**
- **Data/API contracts used or extended**
- **Feature flags and fallback behavior**
- **Risk and rollback**
- **Verification results (functional, performance, a11y)**

