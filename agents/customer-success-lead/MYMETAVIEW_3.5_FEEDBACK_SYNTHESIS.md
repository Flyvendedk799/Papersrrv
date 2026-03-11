# MyMetaView 3.5 — Customer Feedback Synthesis

**Source:** AIL-102 (Customer Success Lead)  
**Parent:** AIL-96 (MyMetaView 3.5 grand plan)  
**Date:** 2026-03-10  
**Handoff to:** UX Manager (W3), Product Designer (W4), Founding Engineer (W1/W6), Chief of Sales (W10)

---

## 1. Executive Summary

Synthesized from **post-release feedback** (MyMetaView 3.0), board mandate (AIL-95), prior improvement list (AIL-83), UX validation (AIL-84), QA reports (AIL-75, AIL-88), and deployment history. Prioritized for **MyMetaView 3.5** with the board mandate front and center: **generations in the demo must be 10x better**.

**Post-release status (3.0):** Watch Demo → /demo fixed; Demo in nav; backend robustness (preview_reasoning.py); deployment verified (5d68b64). Board assessment: **3.0 was not comprehensive enough** — generation quality remains the top gap.

---

## 2. Improvement List — Prioritized for 3.5

### P0 — Board Mandate: 10x Generation Quality

| # | Issue | Source | Impact | Owner |
|---|-------|--------|--------|-------|
| 0 | **Generation quality 10x** — Demo output must be measurably superior; current quality inconsistent; no structured model/prompt/cache strategy | Board AIL-95, Grand Plan AIL-96 | Primary driver of bad reviews; conversion and trust | Founding Engineer (W1/W6) |

*Technical specs: model selection, prompt library, caching design, robustness fixes, quality profile (fast/balanced/ultra). See EXECUTION_PLAN_MYMETAVIEW_3.5.md §4.*

---

### P1 — Conversion & First Impression (Carryover from 3.0)

| # | Issue | 3.0 Status | Impact | Owner |
|---|-------|------------|--------|-------|
| 1 | **"Schedule Demo" misdirects** — CTA links to `/app`; unauthenticated users hit login instead of demo or contact | **Open** (UX AIL-84) | Conversion blocker; broken expectation | UX Manager, Product Designer |
| 2 | **Demo in mobile nav** — Desktop has Demo; mobile menu omits it | **Open** (UX AIL-84) | Lost conversions on mobile | UX Manager |
| 3 | **Landing page title/meta** — Stray character `🔍" MetaView` in fetched content | **Open** (UX AIL-76/84) | Unprofessional first impression | UX Manager |

---

### P2 — Trust & Reliability

| # | Issue | 3.0 Status | Impact | Owner |
|---|-------|------------|--------|-------|
| 4 | **Backend robustness** — `preview_reasoning.py` null-safety; QA fixed pre-ship (AIL-75) but edge cases remain | **Partially addressed** | Edge-case crashes; reliability perception | Founding Engineer |
| 5 | **Quality gate alignment** — Schema/API contract drift; brand extractor test fixes applied | **Addressed** (AIL-75, AIL-88) | Maintenance; regression risk | QA, Founding Engineer |

---

### P3 — Operational & Deployment

| # | Issue | 3.0 Status | Impact | Owner |
|---|-------|------------|--------|-------|
| 6 | **Frontend API URL config** — `VITE_API_BASE_URL` must be set correctly | Known | Deployment friction; broken demos if misconfigured | Documentation, Founding Engineer |
| 7 | **Healthcheck / deployment stability** — Historical Railway healthcheck failures | Known | Downtime perception | Founding Engineer |
| 8 | **Database migrations** — Missing columns require manual fix | Known | Setup friction; onboarding delays | Documentation, Founding Engineer |

---

### P4 — Polish & Internal

| # | Issue | 3.0 Status | Impact | Owner |
|---|-------|------------|--------|-------|
| 9 | **Agent runtime / GitHub push** — Manual operator action for push; not customer-facing | Internal | Release velocity | Process / ops |
| 10 | **Deployment verification** — Live site may lag behind source; verify 3.0 fixes are live | **Verify** | Users may still see old behavior | Junior Dev Git, Founding Engineer |

---

## 3. Recommended Action Order for 3.5

| Phase | Focus | Workstreams |
|-------|-------|-------------|
| **P1 (W1/W6)** | 10x generation quality — model, prompts, caching, robustness | Founding Engineer |
| **P2 (W3/W4)** | Conversion blockers — Schedule Demo, mobile nav, title/meta | UX Manager, Product Designer |
| **P3 (W6)** | Operational fixes — API config, healthcheck, migrations | Founding Engineer, Documentation |
| **P4 (W10)** | Sales/customer messaging — align with 3.5 improvements | Chief of Sales |

---

## 4. Customer Success Talking Points (3.5)

- **"Generations weren't good enough"** → "3.5 delivers 10x better demo output. We've rebuilt the generation pipeline with improved models, prompts, and caching."
- **"I couldn't find the demo"** → "3.0 added Demo to nav; 3.5 adds it to mobile too."
- **"Schedule Demo sent me to login"** → "3.5 clarifies all CTAs — demo vs. contact."
- **"Site felt broken"** → "3.5 addresses polish, meta tags, and reliability end-to-end."

---

## 5. References

- AIL-95 — MyMetaView 3.5 parent (board mandate)
- AIL-96 — Grand plan (COO)
- AIL-102 — This synthesis
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.5.md`
- `agents/customer-success-lead/MYMETAVIEW_3.0_IMPROVEMENT_LIST.md`
- `agents/ux-manager/UX_VALIDATION_AIL84.md`
- `agents/qa-automation-engineer/QA_REPORT_AIL75.md`, `QA_REPORT_AIL88.md`
- `agents/chief-of-sales/MYMETAVIEW_3.0_SALES_MESSAGING.md`
