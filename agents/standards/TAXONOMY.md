# Standards Taxonomy — Phase 2 Deliverable

**Status:** Pending board approval  
**Date:** 2026-03-09  
**Source:** [AIL-59](/AIL/issues/AIL-59) — Phase 2 of [AIL-52](/AIL/issues/AIL-52)  
**Inputs:** [Phase 0 STRUCTURE.md](STRUCTURE.md), [Phase 1 inventory](../doc/standards-inventory.md)

---

## 1. Scope Definitions

### Global (→ standards/global.md)

Standards that apply to **all agents** regardless of role. Loaded first; no agent may contradict them.

- Core control-plane invariants (single assignee, checkout semantics, approval gates)
- Safety rules (never exfiltrate secrets, no destructive commands unless authorized)
- Paperclip API contract (heartbeat flow, run ID, comment style)
- Repo conventions (read order, verification, definition of done)
- Company-scoping and contract sync

### Role-Specific (→ standards/hiring.md, standards/engineering.md)

Standards that apply only to agents in a given role. Extend global; never contradict.

- **hiring.md:** HR Manager, CEO, board — approval flow, hire initiation, org constraints
- **engineering.md:** Engineers, Founding Engineer — PR conventions, database workflow, coding standards

### Credentials (→ standards/secrets.md)

Standards about **credentials and secrets handling**. Applies to all agents that touch secrets (most do). Separate file because it's security-critical and referenced by both global and role-specific docs.

---

## 2. Mapping: global.md

| Standard | Source | Notes |
|----------|--------|-------|
| Read order (GOAL, PRODUCT, SPEC-implementation, DEVELOPING, DATABASE) | AGENTS.md §2 | All contributors |
| Repo map (server, ui, packages, doc) | AGENTS.md §3 | All contributors |
| Dev setup (pnpm install, pnpm dev) | AGENTS.md §4 | All contributors |
| Core engineering rules | AGENTS.md §5 | Company-scoping, contract sync, invariants, no wholesale doc replacement |
| Database change workflow | AGENTS.md §6 | Schema edit → migration → typecheck |
| Verification before hand-off | AGENTS.md §7 | typecheck, test, build |
| API and auth expectations | AGENTS.md §8 | Base path, company checks, activity logging |
| UI expectations | AGENTS.md §9 | Routes, company context, error surfacing |
| Definition of done | AGENTS.md §10 | SPEC match, tests pass, contracts synced |
| V1 contract (overrides SPEC.md when conflict) | SPEC-implementation §1 | Product/engineering |
| V1 outcomes (control-plane loop) | SPEC-implementation §2 | All contributors |
| V1 product decisions | SPEC-implementation §3 | Tenancy, company model, org graph, task ownership |
| In-scope / out-of-scope | SPEC-implementation §5 | Company lifecycle, goals, agents, tasks, approvals |
| Task ownership | SPEC-implementation | Single assignee; atomic checkout |
| Recovery | SPEC-implementation | No auto-reassign; stale work surfaced |
| Long-horizon product spec | SPEC.md | Context when SPEC-implementation is silent |
| Heartbeat procedure | Paperclip skill | Identity → approvals → assignments → checkout → work → update |
| Always checkout before work | Paperclip skill | POST /api/issues/{id}/checkout |
| Never retry 409 | Paperclip skill | Task belongs to others |
| Blocked-task dedup | Paperclip skill | Skip blocked unless new context |
| X-Paperclip-Run-Id on mutating calls | Paperclip skill | Traceability |
| Comment style | Paperclip skill | Status line + bullets + company-prefixed links |
| Never look for unassigned work | Paperclip skill | Exit if no assignments |
| Self-assign only for explicit @-mention | Paperclip skill | Requires PAPERCLIP_WAKE_COMMENT_ID |
| Budget | Paperclip skill | Auto-pause at 100%; focus critical at 80%+ |
| Escalate via chainOfCommand | Paperclip skill | When stuck |
| Never exfiltrate secrets | All agent AGENTS.md | Safety |
| No destructive commands unless authorized | All agent AGENTS.md | Safety |
| $AGENT_HOME for personal files | All agent AGENTS.md | Per agent |

---

## 3. Mapping: hiring.md

| Standard | Source | Scope |
|----------|--------|-------|
| Request hire | HR Manager HEARTBEAT | HR Manager |
| POST /api/companies/{id}/approvals hire_agent | HR Manager HEARTBEAT | HR Manager |
| Read HEARTBEAT.md, HIRING_CHECKLIST.md | HR Manager AGENTS | HR Manager |
| Approval flow (hire_agent type, approvals API) | doc/plans, doc/spec/ui.md §11 | HR Manager, CEO, board |
| When to initiate hires | AIL-52 plan | HR Manager |
| Approval gates | AIL-52 plan | Board |
| Org-structure constraints | AIL-52 plan | HR Manager, CEO |
| Delegation (create subtasks, assign to HR Partners) | HR Manager HEARTBEAT §4 | HR Manager |

**References:** [secrets.md](secrets.md) for credential handling during agent setup.

---

## 4. Mapping: engineering.md

| Standard | Source | Scope |
|----------|--------|-------|
| Deployment modes | doc/DEVELOPING.md | Engineers |
| Dependency lockfile policy | doc/DEVELOPING.md | Engineers |
| Prerequisites (Node 20+, pnpm 9+) | doc/DEVELOPING.md | Engineers |
| Start dev | doc/DEVELOPING.md | Engineers |
| Database in dev (auto PGlite) | doc/DEVELOPING.md, doc/DATABASE.md | Engineers |
| Local PostgreSQL (Docker) | doc/DATABASE.md | Engineers |
| Hosted PostgreSQL (Supabase) | doc/DATABASE.md | Engineers |
| Migration workflow | doc/DATABASE.md, AGENTS.md §6 | Engineers |
| Storage in dev | doc/DEVELOPING.md | Engineers |
| PR conventions | doc/DEVELOPING.md, AGENTS.md §5–7 | Engineers |
| Company deletion toggle | doc/DEVELOPING.md | Engineers |
| Read HEARTBEAT.md | Founding Engineer, Junior Dev AGENTS | Engineers |

**References:** [secrets.md](secrets.md) for secrets in dev, migration commands.

---

## 5. Mapping: secrets.md

| Standard | Source | Scope |
|----------|--------|-------|
| Company secrets config | doc/SPEC-implementation, doc/DEVELOPING.md | All agents |
| Adapter env vars resolution | doc/SPEC-implementation | All agents |
| Secrets in dev (refs, local encryption, strict mode) | doc/DEVELOPING.md | All agents |
| Secrets migration (pnpm secrets:migrate-inline-env) | doc/DEVELOPING.md | All agents |
| Never exfiltrate secrets | All agent AGENTS.md | All agents |
| Git PAT, API keys handling | AIL-52 scope | All agents touching credentials |

**References:** Paperclip company secrets API; adapter config schema.

---

## 6. Cross-Reference Summary

| File | References |
|------|------------|
| global.md | — (base layer) |
| hiring.md | secrets.md (credentials during hire) |
| engineering.md | secrets.md (secrets in dev, migration) |
| secrets.md | doc/SPEC-implementation, doc/DEVELOPING.md |

---

## 7. Gaps and Phase 3+ Notes

1. **HIRING_CHECKLIST.md** — HR Manager references it; Phase 3 should create or document location.
2. **Comment style (company-prefixed URLs)** — In global.md; Paperclip skill is canonical source.
3. **Approval flow** — Scattered in doc/; Phase 3 hiring.md should consolidate.
4. **Junior Dev** — No HEARTBEAT.md; inherits from parent or needs one (Phase 3 decision).
5. **Sales/UX/Graphics agents** — AGENTS.md present; HEARTBEAT.md varies; Phase 3 may add role-specific files if needed.

---

## 8. Board Approval

This taxonomy is ready for board review. Once approved:

- Phase 3: HR Manager implements hiring.md content
- Phase 4: COO/PCM implements task proposal conventions (may extend global or new file per STRUCTURE amendment)
- Phase 5: Engineering implements secrets scoping if needed

---

*End of Phase 2 taxonomy. Awaiting board approval.*
