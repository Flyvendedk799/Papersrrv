# MyMetaView 5.0 — Visual Assets Summary

**Issue:** AIL-151 (MyMetaView 5.0 production-ready visuals — Graphics)  
**Parent:** AIL-145 (MyMetaView 5.0 demo generation workstream)  
**Program:** AIL-142 (MyMetaView 5.0 execution delegation)  
**Date:** 2026-03-11

---

## 1. Deliverables

This issue defines the **graphics/visual asset layer** that supports the 5.0 demo generation experience and the 5.0 demo presentation.

| Asset | Path | Purpose |
|-------|------|---------|
| **5.0 demo screenshot spec** | `agents/graphics-specialist/MYMETAVIEW_5.0_DEMO_SCREENSHOT_SPEC.md` | Capture instructions for the 5.0 demo-generation UI (configure → generating → results_success / results_partial / results_error, plus reduced-motion variants) |
| **5.0 demo presentation spec (reference)** | `agents/graphics-specialist/MYMETAVIEW_5.0_DEMO_PRESENTATION_SPEC.md` | Slide-level visual spec for the 5.0 demo deck; uses screenshots and diagrams defined here and in visual docs |
| **4.0 OG image (reused for 5.0)** | `agents/graphics-specialist/MYMETAVIEW_4.0_OG_IMAGE.html` | 1200×630 social/OG image; continue to use as canonical hero meta image for 5.0 unless marketing requests a new variant |
| **4.0 announcement banner (reused for 5.0)** | `agents/graphics-specialist/MYMETAVIEW_4.0_ANNOUNCEMENT_BANNER.svg` | Banner for blog/email/demo-landing headers; visually compatible with 5.0 demo story |
| **3.5/4.0 visual documentation diagrams (reference)** | `agents/visual-documentation-specialist/MYMETAVIEW_3.5_VISUAL_DOCUMENTATION.md` | Source diagrams for architecture, pipeline, and quality profiles; to be redrawn in slide-ready form for 5.0 |
| **5.0 demo animation UI** | `agents/junior-dev-animation/deliverables/mymetaview-demo-animation.tsx` | Live demo-generation component; the visual backbone for 5.0 demo screenshots and storyboard frames |

The **new work for this issue** is the 5.0-specific screenshot spec; other assets are reused or provided by adjacent workstreams.

---

## 2. 5.0 Demo Screenshot Scope

The 5.0 demo-generation experience has a richer, more explicit **state machine** than 3.5/4.0. Screenshots must cover:

- **Configure state** – URL input, helper text, and CTA for generating a demo preview.
- **Submitting state** – job-registration feedback (button morph, status copy).
- **Generating state** – skeleton grid, shimmer, and loading strip with progress.
- **Results states**:
  - `results_success` — all scenes generated successfully.
  - `results_partial` — mix of success and error scenes.
  - `results_error` — entire run failed.
- **Reduced-motion variant** — at least one composite showing how the experience behaves under `prefers-reduced-motion`.

These are specified in detail in `MYMETAVIEW_5.0_DEMO_SCREENSHOT_SPEC.md` and implemented by the animation component in `mymetaview-demo-animation.tsx`.

---

## 3. Brand & Visual Alignment (inherits from 4.0)

5.0 **does not change the core brand**, only the demo-generation story and polish. Reuse 4.0 brand system:

- **Colors:** Dark slate backgrounds and light-on-dark UI, per `MYMETAVIEW_4.0_VISUAL_ASSETS_SUMMARY.md`:
  - Backgrounds: #0f172a, #1e293b
  - Accent: #38bdf8
  - Text: #f8fafc, #94a3b8
- **Message:** Keep the 4.0 stance — *“Production tool, not a demo”* — and layer in:
  - “5.0 demo generations that feel alive and clear.”
  - “Live demo experience built on the same engine as production.”
- **CTA:** `mymetaview.com/demo`

When creating any new static assets (e.g., thumbnails for the deck, composite visuals), keep:

- Consistent **rounded-corner cards**, subtle **drop shadows**, and **outer glows** for screenshots on dark backgrounds.
- Clear hierarchy in copy (short titles, 1–3 bullets max).

---

## 4. Usage by Team

- **Screenshot and Video Specialist**
  - Use `MYMETAVIEW_5.0_DEMO_SCREENSHOT_SPEC.md` when capturing:
    - Key demo-generation states for the marketing/demo site.
    - Comparison frames for the demo video (success vs partial vs error).
  - Use 4.0 assets (OG image, banner) where 5.0 does not require new visuals.

- **Visual Documentation Specialist**
  - Use existing `MYMETAVIEW_3.5_VISUAL_DOCUMENTATION.md` diagrams as the **conceptual source**.
  - For the 5.0 deck, redraw:
    - The 10x generation pipeline.
    - The quality profile decision tree.
    - The model usage map.

- **Product Designer / Demo Owner**
  - Implement `MYMETAVIEW_5.0_DEMO_PRESENTATION_SPEC.md` using:
    - Screenshots captured per the 5.0 screenshot spec.
    - Redrawn diagrams from visual documentation.
    - 4.0 OG image and banner where a stable brand hero/banner is needed.

---

## 5. Handoff & Evolution

- **Initial 5.0 demo**:
  - Treat this summary + the screenshot spec as the **canonical definition** of 5.0 visual assets.
  - Any missing static assets (e.g., additional thumbnails or overlays) should be derived from the demo-generation UI using the same visual language.

- **Future 5.x updates**:
  - If marketing requests a 5.x-specific OG image or banner, add:
    - `MYMETAVIEW_5.x_OG_IMAGE.html`
    - `MYMETAVIEW_5.x_ANNOUNCEMENT_BANNER.svg`
  - Update this document to include those new assets in the deliverables table.

