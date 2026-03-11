# Customer Success Playbook — MyMetaView 4.0

**Issue:** AIL-131  
**Parent:** AIL-114 (MyMetaView 4.0 — Final Implementation Plan)  
**Author:** Customer Success Lead  
**Date:** 2026-03-10  
**Depends on:** P13 (Documentation for production use — AIL-129)

---

## 1. Purpose

This playbook defines **onboarding for 4.0**, **migration from demo**, and **support runbook** for the MyMetaView full-scale tool. Use it to drive time-to-value, reduce friction, and ensure consistent customer success outcomes.

**Strategic shift:** 3.5 improved generation quality. 4.0 makes the *tool itself* production-ready: batch API, reliability, integrations, professional UX. Customer success must align onboarding and support with this shift.

---

## 2. Onboarding for 4.0

### 2.1 Onboarding Goals

| Goal | Metric |
|------|--------|
| **Time-to-first-job** | Customer submits first batch job within 24h of signup |
| **Time-to-integration** | Customer integrates webhook or embed within 7 days (Growth+ tiers) |
| **Activation** | Customer completes 3+ successful batch jobs in first 14 days |

### 2.2 Onboarding Flow (Post-P3)

| Step | Action | Owner | Reference |
|------|--------|-------|-----------|
| 1 | **Welcome email** — API key, docs link, quick-start | CS / automated | [API Docs](../../.agent-workspaces/documentation-specialist/docs/API_DOCS_MYMETAVIEW_4.0.md) |
| 2 | **First job** — Single URL via `POST /api/demo-v2/batch` | Customer | API_DOCS_MYMETAVIEW_4.0.md §3 |
| 3 | **Status poll** — `GET /api/demo-v2/batch/{job_id}` | Customer | API_DOCS_MYMETAVIEW_4.0.md §4 |
| 4 | **Results** — `GET /api/demo-v2/batch/{job_id}/results` | Customer | API_DOCS_MYMETAVIEW_4.0.md §5 |
| 5 | **Batch** — 2–5 URLs in one job | Customer | — |
| 6 | **Webhook** (Growth+) — Configure `callback_url` or tenant webhook | Customer | [Integration Guide](../../.agent-workspaces/documentation-specialist/docs/INTEGRATION_GUIDE_MYMETAVIEW_4.0.md) |

### 2.3 Onboarding Checklist (CS Use)

- [ ] API key delivered and validated
- [ ] First job submitted successfully
- [ ] Customer understands quality modes (`fast`, `balanced`, `ultra`, `auto`)
- [ ] Partial success handling explained (inspect `result_urls[].status`)
- [ ] Tier limits communicated (Starter: 100 jobs/month, 10 URLs/job; Growth+: higher)
- [ ] Webhook setup (Growth+) if customer has integration needs
- [ ] Export/embed (P7) demo if customer needs PNG/PDF/embed

### 2.4 Key Onboarding Messages

| Message | When |
|---------|------|
| "4.0 is a production tool — batch, API, reliability. The demo was v1; this is the tool." | First touch |
| "Submit multiple URLs in one job. Poll status. Retrieve results. No more one-at-a-time." | Batch intro |
| "Jobs may complete with partial success. Always check `result_urls[].status` per URL." | Reliability |
| "Use webhooks to avoid polling. We POST to your URL on job completion." | Integration |
| "Quality modes: `fast` for speed, `balanced` for default, `ultra` for best quality." | First job |

---

## 3. Migration from Demo (3.5 → 4.0)

### 3.1 Migration Principles

- **No breaking changes** to single-URL demo during 4.0 ramp. Demo at mymetaview.com/demo remains available.
- **Clear upgrade path** — demo users who need scale get guided to batch API.
- **Phased rollout** — batch API (P3), export (P7), webhooks (P8) ship in order. Communicate availability per phase.

### 3.2 Migration Segments

| Segment | Description | Migration Action |
|---------|-------------|-----------------|
| **Demo-only** | Uses mymetaview.com/demo; no API | No action. Demo stays. Offer "Try batch" CTA when P3 ships. |
| **Demo + signup** | Signed up but only used demo | Welcome to 4.0; send API key; link to batch quick-start. |
| **Early API** | Used single-URL API (if any) | Batch API is additive. Same auth. New endpoints. No deprecation of single-URL during ramp. |

### 3.3 Migration Messaging

| Customer Type | Message |
|---------------|---------|
| **"I liked the demo"** | "4.0 keeps the demo. Adds batch, API, export. Try mymetaview.com/demo — then scale with the API." |
| **"I need more than one URL"** | "4.0 batch API: submit dozens at once. Same quality. Poll or use webhooks." |
| **"Will my workflow break?"** | "No. Single-URL demo stays. Batch is additive. We'll notify before any deprecation." |
| **"When can I migrate?"** | "Batch API (P3) first. Export (P7), webhooks (P8) follow. We'll email when each is live." |

### 3.4 Migration Timeline (Reference)

| Phase | Capability | Customer-Facing |
|-------|------------|-----------------|
| P3 | Batch API | "Batch API live. Submit multi-URL jobs." |
| P7 | Export & embed | "Export PNG, PDF, embed code." |
| P8 | Webhooks | "Webhooks on job completion." |
| P9 | Usage limits | "Per-tier limits enforced." |
| P10 | Auth & multi-tenant | "API keys, tenant isolation, key rotation." |

---

## 4. Support Runbook

### 4.1 Common Issues & Resolution

| Issue | Cause | Resolution | Escalate If |
|-------|-------|------------|-------------|
| **401 Unauthorized** | Missing/invalid API key | Verify `Authorization: Bearer <key>` or `X-Api-Key`. Check key not revoked. | Key valid but 401 persists → Engineering |
| **429 Rate limit** | Tier limit exceeded | Check `Retry-After` header. Explain tier limits. Offer upgrade path. | Customer disputes usage → Sales |
| **503 Queue backpressure** | Queue depth > threshold | "Temporary capacity limit. Retry after `Retry-After` seconds." | Sustained 503 → Engineering |
| **Partial success** | Some URLs failed | Normal. Inspect `result_urls[].status` and `error`. Retry failed URLs in new job. | — |
| **Job stuck in `queued`** | Worker backlog or outage | Check status; if >15 min with no progress, escalate. | → Engineering |
| **Timeout per URL** | Slow page, 60s default | "Per-URL timeout is 60s. Retry; or use `fast` quality for quicker attempts." | — |
| **Webhook not received** | URL unreachable, slow response | Webhook retries 3x. Receiver must return 2xx within 30s. Check customer endpoint. | — |

### 4.2 Escalation Paths

| Escalation | Owner | When |
|------------|-------|------|
| **Engineering** | Founding Engineer | API bugs, reliability, queue issues |
| **CTO** | CTO | Architecture, auth, scaling |
| **Sales** | Chief of Sales | Tier limits, pricing, upgrade path |
| **COO** | COO | Cross-functional, delivery blockers |

### 4.3 Support Resources (Internal)

| Resource | Location | Use |
|----------|----------|-----|
| API reference | `../../.agent-workspaces/documentation-specialist/docs/API_DOCS_MYMETAVIEW_4.0.md` | Endpoint specs, errors |
| Integration guide | `../../.agent-workspaces/documentation-specialist/docs/INTEGRATION_GUIDE_MYMETAVIEW_4.0.md` | Webhooks, polling, partial success |
| Deployment runbook | `../../.agent-workspaces/documentation-specialist/docs/DEPLOYMENT_RUNBOOK_MYMETAVIEW_4.0.md` | Ops context, smoke test |
| Technical architecture | `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md` | Batch model, queue, auth |
| Sales messaging | `agents/chief-of-sales/MYMETAVIEW_4.0_SALES_MESSAGING.md` | Talking points, objection handling |

### 4.4 Customer-Facing Links

| Link | Purpose |
|------|---------|
| mymetaview.com/demo | Single-URL demo (first-touch) |
| API docs (public URL when available) | Batch API reference |
| Support email / contact | Escalation |

### 4.5 Feedback Loop (P19)

Post-launch (AIL-135): Customer Success Lead owns feedback collection, issue triage, and iteration backlog. Use this playbook as baseline; update based on real customer feedback.

---

## 5. Customer Success Talking Points (4.0)

| Scenario | Response |
|----------|----------|
| **"When can I use the batch API?"** | "4.0 ships in phases. Batch API (P3) is Week 2 target. We'll notify when it's live." |
| **"Demo was fine but I need scale"** | "4.0 is built for that. Batch, API, reliability. We'll have a clear upgrade path." |
| **"Can I embed previews?"** | "Yes — 4.0 adds export (PNG, PDF) and embed code. P7." |
| **"Do you have webhooks?"** | "4.0 adds webhooks on job completion. P8." |
| **"What about rate limits?"** | "Per-tier limits. Starter: 100 jobs/month, 10 URLs/job. Growth and above scale up." |
| **"Is it enterprise-ready?"** | "Auth, multi-tenant, key rotation in 4.0. Enterprise tier for custom needs." |
| **"The demo was a gimmick"** | "4.0 is built for production. Batch API, reliability, webhooks. The demo was v1; this is the tool." |
| **"What if a job fails?"** | "Partial success: you get completed URLs. Retry failed ones. Idempotent. We handle transient failures." |

*Aligned with* [MYMETAVIEW_4.0_SALES_MESSAGING.md](../chief-of-sales/MYMETAVIEW_4.0_SALES_MESSAGING.md) §5.

---

## 6. Success Criteria

- [ ] Onboarding flow documented and aligned with P13 docs
- [ ] Migration path clear for 3.5 demo users; no breaking changes during ramp
- [ ] Support runbook covers common issues, escalation paths, and internal resources
- [ ] Talking points aligned with Sales (AIL-130)
- [ ] Handoff to P19 (post-launch feedback) after P18 deploy

---

## 7. References

- AIL-131 — This deliverable
- AIL-129 — P13 Documentation (API docs, integration guide, runbook)
- AIL-130 — Sales positioning (Chief of Sales)
- AIL-135 — Post-launch feedback loop (Customer Success Lead)
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md`
- `doc/plans/mymetaview-4.0-scope.md`
- `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md`
- `agents/customer-success-lead/MYMETAVIEW_3.5_FEEDBACK_SYNTHESIS.md`
