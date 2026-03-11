# Engineering Standards

**Scope:** Engineers, Founding Engineer  
**Source:** [AIL-52](/AIL/issues/AIL-52) Phase 3; [AIL-138](/AIL/issues/AIL-138) (patch/upgrade PR rule)  
**References:** [STRUCTURE.md](STRUCTURE.md), [secrets.md](secrets.md) (credentials in dev), `doc/DEVELOPING.md`, `doc/DATABASE.md`, AGENTS.md §5–10

---

## 1. Core Engineering Rules

These rules apply to all implementation work. See AGENTS.md §5 for full context.

1. **Company-scoping:** Every domain entity must be scoped to a company. Company boundaries must be enforced in routes and services.

2. **Contract synchronization:** When changing schema or API behavior, update all impacted layers:
   - `packages/db` schema and exports
   - `packages/shared` types, constants, validators
   - `server` routes and services
   - `ui` API clients and pages

3. **Control-plane invariants:** Preserve these invariants:
   - Single-assignee task model
   - Atomic issue checkout semantics
   - Approval gates for governed actions
   - Budget hard-stop auto-pause behavior
   - Activity logging for mutating actions

4. **Documentation:** Do not replace strategic docs wholesale unless asked. Prefer additive updates. Keep `doc/SPEC.md` and `doc/SPEC-implementation.md` aligned.

---

## 2. Definition of Done

A change is done when all are true:

1. Behavior matches `doc/SPEC-implementation.md` (or stated scope).
2. Verification passes: `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`.
3. Contracts are synced across db/shared/server/ui.
4. Docs updated when behavior or commands change.
5. **PR required:** Code changes must go through a pull request. See §3.2 for patch/upgrade exception handling.

If any verification step cannot be run, explicitly report what was not run and why.

---

## 3. PR Conventions

### 3.1 General Rule

PRs are required for all code changes. See §2 for Definition of Done.

### 3.2 Patch or Upgrade — PR Required

**Rule:** After a big patch or upgrade (e.g. major dependency bump, security patch, framework upgrade), a dev project must have a PR as a requirement to be done.

- **Why:** Patches and upgrades introduce risk. A PR ensures review, traceability, and rollback visibility. Direct pushes after large changes bypass team review.
- **When:** Applies to any work that involves:
  - Major version upgrades (e.g. `next@14` → `next@15`)
  - Security patches (e.g. `npm audit fix`, dependency CVE fixes)
  - Lockfile regeneration (`pnpm install --lockfile-only`, `pnpm update`)
  - Framework or toolchain upgrades
- **Requirement:** The task is not done until a PR exists and has been submitted for review. Do not push directly to main/master after patch/upgrade work.

**Example:** Agent applies `pnpm update` to fix a vulnerability. Work is not complete until a PR is opened with the lockfile and dependency changes for review.

### 3.3 Dependency Lockfile

- **Owner:** GitHub Actions owns `pnpm-lock.yaml`.
- **PRs:** Do not commit `pnpm-lock.yaml` in pull requests. CI validates resolution when manifests change.
- **Master:** Pushes to `master` regenerate lockfile with `pnpm install --lockfile-only --no-frozen-lockfile` and run verification with `--frozen-lockfile`.

See `doc/DEVELOPING.md` for full lockfile policy.

---

## 4. Verification Before Hand-off

Run this full check before claiming done:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

If anything cannot be run, explicitly report what was not run and why.

---

## 5. Database Workflow

- **Schema changes:** Edit `packages/db/src/schema/*.ts`; export new tables from `packages/db/src/schema/index.ts`.
- **Migration:** `pnpm db:generate` after schema edits.
- **Validation:** `pnpm -r typecheck` before hand-off.

Notes:
- `packages/db/drizzle.config.ts` reads compiled schema from `dist/schema/*.js`
- `pnpm db:generate` compiles `packages/db` first

See `doc/DATABASE.md` for embedded vs Docker vs hosted PostgreSQL modes, and AGENTS.md §6 for migration details.

---

## 6. API and Auth Expectations

When adding or modifying endpoints:

- **Base path:** `/api`
- **Company access:** Apply company access checks on all company-scoped endpoints.
- **Permissions:** Enforce actor permissions (board vs agent).
- **Activity log:** Write activity log entries for mutations.
- **Error codes:** Return consistent HTTP errors (`400/401/403/404/409/422/500`).

Agent access uses bearer API keys (`agent_api_keys`), hashed at rest. Agent keys must not access other companies.

See AGENTS.md §8 for full API and auth expectations.

---

## 7. UI Expectations

- Keep routes and nav aligned with available API surface.
- Use company selection context for company-scoped pages.
- Surface failures clearly; do not silently ignore API errors.

See AGENTS.md §9 for full UI expectations.

---

## 8. Dev Setup

- **Prerequisites:** Node.js 20+, pnpm 9+
- **Start:** `pnpm install` then `pnpm dev` from repo root
- **API:** `http://localhost:3100`
- **UI:** Served by API server in dev middleware mode (same origin)
- **Database:** Leave `DATABASE_URL` unset for embedded PGlite in dev
- **Storage:** Default `local_disk` at `~/.paperclip/instances/default/data/storage`
- **Secrets:** See [secrets.md](secrets.md) for credential handling in dev

Quick checks:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Reset local dev DB:

```sh
rm -rf data/pglite
pnpm dev
```

See `doc/DEVELOPING.md` for deployment modes, remote runner, Docker, and CLI operations.

---

## 9. Repo Map

- `server/`: Express REST API and orchestration services
- `ui/`: React + Vite board UI
- `packages/db/`: Drizzle schema, migrations, DB clients
- `packages/shared/`: shared types, constants, validators, API path constants
- `doc/`: operational and product docs

Read before changes: `doc/GOAL.md`, `doc/PRODUCT.md`, `doc/SPEC-implementation.md`, `doc/DEVELOPING.md`, `doc/DATABASE.md`.

---

*End of engineering standards. See [STRUCTURE.md](STRUCTURE.md) for file layout and cross-references.*
