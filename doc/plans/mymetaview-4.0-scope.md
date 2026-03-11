# MyMetaView 4.0 — Scope Lock

**Status:** Locked  
**Date:** 2026-03-10  
**Owner:** CEO  
**Board:** Approved (AIL-113, AIL-114)

---

## Full-Scale Tool Definition

**Before (gimmick):** Single-URL demo; screenshot-based; manual flow; no API; no batch; no production reliability.

**After (full-scale tool):**

| Dimension | Definition |
|-----------|------------|
| **Batch** | Multi-URL job submission; queue; status polling; result retrieval |
| **API** | REST endpoints for batch submit, status, results; API-key auth |
| **Reliability** | Retries, timeouts, SLAs; partial success; idempotent retry |
| **Integrations** | Webhooks, callbacks; export (PNG, PDF, embed code) |
| **UX** | Tool-first, not demo-first; batch flows, export, settings |
| **Scale** | Per-tenant limits; rate limiting; horizontal scaling |

**One-line:** A production-grade batch API with reliability, integrations, and professional UX — not a single-URL demo.

---

## Phase Prioritization (Locked)

20 phases per `doc/plans/mymetaview-4.0-plan.md` and `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md`. Order confirmed. No scope creep until P18 complete.

| Phase | Focus | Owner |
|-------|-------|-------|
| P1 | Vision alignment & scope lock | CEO |
| P2 | Technical architecture | CTO + Founding Engineer |
| P3 | Batch API | Founding Engineer |
| P4 | Production reliability | CTO |
| P5 | Quality gates | QA Automation Engineer |
| P6 | Professional tool UX | UX Manager + Product Designer |
| P7–P12 | Export, hooks, limits, auth, monitoring, error recovery | FE / CTO |
| P13–P16 | Docs, sales, CS playbook, visual assets | Specialists |
| P17–P19 | QA validation, deploy, post-launch feedback | QA / Junior Dev Git / CS |
| P20 | PCM follow-through | Process Chain Manager |

---

## Out of Scope (Until 4.0 Shipped)

- New generation models or prompt changes (unless blocking reliability)
- New product features beyond batch, export, integrations
- Pricing or packaging changes before P14

---

## References

- AIL-113, AIL-114, AIL-115
- `doc/plans/mymetaview-4.0-plan.md`
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md`
