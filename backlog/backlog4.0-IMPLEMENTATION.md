# backlog/backlog4.0 — Foundational phase implementation notes

> Status: **foundation only**. Ships connections + minimal cache + read-only
> API + page shell, all gated behind `github_tab_enabled`. Projects tab is
> untouched and continues to be the default. No public behavioural changes
> unless an operator explicitly enables the flag.

This document captures the decisions made while implementing the foundation
slice of `backlog/backlog4.0.md`, along with deferred scope and operational
notes for reviewers.

## Decisions (see `backlog4.0.md` §Blocking decisions)

### 1. GitHub App vs PAT — **PAT-first**
- **Choice:** Personal Access Tokens (classic or fine-grained), stored in the
  existing company secret vault.
- **Why:** No external approvals needed, no org-admin dependency, works for
  self-hosted Boared instances, and slots directly into existing secret
  governance (rotate/revoke/access grants, activity log).
- **How it's kept future-compatible:** `github_connections.authType` is a
  `text` column with only `"pat"` used today and `"github_app"` pre-declared in
  the shared type (`GithubConnectionAuthType`). Adding App support later is
  purely additive — new auth rows + a new credential resolver.
- **Deferred:** App install flow (OAuth, installation id, webhook secrets),
  check runs, per-repo install scoping, and granular org permission prompts.

### 2. PR ↔ Issue link table — **deferred to Phase 2**
- **Choice:** Do not introduce a join table in the foundation.
- **Why:** Existing Issues already have `issue_links` (generic many-to-many)
  and `issue_handoff_checklists`. Committing to a PR-specific join prematurely
  would force us to ship the sync loop + webhook ingestion in the same slice.
- **Placeholder:** When the sync loop lands we expect to reuse `issue_links`
  with `link_type = "github_pr"` (or add a narrow `issue_github_pr_links`
  table) — TBD based on query pressure. Foundation leaves this untouched.

### 3. Webhook vs polling — **deferred; foundation is pull-only**
- **Choice:** Read-through the live REST API with ETag-based in-memory
  caching. No webhooks, no background sync.
- **Why:** Foundation should not introduce long-running workers, webhook
  secrets, or DB write paths for cached entities. The cache tables exist so
  the wiring is ready, but they are not populated automatically yet.
- **Deferred:** Webhook ingestion (A3), background sync worker (A5),
  persistent cache population (A4 write-side).

### 4. Projects coexistence — **coexist**
- **Choice:** Projects tab stays on by default. GitHub tab is a new, separate
  navigation entry gated behind `github_tab_enabled`.
- **Why:** Projects is load-bearing for existing workflows (issue grouping,
  workspace repoUrl). Replacing it is out of scope; GitHub lives alongside it
  and only surfaces integration features. No schema on `projects` is changed.

---

## Deliverables

### Shared types & helpers (`packages/shared`)
- `src/types/github.ts`
  - `GithubConnection`, `GithubConnectionAuthType`
  - `GithubRepoCache`, `GithubPullRequestCache`, `GithubPullRequestState`
  - `GithubRateLimitMeta`, `GithubApiError`
  - `GithubRepoView`, `GithubPullRequestView`, `GithubPullRequestListResult`
- `src/github-url.ts`
  - `parseRepoUrl(input)` — parses `owner/repo`, `github.com/owner/repo`,
    `git@github.com:owner/repo.git`, `https://github.com/owner/repo` etc.
  - `canonicalRepoKey(owner, repo)` — canonical lowercased form.
- `src/validators/github.ts` — Zod schemas for create/list endpoints.
- Exported from `packages/shared/src/index.ts` and
  `packages/shared/src/types/index.ts`.

### Database (`packages/db`)
- New schema files (all **additive**):
  - `schema/github_connections.ts`
  - `schema/github_repos.ts`
  - `schema/github_pull_requests.ts`
- All three tables are company-scoped (`company_id` FK → `companies`,
  `onDelete: cascade`) and reference `github_connections` where relevant.
- `github_connections.secretId` nullably references `company_secrets` so
  deleting a secret revokes the token reference without nuking the row.
- Migration: `packages/db/src/migrations/0035_sharp_ulik.sql`
  - Hand-edited from the drizzle-kit generated file to **only** add the
    GitHub tables (see "Migration history note" below).
  - Uses `CREATE TABLE IF NOT EXISTS` so it is safe on instances that already
    have adjacent backlog/papee migrations applied.

### Server (`server/src`)
- New dependency: `octokit` (added to `server/package.json`).
- `lib/feature-flags.ts` — tiny server-side flag reader
  (`PAPERCLIP_FF_<FLAG>=1|true|on`). Default off.
  - Flags: `github_tab_enabled`, `github_pat_auth`.
- `services/github.ts` — `createGithubClient(...)` using Octokit with an
  in-memory ETag cache keyed by `companyId:connectionId:resource`.
  - `getRepo(owner, repo)` and `listPullRequests(owner, repo, opts)` return
    narrow view types.
  - Structured errors via `GithubClientError` (401/403/404/422/429/5xx +
    `network_error`).
  - `clearGithubCache(key)` wipes entries for a connection on deletion.
  - **TODO documented in the file:** persistent cache backed by
    `github_repos` / `github_pull_requests` once sync loop lands.
- `services/github-connections.ts` — PAT lifecycle:
  - `list(companyId)` — non-revoked connections first.
  - `getById(id)`.
  - `createPatConnection(...)` — creates a `company_secrets` entry via the
    existing secrets service, stores only the hash/metadata, returns the
    connection row.
  - `resolveToken(id, companyId)` — decrypts the secret for a request.
    Enforces company scoping on the secret itself.
  - `remove(id)` — soft-delete (`revokedAt`) and release cache.
  - `markVerified(id)`.
- `routes/github.ts` — Express router mounted at `/api`:
  - `GET    /companies/:companyId/github/connections`
  - `POST   /companies/:companyId/github/connections` (PAT create)
  - `DELETE /companies/:companyId/github/connections/:id`
  - `GET    /companies/:companyId/github/repos/:owner/:repo`
  - `GET    /companies/:companyId/github/repos/:owner/:repo/pulls`
  - Every endpoint: `assertGithubTabEnabled()` → `assertCompanyAccess()` →
    (where applicable) `assertPatAuthEnabled()` → zod `validate`.
  - Mutations log `github.connection.created` / `github.connection.deleted`
    via `logActivity`.
- `app.ts` mounts the new router; `services/index.ts` re-exports the new
  pieces.

### UI (`ui/src`)
- `lib/featureFlags.ts` — added `github_tab_enabled` and `github_pat_auth`
  (both default-off; overridable via `VITE_FF_*`, URL `?ff=`, or
  `localStorage`).
- `lib/company-routes.ts` — `github` added to the company-prefixed routes
  list.
- `api/github.ts` — typed client wrapper (`listConnections`,
  `createConnection`, `deleteConnection`, `getRepo`, `listPulls`).
- `pages/GitHub.tsx` — foundational page:
  - Connections list with select/remove.
  - PAT create dialog (shown only when `github_pat_auth` is on).
  - Repo preview with `parseRepoUrl` input, default branch / visibility /
    archived / push & update timestamps, and rate-limit footer.
  - Pull request list with state filter (`open` / `closed` / `all`), draft /
    merged / closed state dots, and direct links to GitHub.
  - Empty, loading, and error states for each section (`ApiErrorBanner`).
- `components/boared/Masthead.tsx` — registers GitHub in the archive
  overflow menu only when `github_tab_enabled` is on.
- `App.tsx` — `/github` route + `/:company/github` lazy-loaded route added
  under the same flag (consistent with how backlog tab is gated).

---

## Feature flags

Both flags default **off**; the umbrella flag hides the tab from navigation
and returns 403 on the API. Overrides:

| Flag | Server env | UI env | URL / LS override |
|------|------------|--------|-------------------|
| `github_tab_enabled` | `PAPERCLIP_FF_GITHUB_TAB_ENABLED=1` | `VITE_FF_GITHUB_TAB_ENABLED=on` | `?ff=github_tab_enabled` or `localStorage["paperclip.ff.github_tab_enabled"]="on"` |
| `github_pat_auth` | `PAPERCLIP_FF_GITHUB_PAT_AUTH=1` | `VITE_FF_GITHUB_PAT_AUTH=on` | same pattern |

The sub-flag (`github_pat_auth`) exists so a deployment can turn on the tab
and read flow while keeping PAT creation disabled (e.g. in hardened
environments that only allow GitHub App auth once it ships).

---

## Security notes

- **Token storage:** PATs go through the existing secrets service, which
  encrypts at rest, stores SHA-256 hashes for activity logs, and enforces
  company-scoped access via `assertCompanyAccess`. The connection row only
  holds a `secretId` pointer; the raw token never touches the response
  payload.
- **Company scoping:** All endpoints assert `assertCompanyAccess` before any
  DB or API call. The connection service additionally verifies that a
  resolved secret belongs to the same company as the request.
- **Activity log:** Connection create/delete mutations emit structured
  `github.connection.*` events with actor (user or agent) attribution.
- **Rate limits:** The client service surfaces `rateLimit` metadata on every
  response; the route maps GitHub 403 with `x-ratelimit-remaining: 0` to a
  `rate_limited` error code so the UI can differentiate from permission
  denials. 429s are returned as HTTP 429 to the browser.
- **ETag caching:** In-memory only (per process). Conditional `If-None-Match`
  requests are issued with the last ETag to avoid burning rate limit on
  unchanged reads. Cache entries are dropped when a connection is removed.
- **Deferred hardening:** webhook signature verification, persistent cache
  ACLs, per-PR content redaction, and outbound push flows.

---

## Verification

- `pnpm --filter @paperclipai/shared typecheck` → **pass**.
- `pnpm --filter @paperclipai/db typecheck` → **pass**.
- `pnpm test:run` → **280 passed, 3 failed, 4 skipped**. The 3 failures are
  pre-existing in `papee-bubbles-shared.test.ts` and `usePapeeEnact.test.ts`
  (both rely on untracked `PAPEE_TOOL_TIER` exports). The 6 new
  `github-url.test.ts` tests pass. Two "unhandled errors" about missing
  `jsdom` are a pre-existing environment issue (vitest can't find the
  `jsdom` package; no test in this PR depends on jsdom).
- **Server / UI typecheck noise:** the working tree contains a large set of
  *untracked* WIP files from unrelated workstreams (`papee-*`, evidence-set,
  handoff-checklist, files/review-queue surfaces, etc.) that reference shared
  types and db schemas that do not yet exist on `feat/github-tab-foundation`.
  All typecheck errors on this branch originate in those files — none are in
  files added or modified by this PR. Verified by grep-filtering the tsc
  output for `github*`, `featureFlags`, `Masthead`, `company-routes`,
  `App.tsx` — zero matches. The `cli` package also has 16 pre-existing
  `TS18047` errors in `cli/src/commands/client/agent.ts` (unchanged by this
  PR).
- The earlier clean `pnpm -r typecheck` / `pnpm build` run on
  `feat/backlog-tab-foundation` happened because that branch tracks shared
  types/schemas for those workstreams; rebasing this PR onto the branch that
  ultimately lands those types will produce a clean tree. The GitHub slice
  has no dependency on them.

---

## Deferred tickets (from `backlog4.0.md`)

The following scope is **explicitly out** of this foundation slice and will
be picked up in follow-ups:

- **A3** GitHub webhook receiver + signature verification.
- **A4 (write side)** Persistent cache population for `github_repos` /
  `github_pull_requests` (tables exist; no sync loop yet).
- **A5** Background sync worker (Octokit rate-aware, incremental).
- **A6** GitHub App install flow + credential resolver.
- **B2** Repo picker wired to `project_workspaces.repoUrl` canonicalization
  backfill.
- **B3** PR ↔ Issue linking (display + mutation).
- **B4/B5** Checks / reviews / commits / branches / releases surfaces.
- **C1–C5** PR mutations (comment, approve, merge, close) and send-to-PR
  from Issues / agent work.
- **D*** Papee structured PR awareness + send-to-PR flows.

Every deferred ticket is safe to pick up on top of the foundation without
schema rewrites: the connection row carries `authType`, the cache tables
already include `etag` + `lastSyncedAt`, and routes are namespaced under
`/companies/:companyId/github/*`.

---

## Migration history note

`drizzle-kit generate` on this branch produced a `0035_*.sql` that attempted
to recreate older backlog / papee / evidence tables because snapshot files
for a few recent migrations are missing from the repo state. Rather than
reconstruct those snapshots in this PR (out of scope), the generated SQL was
hand-trimmed to **only** contain `CREATE TABLE IF NOT EXISTS` for the three
GitHub tables plus their indexes and foreign keys. This keeps the migration
strictly additive and idempotent on existing deployments.

The snapshot drift is logged as a separate task for the DB maintainer; it
does not block this slice.
