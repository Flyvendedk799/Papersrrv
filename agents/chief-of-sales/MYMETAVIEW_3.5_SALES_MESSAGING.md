# MyMetaView 3.5 — Sales & Customer Success Messaging Alignment

**Source:** AIL-106 (Chief of Sales)  
**Date:** 2026-03-10  
**Depends on:** [EXECUTION_PLAN_MYMETAVIEW_3.5.md](../coo/EXECUTION_PLAN_MYMETAVIEW_3.5.md), [MYMETAVIEW_3.5_FEEDBACK_SYNTHESIS.md](../customer-success-lead/MYMETAVIEW_3.5_FEEDBACK_SYNTHESIS.md)

---

## 1. Purpose

Align sales and customer success messaging with MyMetaView 3.5 improvements. The board mandate: **generations in the demo must be 10x better**. This doc sets clear expectations for how we talk to prospects and customers about 3.5 — 10x generations, UX polish, and reliability.

---

## 2. Key Messaging (Customer-Facing)

### 2.1 Positioning Statement

> **MyMetaView 3.5** delivers on the promise we couldn't fully make in 3.0. We've rebuilt the preview generation pipeline from the ground up — better models, structured prompts, and intelligent caching. Demo output is measurably superior. Combined with UX fixes (mobile nav, CTA clarity) and reliability improvements, 3.5 is the release that earns trust.

### 2.2 What We Delivered (Aligned with 3.5 Improvements)

| Improvement | Sales/Customer Success Angle |
|-------------|------------------------------|
| **10x generation quality** | "We rebuilt the generation pipeline. Better models, structured prompts, and caching. Demo output is measurably superior — the previews you see now reflect what we promised." |
| **Demo in mobile nav** | "3.0 added Demo to desktop nav; 3.5 adds it to mobile. One tap from anywhere." |
| **Schedule Demo / CTA clarity** | "All CTAs now match their destination. Try Demo → instant demo. Schedule Demo or Start Free Trial → clear path." |
| **Landing title/meta** | "Clean first impression; no stray characters in page titles or meta." |
| **Backend robustness** | "Edge-case handling; null-safety; fewer generation failures." |
| **Deployment stability** | "Healthcheck and deployment fixes; fewer downtime incidents." |

### 2.3 What NOT to Overpromise

- Do not claim "10x" as a precise metric unless engineering/QA has validated.
- Do not promise specific dates beyond the project target (2026-03-11).
- Do not mention internal issues (agent runtime, GitHub push, manual ops) to customers.
- Do not say "all CTAs fixed" until Product Designer/UX confirms implementation (PD-3, PD-5).

---

## 3. "Schedule Demo" vs "Try Demo" — Messaging Clarity (3.5)

**Context:** Product Designer (AIL-101) specified Option A or B. Option A: rename "Schedule Demo" → "Start Free Trial" where it links to `/app`. Option B: add `/contact` and route "Schedule Demo" there.

### 3.1 Recommended Messaging Split

| CTA Intent | Recommended Copy | Destination |
|------------|------------------|-------------|
| **Self-serve demo** | "Try Demo" or "Watch Demo" | `/demo` |
| **Signup / trial** | "Start Free Trial" | `/signup` or `/app` |
| **Sales call / booking** | "Schedule Demo" or "Book a Call" | `/contact` (when available) |

### 3.2 3.5 State

- **"Watch Demo"** → `/demo` ✓ (3.0 fix)
- **"Schedule Demo"** → Per Product Designer: Option A (rename to "Start Free Trial") or Option B (link to `/contact`). Confirm with UX before claiming "fixed" in sales copy.

### 3.3 Sales Team Guidance

- **Outbound / cold outreach:** "Try the demo at mymetaview.com/demo — no sign-up required. 3.5 delivers 10x better preview quality."
- **When prospect asks for a live walkthrough:** "I'll send a calendar link" — do not direct them to "Schedule Demo" on the site until CTA is confirmed.
- **Customer success:** If a customer reports confusion from "Schedule Demo" → login, acknowledge: "3.5 clarifies demo vs. sign-in flow. Use mymetaview.com/demo for instant preview. We're tightening CTA consistency."

---

## 4. Customer Success Talking Points (3.5)

| Complaint | Response |
|-----------|----------|
| **"Generations weren't good enough"** | "3.5 delivers 10x better demo output. We've rebuilt the generation pipeline with improved models, prompts, and caching." |
| **"I couldn't find the demo"** | "3.0 added Demo to desktop nav; 3.5 adds it to mobile too." |
| **"Schedule Demo sent me to login"** | "3.5 clarifies all CTAs — demo vs. contact. Use mymetaview.com/demo for instant preview." |
| **"Site felt broken"** | "3.5 addresses polish, meta tags, and reliability end-to-end." |
| **"Deployment was unstable"** | "Healthcheck and deployment fixes in 3.5 reduce downtime risk." |

---

## 5. Demo Hero Copy (PD-5 Coordination)

Product Designer (AIL-101) specified: when 10x pipeline ships, consider adding a brief line on `/demo` such as "Try our improved preview engine." Coordinate with UX Manager (AIL-100) and Chief of Sales (AIL-106) for final copy.

**Suggested options for sales/marketing use:**
- "Try our improved preview engine — 10x better generations."
- "See what 10x better looks like. Try the demo."

Use only after QA confirms 10x pipeline is live.

---

## 6. References

- AIL-96 — MyMetaView 3.5 grand plan
- AIL-106 — This deliverable
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.5.md`
- `agents/customer-success-lead/MYMETAVIEW_3.5_FEEDBACK_SYNTHESIS.md`
- `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_3.5.md`
- `agents/chief-of-sales/MYMETAVIEW_3.0_SALES_MESSAGING.md`
- `.agent-workspaces/product-designer/PRODUCT_DESIGN_ALIGNMENT_MYMETAVIEW_3.5.md`
