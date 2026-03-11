# MyMetaView 4.0 — Final Implementation Plan

**Parent:** AIL-113 (MyMetaView 4.0)  
**Issue:** AIL-114 (COO final implementation plan)  
**Project:** MyMetaView  
**Status:** Created 2026-03-10  
**Partners:** COO + Founding Engineer (architecture, batch API)  
**Board:** Approval required before implementation. Plan creation does not need approval.

---

## 1. Executive Summary

The board mandate: **The demo generation tool is still a gimmick — screenshot-based, not a full-scale tool.** MyMetaView 4.0 transforms it into a production-grade, scalable product. This execution plan translates the 20-phase strategic plan into phased milestones, workstreams, assignees, and technical specs — with delegation across the entire organization.

**Strategic shift:** 3.5 improved generation quality. 4.0 makes the *tool itself* production-ready: batch processing, API, reliability, integrations, and professional UX.

---

## 2. Phased Milestones

| Phase | Focus | Owner | Target | Depends On |
|-------|-------|-------|--------|------------|
| **P1** | Vision alignment & scope lock | CEO | Week 1 | — |
| **P2** | Technical architecture for scale | CTO + Founding Engineer | Week 1 | P1 |
| **P3** | Batch & bulk generation API | Founding Engineer | Week 2 | P2 |
| **P4** | Production reliability (retries, timeouts, SLAs) | CTO | Week 2 | P2 |
| **P5** | Quality gates at scale | QA Automation Engineer | Week 2–3 | P3, P4 |
| **P6** | Professional tool UX | UX Manager + Product Designer | Week 2 | P1 |
| **P7** | Export & embed workflows | Founding Engineer | Week 3 | P3 |
| **P8** | Integration hooks (webhooks, callbacks) | Founding Engineer | Week 3 | P3 |
| **P9** | Usage limits & rate limiting | Founding Engineer | Week 3 | P3, P10 |
| **P10** | Auth & multi-tenant foundation | CTO | Week 2 | P2 |
| **P11** | Monitoring & observability | Founding Engineer | Week 3 | P4 |
| **P12** | Error recovery & graceful degradation | Founding Engineer | Week 3 | P4 |
| **P13** | Documentation for production use | Documentation Specialist | Week 3 | P5 |
| **P14** | Sales positioning & pricing for 4.0 | Chief of Sales | Week 2 | P1 |
| **P15** | Customer success playbook | Customer Success Lead | Week 4 | P13 |
| **P16** | Visual assets & marketing for 4.0 | Graphics Specialist | Week 4 | P14 |
| **P17** | QA validation & release gates | QA Automation Engineer | Week 4 | P5–P12 |
| **P18** | Deployment & rollout | Junior Dev Git | Week 4 | P17 |
| **P19** | Post-launch feedback loop | Customer Success Lead | Week 5 | P18 |
| **P20** | PCM follow-through to completion | Process Chain Manager | Continuous | P1–P19 |

---

## 3. Technical Specs — Architecture & Batch API

*Partner deliverable: Founding Engineer. COO provides structure; FE owns technical depth.*

### 3.1 Architecture (P2 — CTO + Founding Engineer)

**Deliverable:** `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md`

| Dimension | Spec |
|-----------|------|
| **Batch job model** | Job entity: id, status (queued/running/completed/failed), urls[], created_at, completed_at, result_urls |
| **Queue design** | In-memory or Redis-backed queue; concurrency limits; job ordering |
| **API surface** | REST: `POST /batch` (submit), `GET /batch/{id}` (status), `GET /batch/{id}/results` (retrieve) |
| **Scaling strategy** | Horizontal scaling of workers; queue depth monitoring; backpressure |
| **Auth model** | API keys per tenant; tenant isolation; key rotation |

**Reference:** `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_3.5.md` for existing pipeline (model, prompts, caching).

### 3.2 Batch API (P3 — Founding Engineer)

**Deliverable:** Implemented batch API per P2 specs.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/demo-v2/batch` | POST | Submit multi-URL job; returns job_id |
| `GET /api/demo-v2/batch/{job_id}` | GET | Poll status: queued, running, completed, failed |
| `GET /api/demo-v2/batch/{job_id}/results` | GET | Retrieve generated preview URLs/images |

**Request body (submit):**
```json
{
  "urls": ["https://example.com/page1", "https://example.com/page2"],
  "quality_mode": "balanced"
}
```

**Response (status):**
```json
{
  "job_id": "uuid",
  "status": "running",
  "total": 2,
  "completed": 1,
  "failed": 0
}
```

### 3.3 Reliability (P4 — CTO)

- **Retry policies:** Exponential backoff for transient failures; max 3 retries per URL
- **Timeouts:** Per-URL timeout (e.g. 60s); job-level timeout (e.g. 30min)
- **SLA targets:** 95% job completion within 2x estimated time
- **Failure modes:** Partial success (return completed + failed); idempotent retry

### 3.4 Integration Hooks (P8 — Founding Engineer)

- **Webhooks:** POST to configured URL on job completion (success or partial)
- **Callback URLs:** Optional per-job callback
- **Payload:** job_id, status, result_urls, failed_urls, error_summary

---

## 4. Workstreams and Assignees

| Workstream | Owner | Scope | Phase |
|------------|-------|-------|-------|
| **W1: Vision & scope lock** | CEO | Board-approved scope; "full-scale tool" definition | P1 |
| **W2: Technical architecture** | CTO + Founding Engineer | Batch job model, queue, API surface, scaling | P2 |
| **W3: Batch API implementation** | Founding Engineer | Multi-URL API; job queue; status/results | P3 |
| **W4: Production reliability** | CTO | Retries, timeouts, SLAs, failure modes | P4 |
| **W5: Quality gates at scale** | QA Automation Engineer | Batch API tests; regression; thresholds | P5 |
| **W6: Professional tool UX** | UX Manager + Product Designer | Tool-first UX; batch, export, settings flows | P6 |
| **W7: Export & embed** | Founding Engineer | PNG, PDF, embed code; download flows | P7 |
| **W8: Integration hooks** | Founding Engineer | Webhooks, callbacks, integration docs | P8 |
| **W9: Usage limits** | Founding Engineer | Per-tenant limits; rate limiting; quotas | P9 |
| **W10: Auth & multi-tenant** | CTO | API auth; tenant isolation; key management | P10 |
| **W11: Monitoring** | Founding Engineer | Metrics, logging, alerting, dashboards | P11 |
| **W12: Error recovery** | Founding Engineer | Partial success; retry UX; fallbacks | P12 |
| **W13: Documentation** | Documentation Specialist | API docs, runbook, integration guide | P13 |
| **W14: Sales positioning** | Chief of Sales | Messaging; pricing tiers; playbook | P14 |
| **W15: Customer success playbook** | Customer Success Lead | Onboarding; migration; support runbook | P15 |
| **W16: Visual assets** | Graphics Specialist | Screenshots; demo video; marketing | P16 |
| **W17: QA validation** | QA Automation Engineer | Full regression; release checklist; go/no-go | P17 |
| **W18: Deployment** | Junior Dev Git | Push to production; verify | P18 |
| **W19: Post-launch feedback** | Customer Success Lead | Feedback collection; iteration backlog | P19 |
| **W20: PCM follow-through** | Process Chain Manager | Track AIL-113 to completion; unblock | P20 |

---

## 5. Dependency Graph

```
P1 (Vision) ──────────────────────────────────────────────────────────────┐
     │                                                                     │
     v                                                                     v
P2 (Architecture) ──> P3 (Batch API) ──> P7 (Export) ──> P17 (QA) ──> P18 (Deploy)
     │                     │                   │
     │                     v                   v
     v                 P8 (Hooks)           P13 (Docs) ──> P15 (CS Playbook)
P4 (Reliability) ──> P11 (Monitoring)           │
     │                     │                    v
     v                     v               P16 (Visual)
P10 (Auth) ──> P9 (Limits)              P14 (Sales) ──> P16
     │
     v
P5 (Quality Gates) ──> P17
     │
P6 (UX) ─────────────> P17
     │
P12 (Error Recovery) ─> P17

P20 (PCM) tracks all
P19 after P18
```

---

## 6. Child Issues (Assignable Work)

| Issue | Title | Assignee |
|-------|-------|----------|
| AIL-115 | Vision alignment & scope lock for MyMetaView 4.0 | CEO |
| AIL-116 | Technical architecture for scale (batch, queue, API) | Founding Engineer |
| AIL-117 | CTO architecture review for MyMetaView 4.0 | CTO |
| AIL-118 | Batch & bulk generation API implementation | Founding Engineer |
| AIL-119 | Production reliability (retries, timeouts, SLAs) | CTO |
| AIL-120 | Quality gates at scale for MyMetaView 4.0 | QA Automation Engineer |
| AIL-121 | Professional tool UX (tool-first, not demo UX) | UX Manager |
| AIL-122 | Product design for MyMetaView 4.0 tool UX | Product Designer |
| AIL-123 | Export & embed workflows for MyMetaView 4.0 | Founding Engineer |
| AIL-124 | Integration hooks (webhooks, callbacks) for MyMetaView 4.0 | Founding Engineer |
| AIL-125 | Usage limits & rate limiting for MyMetaView 4.0 | Founding Engineer |
| AIL-126 | Auth & multi-tenant foundation for MyMetaView 4.0 | CTO |
| AIL-127 | Monitoring & observability for MyMetaView 4.0 | Founding Engineer |
| AIL-128 | Error recovery & graceful degradation for MyMetaView 4.0 | Founding Engineer |
| AIL-129 | Documentation for production use (MyMetaView 4.0) | Documentation Specialist |
| AIL-130 | Sales positioning & pricing for MyMetaView 4.0 | Chief of Sales |
| AIL-131 | Customer success playbook for MyMetaView 4.0 | Customer Success Lead |
| AIL-132 | Visual assets & marketing for MyMetaView 4.0 | Graphics Specialist |
| AIL-133 | QA validation & release gates for MyMetaView 4.0 | QA Automation Engineer |
| AIL-134 | Deployment & rollout for MyMetaView 4.0 | Junior Dev Git |
| AIL-135 | Post-launch feedback loop for MyMetaView 4.0 | Customer Success Lead |
| AIL-136 | Process Chain Manager follow-through for MyMetaView 4.0 | Process Chain Manager |

---

## 7. Success Criteria

- [ ] Board approves plan before any implementation
- [ ] Technical architecture (batch, queue, API) approved by CTO
- [ ] Batch API implemented and deployed
- [ ] Production reliability (retries, timeouts, monitoring) in place
- [ ] Export, embed, and integration hooks delivered
- [ ] Professional tool UX (not demo UX)
- [ ] Sales and customer success aligned for 4.0 launch
- [ ] PCM tracks to completion

---

## 8. References

- AIL-113 (parent)
- `doc/plans/mymetaview-4.0-plan.md`
- `doc/plans/mymetaview-4.0-scope.md` — P1 scope lock (CEO)
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.5.md`
- `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_3.5.md`
- `agents/ceo/life/projects/mymetaview/summary.md`
