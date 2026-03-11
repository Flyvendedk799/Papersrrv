# MyMetaView 4.0 — Sales Positioning, Pricing & Playbook

**Source:** AIL-130 (Chief of Sales)  
**Date:** 2026-03-10  
**Depends on:** [doc/plans/mymetaview-4.0-plan.md](../../doc/plans/mymetaview-4.0-plan.md), [doc/plans/mymetaview-4.0-scope.md](../../doc/plans/mymetaview-4.0-scope.md), [EXECUTION_PLAN_MYMETAVIEW_4.0.md](../coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md), [TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md](../founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md)

---

## 1. Purpose

Align sales and customer success messaging with MyMetaView 4.0. The board mandate: **The demo generation tool is still a gimmick — screenshot-based, not a full-scale tool.** 4.0 transforms it into a production-grade product. This doc defines positioning, pricing tiers, and sales playbook for the full-scale tool.

**Strategic shift:** 3.5 improved generation quality. 4.0 makes the *tool itself* production-ready: batch API, reliability, integrations, professional UX.

---

## 2. Key Messaging (Customer-Facing)

### 2.1 Positioning Statement

> **MyMetaView 4.0** is no longer a demo — it's a production tool. Submit dozens of URLs at once. Get results via API. Export to PNG, PDF, or embed. Integrate with webhooks. Built for teams that need scale, reliability, and control.

### 2.2 One-Line Pitch

> A production-grade batch API for AI-powered page previews — with reliability, integrations, and professional UX. Not a single-URL demo.

### 2.3 What We Delivered (Aligned with 4.0 Scope)

| Capability | Sales/Customer Success Angle |
|------------|------------------------------|
| **Batch API** | "Submit multiple URLs in one job. Poll status. Retrieve results. No more one-at-a-time." |
| **Production reliability** | "Retries, timeouts, SLAs. Partial success handling. Idempotent retry. Built for production." |
| **Export & embed** | "PNG, PDF, embed code. Download or embed previews in your app, docs, or CMS." |
| **Integration hooks** | "Webhooks on job completion. Callback URLs. Integrate with your pipeline." |
| **Professional tool UX** | "Tool-first, not demo-first. Batch flows, export, settings. Built for daily use." |
| **Auth & multi-tenant** | "API keys per tenant. Tenant isolation. Key rotation. Enterprise-ready." |
| **Usage limits & rate limiting** | "Per-tenant limits. Fair usage. Predictable capacity." |

### 2.4 What NOT to Overpromise

- Do not claim batch API is live until P3 ships and QA validates.
- Do not promise specific SLA numbers (e.g. "95% within 2x") until P4 is validated.
- Do not commit to pricing until P14 is finalized and board approves.
- Do not mention internal phases (P1–P20) or agent assignments to customers.
- Do not say "enterprise" until auth, multi-tenant, and limits (P9, P10) are in place.

---

## 3. Pricing Tiers (Proposed)

**Status:** Draft — refine with P10 (auth) and cost data. Board approval required before launch.

### 3.1 Tier Structure

| Tier | Target | Jobs/Month | URLs/Job | API Access | Webhooks | Support |
|------|--------|------------|----------|------------|----------|---------|
| **Starter** | Individuals, trials | 100 | 10 | ✓ | — | Self-serve |
| **Growth** | Small teams, agencies | 1,000 | 50 | ✓ | ✓ | Email |
| **Pro** | Mid-market, publishers | 10,000 | 100 | ✓ | ✓ | Priority |
| **Enterprise** | Large orgs, custom | Custom | Custom | ✓ | ✓ | Dedicated |

### 3.2 Tier Messaging

| Tier | Sales Angle |
|------|-------------|
| **Starter** | "Try the full API. Batch up to 10 URLs per job. Perfect for evaluation." |
| **Growth** | "Scale your workflow. 50 URLs per job. Webhooks for automation." |
| **Pro** | "Production volume. 100 URLs per job. Priority support." |
| **Enterprise** | "Custom limits, SLA, dedicated support. For high-volume or regulated use." |

### 3.3 Pricing Principles

- **Usage-based component:** Consider per-URL or per-job overage for Growth/Pro.
- **Annual discount:** 10–15% for annual commit.
- **Trial:** 14-day free trial on Starter; optional extended trial for Growth.
- **Migration:** 3.5 demo users get clear upgrade path; no breaking changes to single-URL demo during 4.0 ramp.

### 3.4 Coordination

- **P10 (Auth):** Confirms tenant model; enables tier enforcement.
- **P9 (Limits):** Implements per-tier caps.
- **Finance/Board:** Final pricing approval before P16 (visual assets) and launch.

---

## 4. Sales Playbook

### 4.1 Discovery Questions

| Question | Purpose |
|----------|---------|
| "How many URLs do you need to preview per day/week?" | Sizing → tier |
| "Is this for a one-off project or ongoing workflow?" | Stickiness, trial vs. commit |
| "Do you need to integrate with your CMS, docs, or pipeline?" | Webhooks, embed |
| "Single user or team?" | Multi-tenant, collaboration |
| "What's your tolerance for manual retries vs. automated reliability?" | Reliability value |

### 4.2 Objection Handling

| Objection | Response |
|-----------|----------|
| **"The demo was a gimmick"** | "4.0 is built for production. Batch API, reliability, webhooks. The demo was v1; this is the tool." |
| **"I only need one URL at a time"** | "Starter tier supports that. Batch is optional. You get API access and export either way." |
| **"What if a job fails?"** | "Partial success: you get completed URLs. Retry failed ones. Idempotent. We handle transient failures." |
| **"We need it in our stack"** | "Webhooks, callback URLs, embed code. Integrate with your pipeline." |
| **"Pricing?"** | "Tiers from Starter to Enterprise. [Share tier table.] Final pricing at launch; happy to discuss volume." |

### 4.3 Demo Flow (4.0)

1. **Single-URL demo** (mymetaview.com/demo) — still available for first-touch.
2. **Batch demo** (when P3 ships) — show job submit, status poll, results. "This is 4.0."
3. **Export demo** (when P7 ships) — PNG, PDF, embed. "Drop into your workflow."
4. **Webhook demo** (when P8 ships) — "Job completes → we POST to your URL."

### 4.4 Handoff to Customer Success

- **Starter → Growth:** Usage approaching 100 jobs/month; ask about workflow.
- **Growth → Pro:** Consistent high volume; ask about SLA needs.
- **Pro → Enterprise:** Custom limits, compliance, dedicated support.

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

---

## 6. References

- AIL-113 — MyMetaView 4.0 parent
- AIL-130 — This deliverable
- `doc/plans/mymetaview-4.0-plan.md`
- `doc/plans/mymetaview-4.0-scope.md`
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md`
- `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md`
- `agents/chief-of-sales/MYMETAVIEW_3.5_SALES_MESSAGING.md`
