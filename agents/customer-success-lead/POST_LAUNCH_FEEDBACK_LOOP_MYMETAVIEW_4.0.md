# Post-Launch Feedback Loop — MyMetaView 4.0

**Issue:** AIL-135  
**Parent:** AIL-114 (MyMetaView 4.0 — Final Implementation Plan)  
**Author:** Customer Success Lead  
**Date:** 2026-03-10  
**Depends on:** P18 (Deployment & rollout — AIL-134)  
**Phase:** P19 / W19

---

## 1. Purpose

This document defines the **post-launch feedback loop** for MyMetaView 4.0: how to collect customer feedback, triage issues, and maintain an iteration backlog that drives product improvement. Execute this process **after P18 deployment** to capture real-world usage and feed learning back into the product.

**Strategic context:** 4.0 transforms the demo from a gimmick into a production tool (batch API, reliability, integrations). Post-launch feedback validates that shift and surfaces gaps in onboarding, UX, reliability, and feature fit.

---

## 2. Feedback Collection Channels

### 2.1 Primary Channels

| Channel | Source | Owner | Cadence |
|---------|--------|-------|---------|
| **Support tickets** | Email, contact form, in-app | Customer Success Lead | Daily review |
| **API/webhook errors** | Job failures, partial success, 429/503 | Founding Engineer (monitoring) | Weekly summary to CS |
| **Onboarding friction** | First-job drop-off, activation metrics | Customer Success Lead | Weekly |
| **Sales/customer calls** | Chief of Sales, outbound | Chief of Sales → CS | Ad-hoc handoff |
| **Board/user feedback** | Direct input, board comments | CEO/COO → CS | As received |

### 2.2 Secondary Channels

| Channel | Source | Owner | Cadence |
|---------|--------|-------|---------|
| **NPS / satisfaction** | Post-onboarding survey (if implemented) | Customer Success Lead | Monthly |
| **Usage patterns** | Batch size, quality mode mix, webhook adoption | Founding Engineer | Monthly report |
| **Competitive / market** | "Why did you choose us?" / "What's missing?" | Chief of Sales | Ad-hoc |

### 2.3 Collection Rules

- **Log every feedback item** — title, source, date, customer (if known), raw text
- **Tag by channel** — `support`, `api_error`, `onboarding`, `sales`, `board`
- **Preserve context** — link to support ticket, job_id, or conversation

---

## 3. Issue Triage Process

### 3.1 Classification

| Type | Definition | Example |
|------|------------|---------|
| **Bug** | Broken behavior; incorrect output; API error | 401 on valid key; job stuck in `queued` |
| **Enhancement** | New capability or improvement | "I need CSV export"; "Batch limit too low" |
| **Documentation** | Unclear docs; missing example | "How do I handle partial success?" |
| **Onboarding** | Friction in first-job flow | "I didn't know about quality modes" |
| **UX** | Tool usability; flow confusion | "Export button hard to find" |
| **Reliability** | Timeouts; retries; SLA | "Jobs timeout on large pages" |

### 3.2 Priority

| Priority | Definition | Action |
|----------|-------------|--------|
| **P0** | Blocker; affects multiple customers; production incident | Escalate immediately; create issue; notify COO |
| **P1** | High impact; conversion or retention risk | Create issue; assign to appropriate owner; target next sprint |
| **P2** | Medium impact; improvement | Add to backlog; schedule when capacity allows |
| **P3** | Low impact; nice-to-have | Backlog; deprioritize |

### 3.3 Routing

| Owner | Handles |
|-------|---------|
| **Founding Engineer** | API bugs, reliability, queue, webhooks, batch behavior |
| **CTO** | Architecture, auth, scaling, multi-tenant |
| **UX Manager** | Tool UX, flows, demo UX |
| **Product Designer** | Visual design, UX spec |
| **Documentation Specialist** | Docs gaps, examples, runbooks |
| **Chief of Sales** | Pricing, tier limits, upgrade path |
| **Customer Success Lead** | Onboarding, onboarding messaging, support runbook updates |
| **COO** | Cross-functional; prioritization; unblocking |
| **CEO** | Strategic direction; board alignment |

### 3.4 Triage Cadence

| Activity | Frequency | Owner |
|----------|-----------|-------|
| **Daily** | Review new support tickets; tag and classify | Customer Success Lead |
| **Weekly** | Synthesis meeting; triage backlog; assign P0/P1 | Customer Success Lead + COO |
| **Bi-weekly** | Backlog review with CEO/COO; prioritize for next sprint | Customer Success Lead |
| **Monthly** | Full feedback report; metrics; trends | Customer Success Lead |

---

## 4. Iteration Backlog

### 4.1 Backlog Structure

- **Source:** Paperclip issues under AIL-113 (MyMetaView 4.0) or a dedicated feedback epic
- **Labels:** `feedback`, `bug`, `enhancement`, `docs`, `onboarding`, `ux`, `reliability`
- **Priority:** Set per triage; link to original feedback source

### 4.2 Backlog Entry Format

When creating an issue from feedback:

- **Title:** Clear, actionable (e.g. "Add CSV export for batch results")
- **Description:** Source of feedback; customer context (if known); impact
- **Labels:** `feedback` + type
- **Assignee:** Per routing table
- **Parent:** AIL-113 or feedback epic

### 4.3 Backlog Maintenance

- **Weekly:** Add P0/P1 items; close duplicates; merge related feedback
- **Sprint planning:** Present prioritized items to COO; align with capacity
- **Retro:** Mark resolved items; update support runbook if resolution changes behavior

---

## 5. Success Metrics

| Metric | Target | Owner |
|--------|--------|-------|
| **Time-to-triage** | P0 within 4h; P1 within 24h | Customer Success Lead |
| **Feedback-to-backlog** | P0/P1 items have Paperclip issues within 48h | Customer Success Lead |
| **Resolution rate** | P0 resolved within 1 sprint; P1 within 2 sprints | COO (tracking) |
| **Activation** | 3+ successful batch jobs in 14 days (from playbook) | Customer Success Lead |
| **Support volume** | Track trends; reduce repeat issues via docs/UX | Customer Success Lead |

---

## 6. Handoff to Product

### 6.1 Weekly Synthesis

- **Format:** Markdown summary; bullet list of new feedback; priority; assigned actions
- **Recipients:** COO, CEO (if strategic), relevant owners
- **Location:** Internal doc or Paperclip comment on AIL-113 (or feedback epic)

### 6.2 Escalation Path

| Escalation | When | To |
|------------|------|-----|
| **Production incident** | P0; multiple customers affected | COO, Founding Engineer |
| **Strategic pivot** | Feedback suggests scope change | CEO |
| **Capacity** | Backlog too large; need prioritization | COO |
| **Cross-team** | Unclear owner; conflicting feedback | COO |

---

## 7. References

- AIL-131 — Customer success playbook (onboarding, migration, support runbook)
- AIL-135 — This deliverable
- AIL-129 — P13 Documentation (API docs, integration guide)
- AIL-134 — P18 Deployment (trigger for this process)
- `agents/customer-success-lead/CUSTOMER_SUCCESS_PLAYBOOK_MYMETAVIEW_4.0.md`
- `agents/customer-success-lead/MYMETAVIEW_3.5_FEEDBACK_SYNTHESIS.md` — Prior feedback synthesis pattern
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md`
