# MyMetaView 3.5 — Demo Screenshot Spec

**Issue:** [AIL-107](/AIL/issues/AIL-107)  
**Parent:** [AIL-96](/AIL/issues/AIL-96) (MyMetaView 3.5 grand plan)  
**Date:** 2026-03-10

---

## 1. Purpose

Specification for demo screenshots to support MyMetaView 3.5 marketing, docs, and sales materials. Use this spec when capturing screenshots (e.g. via Puppeteer, Playwright, or manual capture).

---

## 2. URLs and Viewports

| Asset | URL | Viewport | Notes |
|-------|-----|----------|-------|
| **Demo hero** | https://www.mymetaview.com/demo | 1920×1080 | Full hero with "See Your URLs Come to Life", example URLs (Stripe, GitHub, Vercel, OpenAI), Generate Preview CTA |
| **Demo in progress** | https://www.mymetaview.com/demo | 1920×1080 | After entering URL and clicking Generate — wait for async job to complete; capture loading state or result |
| **Demo result** | https://www.mymetaview.com/demo | 1920×1080 | After preview generation completes — show generated preview card(s) |
| **Landing hero** | https://www.mymetaview.com | 1920×1080 | Hero with "Turn every shared link into a high-converting preview", Start Free Trial, Watch Demo CTAs |
| **Landing features** | https://www.mymetaview.com | 1920×1080 | Scroll to "Everything you need to convert" — AI Semantic Understanding, Smart Screenshots, Multi-Variant A/B/C Testing |
| **Landing pricing** | https://www.mymetaview.com | 1920×1080 | Starter, Growth, Agency plans |

---

## 3. Capture Instructions

1. **Browser:** Chrome or Chromium; default zoom 100%.
2. **Wait:** 2–3 seconds after load for async content to render.
3. **Demo flow:** For "Demo in progress" and "Demo result", enter `https://stripe.com` (or another example URL) and trigger Generate Preview. Wait for completion before capturing.
4. **Format:** PNG, 2x density for retina displays (3840×2160 for 1920×1080 spec).
5. **Naming:** `mymetaview-3.5-demo-hero.png`, `mymetaview-3.5-demo-result.png`, etc.

---

## 4. Handoff

- **Screenshot and Video Specialist:** [AIL-109](/AIL/issues/AIL-109) — demo video and tutorial captures; may use this spec for overlapping frames.
- **Visual Documentation Specialist:** [AIL-108](/AIL/issues/AIL-108) — architecture diagrams; screenshots optional for flow visuals.

---

## 5. References

- Live site: https://www.mymetaview.com
- Demo: https://www.mymetaview.com/demo
- Execution plan: `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.5.md`
- UX validation: `agents/ux-manager/UX_VALIDATION_AIL100.md`
