# Backlog 4.0 - GitHub Tab (Transform Projects into a GitHub Workspace)

## Intent

Transform the current **Projects tab** into a comprehensive **GitHub Tab** — a first-class workspace that unifies repos, pull requests, commits, branches, releases, checks, and project-level GitHub context, with deep bidirectional integration into Issues, Runs, and Boared chat. The goal is to:

- Make GitHub a native part of the Board, not a link-out.
- Enable fast PR creation and send-to-PR from Issues and agent work.
- Surface recent versions, PR status, and repository health at a glance.
- Keep existing Projects semantics (projects, workspaces, goals) intact and layered underneath.

This backlog is intentionally **adaptive**. Before implementing any ticket, run the revalidation checklist so the plan remains correct even if the codebase changes.

> **Relationship to other backlogs:** Independent of `backlog1/1.5/2.0` (files) and `backlog3.0` (Backlog Tab), but integrates naturally with them: Issues can attach PR evidence (like file evidence in `backlog2.0 B3`), Backlog items can be promoted to Issues then linked to PRs (`backlog3.0 C3`), and file pins can reference PR diffs. Shared policies (dependency fallback, edge coverage, revalidation discipline) from `backlog2.0.md` apply here too.

---

## Current foundation (validated in code)

- `projects` table and `project_workspaces.repoUrl` already store GitHub URLs per project.
- `ProjectDetail` has tabs (`overview` | `list`) and workspace/repo metadata editing (`ProjectProperties`).
- UI validates GitHub URLs client-side; canonical `owner/repo` is not normalized server-side.
- No Octokit/GitHub REST integration in the repo.
- No inbound webhooks, no synced PRs/commits/branches/releases/checks in DB.
- Existing "webhook" step in workflow engine is outbound fetch — not GitHub webhooks.
- Papee chat regex-extracts PR mentions from comments (display only, not structured).
- Secrets vault and local runner already handle Git tokens for agent execution — there is a credential surface to leverage, not rebuild.

**Meaning:** GitHub Tab is greenfield integration work, grounded on `project_workspaces.repoUrl` as the link key. We add a real integration layer (GitHub App or PAT), caches, and a focused UI, and wire it into Issues/Runs/Backlog/Papee.

---

## Transformation thesis

- Before: Projects tab is an issue grouping shell with passive repo URLs.
- After: GitHub Tab is the operational interface for repos and PRs, tightly coupled with Issues and agent work, where users (and Papee) can observe, act, and ship.

---

## Non-negotiable constraints

- Security first: GitHub tokens/installations must follow existing secrets patterns; no plaintext at rest beyond approved stores.
- Company scoping end-to-end; no leaking repos or PRs across companies.
- Rate-limit-aware: never hammer GitHub API; use caching and webhooks as source of truth.
- Do not regress existing Projects behavior; GitHub features layer on top and are flag-gated.
- All mutating GitHub actions (create PR, merge, comment) must log activity with actor attribution (human vs agent).
- Respect GitHub permissions of the connected identity; never bypass.

---

## Mandatory pre-flight revalidation (before each ticket)

1. Reconfirm Projects routes/services and `project_workspaces.repoUrl` shape.
2. Reconfirm secrets vault patterns and how tokens are injected into runners.
3. Reconfirm navigation (Masthead/Sidebar) and whether Projects still lives alongside or is replaced.
4. Reconfirm activity logging, query cache keys, and deep-link conventions.
5. Verify current UI/API patterns for long-running sync tasks (workflow engine, background jobs).
6. Recheck whether any parallel GitHub-related work landed since this doc was written.

If drift is found, add an "Adjusted implementation note" to the ticket/PR before coding.

Apply the **Dependency fallback policy** from `backlog2.0.md` verbatim.

---

## Priority policy

All phases are **required** and carry **equal priority**. Sequence is for dependency/risk management only.

---

## Unified user flows to support

### Flow G1 - Connect a repo
- Pick a project -> connect GitHub (App install or PAT) -> repo metadata and permissions verified -> dashboard populates.

### Flow G2 - Repo overview at a glance
- Open GitHub Tab -> see connected repos, recent PRs, CI status, recent releases, branch activity, and project linkage in one screen.

### Flow G3 - PR operations
- Create PR from Issue or branch in UI -> edit description using issue context -> assign reviewers -> push to GitHub.

### Flow G4 - Send to PR from Issue
- On an Issue, click "Open PR for this Issue" -> prefilled title/body/linking; or attach an existing PR to the Issue.

### Flow G5 - Agent-driven PR
- After a run/workflow, "Create PR from this run's branch" with curated diff summary, linked Issue, and evidence files.

### Flow G6 - PR review in Board
- Inspect PR summary, diff stats, CI checks, and reviewer status inside Board; jump to GitHub only when needed.

### Flow G7 - Recent versions and release context
- See recent tags/releases, changelog, and what PRs/issues are in a given version.

### Flow G8 - Repo health and insights
- Churn, stale PRs, failing checks, missing descriptions — flagged with one-click jump.

### Flow G9 - Papee on GitHub
- Papee answers "what's open for repo X?", "which PRs block issue Y?", "create draft PR description from issue Z" — all grounded in synced data.

---

## Phase A - Foundation: identity, connection, sync (equal priority)

### Ticket A1 - GitHub integration strategy

> **Blocking design decision:** choose GitHub App install (recommended for webhooks + scoped permissions) vs PAT/OAuth per user. Can ship PAT-first with App as follow-up; pick explicitly before coding.

**Goal**
- Establish the connection model that all GitHub features will build on.

**Implementation**
- Add `github_installations` (for App) or `github_connections` (for PAT/OAuth) table, company-scoped.
- Secret storage uses existing vault patterns.
- Repo binding stored as normalized `owner/repo` + optional `defaultBranch`, linked to `project_workspaces.repoUrl`.

**Acceptance criteria**
- Connection and disconnection flows are explicit and auditable.
- Tokens/installations scoped per company; no cross-company access.
- Repo normalization canonicalizes URLs (strip `www.`, trailing `/`, `.git`, etc.).

**Revalidation focus**
- Confirm existing vault/service for secrets and activity logging patterns.

---

### Ticket A2 - GitHub client service (rate-limit aware)

**Goal**
- Central server service wrapping Octokit with retry, backoff, and per-installation caching.

**Implementation**
- New `server/src/services/github.ts` using Octokit with App or OAuth token.
- Per-repo and per-user request caching with ETags; request coalescing.
- Structured error handling (401, 403, 404, 422, 429, 5xx) with clear error codes for UI.

**Acceptance criteria**
- Tolerates rate limits cleanly; surfaces remaining quota to UI.
- Central client means no scattered Octokit calls.

**Revalidation focus**
- Confirm dependency management and environment config conventions.

---

### Ticket A3 - Webhook ingestion

> **Blocking design decision:** receive GitHub webhooks via a dedicated ingress route vs deferred polling. Webhooks preferred for freshness; polling is acceptable fallback.

**Goal**
- Keep local state fresh using GitHub as source of truth.

**Implementation**
- `/api/webhooks/github` endpoint with signature verification.
- Handlers for `pull_request`, `push`, `check_run`, `release`, `issues`, `issue_comment`, `workflow_run`.
- Idempotent handlers; last-write-wins with timestamps.

**Acceptance criteria**
- Events are verified, logged, and materialized into cached tables.
- Replay is safe; no duplicate data on retries.

**Revalidation focus**
- Confirm ingress auth patterns and secret verification conventions.

---

### Ticket A4 - Local cache schema

**Goal**
- Cache the subset of GitHub data needed for snappy UX.

**Implementation**
- Tables (company-scoped, repo-scoped):
  - `github_repos` (owner/repo, default branch, permissions summary)
  - `github_pull_requests` (id, number, title, state, draft, head/base, author, mergeable, checks summary, updatedAt)
  - `github_commits` (minimal metadata for recent commits per branch)
  - `github_branches` (name, lastCommit, protected)
  - `github_releases` (tag, name, publishedAt, notes)
  - `github_checks` (run id, conclusion, status, url)
  - `github_reviews` (pr id, reviewer, state)
- Soft TTL + background refresh; webhooks mark rows fresh.

**Acceptance criteria**
- Cache recovers from stale/partial states without user intervention.
- Schema evolution is additive.

**Revalidation focus**
- Confirm migration workflow (`pnpm db:generate`) and shared types path.

---

## Phase B - GitHub Tab UX (equal priority)

### Ticket B1 - GitHub Tab navigation and route

**Goal**
- Promote GitHub to a first-class Board tab.

> **Blocking design decision:** replace the Projects entry entirely vs keep Projects as a sub-view under GitHub vs keep both. Decide before shipping nav changes.

**Implementation**
- Add `/github` route (company-prefixed) with landing dashboard.
- Register in Masthead `PRIMARY_NAV` (and Sidebar if both remain).
- If replacing Projects, preserve old `/projects/...` deep links via redirects to equivalent GitHub Tab views.

**Acceptance criteria**
- Users land in GitHub Tab fast and recognize the space immediately.
- No broken deep links from old Projects surfaces.

**Revalidation focus**
- Confirm active nav surfaces and redirect handling conventions.

---

### Ticket B2 - Repo dashboard

**Goal**
- Single-screen overview per connected repo.

**Implementation**
- Panels: open PRs (with draft/ready split), recent commits on default branch, recent releases, failing/pending checks, branch activity, linked project/goals.
- Quick actions: create PR, create branch from issue, open in GitHub.

**Acceptance criteria**
- Dashboard renders within performance budget from `backlog2.0.md` D2 (analogous thresholds).
- Empty states and unauthorized states clearly explained.

**Revalidation focus**
- Confirm layout/component system for card grids and status indicators.

---

### Ticket B3 - PR list and detail

**Goal**
- Inspect and operate on PRs without leaving Board.

**Implementation**
- PR list with filters (state, author, reviewer, label, checks status, linked issue).
- PR detail with description, file list summary, checks, reviewers, timeline (cached).
- Actions: comment, approve, request changes (via API when permitted), mark ready, merge (behind confirm).

**Acceptance criteria**
- Actions respect GitHub permissions and surface errors cleanly.
- Activity is logged for every mutation with actor attribution.

**Revalidation focus**
- Confirm comment/actor rendering conventions from Issues reuse.

---

### Ticket B4 - Branches and commits view

**Goal**
- Show what's shipping and what's drifting.

**Implementation**
- Branch list with last commit, ahead/behind default, open PR.
- Commit list per branch (cached) with author, message, checks.

**Acceptance criteria**
- Branch and commit views are scannable and filterable.
- Stale data indicator when cache lags webhooks.

**Revalidation focus**
- Confirm webhook freshness model.

---

### Ticket B5 - Releases and recent versions

**Goal**
- Make recent versions discoverable and useful.

**Implementation**
- Release list with tag, date, changelog preview, linked PRs/issues.
- "What's in this release" view that cross-links cached PRs and Issues.

**Acceptance criteria**
- Users answer "what's in vX?" without leaving Board.
- Release notes render safely (markdown, sanitized).

**Revalidation focus**
- Confirm markdown rendering reuse (`backlog2.0.md` C4a).

---

### Ticket B6 - Repo-to-project mapping and overview

**Goal**
- Keep existing Projects semantics usable and visible in GitHub Tab.

**Implementation**
- Per-project view includes: linked repo(s), filtered PR/issue signal, goal status, workspaces.
- "Overview" previously in Project detail becomes a tab inside GitHub Tab scoped by project.

**Acceptance criteria**
- No regression in project metadata/editing.
- Mapping is bidirectional and obvious.

**Revalidation focus**
- Confirm current `ProjectDetail` extension points.

---

## Phase C - Issue <-> PR workflows (equal priority)

### Ticket C1 - Create PR from Issue

**Goal**
- Make "ship this issue" a one-click action.

**Implementation**
- Action "Open PR" on Issue detail.
- Prefill: title from Issue, body from Issue + linked evidence, branch name convention, base branch default.
- Optional: select existing branch (agent-produced run branches qualify).

**Acceptance criteria**
- PR creation succeeds without leaving Board for common cases.
- Failures are explicit (permission, missing branch, conflicts).

**Revalidation focus**
- Confirm Issue detail extension and agent run branch data availability.

---

### Ticket C2 - Attach existing PR to Issue

**Goal**
- Structured linkage replaces comment-regex PR mentions.

**Implementation**
- UI to attach PR by URL or picker (from cached repo list).
- Store link in a structured table (`issue_github_links`) with role (`implements`, `relates`, `closes`).
- Preserve current regex surfacing for backward compatibility, but prefer structured links.

**Acceptance criteria**
- Linked PRs appear prominently on Issue detail with live status.
- Closing a PR updates Issue status advisory per rules.

**Revalidation focus**
- Confirm activity logging and notifications conventions.

---

### Ticket C3 - Bidirectional status surfacing

**Goal**
- See Issue context on PR and PR context on Issue at all times.

**Implementation**
- On Issue: show linked PRs with draft/ready, checks, reviewers, mergeable.
- On PR detail: show linked Issues, their status, and evidence files if present.
- When PR closes/merges, Issue lifecycle rules suggest transitions (non-blocking unless configured).

**Acceptance criteria**
- No stale state beyond cache TTL after a webhook event.
- Suggested transitions are user-approved, not silent.

**Revalidation focus**
- Confirm issue transition hooks from `backlog1.5 B3` direction — avoid conflicts.

---

### Ticket C4 - Send to PR from agent run / workflow

**Goal**
- Turn agent output into a real PR with one deliberate action.

**Implementation**
- On run detail and workflow output: "Create PR from this run" -> uses the run's produced branch, summarizes changed files from indexer (`backlog1.md 1.3`, `2.0 C2` provenance).
- PR body drafts pulled from run summary + linked Issue evidence.

**Acceptance criteria**
- PR accurately reflects the run's changes.
- Attribution shows agent + human orchestrator clearly.

**Revalidation focus**
- Confirm run-to-branch linkage and file indexer outputs.

---

### Ticket C5 - PR comments and reviews in Board

**Goal**
- Keep review loop inside Board when possible.

**Implementation**
- Render PR comment threads (general + line-scoped summary).
- Post comments and review actions via API (where permitted).

**Acceptance criteria**
- Review round-trip latency feels native.
- Clear permission and error paths.

**Revalidation focus**
- Confirm comment composer component reuse with Issues.

---

## Phase D - Intelligence, automation, and safety (equal priority)

### Ticket D1 - Papee on GitHub

**Goal**
- Let Papee query and act on synced GitHub data safely.

**Implementation**
- Papee tools (registry additions): `listOpenPRs`, `summarizePR`, `draftPRDescriptionFromIssue`, `linkPRToIssue`, `createPRFromIssue`, `summarizeRelease`.
- All actions deep-link and log with agent attribution; mutating tools follow existing governance (approval gates if configured).

**Acceptance criteria**
- Papee never mutates repo state without explicit authorization.
- Responses cite live cache or GitHub directly when cache is stale.

**Revalidation focus**
- Confirm Papee tool registry extension approach and approval gates.

---

### Ticket D2 - Repo health and insights

**Goal**
- Surface what needs attention now, not buried in GitHub.

**Implementation**
- Dashboards: stale PRs, failing checks, unreviewed PRs past SLA, contributors missing descriptions, branches far behind default.
- Click-through filters to act in one step.

**Acceptance criteria**
- Insights are actionable and accurate.
- Custom thresholds per company (simple config to start).

**Revalidation focus**
- Confirm analytics/metric rendering patterns to reuse.

---

### Ticket D3 - Search across PRs, issues (synced), releases

**Goal**
- Make the tab navigable even at scale.

**Implementation**
- Unified search over cached PRs, commits, releases, and GitHub-linked issues.
- Filter presets shared across views when applicable.

**Acceptance criteria**
- Search is fast, ranked, and consistent with Issues search UX.

**Revalidation focus**
- Confirm server search conventions (`backlog1.md 1.1`) for consistency.

---

### Ticket D4 - Feature flags and rollout

**Goal**
- Ship incrementally and safely.

**Implementation**
- Umbrella flag: `github_tab_enabled`.
- Sub-flags: `github_webhooks`, `pr_actions`, `papee_github_tools`, `release_insights`.
- Default off until each area is production-ready; Projects behavior preserved when flags are off.

**Acceptance criteria**
- Any submodule can be disabled independently.
- No user-visible breakage when flags are off.

**Revalidation focus**
- Confirm existing feature-flag infrastructure.

---

### Ticket D5 - Performance, accessibility, and edge safety

**Goal**
- Keep GitHub Tab fast, inclusive, and resilient.

**Implementation**
- Apply performance budgets from `backlog2.0.md` D2 to dashboard, PR list, PR detail, and search.
- Keyboard navigation, screen-reader labels, focus management.
- Edge cases: disconnected repo, revoked token, rate limit exhausted, webhook outage, PR deleted, branch force-pushed, merge conflict, archived repo, transferred repo ownership.

**Acceptance criteria**
- Metrics within budget in staging.
- a11y checks pass; keyboard-only users can operate PR workflows.
- Edge cases behave predictably with clear UX.

**Revalidation focus**
- Align with existing telemetry and a11y conventions.

---

## Phase E - Migration and continuity (equal priority)

### Ticket E1 - Project detail continuity

**Goal**
- Preserve everything users already do in Projects without disruption.

**Implementation**
- Maintain existing project CRUD, workspaces, goal links under GitHub Tab.
- Keep old `/projects/...` URLs working via redirects.

**Acceptance criteria**
- No regression on project creation/edit/list flows.
- Deep links from chat, comments, or docs continue to resolve.

**Revalidation focus**
- Verify all current Projects routes and UI references.

---

### Ticket E2 - Repo URL canonicalization

**Goal**
- Normalize existing `repoUrl` data for reliable linking.

**Implementation**
- Background migration to derive `owner/repo` and `defaultBranch` where possible.
- Expose normalized fields; keep raw URL for display.

**Acceptance criteria**
- Bad/ambiguous URLs flagged, not silently corrupted.
- UI displays both canonical and raw.

**Revalidation focus**
- Confirm migration and background job patterns.

---

### Ticket E3 - Deep links and cross-surface provenance

**Goal**
- Make GitHub entities first-class in deep-link navigation.

**Implementation**
- Routes: `/github/repos/:owner/:repo`, `.../pulls/:number`, `.../releases/:tag`.
- Bidirectional links: Issue <-> PR, Run <-> PR, Release <-> PRs/Issues.
- Activity entries link to GitHub entities when relevant.

**Acceptance criteria**
- Two-click rule: navigate between related GitHub entities, Issues, Runs in ≤ 2 clicks.
- Missing/unauthorized references degrade gracefully.

**Revalidation focus**
- Confirm activity row link resolver supports new entity types.

---

## Suggested dependency-aware order (not priority order)

1. A1 Integration strategy (App vs PAT decision)
2. A2 GitHub client service
3. A4 Cache schema
4. A3 Webhook ingestion (or polling fallback)
5. B1 Tab navigation
6. B2 Repo dashboard
7. B3 PR list and detail
8. E1 Project detail continuity
9. C2 Attach existing PR to Issue
10. C3 Bidirectional status surfacing
11. C1 Create PR from Issue
12. B4 Branches and commits
13. B5 Releases and recent versions
14. C4 Send to PR from run/workflow
15. C5 PR comments and reviews in Board
16. B6 Repo-to-project mapping
17. D3 Search
18. D2 Repo health and insights
19. D1 Papee on GitHub
20. E2 Repo URL canonicalization
21. E3 Deep links and provenance
22. D4 Feature flags
23. D5 Performance / a11y / edge safety

Rationale:
- Stand up connection, client, cache, and ingestion first.
- Land navigation + dashboard + PR views for perceived value quickly.
- Bridge Issues and runs to PRs to unlock core workflows.
- Add intelligence, insights, and Papee over a stable substrate.
- Migrate/canonicalize data and harden late.

---

## Definition of done (per ticket)

- GitHub interactions are company-scoped, permission-respecting, and rate-limit-safe.
- No regression in Projects, Issues, Runs, or Workflow behavior.
- All mutating actions log activity with correct actor attribution (human/agent).
- Cache consistency tolerates webhook outages; user sees stale indicators, not wrong data.
- Cross-surface deep links are deterministic and tested.
- Performance, a11y, and edge coverage pass per shared DoD in `backlog2.0.md`.
- Ticket includes revalidation notes for any drift adaptations.

### Shared edge and error coverage (must be handled)

- Disconnected or revoked integration (token expired, App uninstalled).
- Rate limit hit (exponential backoff + clear UX).
- Webhook outage / replay on reconnect.
- PR deleted, closed, branch force-pushed, repo archived or transferred.
- Merge conflicts and mergeability uncertainty.
- Permission boundary: reading/writing with insufficient scope.
- Company scoping violations (defense-in-depth server checks).
- Network/offline failure on dashboard, PR actions, and search.
- Malformed or legacy `repoUrl` data.

---

## Ticket implementation template

- **Objective**
- **Current-state validation findings**
- **Adjusted implementation note (if code drifted)**
- **User flows covered (G1-G9)**
- **Touched modules (ui / server / db / shared)**
- **Data / API contracts used or changed (incl. GitHub endpoints)**
- **Feature flags / fallback behavior (incl. rate limit and webhook outage)**
- **Security / permissions review notes**
- **Risk and rollback plan**
- **Verification results (functional, performance, accessibility, edge cases)**
