# Backlog 3.0 - Backlog Tab (Plans, Drafts, and Promotion Pipeline)

## Intent

Introduce a first-class **Backlog Tab** that acts as a single workspace for plans, drafts, and pre-issue ideas surfaced via Boared (Papee chat, agent output, workflow runs), then promoted cleanly into real Issues. The goal is to:

- Let users capture plans and draft work without immediately committing to an Issue.
- Provide overview, grouping, and fast triage across everything that could become work.
- Offer "send to Backlog" from Issues and AI-agent surfaces.
- Keep the existing Issues system stable; Backlog feeds it, doesn't fragment it.

This backlog is intentionally **adaptive**. Before implementing any ticket, run the revalidation checklist so the plan remains correct even if the codebase changes.

> **Relationship to other backlogs:** Complementary to `backlog1.md`, `backlog1.5.md`, `backlog2.0.md` (files) — this one introduces a new domain surface (plans/backlog items) and touches Issues creation rather than files. Shared policies (dependency fallback policy, edge/error coverage, revalidation discipline) in `backlog2.0.md` apply here too.

---

## Current foundation (validated in code)

- Issues model is strong and canonical: `status`, `priority`, `projectId`, `goalId`, `parentId`, `labels`, `identifier`, links, comments, runs.
- `"backlog"` currently exists only as an **issue status** and a **project status** — not a separate domain concept.
- `IssuesList` has rich client-side filtering, grouping, board/list modes, and localStorage-persisted views (including a `"Backlog"` quick filter on `status === backlog`).
- Papee tools can already `createIssue`, `linkIssues`, `moveIssueToProject`, `setIssueStatus`, etc.
- Papee chat summarizes threads but does **not** persist a draft row; agents jump straight to real issues.
- Company scoping (`/api/companies/:companyId/...`) is consistent; Board routes are `/:companyPrefix/*`.
- No existing plan/draft/sprint/roadmap schema — Backlog is a greenfield addition layered cleanly over Issues.

**Meaning:** we are adding a new light domain entity (`backlog_items`) as a pre-issue workspace, reusing all existing Issue primitives after promotion. No rewrite of Issues is required.

---

## Transformation thesis

- Before: capturing work is binary — either an Issue is created, or it lives in chat transcripts.
- After: there is a durable, searchable, groupable backlog surface where ideas, plans, and drafts live with provenance, can be refined, grouped, ordered, and promoted into Issues when ready.

---

## Non-negotiable constraints

- Do not regress Issues behavior, views, or filters.
- Keep all additions company-scoped and permission-safe.
- Every mutation must log activity, consistent with current patterns.
- Preserve existing Papee tool semantics; extend, don't reroute.
- Any promotion must create a regular Issue using existing APIs — no parallel Issue model.
- Backlog items must remain usable even when flagged off (feature-flag-safe data).

---

## Mandatory pre-flight revalidation (before each ticket)

1. Reconfirm Issues routes/services (`/server/src/routes/issues.ts`, `/server/src/services/issues.ts`) and list/filter contract.
2. Reconfirm Papee tool surface (`papee-tools.ts`) and which issue-creation flows are active.
3. Reconfirm navigation surfaces: Masthead (primary) and Sidebar (legacy) — register new tab in both if both remain.
4. Reconfirm company routing via `/:companyPrefix/*` in `ui/src/App.tsx`.
5. Reconfirm activity logging and query cache invalidation patterns.
6. Recheck workflow run artifact and output surfaces that could feed Backlog.

If drift is found, add an "Adjusted implementation note" to the ticket/PR before coding.

Apply the **Dependency fallback policy** from `backlog2.0.md` verbatim.

---

## Priority policy

All phases are **required** and carry **equal priority**. Sequence is for dependency/risk management only.

---

## Unified user flows to support

### Flow P1 - Idea capture (chat to backlog)
- User or Papee captures an idea during chat -> "Send to Backlog" persists a backlog item with source, context, and draft body -> visible in Backlog Tab instantly.

### Flow P2 - Send to Backlog from Issues / agent work
- From an Issue, comment, run, or workflow output -> "Send to Backlog" to spin out related but not-yet-actionable work -> captured with provenance.

### Flow P3 - Triage and grouping
- Open Backlog Tab -> filter, search, group by theme/project/goal/label/source -> rank/reorder via stable rank -> turn noisy capture into structured plans.

### Flow P4 - Plan building
- Combine multiple items into a named plan (sprint, milestone, roadmap, or ad-hoc group) -> add notes -> mark as ready.

### Flow P5 - Promotion to Issue
- Promote one or many items to Issues in one action -> auto-apply project, goal, labels, priority; capture link back to origin backlog item for audit.

### Flow P6 - Post-promotion lineage
- From a promoted Issue, trace back to the original backlog item and its source (chat, run, workflow) for full provenance.

### Flow P7 - Reverse flow
- From an existing Issue, "move back to Backlog" when it's not ready yet, instead of closing it (preserve history + comments).

---

## Phase A - Data model and canonical backlog surface (equal priority)

### Ticket A1 - `backlog_items` schema

> **Blocking design decision:** finalize the schema below before shipping writes. UI and read-only paths can proceed on mocked data until decided.

**Proposed shape (starting point, must be confirmed at implementation time):**

- `id` (uuid)
- `companyId` (fk, scoped)
- `title` (text)
- `body` (text, markdown)
- `status` (`idea` | `draft` | `ready` | `promoted` | `archived`)
- `priority` (nullable, reusing issue priorities)
- `source` (`chat` | `issue` | `run` | `workflow` | `manual` | `agent`)
- `sourceRef` (json: `{ type, id, url? }` — e.g., threadId, issueId, runId, workflowRunId)
- `authorId` / `authorAgentId` (nullable)
- `projectId` (nullable fk)
- `goalId` (nullable fk)
- `labelIds` (M:N via `backlog_item_labels`)
- `rank` (lexorank or numeric) for ordering within views/groups
- `planId` (nullable fk to `backlog_plans`, see A3)
- `promotedIssueId` (nullable fk when promoted)
- Timestamps and `deletedAt` for soft delete.

**Acceptance criteria**
- Company scoping enforced at service level.
- Soft delete available; promoted items keep lineage.
- Migration is additive and reversible.

**Revalidation focus**
- Confirm label M:N table pattern (reuse `issue_labels` convention).
- Confirm activity logging hooks.

---

### Ticket A2 - Backlog service and routes

**Goal**
- Provide CRUD + list/search for backlog items.

**Implementation**
- Routes under `/api/companies/:companyId/backlog/items` and `/backlog/plans`.
- List endpoint supports filter (status, source, label, project, goal, planId), search, and group-by hints.
- Stable server ordering by `rank`, then `updatedAt`.
- Emit activity events on create/update/archive/promote.

**Acceptance criteria**
- APIs are consistent with existing resource patterns.
- Paginated or cursor-based to avoid list scale issues.
- Mutations logged and cache-invalidation friendly.

**Revalidation focus**
- Match existing error shape (`400/401/403/404/409/422/500`).

---

### Ticket A3 - Plans (named groups) model

> **Blocking design decision:** is a plan a first-class row or a backlog item `type`? Pick before shipping writes.

**Goal**
- Allow grouping items into named, ordered plans (sprint, milestone, roadmap, ad-hoc).

**Implementation**
- `backlog_plans`: `id`, `companyId`, `title`, `kind` (`sprint|milestone|roadmap|custom`), optional `startsAt`/`endsAt`, `status`, `projectId?`, `goalId?`, `rank`.
- Backlog items reference `planId` and have intra-plan `rank`.

**Acceptance criteria**
- Items can move across plans cleanly.
- Plans can be archived without deleting items.
- Reordering is reliable (lexorank or sparse integer).

**Revalidation focus**
- Confirm how projects/goals currently scope queries to avoid duplicate semantics.

---

## Phase B - Backlog Tab UX (equal priority)

### Ticket B1 - Backlog Tab navigation and route

**Goal**
- Register a first-class Backlog Tab discoverable from main navigation.

**Implementation**
- Add `/backlog` route under company-prefixed routing.
- Register in Masthead `PRIMARY_NAV` (and Sidebar if still in use).
- Default view: "Inbox" (unplanned items) + plans list in side nav.

**Acceptance criteria**
- Navigating to Backlog is as fast and obvious as Issues.
- Deep links survive refresh and sharing.

**Revalidation focus**
- Confirm which nav surfaces are still rendered and active (don't orphan the tab).

---

### Ticket B2 - Unified list + board + plan views

**Goal**
- Give users the same power as `IssuesList` but tuned for backlog curation.

**Implementation**
- Views: `list`, `board` (by status or plan), `plans` (plan-centric).
- Group by: status, source, project, goal, label, plan.
- Sort by: rank, updated, created, priority.
- Sticky filter chips, URL query sync, and per-view localStorage persistence consistent with Issues.

**Acceptance criteria**
- Filters/groups compose; URL captures state for shareable views.
- Performance budget (see `backlog2.0.md` D2) respected for large backlogs.

**Revalidation focus**
- Reuse components/utilities from `IssuesList` where safe; don't fork rendering.

---

### Ticket B3 - Drag-and-drop and keyboard reordering

**Goal**
- Make reordering fast and reliable.

**Implementation**
- DnD within and across plans/groups.
- Keyboard reorder for accessibility.
- Optimistic updates with rollback on rank collision.

**Acceptance criteria**
- Reorder latency is imperceptible for typical lists.
- Ranks remain stable under concurrent edits (idempotent rebalancing strategy).

**Revalidation focus**
- Confirm DnD library/patterns already used in app (reuse if present).

---

### Ticket B4 - Bulk operations

**Goal**
- Triage at speed, not one item at a time.

**Implementation**
- Select multiple -> bulk apply: label, priority, plan, project, goal, archive, promote.
- Keyboard shortcuts for selection and actions.

**Acceptance criteria**
- Bulk actions are atomic per item; partial failures reported clearly.
- All bulk mutations logged.

**Revalidation focus**
- Confirm activity logging batch pattern.

---

### Ticket B5 - Overview and insights strip

**Goal**
- Give the user a pulse: what's incoming, what's ready, what's stalling.

**Implementation**
- Top strip with counts: ideas, drafts, ready, promoted last N days, archived.
- "Aging" highlight: items untouched for too long.
- Per-plan progress bar when plans exist.

**Acceptance criteria**
- Insights are actionable (clicks filter the list).
- Renders quickly; tolerates empty state elegantly.

**Revalidation focus**
- Confirm existing empty-state/toast/UX patterns.

---

## Phase C - Capture and promotion pipelines (equal priority)

### Ticket C1 - "Send to Backlog" from Papee/chat

**Goal**
- Make backlog capture a one-click action from Boared chat.

**Implementation**
- Add Papee tool `createBacklogItem` with `{ title, body?, source: 'chat', sourceRef, projectId?, goalId?, labelIds? }`.
- UI: quick action on Papee messages and summaries ("Send to Backlog").
- Preserve thread/chat context in `sourceRef` for later lineage.

**Acceptance criteria**
- Works without creating an Issue by default.
- Clear success feedback with link to Backlog Tab.

**Revalidation focus**
- Confirm Papee tool registry and enact pipeline remain stable.

---

### Ticket C2 - "Send to Backlog" from Issues and agent work

**Goal**
- Let users spin off ideas from active work without polluting Issues.

**Implementation**
- Action available on: Issue detail, Issue comment, run detail, workflow output panel, activity row (for supported events).
- Backlog item captures `sourceRef` pointing back to origin (issueId / runId / workflowRunId / commentId).

**Acceptance criteria**
- Origin surfaces show "Sent to Backlog" indicator/link.
- Backlog item retains preview of origin (title, excerpt).

**Revalidation focus**
- Confirm Issue detail, run, and workflow components expose stable extension points.

---

### Ticket C3 - Promote to Issue (one and many)

**Goal**
- Turn backlog items into Issues with one deliberate action.

**Implementation**
- UI: "Promote" action on single item and on bulk selection.
- Optional pre-flight form: confirm title, project, goal, labels, priority, parentId, assignee.
- Server: create Issue via existing API, link back via `promotedIssueId` on backlog item, set status to `promoted`.
- Carry labels, project, goal, priority by default.

**Acceptance criteria**
- Promotion never creates an Issue in inconsistent state.
- Backlog item preserved with lineage, not deleted.
- Activity logged on both backlog item and new Issue.

**Revalidation focus**
- Confirm Issue creation schema and default-status behavior.

---

### Ticket C4 - Reverse flow: Issue to Backlog

**Goal**
- Give users a non-destructive "not ready yet" path.

**Implementation**
- Action on Issue detail: "Move to Backlog" (keeps Issue, creates linked backlog item, sets Issue status appropriately — e.g., `backlog` or a new `on_hold`-like state to be decided).
- Clear undo path.

> **Blocking design decision:** whether to reuse Issue status `backlog` or introduce a new status. Decide before shipping.

**Acceptance criteria**
- Round-trip (Issue -> Backlog -> Issue) preserves comments and history.
- No data loss across the transition.

**Revalidation focus**
- Confirm Issue status transitions and any guardrails.

---

### Ticket C5 - Capture from workflow output

**Goal**
- Turn useful agent/workflow outputs into actionable backlog items.

**Implementation**
- Add "Send to Backlog" to workflow run outputs and artifacts.
- Preserve artifact reference in `sourceRef`.

**Acceptance criteria**
- Linked artifacts remain accessible via existing retrieval paths.
- Handles unavailable artifacts gracefully (see Immutability Invariant in `backlog2.0.md`).

**Revalidation focus**
- Confirm artifact reference shapes stable in workflow routes.

---

## Phase D - Organization and collaboration (equal priority)

### Ticket D1 - Plans management UX

**Goal**
- Let users create, edit, sequence, and close plans.

**Implementation**
- Plans side nav with counts and progress.
- Create/edit dialog with kind, dates, project/goal links.
- Close/archive plan preserves items (moves to unplanned or next plan per user choice).

**Acceptance criteria**
- Plan lifecycle is clear; archived plans are findable.
- Items move across plans without rank corruption.

**Revalidation focus**
- Confirm route and nav compositions won't conflict with goals/projects.

---

### Ticket D2 - Templates and quick-capture

**Goal**
- Reduce capture friction to almost zero.

**Implementation**
- Global keyboard shortcut to open quick-capture.
- Templates for common item types (bug idea, experiment, doc task) with prefilled labels/priority.
- Paste-to-capture: clipboard content becomes a new item with source `manual`.

**Acceptance criteria**
- Capture from anywhere in the Board completes in under 5 seconds.
- Templates are configurable per company.

**Revalidation focus**
- Confirm keyboard shortcut conventions to avoid collisions.

---

### Ticket D3 - Comments and collaboration on items

**Goal**
- Allow refinement discussion before promotion.

**Implementation**
- Lightweight comments on backlog items (reuse comment component if feasible, else lean variant).
- Mentions, attachments (reusing file evidence concept from `backlog2.0.md` B3 when available).

**Acceptance criteria**
- Comments persist across promotion (either copied into Issue on promotion or kept linked).
- Clear rules documented for what moves where on promotion.

> **Blocking design decision:** whether comments copy over on promotion or link via `sourceRef`. Decide before writes.

**Revalidation focus**
- Reuse comment schema/rendering where clean.

---

### Ticket D4 - Assignment and ownership

**Goal**
- Make it obvious who is shepherding an item.

**Implementation**
- Soft assignment on backlog items (owner), separate from the eventual Issue assignee.
- Filter by owner.

**Acceptance criteria**
- Ownership is advisory, not enforced.
- Clear visual differentiation from Issue assignment.

**Revalidation focus**
- Confirm user/agent identity surfacing patterns.

---

## Phase E - Integrations, automation, and safety (equal priority)

### Ticket E1 - Papee intelligence on Backlog

**Goal**
- Use existing Papee tools to maintain and triage the backlog.

**Implementation**
- New Papee tools: `createBacklogItem`, `updateBacklogItem`, `groupBacklogItems`, `promoteBacklogItem(s)`, `archiveBacklogItem`.
- Safe defaults: Papee can create/update drafts freely but promotion to Issue still requires explicit user action unless governed rule allows.

**Acceptance criteria**
- Papee never promotes silently.
- All Papee actions appear in activity with agent attribution.

**Revalidation focus**
- Confirm Papee enact registry extension approach.

---

### Ticket E2 - Deep links and cross-surface provenance

**Goal**
- Make backlog items first-class in deep-link navigation (consistent with canonical file context from `backlog2.0.md` A1).

**Implementation**
- `/backlog/items/:id`, `/backlog/plans/:id` routes.
- Bidirectional links: Issue detail shows "Origin: backlog item X" and Backlog item shows "Promoted Issue Y".
- Activity entries link to backlog items when relevant.

**Acceptance criteria**
- Two-click rule: navigate between Issue <-> backlog item <-> source in ≤ 2 clicks.
- Missing references degrade gracefully.

**Revalidation focus**
- Confirm activity row link resolver supports new entity types.

---

### Ticket E3 - Feature flags and rollout

**Goal**
- Ship Backlog Tab safely next to Issues without destabilizing Board.

**Implementation**
- Flag umbrella: `backlog_tab_enabled`.
- Sub-flags: `papee_backlog_tools`, `bulk_promote`, `reverse_flow_issue_to_backlog`.
- All flags default off until ready.

**Acceptance criteria**
- Any submodule can be disabled independently.
- Issues UX remains fully functional when flags are off.

**Revalidation focus**
- Confirm feature-flag infra and config location.

---

### Ticket E4 - Performance, accessibility, and edge safety

**Goal**
- Keep Backlog Tab fast, inclusive, and robust.

**Implementation**
- Apply performance budgets from `backlog2.0.md` D2 where analogous (list render, preview, bulk action feedback, rank update).
- Keyboard navigation, screen-reader labels, focus management.
- Handle edge cases: deleted source, unavailable artifact, stale promoted Issue, huge bulk selections, concurrent rank conflicts.

**Acceptance criteria**
- Metrics within budget in staging.
- a11y checks pass; keyboard-only users can triage efficiently.
- Edge cases have documented behavior (no silent failures).

**Revalidation focus**
- Align with existing telemetry and a11y conventions.

---

## Suggested dependency-aware order (not priority order)

1. A1 `backlog_items` schema
2. A2 Service and routes
3. A3 Plans model
4. B1 Tab navigation
5. B2 List/board/plan views
6. C1 Send to Backlog from Papee/chat
7. C2 Send to Backlog from Issues/agent work
8. C3 Promote to Issue
9. B4 Bulk operations
10. B3 DnD and keyboard reordering
11. D1 Plans management UX
12. C4 Reverse flow Issue to Backlog
13. C5 Capture from workflow output
14. D2 Templates and quick-capture
15. D3 Comments and collaboration
16. D4 Ownership
17. E1 Papee tools
18. E2 Deep links and provenance
19. B5 Overview and insights strip
20. E3 Feature flags
21. E4 Performance / a11y / edge safety

Rationale:
- Establish data + routes + navigation shell first.
- Land capture and promotion pipelines to prove value early.
- Layer triage power (bulk, DnD) once core loop works.
- Add planning depth, collaboration, intelligence.
- Harden with flags, perf, a11y last.

---

## Definition of done (per ticket)

- Backlog works company-scoped end-to-end.
- Issues behavior, views, and filters are not regressed.
- New mutations log activity with correct actor attribution.
- Cross-surface deep links (Issue <-> backlog item <-> source) are deterministic and tested.
- Performance, a11y, and edge coverage pass per shared DoD in `backlog2.0.md`.
- Ticket includes revalidation notes for any drift adaptations.

### Shared edge and error coverage (must be handled)

- Deleted or archived source references (chat thread, run, workflow, issue, comment).
- Promotion to Issue when target project/goal/label was deleted — graceful fallback.
- Concurrent edits on rank (idempotent rebalancing).
- Bulk operations partial failures (report per-item status; never silent drop).
- Permission boundaries: following a deep link into unauthorized company/project.
- Network/offline failure on list, capture, promote, and bulk actions.
- Malformed deep-link params.

---

## Ticket implementation template

- **Objective**
- **Current-state validation findings**
- **Adjusted implementation note (if code drifted)**
- **User flows covered (P1-P7)**
- **Touched modules**
- **Data / API contracts used or changed**
- **Feature flags / fallback behavior**
- **Risk and rollback plan**
- **Verification results (functional, performance, accessibility, edge cases)**
