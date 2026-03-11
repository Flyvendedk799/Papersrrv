# MyMetaView 3.5 — Demo Video & Tutorial Capture Spec

**Issue:** [AIL-109](/AIL/issues/AIL-109)  
**Parent:** [AIL-96](/AIL/issues/AIL-96) (MyMetaView 3.5 grand plan)  
**Date:** 2026-03-10

---

## 1. Purpose

Specification for demo video and tutorial captures to support MyMetaView 3.5 marketing, docs, and onboarding. Aligns with [MYMETAVIEW_3.5_DEMO_SCREENSHOT_SPEC.md](../graphics-specialist/MYMETAVIEW_3.5_DEMO_SCREENSHOT_SPEC.md) for overlapping frames.

---

## 2. Deliverables

| Asset | Format | Duration/Size | Purpose |
|-------|--------|---------------|---------|
| **Demo walkthrough video** | MP4/WebM | 60–90 seconds | Marketing, landing page "Watch Demo", sales |
| **Tutorial screenshot set** | PNG | 6 frames | Docs, onboarding, tutorial steps |
| **Demo flow keyframes** | PNG | 3 frames | Overlap with screenshot spec: hero, in-progress, result |

---

## 3. Demo Video Script

**Target:** 60–90 seconds, no narration (or optional voiceover later).

| Time | Scene | Action |
|------|-------|--------|
| 0–5s | Landing hero | Open mymetaview.com; show hero with "Turn every shared link into a high-converting preview" |
| 5–10s | Navigate to demo | Click "Watch Demo" or "Try Demo" → /demo |
| 10–15s | Demo hero | Show "See Your URLs Come to Life", example URLs (Stripe, GitHub, etc.) |
| 15–25s | Enter URL | Type `https://stripe.com` in input; click "Generate Preview" |
| 25–55s | Generation | Show loading state; wait for async job to complete |
| 55–75s | Result | Show generated preview card(s); highlight quality |
| 75–90s | CTA | Optional: scroll to bottom CTA or return to landing |

**Viewport:** 1920×1080 (or 1280×720 for lighter file size).  
**Frame rate:** 30 fps.  
**Naming:** `mymetaview-3.5-demo-walkthrough.mp4`

---

## 4. Tutorial Screenshot Set

Per [MYMETAVIEW_3.5_DEMO_SCREENSHOT_SPEC.md](../graphics-specialist/MYMETAVIEW_3.5_DEMO_SCREENSHOT_SPEC.md):

| Frame | URL | Viewport | Caption |
|-------|-----|----------|---------|
| 1. Demo hero | https://www.mymetaview.com/demo | 1920×1080 | "Enter any URL to generate a preview" |
| 2. Demo in progress | https://www.mymetaview.com/demo | 1920×1080 | "AI generates your preview in seconds" |
| 3. Demo result | https://www.mymetaview.com/demo | 1920×1080 | "Share-ready meta image and preview" |
| 4. Landing hero | https://www.mymetaview.com | 1920×1080 | "Turn every shared link into a high-converting preview" |
| 5. Landing features | https://www.mymetaview.com | 1920×1080 | "AI Semantic Understanding, Smart Screenshots, A/B Testing" |
| 6. Landing pricing | https://www.mymetaview.com | 1920×1080 | "Starter, Growth, Agency plans" |

**Format:** PNG, 2x density (3840×2160) for retina.  
**Naming:** `mymetaview-3.5-tutorial-01-demo-hero.png`, `mymetaview-3.5-tutorial-02-demo-progress.png`, etc.

---

## 5. Capture Instructions

1. **Browser:** Chrome or Chromium; default zoom 100%.
2. **Wait:** 2–3 seconds after load for async content; for demo flow, wait for generation to complete (~30–60s).
3. **Demo URL:** Use `https://stripe.com` or `https://github.com` for consistent, high-quality results.
4. **Automation:** Use `scripts/capture-mymetaview-3.5.mjs` (Playwright) for reproducible captures.

---

## 6. References

- Screenshot spec: `agents/graphics-specialist/MYMETAVIEW_3.5_DEMO_SCREENSHOT_SPEC.md`
- Live site: https://www.mymetaview.com
- Demo: https://www.mymetaview.com/demo
- Execution plan: `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.5.md`
