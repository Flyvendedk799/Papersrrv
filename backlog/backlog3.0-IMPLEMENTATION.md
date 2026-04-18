# Backlog 3.0 — Foundation Phase Implementation

This document records the foundation-phase implementation of the Backlog Tab described in `backlog/backlog3.0.md`. Scope is intentionally narrow: tickets **A1, A3, A2, B1** plus shared types and a feature flag. Everything ships behind `backlog_tab_enabled` (default-off).

## Design decisions (documented per the backlog spec)

### 1. `backlog_items.status` — final enum

**Decision:** `idea | draft | ready | promoted | archived`.

- `idea` — default seed state, minimal fields required.
- `draft` — in-progress refinement; user or agent is shaping body/metadata.
- `ready` — curated and ready to promote to an Issue.
- `promoted` — terminal state; `promoted_issue_id` is populated once promotion ships (A4+, out of scope here).
- `archived` — soft-hidden from default views, kept for history / undo.

`deleted_at` provides an additional soft-delete tombstone so we can "archive permanently" without rewriting status on re-hydration.

### 2. Rank / ordering strategy

**Decision:** `rank text NOT NULL DEFAULT ''` — a string field indexed per `(company_id, rank)`. Foundation writes always default `rank` to `''` and sort fallback is `(rank, createdAt DESC)`. DnD / fractional reorder (backlog 3.0 B3) will populate this field later using jumpmock-style keys; storing it as `text` keeps that future change cheap.

### 3. Plan is a first-class row

**Decision:** `backlog_plans` is a separate table. `backlog_items.plan_id` is **nullable** and `ON DELETE SET NULL`, so items without a plan remain valid and deleting a plan does not cascade-delete items.

- First-class plans mean we can hang policy, workflow runs, and activity onto plans directly when promotion and bulk ops arrive.
- Plans carry `kind` (`sprint | quarter | roadmap | custom`) and `status` (`active | completed | archived`), a uniqueness constraint on `(company_id, title)`, and optional `project_id`/`goal_id` linkage.

---

## What shipped

### A1 — `backlog_items` + labels join

- `packages/db/src/schema/backlog_items.ts` — main table. UUID PK, `company_id` scoping, full status/priority/source enums as text, provenance via `source` + `source_ref jsonb`, author/owner for both human and agent actors, optional `project_id` / `goal_id` / `plan_id` / `promoted_issue_id`, `rank`, soft-delete, timestamps, and `(company_id, status)` / `(company_id, source)` / `(company_id, plan_id)` / `(company_id, project_id)` / `(company_id, rank)` indexes.
- `packages/db/src/schema/backlog_item_labels.ts` — M:N join against `labels`, mirrors the `issue_labels` convention (composite PK, cascade delete, `company_id` for tenancy safety, item+label+company indexes).
- Re-exported from `packages/db/src/schema/index.ts`.

### A3 — `backlog_plans`

- `packages/db/src/schema/backlog_plans.ts` — UUID PK, company-scoped, unique `(company_id, title)`, optional `project_id`/`goal_id`, `(company_id)` and `(company_id, status)` indexes. `backlog_items.plan_id` references it with `ON DELETE SET NULL` so items survive plan deletion.

### Migration `0031_backlog_foundation.sql`

Hand-written migration covering all three tables, their FKs, and indexes. Registered in `packages/db/src/migrations/meta/_journal.json` with `idx: 31, tag: "0031_backlog_foundation"`.

> **Note on migration numbering:** Drizzle's `db:generate` currently stalls on this repo because several in-flight branches have added conflicting snapshot entries (`0031`–`0034`) that never landed on `main`. This branch therefore ships a hand-written SQL migration slotted into `0031` against `main`'s `_journal.json`. Future branches should rebase their own migrations onto whichever migration actually lands first; that is a pre-existing repo-drift issue, not a backlog-3.0 issue.

### Shared types — `packages/shared/src/types/backlog.ts`

Pure-TypeScript types used by both the server and UI:

- `BACKLOG_ITEM_STATUSES`, `BACKLOG_ITEM_SOURCES`, `BACKLOG_PLAN_KINDS`, `BACKLOG_PLAN_STATUSES` as `as const` tuples + derived union types.
- `BacklogItem`, `BacklogPlan` API shapes (ISO-string timestamps, `BacklogItemSourceRef` for provenance).
- `CreateBacklogItemInput`, `UpdateBacklogItemInput`, `CreateBacklogPlanInput`, `UpdateBacklogPlanInput`, `BacklogItemFilters`.

Re-exported from both `packages/shared/src/types/index.ts` and `packages/shared/src/index.ts` so server and UI can `import { BacklogItem } from "@paperclipai/shared"`.

### A2 — Service + routes

- `server/src/services/backlog.ts` — `backlogService` with company-scoped read/create/update/archive for both items and plans, consistent DB-row → API-type mapping, default rank/status handling, and `HttpError` surfaces for 404 / 400.
- `server/src/routes/backlog.ts` — mounts under `/api/companies/:companyId/backlog/{items,plans}`, uses `assertCompanyAccess`, logs activity on every mutation via the standard `logActivity` hook, and returns the consistent `{ item }` / `{ items }` / `{ plan }` / `{ plans }` envelope shape.
- Registered in `server/src/services/index.ts` and `server/src/app.ts`.

### B1 — UI tab, route shell, navigation

- `ui/src/api/backlog.ts` — thin client matching the new endpoints.
- `ui/src/lib/queryKeys.ts` — `queryKeys.backlog.{items, item, plans, plan}` entries.
- `ui/src/pages/Backlog.tsx` — minimal page that lists items (empty-state + simple list) and provides a **Create backlog item** dialog (title + body). Good-enough shell for the feature flag reveal; follow-up tickets will layer filtering, grouping, rank DnD, and plan views on top.
- `ui/src/App.tsx` — `/backlog` route added inside `boardRoutes()` and a matching unprefixed redirect, both gated on `isFeatureEnabled("backlog_tab_enabled")`.
- `ui/src/components/Sidebar.tsx` — conditional `Backlog` nav entry under the main workspace section, gated on the same flag.

> **Note on Masthead vs Sidebar:** `backlog3.0.md` mentions adding the nav entry to `Masthead.tsx`. On this branch `Masthead.tsx` belongs to an in-flight "boared" rebrand that isn't wired into `App.tsx` yet, so touching it would couple this foundation commit to an unrelated surface. The feature is instead surfaced via the existing `Sidebar.tsx`, which is what users actually see today. When the boared rebrand lands, a follow-up can mirror the entry into the new Masthead.

### Feature flag

- `ui/src/lib/featureFlags.ts` — `backlog_tab_enabled` key, default `false`, honoring the standard triple-lookup (env `VITE_FF_BACKLOG_TAB_ENABLED`, localStorage `paperclip.ff.backlog_tab_enabled`, URL `?ff=backlog_tab_enabled`).

---

## What is explicitly out of scope

The backlog spec lists these for later phases; none of them ship here:

- Bulk operations / multi-select.
- Drag-and-drop reordering (rank column is present but unused by the UI).
- Promotion to Issues (`backlog_items.promoted_issue_id` remains nullable with no writer).
- Papee tool verbs for backlog (createBacklogItem, promoteBacklogItem, etc.).
- Comments / evidence / checklists on backlog items.
- Plan detail view, plan grouping, plan timelines.

---

## Verification

Ran against the branch `feat/backlog-tab-foundation`:

- `pnpm --filter @paperclipai/shared --filter @paperclipai/db --filter @paperclipai/server --filter @paperclipai/ui typecheck` → **pass**.
- `pnpm test:run` at the repo root → **48 files, 240 tests pass** (1 file / 4 tests intentionally skipped, pre-existing).
- `pnpm --filter @paperclipai/shared --filter @paperclipai/db --filter @paperclipai/server --filter @paperclipai/ui build` → **pass**.

> `pnpm -r typecheck` reports pre-existing failures in `cli/src/commands/client/agent.ts` and the CLI's view of `server/src/services/workflow-engine.ts`. Both reproduce on `main` with this branch stashed and are unrelated to backlog 3.0. Not fixed here.

---

## Files touched on this branch

Added:

- `packages/db/src/schema/backlog_items.ts`
- `packages/db/src/schema/backlog_item_labels.ts`
- `packages/db/src/schema/backlog_plans.ts`
- `packages/db/src/migrations/0031_backlog_foundation.sql`
- `packages/shared/src/types/backlog.ts`
- `server/src/services/backlog.ts`
- `server/src/routes/backlog.ts`
- `ui/src/api/backlog.ts`
- `ui/src/pages/Backlog.tsx`
- `ui/src/lib/featureFlags.ts`
- `backlog/backlog3.0-IMPLEMENTATION.md` (this file)

Modified:

- `packages/db/src/schema/index.ts` — export backlog schemas.
- `packages/db/src/migrations/meta/_journal.json` — register `0031_backlog_foundation`.
- `packages/shared/src/index.ts` — re-export backlog types at the package root.
- `packages/shared/src/types/index.ts` — re-export backlog types from the types barrel.
- `server/src/app.ts` — mount `backlogRoutes`.
- `server/src/services/index.ts` — export `backlogService`.
- `ui/src/App.tsx` — add flagged `/backlog` route + unprefixed redirect.
- `ui/src/components/Sidebar.tsx` — add flagged `Backlog` nav entry.
- `ui/src/lib/queryKeys.ts` — add `queryKeys.backlog.*`.
