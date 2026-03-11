# MyMetaView 5.0 — Demo Visual Presentation Spec

**Issue:** AIL-157 (MyMetaView 5.0 demo visual presentation)  
**Parent:** AIL-145 (MyMetaView 5.0 demo generation workstream)  
**Program:** AIL-142 (MyMetaView 5.0 execution delegation)  
**Owner:** Graphics Specialist  
**Date:** 2026-03-11

---

## 1. Purpose & Audience

- **Goal:** Provide a high-impact, visual-first presentation for the MyMetaView 5.0 demo that:
  - Tells a coherent narrative from problem → product → demo generation experience → proof of robustness.
  - Reuses and extends **4.0 visual assets** (screenshots, OG image, banner) where appropriate.
  - Integrates **visual documentation diagrams** and **5.0 demo animation states** to explain how demo generation actually works.
- **Primary audiences:**
  - Prospective customers watching a live or recorded demo.
  - Internal stakeholders (product, engineering, sales) aligning on the 5.0 story.

Output is a **slide-by-slide spec** that can be implemented in Google Slides / Keynote / Pitch, using this document as the canonical reference for layout, visuals, and narrative beats.

---

## 2. Visual Language & Asset Sources

- **Base brand (inherit from 4.0):**
  - Colors and message per `MYMETAVIEW_4.0_VISUAL_ASSETS_SUMMARY.md`.
  - Keep the **“production tool, not a demo”** stance; 5.0 refines demo generation rather than changing the core brand.
- **Core visual sources to leverage:**
  - **4.0 Screenshot Spec:** `MYMETAVIEW_4.0_DEMO_SCREENSHOT_SPEC.md`
    - Use: demo hero, demo result, landing hero, batch tool, export flow.
  - **4.0 OG Image + Banner:**
    - `MYMETAVIEW_4.0_OG_IMAGE.html` → hero meta preview for intro/closing slides.
    - `MYMETAVIEW_4.0_ANNOUNCEMENT_BANNER.svg` → subtle header/footer strip or chapter dividers.
  - **Visual Documentation Diagrams (3.5):**
    - `visual-documentation-specialist/MYMETAVIEW_3.5_VISUAL_DOCUMENTATION.md`
    - Use architecture + flow mermaid diagrams as **reference** to recreate clean, slide-ready diagrams that show:
      - The preview generation pipeline.
      - Quality profiles and cache/response behavior.
  - **5.0 Demo Animation:**
    - `junior-dev-animation/MYMETAVIEW_5.0_DEMO_ANIMATION_SPEC.md`
    - `junior-dev-animation/deliverables/mymetaview-demo-animation.tsx`
    - Use key states (configure → submitting → generating → results_*), skeleton grid, shimmer, and motion system as the **visual backbone** for the live demo section.

---

## 3. Structure Overview (Chapters)

1. **Chapter 1 — Problem & Promise**
   - Why meta images and link previews matter.
   - Where current workflows break (manual design, inconsistent previews).
2. **Chapter 2 — Meet MyMetaView**
   - Product positioning and high-level capabilities.
   - 4.0 → 5.0 evolution in one visual.
3. **Chapter 3 — The Demo Generation Experience (5.0)**
   - Live/demo-like walkthrough using the 5.0 animation spec.
   - Emphasis on system state clarity and polish.
4. **Chapter 4 — Under the Hood (How it Works)**
   - Architecture and pipeline; how we go from URL to high-quality preview.
5. **Chapter 5 — Plans, Pricing, and Fit**
   - Who it’s for, pricing highlights, and deployment/next steps.
6. **Chapter 6 — Summary & CTA**
   - Recap and clear path to trial or onboarding.

---

## 4. Slide-by-Slide Spec

### 4.1 Title & Cold Open

1. **Slide 1 — Title / Cold Open**
   - **Title:** “MyMetaView 5.0 — Demo Generations That Sell Your Product”
   - **Visual:**
     - Use 4.0 **OG image** screenshot as a large, centered hero image on dark background.
     - Overlay a subtle grid of blurred preview cards in the background (brand accent color).
   - **Copy:**
     - Subtitle: “Turn every shared link into a high-converting preview.”
     - Small tag: “Version 5.0 demo generation experience”.

2. **Slide 2 — Why Previews Matter**
   - **Visual:**
     - Three side-by-side link preview examples:
       - “Before” (generic, low-quality).
       - “Typical competitor” (slightly better).
       - “MyMetaView” (high-quality, on-brand).
   - **Copy:**
     - 1–2 bullets on click-through lift and consistency.

### 4.2 Product Overview & Positioning

3. **Slide 3 — What MyMetaView Does**
   - **Visual:**
     - Simple diagram: URL(s) → MyMetaView → Preview images + meta tags.
   - **Copy:**
     - One-line positioning from 4.0 messaging: “A production-grade batch API for AI-powered page previews.”

4. **Slide 4 — 4.0 to 5.0 Evolution**
   - **Visual:**
     - Timeline or two-column comparison:
       - 4.0: production-ready tool, batch API, export.
       - 5.0: **demo generation story** upgrades (animation, clarity, state machine, better flows).
   - **Copy:**
     - 3 bullets max, focused on what changes for demo generations specifically.

### 4.3 Demo Generation Experience (Narrated Walkthrough)

5. **Slide 5 — Demo Flow Overview**
   - **Visual:**
     - State machine diagram adapted from `MYMETAVIEW_5.0_DEMO_ANIMATION_SPEC.md`:
       - `configure → submitting → generating → results_success/results_partial/results_error`.
   - **Copy:**
     - Short line: “Every demo run is a guided journey through clear system states.”

6. **Slide 6 — Configure State (URL Input)**
   - **Visual:**
     - Screenshot based on 4.0 **demo hero** + 5.0 animation styling:
       - URL input and options panel with subtle entrance motion hints.
   - **Notes:**
     - Mark hover/focus cues and the gentle glow on input.

7. **Slide 7 — Submitting & Generating**
   - **Visual:**
     - Two side-by-side frames:
       - `submitting`: form compressing into a progress header; button morphs into “Generating…” pill.
       - `generating`: skeleton grid with shimmer + progress bar.
   - **Copy:**
     - Call out performance + clarity:
       - “Users always know what’s happening; no jarring jumps.”

8. **Slide 8 — Results: Success & Partial**
   - **Visual:**
     - Grid of result cards with staggered entrance, hover states.
     - One card showing a subtle failure state (shake + icon), per animation spec.
   - **Notes:**
     - Emphasize that both success and partial failures are visually clear and accessible.

9. **Slide 9 — Reduced Motion Accessibility**
   - **Visual:**
     - Two mockups: full-motion vs reduced-motion versions of the same results grid.
   - **Copy:**
     - Bullet: “Respects `prefers-reduced-motion` — no continuous shimmer, but all critical info remains.”

### 4.4 Under the Hood (Architecture & Quality)

10. **Slide 10 — Generation Pipeline Overview**
    - **Visual:**
      - Adapt the **3.5 10x Generation Pipeline** diagram into a 5.0-branded slide:
        - Input → Cache Layer → Multi-stage Reasoning → Models → Response.
      - Use the mermaid diagram in visual docs as a basis, but render as clean icon/box diagram.
    - **Copy:**
      - 2–3 callouts: caching, multi-stage reasoning, brand extraction.

11. **Slide 11 — Quality Profiles & Auto Mode**
    - **Visual:**
      - Quality profile decision tree from visual docs:
        - `auto → fast/balanced/ultra`.
      - Table summarizing each profile in simplified form.
    - **Copy:**
      - Emphasize: “Demo generations stay fast on simple pages but scale up quality on complex ones.”

12. **Slide 12 — Model Usage**
    - **Visual:**
      - Simplified model usage map:
        - gpt-4o for core layout/brand/critic, gpt-4o-mini for value prop/fallbacks.
      - Derived from visual documentation model usage map.
    - **Copy:**
      - Short note on cost vs quality trade-offs; the demo uses the same infrastructure as production.

### 4.5 Plans, Pricing, and Fit

13. **Slide 13 — Who MyMetaView is For**
    - **Visual:**
      - Icons for typical users: SaaS marketing, content teams, agencies.
    - **Copy:**
      - 3 bullets mapping user types to primary benefits.

14. **Slide 14 — Plans & Pricing (Snapshot)**
    - **Visual:**
      - Use 4.0 **landing pricing** screenshot as base, lightly anonymized if pricing is still evolving.
    - **Copy:**
      - Highlight that demo generations are included in the standard flows (no separate “demo-only” tier).

### 4.6 Summary & CTA

15. **Slide 15 — Summary**
    - **Visual:**
      - Reuse OG image or a collage of 3–4 preview cards.
    - **Copy:**
      - 3 bullets:
        - “Production-grade preview engine.”
        - “5.0 demo generations that feel alive and clear.”
        - “Built for real teams, not toy demos.”

16. **Slide 16 — Call to Action**
    - **Visual:**
      - Clean dark slide with large CTA: `mymetaview.com/demo`.
      - Optional small QR code using the demo URL.
    - **Copy:**
      - “See it on your own URLs.”

---

## 5. Design Guidelines for Implementation

- **Layout:**
  - 16:9 widescreen canvas.
  - Generous margins; avoid cramming screenshots edge-to-edge.
  - Use consistent grid and alignment; center hero visuals, left-align narrative text.
- **Typography:**
  - Match 4.0 brand typography where possible; otherwise:
    - Title: geometric sans (e.g. Inter/Manrope) in bold.
    - Body: same family, regular/medium, high contrast on dark background.
- **Color Use:**
  - Backgrounds: deep slate/dark navy from 4.0 palette.
  - Accents: cyan/sky for highlights and CTAs.
  - Avoid introducing new brand colors that conflict with existing assets.
- **Screenshot Treatment:**
  - Apply subtle rounded corners and drop shadows to all UI screenshots.
  - When overlaying on dark backgrounds, add a faint outer glow to separate from background.
- **Diagram Style:**
  - Use minimal iconography; prioritize legible boxes/arrows.
  - Keep labels short; expand verbally during the demo rather than cramming text.

---

## 6. Next Steps & Handoff

- **For Presentation Creator (e.g., Product Designer or Demo Owner):**
  - Implement this spec in the chosen slide tool (Google Slides / Keynote / Pitch).
  - Pull actual screenshots based on:
    - `MYMETAVIEW_4.0_DEMO_SCREENSHOT_SPEC.md` for live URLs and capture instructions.
    - Any 5.0-specific UI views from the demo implementation using `mymetaview-demo-animation.tsx`.
  - Recreate architecture and quality profile diagrams using the visual docs as the source of truth.
- **For Future Iterations:**
  - When 5.0 introduces new visual surfaces (e.g., additional quality controls or analytics), append new slides under Chapter 3 or 4.
  - Keep this spec as the **living document**; update here first, then propagate changes to the deck.

