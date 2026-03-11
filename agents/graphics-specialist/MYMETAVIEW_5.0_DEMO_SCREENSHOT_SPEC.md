# MyMetaView 5.0 — Demo Screenshot Spec

**Issue:** AIL-151 (MyMetaView 5.0 production-ready visuals — Graphics)  
**Parent:** AIL-145 (MyMetaView 5.0 demo generation workstream)  
**Program:** AIL-142 (MyMetaView 5.0 execution delegation)  
**Date:** 2026-03-11

---

## 1. Purpose

Specification for **demo-generation screenshots** to support MyMetaView 5.0:

- Marketing site and demo page.
- Sales/demo decks (per `MYMETAVIEW_5.0_DEMO_PRESENTATION_SPEC.md`).
- Visual documentation and internal references.

5.0 focuses on making **demo runs feel legible and polished** — every state (configure, submitting, generating, results) should look intentional, not like a raw loading spinner.

Use this spec when capturing screenshots (Puppeteer, Playwright, or manual capture).

---

## 2. Core References

- **4.0 demo screenshot spec:** `agents/graphics-specialist/MYMETAVIEW_4.0_DEMO_SCREENSHOT_SPEC.md`
- **4.0 visual assets summary:** `agents/graphics-specialist/MYMETAVIEW_4.0_VISUAL_ASSETS_SUMMARY.md`
- **3.5 visual documentation:** `agents/visual-documentation-specialist/MYMETAVIEW_3.5_VISUAL_DOCUMENTATION.md`
- **5.0 demo animation UI:** `agents/junior-dev-animation/deliverables/mymetaview-demo-animation.tsx`
- **5.0 demo presentation spec:** `agents/graphics-specialist/MYMETAVIEW_5.0_DEMO_PRESENTATION_SPEC.md`

This document **extends** the 4.0 spec; where not explicitly overridden, reuse the 4.0 capture rules.

---

## 3. URLs and Viewports

> Exact URLs and routes may evolve; treat these as **targets**. If the demo-generation UI is embedded under a different path, adapt the same viewpoints and state coverage.

| Asset | URL (target) | Viewport | Notes |
|-------|--------------|----------|-------|
| **5.0 demo hero** | `https://www.mymetaview.com/demo` | 1920×1080 | Top-of-page hero for 5.0 demo; title copy aligned with “Generate live product demos from any URL.” Can reuse full-bleed hero from 4.0 where layout is unchanged. |
| **Configure state (URLs input)** | `https://www.mymetaview.com/demo` | 1920×1080 | Focus on the 5.0 demo-generation card: URL textarea, helper copy, “Generate demo preview” button. No modals or browser UI. |
| **Submitting state** | Same as above | 1920×1080 | Immediately after submit: button morphs into “Creating demo job…” (or equivalent), header text reflects job creation. |
| **Generating state (skeleton grid)** | Same as above | 1920×1080 | Show skeleton grid with shimmer; loading strip at top with progress in the 20–80% range. This is the **canonical 5.0 “in-progress” shot**. |
| **Results — success** | Same as above | 1920×1080 | All scenes succeeded; grid of result cards, no error indicators. Use 3–6 URLs. |
| **Results — partial** | Same as above | 1920×1080 | Mix of success and error cards; at least one clear “needs attention” state with amber accent. |
| **Results — error** | Same as above | 1920×1080 | Entire run failed: error copy at the top, retry/edit controls visible. |
| **Reduced-motion variant (results)** | Same as above, with `prefers-reduced-motion` | 1920×1080 | Same composition as the “results — success” shot, but with shimmer/continuous motion removed. |
| **Run summary sidebar** | Same as above | 1920×1080 | Capture the `Run summary` panel (status, total scenes, ready, needs attention) clearly for use in slides. Can be a crop of one of the above states. |

---

## 4. Capture Instructions

Follow the 4.0 spec where applicable, with the 5.0-specific details below.

1. **Browser**
   - Chrome or Chromium; zoom 100%.
   - Dark-mode appearance where available.
2. **Viewport**
   - 1920×1080 logical resolution (3840×2160 at 2x density).
   - Hide browser chrome (URL bar, bookmarks, OS UI) in final crops.
3. **Demo Flow**
   - Use the 5.0 demo-generation experience driven by the `DemoGenerationExperience` component from `mymetaview-demo-animation.tsx`.
   - Example URLs (one per line) for configure/generating/results shots:
     - `https://stripe.com`
     - `https://vercel.com`
     - `https://github.com/paperclip-ai`
     - `https://openai.com`
4. **State Setup**
   - **Configure state:**
     - Ensure 2–4 example URLs are present, with helper text visible.
     - No validation errors; primary CTA in default (non-hovered) state.
   - **Submitting state:**
     - Capture immediately after clicking the CTA, before the skeleton grid takes over (if applicable).
     - Button should be in its loading/in-progress style.
   - **Generating state:**
     - Wait until skeleton grid is fully visible.
     - Progress strip should be between 20–80%, not 0% or 100%.
   - **Results states:**
     - Drive real or stubbed data so that:
       - Success state shows thumbnails or “Preview pending” placeholders with green indicators.
       - Partial state shows at least one card with an amber/orange error indicator and message.
       - Error state shows clear failure messaging and the “Retry failed” / “Edit URLs” controls where implemented.
   - **Reduced motion:**
     - Enable `prefers-reduced-motion` in system/browser settings.
     - Capture the results view to show that the layout is identical but continuous shimmer/strip animations are gone.
5. **Format & Naming**
   - Format: PNG, 2x density.
   - Suggested naming:
     - `mymetaview-5.0-demo-configure.png`
     - `mymetaview-5.0-demo-submitting.png`
     - `mymetaview-5.0-demo-generating.png`
     - `mymetaview-5.0-demo-results-success.png`
     - `mymetaview-5.0-demo-results-partial.png`
     - `mymetaview-5.0-demo-results-error.png`
     - `mymetaview-5.0-demo-results-reduced-motion.png`
     - `mymetaview-5.0-demo-run-summary.png`

---

## 5. Visual Guidelines (5.0 Demo States)

- **Composition**
  - Center the demo-generation card and results grid; avoid cropping too tightly.
  - Maintain generous margins; keep sidebar elements (e.g., Run summary) fully readable.
- **Brand**
  - Use dark slate backgrounds and cyan/sky accents, per 4.0 brand.
  - Avoid introducing new accent colors that conflict with #38bdf8.
- **Legibility**
  - Ensure all key labels (“Generating previews…”, “Demo previews ready to review”, etc.) are readable at typical slide sizes.
  - Avoid motion blur; timing captures so the UI is stable.
- **States as Storyboard**
  - When used in slides, the sequence **Configure → Generating → Results (success/partial/error)** should look like intentional story beats, not random snapshots.
  - Prefer consistent zoom and framing across the sequence so the eye tracks state changes easily.

---

## 6. Handoff

- **Screenshot and Video Specialist**
  - Use these assets as canonical frames for:
    - Demo video sequences.
    - Tutorial walkthroughs.
  - When cropping, keep state labels and key UI affordances visible.

- **Product Designer / Demo Owner**
  - For AIL-157, drop the captured frames into the slides specified in `MYMETAVIEW_5.0_DEMO_PRESENTATION_SPEC.md`:
    - Configure, generating, and results frames in Chapter 3.
    - Reduced-motion comparison in the accessibility slide.

- **Visual Documentation Specialist**
  - Optionally embed small demo-state thumbnails next to 5.0 architecture/flow diagrams to ground abstract diagrams in concrete UI.

