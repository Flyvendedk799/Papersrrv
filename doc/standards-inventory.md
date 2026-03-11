# Standards Inventory — Phase 1 Deliverable

**Status:** Inventory only (no new files in `standards/`)  
**Date:** 2026-03-09  
**Source:** [AIL-58](/AIL/issues/AIL-58) — Phase 1 of [AIL-52](/AIL/issues/AIL-52)  
**Feeds:** Phase 2 taxonomy mapping

---

## 1. Overview

This document lists all current standards found across the codebase, with location and scope (global vs role-specific). Used by Phase 2 to map into the locked structure (`standards/global.md`, `standards/hiring.md`, `standards/engineering.md`, `standards/secrets.md`).

---

## 2. Root-Level Standards

### 2.1 AGENTS.md (root)

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Read order (GOAL, PRODUCT, SPEC-implementation, DEVELOPING, DATABASE) | §2 | Global | All contributors |
| Repo map (server, ui, packages, doc) | §3 | Global | All contributors |
| Dev setup (pnpm install, pnpm dev) | §4 | Global | All contributors |
| Core engineering rules | §5 | Global | Company-scoping, contract sync, invariants, no wholesale doc replacement |
| Database change workflow | §6 | Global | Schema edit → migration → typecheck |
| Verification before hand-off | §7 | Global | typecheck, test, build |
| API and auth expectations | §8 | Global | Base path, company checks, activity logging |
| UI expectations | §9 | Global | Routes, company context, error surfacing |
| Definition of done | §10 | Global | SPEC match, tests pass, contracts synced |

---

## 3. doc/SPEC-implementation.md

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| V1 contract (overrides SPEC.md when conflict) | §1 | Global | Product/engineering |
| V1 outcomes (control-plane loop) | §2 | Global | All contributors |
| V1 product decisions | §3 | Global | Tenancy, company model, org graph, task ownership, etc. |
| In-scope / out-of-scope | §5 | Global | Company lifecycle, goals, agents, tasks, approvals, heartbeats |
| Task ownership | — | Global | Single assignee; atomic checkout |
| Recovery | — | Global | No auto-reassign; stale work surfaced |

---

## 4. doc/SPEC.md

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Long-horizon product spec | — | Global | Context when SPEC-implementation.md is silent |

---

## 5. doc/DEVELOPING.md

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Deployment modes | — | Global | local_trusted, authenticated |
| Dependency lockfile policy | — | Global | GitHub Actions owns pnpm-lock.yaml |
| Prerequisites (Node 20+, pnpm 9+) | — | Global | All contributors |
| Start dev | — | Global | pnpm dev |
| Database in dev (auto PGlite) | — | Global | Leave DATABASE_URL unset |
| Storage in dev | — | Global | local_disk default |
| Secrets in dev | — | Global | Secret refs, local encryption, strict mode |
| Secrets migration | — | Global | pnpm secrets:migrate-inline-env |
| Company deletion toggle | — | Global | PAPERCLIP_ENABLE_COMPANY_DELETION |

---

## 6. doc/DATABASE.md

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Embedded PostgreSQL (zero config) | §1 | Global | DATABASE_URL unset |
| Local PostgreSQL (Docker) | §2 | Global | docker compose |
| Hosted PostgreSQL (Supabase) | §3 | Global | Production |
| Migration workflow | — | Global | drizzle-kit push / migrate |

---

## 7. Paperclip Skill (Agent API Contract)

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Heartbeat procedure | — | All agents | Identity → approvals → assignments → checkout → work → update |
| Always checkout before work | — | All agents | POST /api/issues/{id}/checkout |
| Never retry 409 | — | All agents | Task belongs to others |
| Blocked-task dedup | — | All agents | Skip blocked unless new context |
| X-Paperclip-Run-Id on mutating calls | — | All agents | Traceability |
| Comment style | — | All agents | Status line + bullets + company-prefixed links |
| Never look for unassigned work | — | All agents | Exit if no assignments |
| Self-assign only for explicit @-mention | — | All agents | Requires PAPERCLIP_WAKE_COMMENT_ID |
| Budget | — | All agents | Auto-pause at 100%; focus critical at 80%+ |
| Escalate via chainOfCommand | — | All agents | When stuck |

---

## 8. Agent-Specific AGENTS.md

### 8.1 CEO (agents/ceo/AGENTS.md)

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Use para-memory-files skill | — | CEO | Memory, planning |
| Never exfiltrate secrets | — | CEO | Safety |
| No destructive commands | — | CEO | Unless board requests |
| Read HEARTBEAT.md, SOUL.md, TOOLS.md | — | CEO | Per heartbeat |

### 8.2 HR Manager (agents/hr-manager/AGENTS.md)

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Read HEARTBEAT.md, HIRING_CHECKLIST.md | — | HR Manager | Before hire |
| Never exfiltrate secrets | — | HR Manager | Safety |
| No destructive commands | — | HR Manager | Unless manager/board |

### 8.3 Founding Engineer (agents/founding-engineer/AGENTS.md)

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Read HEARTBEAT.md | — | Founding Engineer | Per heartbeat |
| Never exfiltrate secrets | — | Founding Engineer | Safety |
| No destructive commands | — | Founding Engineer | Unless manager/board |

### 8.4 COO (agents/coo/AGENTS.md)

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Read HEARTBEAT.md | — | COO | Per heartbeat |
| Never exfiltrate secrets | — | COO | Safety |
| No destructive commands | — | COO | Unless manager/board |

### 8.5 Junior Dev (agents/junior-dev/AGENTS.md)

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Report to Founding Engineer | — | Junior Dev | React specialist |
| No explicit HEARTBEAT.md ref | — | Junior Dev | May inherit from parent |

### 8.6 Other agents (HR Partners, Sales, Engineers, etc.)

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Read HEARTBEAT.md | — | Role-specific | Per agent |
| Safety (no exfiltrate, no destructive) | — | Role-specific | Common pattern |
| $AGENT_HOME for personal files | — | Role-specific | Per agent |

---

## 9. Agent-Specific HEARTBEAT.md

### 9.1 HR Manager (agents/hr-manager/HEARTBEAT.md)

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Identity and context | §1 | HR Manager | GET /api/agents/me |
| Get assignments | §2 | HR Manager | Prioritize in_progress, todo |
| Checkout and work | §3 | HR Manager | Always checkout; never retry 409; blocked = no release |
| Delegation | §4 | HR Manager | Create subtasks; assign to HR Partners |
| Notes hygiene | §5 | HR Manager | Under 50 lines; prune last 5 |
| Request hire | — | HR Manager | POST /api/companies/{id}/approvals hire_agent |
| API quick reference | — | HR Manager | Endpoints table |

### 9.2 Founding Engineer (agents/founding-engineer/HEARTBEAT.md)

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Identity and context | §1 | Founding Engineer | Same as HR Manager |
| Get assignments | §2 | Founding Engineer | Same |
| Checkout and work | §3 | Founding Engineer | Same |
| Notes hygiene | §4 | Founding Engineer | Same |
| API quick reference | — | Founding Engineer | Same endpoints |

### 9.3 Shared HEARTBEAT pattern (CEO, COO, HR Partners, etc.)

| Standard | Location | Scope | Notes |
|----------|----------|-------|-------|
| Identity → assignments → checkout → work → update | — | All agents with HEARTBEAT | Same flow |
| X-Paperclip-Run-Id on mutating calls | — | All agents | Traceability |
| Comment style | — | All agents | Status + bullets + links |

---

## 10. Platform References (from doc/)

| Topic | Location | Scope | Notes |
|-------|----------|-------|-------|
| Approval flow | doc/spec/ui.md §11, doc/plans/agent-authentication.md | Board, HR | hire_agent, approve_ceo_strategy |
| PR conventions | doc/DEVELOPING.md, AGENTS.md §5–7 | Engineers | — |
| Company secrets | doc/SPEC-implementation.md, doc/DEVELOPING.md | All agents | Secret refs, adapter config |

---

## 11. Summary by Target File (Phase 2 Mapping)

| standards/ file | Likely sources | Scope |
|-----------------|----------------|-------|
| global.md | AGENTS.md §5–10, SPEC-implementation §3, Paperclip skill rules, agent safety (no exfiltrate, no destructive) | All agents |
| hiring.md | HR Manager AGENTS/HEARTBEAT, HIRING_CHECKLIST, doc/plans/agent-authentication.md, doc/spec/ui.md §11 | HR Manager, CEO, board |
| engineering.md | AGENTS.md §5–7, doc/DEVELOPING.md, doc/DATABASE.md, engineer HEARTBEAT | Engineers, Founding Engineer |
| secrets.md | doc/DEVELOPING.md (Secrets in Dev), AGENTS.md §8, agent safety rules | All agents |

---

## 12. Gaps Identified

1. **No centralized HIRING_CHECKLIST.md reference** — HR Manager references it; location/format not in inventory.
2. **Junior Dev** — No HEARTBEAT.md; may inherit from parent or need one.
3. **Sales/UX/Graphics agents** — AGENTS.md present; HEARTBEAT.md presence varies by role.
4. **Comment style** — Company-prefixed URLs (e.g. `/AIL/issues/AIL-52`) required; defined in Paperclip skill, not in repo docs.
5. **Approval flow** — Scattered across doc/plans, doc/spec; no single reference doc.

---

*End of Phase 1 inventory. Ready for Phase 2 taxonomy.*
