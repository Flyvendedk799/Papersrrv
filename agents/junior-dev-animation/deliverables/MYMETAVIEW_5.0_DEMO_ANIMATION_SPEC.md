# MyMetaView 5.0 — Demo Generation Animation Spec

**Issue:** AIL-149 (MyMetaView 5.0 demo animation implementation)  
**Parent:** [AIL-145](/AIL/issues/AIL-145) (MyMetaView 5.0 demo generation workstream)  
**Program:** [AIL-142](/AIL/issues/AIL-142) (MyMetaView 5.0 execution delegation)  
**Owner:** Junior Dev (Animation)  
**Date:** 2026-03-11

---

## 1. Goals

- **Make demo generations feel “alive” and premium** without becoming distracting.
- **Communicate system state clearly** (idle → configuring → submitting → generating → completed / partial failure).
- **Stay performant and accessible** on typical marketing/demo hardware (laptops during screen sharing).
- **Align with 4.0 tool-first UX** while emphasizing 5.0’s improved demo-generation story.

---

## 2. Key Surfaces & States

These states assume a React SPA, but the same timing/easing can be used in any UI:

1. **Landing / “New Demo” entry**
   - Hero section with subtle parallax on scroll (background gradient + preview cards).
   - Primary CTA (“Generate demo preview”) uses a soft hover lift and press animation.
2. **URL input + configuration**
   - URL input field and options panel fade+slide in from below when the page mounts.
   - On focus, URL field gets a gentle glow and a 1px scale-up (no layout shift).
3. **Submit → job creation**
   - On submit, the form compresses vertically, then transitions into a progress header.
   - The submit button morphs into a “Generating…” pill with a looping shimmer.
4. **Generation in progress**
   - Grid of skeleton cards animates in with a staggered fade+scale.
   - Each skeleton card shows a looping “scan line” shimmer to indicate work.
   - A timeline/progress bar subtly fills over time, independent of exact job duration.
5. **Results grid (success / partial failure)**
   - Completed previews cross-fade from skeleton to thumbnail image.
   - Cards stagger in rows (40–60ms between cards) to avoid jank.
   - Failed URLs shake very slightly once and then rest with a warning icon + “Retry”.
6. **Hover and focus interactions**
   - Card hover: small lift (translateY -4px), 2–3% scale-up, shadow deepen.
   - Focus-visible outlines use smooth 120ms color fades, no motion-path movement.

---

## 3. Motion System

### 3.1 Timing

- **Fast interactions (hover, focus, button press):** 120–180ms.
- **State transitions (form ↔ loading, loading ↔ results):** 220–260ms.
- **Staggered list/grid appearances:** 40–80ms between siblings.
- **Entrance for full-page sections:** 260–320ms.

### 3.2 Easing

- Use **cubic-bezier(0.16, 1, 0.3, 1)** (“expo out”) for most transitions.
- Use **cubic-bezier(0.2, 0, 0, 1)** for subtle parallax or continuous motion.
- Never use linear easing for position/scale, only for shimmer/loop effects.

### 3.3 Reduced Motion

- Respect `prefers-reduced-motion: reduce`:
  - Disable continuous shimmer and parallax.
  - Replace large transitions with single-step opacity/scale changes ≤ 120ms.
  - Keep focus-visible cues and color changes (non-motion feedback) intact.

---

## 4. State Machine (High-Level)

```text
idle
 └─(landing loaded)→ configure

configure
 ├─(submit valid form)→ submitting
 └─(prefetch previous demo)→ configure_with_preview (optional)

submitting
 └─(job created)→ generating

generating
 ├─(all results ok)→ results_success
 ├─(some failed)→ results_partial
 └─(all failed / timeout)→ results_error

results_success
 └─(user edits URLs)→ configure

results_partial
 ├─(retry failed)→ generating
 └─(user edits URLs)→ configure

results_error
 └─(retry / edit)→ configure
```

Each transition corresponds to a layout + animation bundle in the React implementation.

---

## 5. Implementation Notes (React + Tailwind + Framer Motion)

**Stack assumption:** React SPA with Tailwind CSS. For animation, prefer **Framer Motion**:

- Handles layout transitions and staggered children without manual timers.
- Plays nicely with React state machines for `status` / `progress`.
- Can be swapped with CSS-only animations by using the same data attributes.

### 5.1 Core Component

- `DemoGenerationExperience` component owns:
  - `status: "configure" | "submitting" | "generating" | "results_success" | "results_partial" | "results_error"`.
  - `items: DemoItem[]` (URLs + statuses).
  - `progress: number` for the pseudo-progress bar.
- It renders:
  - **Header** with product name + subtle entrance motion.
  - **Config form** (hidden when `status !== "configure"`).
  - **Loading strip** (shown in `submitting`/`generating`).
  - **Results grid** with animated cards.

### 5.2 Motion Tokens (CSS utility classes)

Define a small set of reusable utility classes (or variants) in the app CSS:

- `.mv-fade-up`: opacity 0 → 1, translateY 8px → 0, 220ms.
- `.mv-fade-down`: opacity 0 → 1, translateY -8px → 0, 220ms.
- `.mv-scale-in`: opacity 0 → 1, scale 0.96 → 1, 220ms.
- `.mv-card-hover`: on hover/focus-visible, scale 1.02, translateY -2px, shadow-lg.
- `.mv-shimmer`: gradient background animation for skeletons.

These can be applied regardless of whether the host uses Framer Motion, GSAP, or pure CSS.

### 5.3 Accessibility

- Ensure all motion is **non-blocking**:
  - Do not delay critical navigation or form submission for the sake of animation.
  - Primary CTAs are clickable even while entrance animations are running.
- Provide ARIA live regions for status updates:
  - “Submitting demo job…”, “Generating previews…”, “10 of 12 complete”.
- For screen readers:
  - Skeleton shimmer is purely visual; label cards via aria attributes only once content exists.

---

## 6. Handoff Artifact

A ready-to-drop React implementation is provided in:

- `agents/junior-dev-animation/deliverables/mymetaview-demo-animation.tsx`

This file includes:

- A `DemoGenerationExperience` component with:
  - State machine for `configure → submitting → generating → results_*`.
  - Animation hooks for form, loading strip, and results grid.
  - Example props/interfaces that match a generic “demo generation” backend.
- Clear `// Copy to:` header so the MyMetaView frontend team can drop it into their repo and wire it to their real API.

---

## 7. Acceptance Criteria (Animation Scope)

- [ ] All primary states (configure, submitting, generating, results_success, results_partial, results_error) have distinct yet cohesive motion treatments.
- [ ] Animations honor `prefers-reduced-motion` by disabling continuous effects.
- [ ] Results grid uses staggered entry and hover states without layout jank.
- [ ] Error/partial states communicate failure clearly with minimal motion.
- [ ] Implementation file compiles in a standard React + Tailwind + Framer Motion stack with minimal wiring changes.

