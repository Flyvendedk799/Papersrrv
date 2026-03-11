## MyMetaView 5.0 – Demo-Generation UX Touchpoints

### 1. Goals and Success Criteria

- **Primary goal**: Make the demo-generation flow feel like a finished, premium SaaS product that a sales engineer could use live with zero explanation.
- **Success criteria**
  - **Clarity**: Users always know what page they are on, what will happen next, and what is required to generate a demo.
  - **Speed of understanding**: A first-time user should understand the full flow in \< 30 seconds from landing.
  - **Low-friction happy path**: Default path from “start demo” to “ready-to-show preview” should be \<= 5 clear steps with no dead ends.
  - **Confidence**: System clearly communicates progress, success, and failure with inline feedback and non-scary error handling.
  - **Story-first**: Every screen reinforces the narrative: “MyMetaView automatically turns your product into beautiful, on-brand preview images for every page.”

### 2. Core Persona and Context

- **Persona**: Internal operator or sales/demo engineer preparing a MyMetaView 5.0 demo.
- **Context**
  - Time-boxed: they often have minutes, not hours, to set up/demo.
  - Multi-run: they may generate multiple demo variants (different sites / themes).
  - Not a designer: UI must guide them to “good enough” visuals without design expertise.

### 3. End-to-End Demo-Generation Flow

High-level sequence for the demo:

1. **Landing / Entry**
   - Clear hero that states product value: “Generate polished social/meta previews for every page of your product with AI.”
   - Primary CTA: **“Create demo”** (or **“Start new demo”** if demos already exist).
   - Secondary CTA: **“View previous demos”** for quick recall.
   - Lightweight explanation of what a “demo” is (1–2 sentences + optional tooltip).

2. **Demo Setup (Wizard Step 1)**
   - Inputs:
     - **Project name** (default from MyMetaView project, editable).
     - **Target presentation context** (dropdown: e.g., “Sales demo”, “Marketing review”, “Investor deck”).
   - UX:
     - Single-column form, minimal required fields.
     - Inline helper copy under each field (“Shown internally only”, etc.).
   - Actions:
     - Primary: **“Continue”** (go to content source).
     - Secondary: “Cancel” or “Back to dashboard”.

3. **Content Source & Scope (Wizard Step 2)**
   - Inputs:
     - **Source URL or repo** (depending on implementation scope).
     - **Page selection**: default “All major pages” with auto-detected list; allow checkboxes for pages to include/exclude.
   - UX:
     - Summarized explanation: “We will scan these pages to generate preview images.”
     - Inline status indicator when validating source (loading spinner + short line of text).
   - Actions:
     - Primary: **“Continue to styling”** (disabled until validation passes).
     - Secondary: “Back”.

4. **Visual Style & Theme (Wizard Step 3)**
   - Inputs:
     - **Preset themes** (cards with thumbnail previews): e.g., “Product default”, “Dark minimal”, “Vibrant marketing”.
     - **Brand controls** (optional advanced section): accent color picker, font mood toggle (e.g., “Clean / Playful / Editorial”).
   - UX:
     - Grid of theme cards with hover state and “Selected” badge.
     - Right-side live preview frame showing 1–2 representative pages with currently selected theme.
   - Actions:
     - Primary: **“Generate demo”**.
     - Secondary: “Back”.

5. **Generation Progress**
   - Layout:
     - Left: progress summary (“Generating previews for 12 pages…”).
     - Right: vertically stacked page rows with individual statuses.
   - States:
     - **Queued / In progress / Completed / Failed** for each page.
   - UX:
     - Use calm animations: progress bar, dot loaders.
     - Friendly microcopy for failures: “We couldn’t reach /pricing. You can retry later or exclude this page.”
   - Actions:
     - Primary: **“View demo”** appears once minimum viable set (e.g., 80% of pages) is ready, even if a few pages are still running.
     - Per-row overflow menu for “Retry” or “Exclude page”.

6. **Demo Overview (Gallery)**
   - Purpose: this is the **showtime** view a sales engineer will actually present.
   - Layout:
     - Header with demo name, timestamp (“Generated 2 minutes ago”), and badge indicating source and theme.
     - Filter controls (page type, status).
     - Responsive grid of preview cards representing each page.
   - Each card:
     - Page title and short path (`/pricing`).
     - Generated image thumbnail with safe margins.
     - Quick actions: “Open full view”, “Copy image”, “Copy link”.
   - Actions:
     - Primary: **“Start walkthrough”** (enters a guided presentation mode).
     - Secondary: “Regenerate with different style”, “Export set” (if supported).

7. **Guided Walkthrough Mode**
   - Experience optimised for live demo:
     - Full-bleed slides, keyboard navigation (←/→) or on-screen arrows.
     - Optional “Presenter notes” sidebar (hidden by default) explaining what to highlight for each page.
   - States:
     - Empty-state when no notes: “No presenter notes yet. You can add talking points later.”
   - Actions:
     - “Exit walkthrough” returns to gallery.

### 4. Key UX Principles for Demo-Generation

- **Predictable, linear flow**: 3–4 wizard steps + progress + gallery. Avoid branching dead ends.
- **State visibility**: Always show where the user is in the process (step indicator, titles like “Step 2 of 4: Content scope”).
- **Progressive disclosure**: Advanced controls are collapsible and clearly labeled.
- **Recoverability**: Every potentially destructive action has an undo path or soft confirmation (e.g., “Exclude page” with immediate “Undo” toast).
- **Demo-friendly aesthetics**:
  - High-contrast typography, neutral background, avoid noisy chrome.
  - Keep chrome (nav, controls) visually subordinate to the preview images.
  - Ensure layouts and animations feel smooth at 60fps on modern hardware.

### 5. Cross-Team Touchpoints

This spec coordinates with other agents as follows:

- **Frontend Engineer**
  - Implements the wizard screens, progress view, and gallery layout.
  - Needs:
    - Clear step sequence and state machine (provided above).
    - Component hierarchy (wizard shell, step body, progress list, card grid).
    - Copy text for labels and buttons (can start with this doc’s phrasing).

- **Animation / Junior Dev (Animation)**
  - Responsible for micro-interactions that make the experience feel “finished”.
  - Key moments:
    - Wizard step transitions (subtle slide/opacity, not jarring).
    - Progress list row state changes (success/failure animations).
    - Gallery hover states and walkthrough entry/exit transitions.
  - Constraints:
    - Animations must be skippable/fast — no un-cancellable blocking sequences.

- **Docs / Visual Presentation / Documentation Specialist**
  - Owns narrative framing and inline helper copy.
  - Deliverables:
    - Tooltips and helper text for each critical control.
    - Suggested presenter script for walkthrough mode.

- **Graphics Specialist**
  - Ensures generated images look on-brand and cohesive.
  - Collaborates on:
    - Default theme presets and example thumbnails used in this UX.
    - Edge-case states (e.g., placeholder art when generation fails).

### 6. Edge Cases and Failure States

- **Source validation fails**
  - Show inline error under source URL field:
    - Title: “We couldn’t validate this source.”
    - Body: 1–2 actionable suggestions (“Check that the site is reachable and not behind a login.”).
  - Disable “Continue” until resolved or user changes input.

- **No pages detected**
  - Empty state with illustration and copy:
    - “We didn’t find any public pages to generate from.”
    - Offer actions: “Try a different URL” and “Manually add pages”.

- **Partial generation failure**
  - Keep overall demo usable:
    - Show banner: “Some pages couldn’t be generated. Your demo is still ready.”
    - Tag affected cards with a “Needs attention” label and offer “Retry”.

- **Timeouts / system errors**
  - Use non-technical language:
    - “Something went wrong on our side while generating this demo.”
    - Provide “Retry generation” and “Contact support” links.

### 7. Implemented 5.0 Flow (Current Release)

The **first release** of MyMetaView 5.0 uses a streamlined single-page flow, implemented in `agents/junior-dev-animation/deliverables/mymetaview-demo-animation.tsx` and aligned with `MYMETAVIEW_5.0_DEMO_SCREENSHOT_SPEC.md` and `MYMETAVIEW_5.0_VISUAL_DOCUMENTATION.md`:

| Step | UX Touchpoint | Implementation |
|------|---------------|----------------|
| **Configure** | Content source (URLs) | Single textarea, one URL per line; helper copy; primary CTA "Generate demo preview" |
| **Submitting** | Job registration | Button loading state; "Creating demo job…" header |
| **Generating** | Progress + skeleton grid | Loading strip (20–80% range); skeleton cards with shimmer; per-URL status rows |
| **Results** | Gallery + actions | Success / partial / error states; "Retry failed", "Edit URLs"; Run summary sidebar |

The **multi-step wizard** (Landing → Setup → Content Source → Visual Style → Progress → Gallery → Walkthrough) in §3 remains the **target UX** for a future release. The current flow satisfies the primary goal: a demo-ready experience that feels finished and requires no explanation.

### 8. Open Questions / Follow-Ups (Future Releases)

- **Presenter notes ownership**: which role maintains the canonical talking points for each demo?
- **Export formats**: do we need downloadable packages (e.g., ZIP, PDF deck) for external sharing?
- **Access control**: are demos private per user, per company, or globally visible inside the org?
- **Versioning**: how do we represent demos that were generated on outdated product UI vs latest?

When these decisions are made upstream (AIL-145 / AIL-142), this document should be updated to lock in the final UX contracts.

