# MyMetaView 3.0 — Sales & Customer Success Messaging Alignment

**Source:** AIL-90 (Chief of Sales)  
**Date:** 2026-03-10  
**Depends on:** W1 improvement list ([AIL-83](/AIL/issues/AIL-83)), [EXECUTION_PLAN_MYMETAVIEW_3.0.md](../coo/EXECUTION_PLAN_MYMETAVIEW_3.0.md)

---

## 1. Purpose

Align sales and customer success messaging with MyMetaView 3.0 improvements. Set clear expectations for how we talk to prospects and customers about the release.

---

## 2. Key Messaging (Customer-Facing)

### 2.1 Positioning Statement

> **MyMetaView 3.0** addresses customer feedback head-on. We've fixed conversion blockers, improved demo discoverability, and strengthened reliability. The product you'll see today reflects what our users asked for.

### 2.2 What We Fixed (Aligned with Improvement List)

| Improvement | Sales/Customer Success Angle |
|-------------|------------------------------|
| **Watch Demo → /demo** | "Try the demo instantly — no sign-in wall. One click from the homepage." |
| **Demo in nav** | "Demo is front and center in the main navigation." |
| **Schedule Demo clarity** | See §3 below — CTA intent must match destination. |
| **Landing title/meta** | "Cleaner first impression; no stray characters in page titles." |
| **Backend robustness** | "More reliable preview generation; edge cases handled." |
| **Deployment stability** | "Fewer downtime incidents; healthcheck and deployment fixes." |

### 2.3 What NOT to Overpromise

- Do not claim all 10 improvement items are "done" until engineering/QA confirms.
- Do not promise specific dates beyond the project target (2026-03-11).
- Do not mention internal issues (agent runtime, GitHub push) to customers.

---

## 3. "Schedule Demo" vs "Try Demo" — Messaging Clarity

**Issue #3 (Improvement List):** "Schedule Demo" links to `/app`; implies sales call/booking but sends to app.

### 3.1 Recommended Messaging Split

| CTA Intent | Recommended Copy | Destination |
|------------|------------------|-------------|
| **Self-serve demo** | "Try Demo" or "Watch Demo" | `/demo` |
| **Sales call / booking** | "Schedule Demo" or "Book a Call" | `/contact` or `/schedule` (when available) |

### 3.2 Current State (3.0)

- **"Watch Demo"** → `/demo` ✓ (fixed)
- **"Schedule Demo"** → `/app` (still misdirects; Product Designer/UX to fix CTA or add contact page)

### 3.3 Sales Team Guidance

- **Outbound / cold outreach:** Use "Try the demo at mymetaview.com/demo — no sign-up required."
- **When prospect asks for a live walkthrough:** "I'll send a calendar link" — do not direct them to "Schedule Demo" on the site until the CTA is fixed.
- **Customer success:** If a customer reports confusion from "Schedule Demo" → login, acknowledge: "We're aware; 3.0 fixes clarify demo vs. sign-in flow. Use mymetaview.com/demo for instant preview."

---

## 4. Customer Success Talking Points

- **Complaint: "I couldn't find the demo"** → "3.0 adds Demo to the main nav and fixes the hero CTA. Try mymetaview.com/demo."
- **Complaint: "Watch Demo sent me to login"** → "Fixed in 3.0. Demo is now one click, no sign-in required."
- **Complaint: "Site felt broken / unprofessional"** → "3.0 addresses landing page polish, meta tags, and reliability. We've tightened quality gates."
- **Complaint: "Deployment was unstable"** → "Healthcheck and nginx fixes in 3.0 reduce downtime risk."

---

## 5. References

- [AIL-81](/AIL/issues/AIL-81) — MyMetaView 3.0 parent
- [AIL-83](/AIL/issues/AIL-83) — Customer feedback improvement list
- [AIL-90](/AIL/issues/AIL-90) — This deliverable
- `agents/customer-success-lead/MYMETAVIEW_3.0_IMPROVEMENT_LIST.md`
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.0.md`
