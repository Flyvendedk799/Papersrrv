# MyMetaView 4.0 — Demo Screenshot Spec

**Issue:** AIL-132 (Visual assets & marketing for MyMetaView 4.0)  
**Parent:** AIL-114 (MyMetaView 4.0 — Final Implementation Plan)  
**Date:** 2026-03-10

---

## 1. Purpose

Specification for demo screenshots to support MyMetaView 4.0 marketing, docs, and sales materials. 4.0 is a **production tool** — batch API, reliability, integrations, professional UX. Use this spec when capturing screenshots (e.g. via Puppeteer, Playwright, or manual capture).

**Strategic shift:** 3.5 was demo-focused. 4.0 is tool-first: batch flows, export, settings, API.

---

## 2. URLs and Viewports

| Asset | URL | Viewport | Notes |
|-------|-----|----------|-------|
| **Demo hero** | https://www.mymetaview.com/demo | 1920×1080 | Full hero; "See Your URLs Come to Life"; example URLs; Generate Preview CTA |
| **Batch tool (when P3 ships)** | https://www.mymetaview.com/demo | 1920×1080 | Batch job UI: multi-URL input, submit, status, results |
| **Demo in progress** | https://www.mymetaview.com/demo | 1920×1080 | After entering URL(s) and clicking Generate — loading state or job status |
| **Demo result** | https://www.mymetaview.com/demo | 1920×1080 | After preview generation completes — generated preview card(s) |
| **Export flow (when P7 ships)** | https://www.mymetaview.com/demo | 1920×1080 | PNG, PDF, embed code options; download or copy |
| **Landing hero** | https://www.mymetaview.com | 1920×1080 | Hero with "Turn every shared link into a high-converting preview"; Start Free Trial, Watch Demo CTAs |
| **Landing features** | https://www.mymetaview.com | 1920×1080 | Scroll to "Everything you need to convert" — AI Semantic Understanding, Smart Screenshots, Multi-Variant A/B/C Testing |
| **Landing pricing** | https://www.mymetaview.com | 1920×1080 | Starter, Growth, Pro, Enterprise tiers (per P14) |

---

## 3. 4.0-Specific Capture Priorities

| Priority | Asset | Rationale |
|----------|-------|-----------|
| **P1** | Demo hero, Demo result, Landing hero | Core first-touch; available before P3 |
| **P2** | Batch tool, Export flow | Differentiate 4.0 from 3.5; capture when P3/P7 ship |
| **P3** | Landing features, Landing pricing | Support sales decks; pricing may update post-P14 |

---

## 4. Capture Instructions

1. **Browser:** Chrome or Chromium; default zoom 100%.
2. **Wait:** 2–3 seconds after load for async content to render.
3. **Demo flow:** For "Demo in progress" and "Demo result", enter `https://stripe.com` (or another example URL) and trigger Generate Preview. Wait for completion before capturing.
4. **Batch flow (when available):** Enter multiple URLs; submit job; capture status poll or results view.
5. **Format:** PNG, 2x density for retina displays (3840×2160 for 1920×1080 spec).
6. **Naming:** `mymetaview-4.0-demo-hero.png`, `mymetaview-4.0-batch-tool.png`, `mymetaview-4.0-demo-result.png`, etc.

---

## 5. Messaging Alignment (4.0)

Per `agents/chief-of-sales/MYMETAVIEW_4.0_SALES_MESSAGING.md`:

- **Positioning:** "Production tool, not a demo. Batch API, reliability, integrations."
- **One-line:** "A production-grade batch API for AI-powered page previews."
- **Do not overpromise:** Batch/export features only when P3/P7 ship.

---

## 6. Handoff

- **Screenshot and Video Specialist:** Demo video and tutorial captures; may use this spec for overlapping frames.
- **Visual Documentation Specialist:** Architecture diagrams; screenshots optional for flow visuals.
- **Marketing / Sales:** OG image and banner for 4.0 launch.

---

## 7. References

- Live site: https://www.mymetaview.com
- Demo: https://www.mymetaview.com/demo
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md`
- `agents/chief-of-sales/MYMETAVIEW_4.0_SALES_MESSAGING.md`
- `agents/graphics-specialist/MYMETAVIEW_3.5_DEMO_SCREENSHOT_SPEC.md`
