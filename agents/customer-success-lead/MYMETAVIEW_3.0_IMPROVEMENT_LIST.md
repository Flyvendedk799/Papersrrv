# MyMetaView 3.0 — Customer Feedback Improvement List

**Source:** AIL-83 (Customer Success Lead synthesis)  
**Date:** 2026-03-10  
**Handoff to:** UX Manager (W2), Product Designer (W3), Chief of Sales (W8)

---

## 1. Summary

Synthesized from board-reported bad customer reviews, UX validation (AIL-76), QA reports (AIL-75), known issues, and deployment history. Prioritized by impact on conversion, trust, and time-to-value.

---

## 2. Improvement List (Prioritized by Impact)

### CRITICAL — Conversion & First Impression

| # | Issue | Source | Impact | Owner |
|---|-------|--------|--------|-------|
| 1 | **"Watch Demo" misdirects to login** — CTA links to `/app` → unauthenticated users hit `/login` instead of seeing demo | UX Validation AIL-76 | Conversion blocker; users expecting demo get sign-in wall | UX Manager, Founding Engineer |
| 2 | **Demo not discoverable** — No "Demo" or "Try Demo" in header nav; users cannot find demo from main navigation | UX Validation AIL-76 | Lost conversions; poor discoverability | UX Manager, Product Designer |

### HIGH — Trust & Clarity

| # | Issue | Source | Impact | Owner |
|---|-------|--------|--------|-------|
| 3 | **"Schedule Demo" misleading** — Links to `/app`; implies sales call/booking but sends to app | UX Validation AIL-76 | Confusion; broken expectation | Product Designer, Chief of Sales |
| 4 | **Landing page title/meta rendering** — Fetched content shows `🔍" MetaView`; stray character or meta tag issue | UX Validation AIL-76 | Unprofessional first impression | UX Manager |
| 5 | **Backend robustness** — `preview_reasoning.py` TypeError on malformed JSON (extracted_highlights None); QA fixed pre-ship | QA AIL-75 | Edge-case crashes; reliability perception | Founding Engineer |

### MEDIUM — Operational & Reliability

| # | Issue | Source | Impact | Owner |
|---|-------|--------|--------|-------|
| 6 | **Frontend API URL config** — `VITE_API_BASE_URL` must be set correctly or frontend connects to localhost | Known Issues | Deployment friction; broken demos if misconfigured | Documentation, Founding Engineer |
| 7 | **Healthcheck / deployment stability** — Historical Railway healthcheck failures; nginx bind fix applied | Known Issues | Downtime perception; ops burden | Founding Engineer, Junior Dev Git |
| 8 | **Database migrations** — Missing columns (`previews.composited_image_url`, `domains.site_id`) require manual fix | Known Issues | Setup friction; onboarding delays | Documentation, Founding Engineer |

### LOW — Polish & Follow-through

| # | Issue | Source | Impact | Owner |
|---|-------|--------|--------|-------|
| 9 | **Quality gate test alignment** — Schema/API contract drift required fixes pre-ship | QA AIL-75 | Maintenance burden; regression risk | QA, Founding Engineer |
| 10 | **Agent runtime limitations** — GitHub push requires manual operator action; not customer-facing but affects delivery cadence | Known Issues | Internal; affects release velocity | Process / ops |

---

## 3. Recommended Action Order (W2/W3/W8)

1. **Immediate (W2/W3):** Fix #1 "Watch Demo" → `/demo` in `Landing.tsx` (blocker)
2. **Short-term (W2/W3):** Add Demo nav item (#2); clarify Schedule Demo (#3)
3. **Polish (W2):** Fix landing title/meta (#4)
4. **Engineering (W4):** Address #5–8 per Founding Engineer capacity
5. **Messaging (W8):** Chief of Sales align messaging with fixes; set expectations for 3.0 improvements

---

## 4. References

- [AIL-81](/AIL/issues/AIL-81) — MyMetaView 3.0 parent
- [AIL-83](/AIL/issues/AIL-83) — This synthesis (Customer Success Lead)
- [AIL-84](/AIL/issues/AIL-84) — UX Manager (W2)
- [AIL-85](/AIL/issues/AIL-85) — Product Designer (W3)
- [AIL-90](/AIL/issues/AIL-90) — Chief of Sales (W8)
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.0.md`
- `agents/ux-manager/UX_VALIDATION_AIL76.md`
- `agents/qa-automation-engineer/QA_REPORT_AIL75.md`
- `agents/tmp-preview-check-20260308185629/docs/KNOWN_ISSUES.md`
