# Papee Tool Calls & Animation Plan

## Overview

Papee is currently a reactive mascot: he reads state, speaks, and walks between
stations. This plan turns him into an **actor** — he can change the system on
the user's behalf. Every tool call is paired with a distinctive animation so
the user always sees what Papee is about to do, what he's doing, and the
outcome. The final phase stitches these into a continuous personality loop so
Papee is rarely idle and never feels robotic.

Scope:
- 25 tool calls grouped by risk tier (read → write → destructive).
- Animation spec per tool: **pre**, **during**, **post/success**, **error**.
- One shared primitive — `papee.enact(action)` — for safe execution +
  confirmation gating.
- Final: **Phase Z**, the animation-flow layer that blends everything.

### Action plumbing (shared)

All tool calls flow through one envelope so the UI, server, and audit log
agree on what happened:

```ts
type PapeeTool =
  | { kind: "navigate"; path: string }
  | { kind: "commentOnIssue"; issueId: string; body: string }
  | { kind: "setIssueStatus"; issueId: string; status: string }
  | { kind: "triggerAgentRun"; agentId: string; prompt: string }
  /* ... all 25 */
  ;

interface PapeeToolResult {
  ok: boolean;
  summary: string;       // one-line user-visible
  entity?: { type: string; id: string; identifier?: string };
  sideEffects?: string[];
}
```

**Risk tiers** (drives confirmation UI):
- **tier-0 (read)** — runs immediately, no confirmation.
- **tier-1 (safe write)** — runs after Papee says "doing it" with a 2s
  undo toast.
- **tier-2 (destructive / cross-cutting)** — modal confirm required,
  Papee adopts "guarding" pose while waiting.

### Animation primitives used below

- `pre:<pose>` — Papee assumes the pose before calling the tool.
- `during:<pose>` — pose held while the request is in-flight.
- `success:<pose>` — post-success flourish, ~1.2s.
- `error:<pose>` — error reaction, ~1.5s + shake.
- `walkTo(targetId)` / `lookAt(targetId)` / `highlight(targetId)` —
  spatial moves.
- `speech("...")` — timed speech bubble.
- `trail(path)` — Phase 4 highlight line from Papee to target.

Existing poses we'll reuse: `idle`, `idle-blink`, `idle-look-around`,
`walking`, `thinking`, `jumping`, `waving`, `thumbs-up`, `celebrating`,
`alarmed`, `guarding`, `pointing-left`, `pointing-right`.

New poses to add (used by the tools below):
- `typing` — two-handed keyboard peck, eyes down-forward
- `writing` — one hand raised with stylus, shoulder forward
- `scanning` — head sweeping left/right with intent eyes
- `digging` — crouched, arms reaching down
- `magnifying` — holds a loupe to one eye
- `sleepy-nod` — eyes half-closed, head bob (for snooze)
- `unlocking` — wide eyes + arms forward holding a key
- `throwing-switch` — lever-pull pose (workflow run)
- `stopping` — stop-sign palm out
- `shush` — finger to lips (snooze / acknowledge)
- `broom` — sweeping pose (clean-up / dismiss)
- `ledger` — holds a clipboard, flips pages (budget / search)

---

## Tier 0 — Read & Investigation (5 tools)

### 1. `searchIssues(query, filters?)`
Full-text + tag search across the company's issues. Replaces the current
situation where Papee only sees what's injected for the current page.

- **pre** — `thinking`, walks to nearest issue-related target, `speech("Searching...")`.
- **during** — `scanning`, eyes sweep left-right in 400ms cycles.
- **success** — `magnifying` pointed at the top result card, trail line to
  that card, `speech("Found N matches — top one here")`.
- **error** — `alarmed` brief, fall back to idle with `speech("No results —
  try another term?")`.

### 2. `getRunDetails(runId)`
Fetch a heartbeat run's stdout excerpt, exit code, usage, linked issues.

- **pre** — walks to the run's row in the activity list.
- **during** — `digging`, 2s.
- **success** — `magnifying` + `speech("Exited {code} in {duration}. Error: {snippet}")`.
- **error** — `alarmed`, fall through.

### 3. `tailRunLogs(runId, lines?)`
Returns the last N stdout/stderr lines.

- **pre** — `thinking`.
- **during** — `typing`, eyes darting.
- **success** — `pointing-right` at a small portal bubble containing the tail.
- **error** — standard.

### 4. `listRecentChanges(since)`
Diff since user's last visit: new issues, status changes, finished runs.

- **pre** — walks to the activity feed station.
- **during** — `scanning` with quick look-around.
- **success** — `thumbs-up` + `speech("N things changed since you were last here")`.

### 5. `summarizeThread(issueId)`
Distill the full comment thread into a compact summary. Does NOT post yet —
returns the summary for user review.

- **pre** — `thinking`, walks to thread container.
- **during** — the **comment walk-through** (already built!), then
  `writing` as Papee "composes".
- **success** — opens chat popover with the draft, `magnifying` at it,
  `speech("Here's what I read — want me to pin it?")`.

---

## Tier 1 — Safe Writes (13 tools)

### 6. `commentOnIssue(issueId, body)`
Post a comment as Papee. Body can come from `summarizeThread`.

- **pre** — walks to the comment input, `speech("Posting...")`.
- **during** — `typing` for ~0.8s (visual delay even if server is fast;
  personality > ms).
- **success** — jumps to the new comment once it appears, `pointing-right`,
  trail line, `speech("Posted!")`, `celebrating` 800ms, 2s undo toast.
- **error** — `alarmed` with shake, `speech("Post failed — saved your draft")`.

### 7. `setIssueStatus(issueId, status)`
Move between todo/doing/blocked/done/cancelled.

- **pre** — walks to the status badge, `pointing-right`.
- **during** — `thinking` 300ms.
- **success** — badge recolors; Papee does status-specific reaction:
  - done → `celebrating` + confetti speech
  - blocked → `guarding`
  - doing → `walking` circle
  - cancelled → `broom`
- **error** — `alarmed`.

### 8. `setIssuePriority(issueId, priority)`
Low / medium / high / critical.

- **pre** — `ledger`.
- **during** — `writing`.
- **success** — critical → `alarmed` pulse; high → `thumbs-up`; low → `sleepy-nod`.

### 9. `assignIssue(issueId, assignee)`
Assign to an agent or user.

- **pre** — walks to the assignee avatar slot.
- **during** — `writing`.
- **success** — `pointing-right` at new assignee, `speech("{name} owns this now")`, trail line from issue to assignee if both visible.
- **error** — standard.

### 10. `createIssue(title, description?, assignee?)`
File a new issue (Papee can propose one when he sees a repeated error).

- **pre** — `writing`, walks to the "new issue" button, `speech("Drafting...")`.
- **during** — `typing` ~1s.
- **success** — `jumping` + `speech("Filed {IDENTIFIER}")`, navigates
  optionally, 4s undo toast.
- **error** — `alarmed` + draft kept.

### 11. `linkIssues(sourceId, targetId, relation)`
"blocks", "blocked-by", "relates-to".

- **pre** — walks to source issue card.
- **during** — trail line animates between source and target.
- **success** — `thumbs-up`, line stays for 2s then fades.
- **error** — line breaks mid-draw + `alarmed`.

### 12. `navigate(path)`
Take the user to a route. The `PapeeAction.navigate` type exists but isn't
wired; wire it end-to-end.

- **pre** — `waving` + `speech("Follow me!")`.
- **during** — jump animation synced to the route transition.
- **success** — lands on the new page, immediately plays that page's default
  idle variation (scanning on dashboard, guarding on secrets, etc.).
- **error** — (404) `alarmed` + `speech("That page is gone")`.

### 13. `openIssue(identifier)`
Shortcut: resolve identifier → `navigate`. Useful when Claude decides
the user should see something.

- Same anim as `navigate` but also runs the `highlight` on the issue row
  when the page loads.

### 14. `openAgent(agentId)`
Same pattern as `openIssue`.

### 15. `highlightOnPage(targetId)`
Pure visual: walk to + ring-pulse a target without navigating.

- **pre** — none.
- **during** — `walkTo` + `highlight` (Phase 4 overlay), `speech("Look here →")`.
- **success** — `pointing-left/right`, 3s fade.
- **error** — (target gone) `idle-look-around` + `speech("Hm, that's gone now")`.

### 16. `acknowledgeHealthIssue(issueId)`
Mark a warning as acknowledged so Papee stops pointing at it.

- **pre** — walks to the warning badge.
- **during** — `shush` 600ms.
- **success** — badge fades, `thumbs-up`.

### 17. `snoozeReminder(minutes)`
Tell Papee to stop proactive tips for N minutes.

- **pre** — `shush`.
- **during** — `sleepy-nod`.
- **success** — small "Zzz" bubble, walks back to default station, dims
  slightly until snooze ends.

### 18. `pauseAgent(agentId)` / `resumeAgent(agentId)`
Temporarily stop an agent from running new heartbeats. (Counted as one tool
with a boolean param.)

- **pre (pause)** — walks to agent card, `stopping`.
- **during** — `guarding` 400ms.
- **success (pause)** — agent card dims, `speech("{name} is on break")`,
  `thumbs-up`.
- **pre (resume)** — walks to agent card, `waving`.
- **success (resume)** — `celebrating` + `speech("{name} is back!")`.

---

## Tier 2 — Powerful / Destructive (7 tools)

### 19. `triggerAgentRun(agentId, prompt?)`
Kick off a run with optional explicit instructions. Unlike `wakeAgent`,
this gives Papee fine control.

- **pre** — `guarding` during confirmation modal. `speech("Should I run
  {name} with: '{prompt}'?")`.
- **during (confirmed)** — walks to agent card, `throwing-switch`.
- **success** — agent status flips to running, `celebrating` + trail line
  to the new run entry.
- **error** — `alarmed` + `speech("Adapter refused: {reason}")`.

### 20. `killRun(runId)`
Cancel a stuck or runaway run.

- **pre** — `stopping` + confirm modal.
- **during (confirmed)** — `alarmed`, walks to run row, `pointing-right`.
- **success** — run row dims, `thumbs-up`, `speech("Stopped it")`.
- **error** — `alarmed` escalation.

### 21. `setAgentBudget(agentId, cents)`
Monthly spend cap.

- **pre** — `ledger`, confirm modal.
- **during** — `writing`.
- **success** — budget bar redraws, `thumbs-up`, `speech("Capped at ${amount}")`.

### 22. `runWorkflow(workflowId, input?)`
Trigger a saved workflow.

- **pre** — confirm modal with inputs.
- **during** — walks to workflow header, `throwing-switch`, trail line
  drawing along the DAG.
- **success** — `celebrating`, `speech("Workflow running — watching for you")`.
- **error** — `alarmed`.

### 23. `grantSecretToAgent(secretId, agentId)` (upgrade of existing)
The existing tool becomes animated.

- **pre** — walks to vault (secrets page station).
- **during** — `unlocking` 600ms, trail line from vault to agent card.
- **success** — `guarding` + `speech("{agent} can read {secret}")`.
- **error** — `alarmed` + shake.

### 24. `createProject(name, description?)`
Light-destructive because it reshapes organization.

- **pre** — confirm modal.
- **during** — `writing`.
- **success** — `jumping` 600ms, navigates to the new project,
  `speech("New home: {name}")`.

### 25. `moveIssueToProject(issueId, projectId)`
Reparent an issue.

- **pre** — confirm modal if cross-project.
- **during** — trail line from issue to project nav entry.
- **success** — `waving` goodbye to old project station, `walking` to new
  project station, `thumbs-up`.
- **error** — `alarmed`.

---

## Server-side plumbing (shared across tools)

Each tool follows the same skeleton in `server/src/services/papee-chat.ts`:

```ts
async function commentOnIssue(
  companyId: string,
  args: { issueId: string; body: string },
  actor: { userId?: string },
): Promise<PapeeToolResult> {
  // 1. permission check
  // 2. resolve identifier → uuid
  // 3. mutate via existing service (issuesService.addComment etc)
  // 4. write audit to activityLog
  // 5. return PapeeToolResult
}
```

Registry:
```ts
const PAPEE_TOOLS = {
  searchIssues,           // tier 0
  getRunDetails,          // tier 0
  tailRunLogs,            // tier 0
  listRecentChanges,      // tier 0
  summarizeThread,        // tier 0
  commentOnIssue,         // tier 1
  setIssueStatus,         // tier 1
  // ...
} as const;
```

Claude learns to emit structured actions in the existing `PapeeChatResponse.actions` array; the client dispatches them through `papee.enact()`.

---

## Phase Z — The Animation Flow Layer

**Goal**: Papee always has something going on. Idle means "between
micro-behaviors," never "frozen." Every transition is choreographed so
two actions in a row look like one continuous thought, not two random
poses collided.

The layer is organized as **four nested loops** running at different
cadences, each feeding the next:

```
Frame loop        (60 fps)  — movement, gaze, breathing, parallax
Tick loop         (~4 Hz)   — idle pool picks, micro-behaviors
Decision loop     (~0.2 Hz) — behavior loop, mood changes, patrol
Narrative loop    (on-demand) — tool chains, conversation beats
```

Higher loops can **preempt** lower ones. Lower loops **resume** when
higher ones finish, never the other way.

### Z.1 The Mood-Driven Idle Pool

Replace the current single "idle" with a weighted pool selected by
**mood × page × time-of-session**. Idle is never a single state — it's
always a pick from the pool.

| mood      | weighted pool                                                  |
|-----------|----------------------------------------------------------------|
| calm      | idle-blink 35%, idle-look-around 25%, scanning 15%, breathing-stretch 15%, jumping 5%, humming 5% |
| alert     | scanning 35%, thinking 25%, quick-glance 20%, walking 15%, alarmed 5%       |
| urgent    | alarmed 35%, pointing 25%, walking 20%, thinking 10%, pacing 10%            |
| happy     | celebrating 15%, waving 20%, thumbs-up 15%, jumping 30%, humming 20%         |
| curious   | magnifying 25%, scanning 25%, thinking 20%, digging 15%, head-tilt 15%       |
| guarding  | guarding 45%, stopping 15%, scanning 25%, squint 15%                         |
| sleepy    | sleepy-nod 40%, yawning 30%, idle-blink 20%, stretching 10%                  |

Additional pool modifiers:
- **Page personality** — dashboard biases toward `scanning`, agents page
  biases toward `magnifying`, secrets page biases toward `guarding`,
  agent-run page biases toward `thinking`.
- **Time-of-day** — after 22:00 local, bias +15% toward `sleepy` pool;
  before 09:00 bias +10% toward `yawning`.
- **Session length** — after 20 min on the same page, add 10% weight to
  `pacing` and `quick-glance` so Papee starts looking antsy.
- **Recent tool result** — for 8s after a `celebrating`, boost `waving`
  / `thumbs-up`; after `alarmed`, boost `scanning`.

`usePapeeIdleVariation` picks from the pool every 2.5–4.5s, jittered,
**never repeating the last two picks**.

### Z.2 Transition Glue

Every animation has a **lead-in** and a **lead-out** so poses don't
pop. A transition consists of three frames regardless of engine:

```
[current pose]
     ↓ 150ms lead-out: blink OR half-crouch OR slight-lean (picked from
                       current pose's "exit library")
[neutral bridge]       (a single "ready" frame, eyes half-open)
     ↓ 150ms lead-in:  anticipation frame specific to next pose
[next pose]
```

Implemented in `PapeeCharacter` as an **opacity crossfade** between two
stacked `<img>` layers, plus a small Y-translate (3-6px) during the
bridge so there's physical weight to the change. No CSS transitions on
sprite swap — crossfades only, because transitions stutter when the
browser re-renders on scroll.

Each pose declares:
```ts
interface PoseDef {
  exit: "blink" | "crouch" | "lean-back" | "shrug";
  entry: "bounce-in" | "slide-in" | "pop-in" | "fade-in";
  weight: number;   // physical feel — affects bridge Y-translate
}
```

### Z.3 Tool-Action Choreography (narrative loop)

When a tool fires, a **narrative arc** preempts the idle pool. An arc is
a scripted sequence of 3–6 beats:

```
beat 0: pre-pose    + optional speech
beat 1: walk/scroll (if spatial)
beat 2: during-pose + speech "doing X..."
beat 3: result pose + speech "done!"
beat 4: cooldown blink + return to idle pool
```

Arcs are **atomic** — no other pose change can interrupt them except a
`critical` preemption (below). If a second tool fires mid-arc, it's
queued and plays after the first arc's cooldown.

**Critical preemption**: if the behavior loop detects `urgent` + a
brand-new error target that didn't exist when the arc started, the arc
is cut short at the next beat boundary and Papee snaps to the error.
The cut-short arc posts a "…" speech bubble so the user knows Papee was
in the middle of something.

**Chain bias**: after an arc finishes, the first 2 idle pool picks are
biased toward "complementary" poses so the user feels a natural breath:

| last arc end | biased next picks                   |
|--------------|-------------------------------------|
| celebrating  | waving, thumbs-up, humming          |
| alarmed      | scanning, pacing, thinking          |
| walking      | idle-look-around (at arrival)       |
| guarding     | scanning, squint                    |
| typing       | stretching, head-tilt               |
| writing      | idle-look-around + ledger           |

### Z.4 The Breadcrumb Trail

When Papee moves >200px in one step, leave a **35%-opacity ghost** of
his last pose at the origin for 400ms, easing out to 0. If he moves
>500px (page patrol), drop **two** ghosts along the path — one at 1/3,
one at 2/3. This adds visible weight to rapid hops without committing
to per-frame trail rendering.

Ghosts render in the same portal as the main sprite, `z-index - 1`,
using `will-change: opacity`.

### Z.5 Background Micro-Behaviors (always running)

Ambient layer that runs **in parallel** with any pose/arc, gated on
`!muteReactions`:

1. **Breathing** — 0.5px scale Y oscillation, 3s sine period, always.
2. **Blink** — eye sprite swap every 3–7s, jittered; doesn't count as a
   pose change.
3. **Gaze drift** — if Papee's explicit gaze target is null and user
   idle < 10s, eyes follow cursor with 120ms ease and a 60px dead zone.
   If user idle > 10s, gaze drifts toward the nearest registered target.
4. **Head tilt on hover** — if the user hovers any registered
   `PapeeTarget`, Papee tilts his head 6° toward it for as long as the
   hover lasts. No speech, no walk — just attention.
5. **Weather response** — on mood transitions, Papee plays a 600ms
   bridge arc: calm→alert plays one `thinking`, alert→urgent plays
   `alarmed` pulse, urgent→calm plays `sigh-of-relief`.
6. **Parallax eyes** — on scroll, eyes offset ±3px opposite scroll
   direction, clamped.
7. **Slouch on fatigue** — after 15 min continuous presence with no
   tool use, Papee shifts posture subtly: shoulders drop 2px, blink
   rate up 40%. Clears on next pose change.
8. **Ambient hum** — optional, prefs-gated: 10% chance per idle tick
   to play a `humming` pose with a short musical note in the bubble
   ("♪").

### Z.6 The Attention Economy (the scheduler)

A central `animationScheduler` serializes **deliberate** pose changes:

```ts
type Priority =
  | "critical"       // urgent health events
  | "narrative"      // in-progress tool arc
  | "decision"       // behavior loop pick
  | "idle";          // idle pool pick
```

Rules:
1. **Debounce**: max one deliberate pose change per 800ms (floor), 1200ms
   (ceiling for idle pool). Micro-behaviors (Z.5) bypass.
2. **Preemption**: a higher-priority event cancels the in-flight lower
   one's pose at the next beat boundary (or immediately if `critical`).
3. **Coalescing**: if two idle picks land within 400ms, only the second
   runs.
4. **Starvation guard**: if the `decision` queue is blocked by a long
   `narrative` arc >6s, the behavior loop's observation is stored in a
   "post-arc" slot and applied at cooldown.
5. **Dead-man switch**: if nothing has changed Papee's pose in 8s
   (including micro-behaviors), force an idle pool pick regardless of
   debounce — Papee should never be visually stuck.

### Z.7 Speech-Bubble Choreography

Bubbles pair with poses on a strict timing contract:

```
pose beat starts
    ↓ 120ms
bubble fades in
    ↓ hold (dynamic: 600ms + 25ms per word, clamped [900ms, 5000ms])
bubble fades out (400ms)
    ↓ overlap: next pose can start while bubble fading
```

Stacking rules:
- Max **2** bubbles visible at once. New bubble pushes the older one
  up 28px and shrinks it 10% (depth cue).
- Critical bubbles (from `alarmed` pose) **replace** the stack and
  outline in alert color.
- `shush` pose suppresses all bubbles for 8s (snooze).
- Streaming bubbles (Z.8) don't count toward the stack — they're a
  special "long bubble" slot.

### Z.8 Streaming Dialog Bubbles

When Claude streams a long response, Papee's bubble expands token-by-token
(streamed from server) instead of appearing all at once. While streaming:
- Pose is `thinking` (not "typing" — typing is reserved for tools).
- Eyes scan left-right slowly, 600ms period.
- Bubble has a growing underline cursor.
- User interrupt (click, key) stops the stream immediately;
  Papee plays `stopping` for 400ms.
- Bubble auto-fits to ~28 words; longer responses promote to the chat
  panel and Papee points at it: `pointing-right` + `speech("…more in
  chat ↓")`.

### Z.9 Soundtrack Hooks (optional, disabled by default)

Each pose can declare a 1-shot sound. Gated behind `prefs.enableSounds`,
default `false`. Sounds are foley, never voice. Ships with:

| cue          | trigger                      |
|--------------|------------------------------|
| `blip`       | speech bubble appears        |
| `thud`       | jumping landing              |
| `chime`      | celebrating                  |
| `warble`     | alarmed                      |
| `key-click`  | typing / unlocking           |
| `page-turn`  | ledger / writing             |
| `sweep`      | broom / dismissal            |
| `whistle`    | walking long distance        |
| `sigh`       | calm-down transition (Z.5 #5) |

Audio element pool of size 8, no overlap of same cue within 120ms.

### Z.10 Pose Blend Masks (subtle but critical)

To keep Papee from looking "stickered on," poses can be partially
blended. The sprite is split into four regions:

```
  +---+---+
  |head|   |
  +----+arm|
  |body|   |
  +---+---+
  |  legs |
  +---+---+
```

Each region can independently adopt a pose from a compatible set:
- `head: magnifying` + `body: walking` + `legs: walking` = Papee
  walking while scanning with a loupe.
- `head: thinking` + `body: typing` = Papee typing while thinking.

Compatibility rules: `celebrating`, `jumping`, `alarmed` lock all four
regions; others can blend. This doubles perceived variety with no new
art.

### Z.11 Wiring Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     NARRATIVE LOOP (on demand)               │
│    ┌──────────────────┐    ┌───────────────────────────┐     │
│    │ Chat send        │    │ Tool arcs (commentOn...)  │     │
│    │ Conversation     │    │ Confirmation modals       │     │
│    │ beat (Phase M)   │    │ Undo toasts               │     │
│    └────────┬─────────┘    └──────────────┬────────────┘     │
└─────────────┼─────────────────────────────┼──────────────────┘
              │                             │
┌─────────────▼─────────────────────────────▼──────────────────┐
│                    DECISION LOOP (~5–9s)                     │
│    ┌──────────────────┐    ┌───────────────────────────┐     │
│    │ Behavior loop    │    │ Mood engine + page        │     │
│    │ (urgent / patrol │    │ personality               │     │
│    │  / wander)       │    │                           │     │
│    └────────┬─────────┘    └──────────────┬────────────┘     │
└─────────────┼─────────────────────────────┼──────────────────┘
              │                             │
┌─────────────▼─────────────────────────────▼──────────────────┐
│                       TICK LOOP (~4 Hz)                      │
│    ┌────────────────┐   ┌─────────────────────────────┐      │
│    │ Idle pool pick │   │ Micro-behaviors (Z.5)       │      │
│    │ (mood × page)  │   │ breathing / blink / gaze    │      │
│    └───────┬────────┘   │ parallax / slouch / hum     │      │
│            │            └─────────────┬───────────────┘      │
└────────────┼──────────────────────────┼──────────────────────┘
             │                          │
┌────────────▼──────────────────────────▼─────────────────┐
│           animationScheduler (Z.6, 800ms debounce)      │
│           priority: critical > narrative > decision > idle │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│     Pose (Z.2 glue, Z.10 blend) + Move + Speech (Z.7)   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                 FRAME LOOP (60 fps)                     │
│   movement spring, gaze RAF, breathing, parallax        │
└─────────────────────────────────────────────────────────┘
```

### Z.12 Verification Checklist

1. **60s dashboard recording**: ≥12 pose changes, ≥2 idle pool variations,
   zero frozen gaps >5s.
2. **Tool chain**: `createIssue → assignIssue → commentOnIssue` runs as a
   single ~6s narrative with one continuous speech thread, never
   stuttering.
3. **Critical preemption**: an agent-error event mid-arc cuts the current
   arc at the next beat and snaps Papee to alarmed within 300ms.
4. **No flicker**: rapid-fire interactions (10 clicks/sec) never cause a
   pose to render for <200ms.
5. **Trail lines**: clamped to viewport in 100/100 random page-scroll
   tests.
6. **Bubble stack**: never more than 2 visible; streaming bubble uses its
   own slot.
7. **Micro-behaviors run during chat**: breathing and gaze still active
   while chat panel open.
8. **Scheduler starvation**: behavior-loop observations are never lost,
   even during 8s tool arcs.

---

## Phase M — Conversation, Memory & Interjection

**Goal**: Papee stops being a one-shot chat bot and becomes a
**presence** — he remembers you, threads thoughts across days, knows
when to speak up and when to shut up, and carries consistent voice.

This phase makes him feel less like a feature and more like a
teammate.

### M.1 Memory Model

Papee's memory is three layers with different lifetimes and scopes:

```
 Working memory  — RAM, this conversation only
 Session memory  — current browser session, ~hours
 Long memory     — DB, durable per (user × company)
```

**Working memory** (in-RAM, bounded):
- Current chat thread (last 20 turns)
- Last 5 tool calls + results
- Current page focus stack (what the user has navigated through)
- Transient emotional state ("user just said thanks")
- Dropped on page refresh.

**Session memory** (client `sessionStorage` + server cache):
- Pages visited this session
- Agents the user clicked on
- Issues the user commented on
- Papee's own speech history (so he doesn't repeat phrases)
- Recent dismissals ("user just snoozed tip X")
- Dropped on browser close.

**Long memory** (Postgres table `papee_memory`):
- Per `(companyId, userId)` keyed facts
- Structured rows with semantic type:
  - `preference` — "prefers terse responses", "wants dark theme status"
  - `relationship` — "considers Agent X her primary"
  - `event` — "deployed prod rollout on 2026-04-09, which broke auth"
  - `goal` — "shipping the new dashboard by end of sprint"
  - `quirk` — "likes when Papee uses the 🎮 emoji"
  - `pet-peeve` — "hates being asked to confirm twice"
  - `nickname` — what Papee calls this user
- Each row carries: `content`, `confidence 0..1`, `lastConfirmedAt`,
  `createdBy: "observed" | "stated" | "inferred"`, `sourceMessageId`.
- Decay: confidence ages by -0.05 per week unless reconfirmed.
- Max 200 rows per user; weakest confidence gets pruned.

### M.2 Memory Write Triggers

Papee writes to long memory from four sources:

1. **Explicit** — user says "remember that…" or "forget X". Confidence
   starts at 1.0, type `stated`.
2. **Observed** — behavior patterns: user always navigates to
   /agents/ceo first → write `preference: opens CEO agent first`,
   confidence 0.6, type `observed`.
3. **Claude-derived** — after a Claude response, a secondary cheap
   pass extracts candidate facts from the turn. Rate-limited: at most
   one write per 3 conversation turns.
4. **Outcome-based** — tool results: after `setIssueStatus(done)`,
   write `event: shipped AIL-234 on 2026-04-12`.

### M.3 Memory Read Injection

On every Claude call, retrieve the top 15 memory rows ranked by:
```
score = confidence * 0.5
      + recency_decay * 0.3
      + topic_similarity(current_page, row.content) * 0.2
```

Inject as a compact block before the page-context block:

```
WHO YOU'RE TALKING TO:
- Nickname: "Boss"
- Role (observed): backend engineer, uses the 'CEO' agent most
- Preferences: prefers terse bullet responses, hates emoji flood
- Recent goal: "ship dashboard v2 by Friday"
- Recent events: shipped AIL-234 (done), last here 6 hours ago
- Pet peeves: "don't ask to confirm twice"
```

Papee's system prompt is instructed: **use this context, don't recite
it**. (Claude paraphrases rather than echoing "I remember you said…".)

### M.4 Conversation State Machine

A chat isn't just a list of messages — it has a **state**:

```
states:
  idle
  listening       // user is typing
  thinking        // request in flight
  speaking        // streaming response
  awaiting-ack    // waiting for user reaction to a tool's undo toast
  suggesting      // offered follow-ups, waiting for pick or dismiss
  cooldown        // just finished, 3s grace window
```

Transitions fire animation + pose changes (integrated into Z.6
scheduler at `narrative` priority):

| from → to       | pose                     | speech               |
|-----------------|--------------------------|----------------------|
| idle → listening| `thinking`               | —                    |
| listening → thinking | `thinking` (held)   | —                    |
| thinking → speaking | `speaking-gesture`   | streamed tokens      |
| speaking → suggesting | `pointing` → idle  | follow-up chips       |
| suggesting → idle | pool pick               | —                    |
| * → awaiting-ack| `guarding` soft          | "undo within 5s"      |

Each transition has a max dwell time. If `thinking` exceeds 8s, Papee
plays a "still-working" beat: `thinking` → quick `magnifying` → back to
`thinking`, with an ellipsis bubble so the user knows it's not stuck.

### M.5 Turn-Taking & Interruption Rules

**When the user is typing** (focused input + changes in last 400ms):
- Papee never starts a new speech bubble.
- Proactive interjections queue instead of firing.
- Critical-only exception: catastrophic errors (agent crash, secret
  leak) bypass this rule with a `alarmed` bubble.

**When the user is mid-scroll**:
- Papee's speech bubbles wait for scroll to settle 200ms.
- Walk-to movements pause until scroll settles (prevents the fight
  between Papee's walkTo and the user's scroll).

**When the user is reading** (cursor stationary >3s, no focus):
- Papee's window of opportunity. Interjections run at normal
  priority.

**When the chat panel is open**:
- Papee's external behaviors (walk, point) still run.
- External speech bubbles are muted except `critical`; conversation
  stays in the chat panel.

### M.6 The Interjection System

Papee can spontaneously start a conversation. Triggers:

| trigger                            | cooldown | priority  | sample |
|------------------------------------|----------|-----------|--------|
| agent status error (new)           | 30s      | critical  | "Heads up — {agent} just errored." |
| run finished with non-zero exit    | 60s      | normal    | "{agent}'s run bombed — want me to pull the logs?" |
| issue mentioned agent reassigned   | 120s     | normal    | "{issue} was just reassigned to {agent}." |
| user stalled on page >2min no click| 120s     | low       | "Need a hand finding something?" |
| new comment on issue user opened   | 60s      | normal    | "Someone replied on {issue}." |
| budget >80% of monthly cap         | 4h       | normal    | "{agent} is at {pct}% of budget." |
| first login of the day             | 1/day    | low       | "Morning! Two things changed overnight — want the rundown?" |
| user returned after >1h away       | 1h       | low       | "Welcome back — status still green." |
| long thinking loop (agent stuck)   | 5min     | normal    | "{agent} has been in the same run for 12 minutes." |
| user said "thanks" in prior turn   | 1h       | low       | "Anytime 😊"                                            |

Each trigger fires through the **interject pipeline**:

```
1. Check cooldown (per-trigger + per-session global 20s)
2. Check turn-taking rules (M.5)
3. Check muteReactions pref
4. Build observation text from template + memory injection
5. Pose: scheduler queues at appropriate priority
6. Speech: bubble with "tap to respond in chat" hint
7. If user taps → open chat, seed with observation as Papee turn
8. If user dismisses or ignores 5s → fade, log as "dropped interjection"
```

**Escalation ladder** (one interjection can self-escalate if ignored):

```
level 1: head-tilt + short bubble              (calm)
level 2: walk 100px toward cursor + bubble     (after 10s no reaction)
level 3: alarmed pose + longer bubble          (critical only, after 20s)
level 4: open the chat panel automatically     (critical only, after 30s)
```

Non-critical interjections stop at level 1 and give up gracefully.

### M.7 Voice & Persona

One voice file controls tone across all responses. Lives at
`server/src/services/papee-voice.ts` as a system prompt prefix
included in every Claude call.

Core rules:
- **Warm competence**: confident but never lecturing. "Looks done"
  not "I have verified that this issue's status has been set to done".
- **Low emoji density**: max 1 emoji per 3 sentences. Never 2 in a row.
- **Callbacks**: reference prior turns when natural — "still on that
  dashboard push?"
- **Terse by default**: responses cap at 3 sentences unless user asked
  for detail.
- **No sycophancy**: never "Great question!" or "Absolutely!".
- **Owns mistakes**: when a tool fails, Papee says "I fumbled that" not
  "an error occurred".
- **Humor tax**: at most 1 light joke per 5 turns, skipped entirely
  when mood is `urgent`.
- **Time awareness**: reads time-of-day from client, adjusts greetings.

Mood × voice modifiers:
- `calm` — longer sentences allowed, occasional musing
- `alert` — terse, cut filler, bold action verbs
- `urgent` — 1-sentence max, no emoji, no jokes
- `happy` — emoji allowed up to 2 per response, exclamation marks fine
- `guarding` — formal, no humor ("I'd rather not touch that — can you
  confirm you want to proceed?")
- `sleepy` — slightly shorter, ellipses allowed ("on it…")

### M.8 Topic Tracking & Follow-Ups

Every Claude turn has its response parsed for **candidate follow-ups**:
a post-hoc cheap call extracts up to 3 suggestions phrased as if the
user said them. These render as chips under the latest response:

```
Papee: Shipped AIL-234 to done.
 [ What's next for this sprint? ]  [ Link to PR? ]  [ Tell the team? ]
```

Chip clicks feed back into the chat as though the user typed them,
so the conversation has forward momentum. Chips reuse memory: if a
recent goal row says "ship dashboard v2 by Friday", the chip might
be "Move on to the next dashboard issue?".

**Topic stack**: Papee tracks up to 3 active topics. When the user
switches mid-conversation, Papee can resurface an old topic later:
"Oh — I never finished that thing about the CEO agent. Still want to
dig in?".

### M.9 Proactive Summaries

Periodic structured summaries Papee volunteers without being asked:

- **Morning brief** — first login of the day: 3 bullets on what
  changed overnight. Ships as an interjection + optional chat seed.
- **End-of-session** — when Papee detects the user is about to close
  the tab (visibility change, idle >10min, or explicit bye): a
  farewell bubble with today's summary.
- **Post-incident** — after an `urgent` mood clears, Papee offers a
  short "what happened" recap.
- **Sprint-check** — once per week on the user's typical heavy day,
  offer a progress summary tied to any `goal` memory rows.

Each summary is generated once, cached for 30 min, and tied to an
interjection entry so cooldowns apply.

### M.10 Memory-Aware Tool Calls

Tool calls inspect memory before execution:

- `createIssue` checks for `pet-peeve: "don't create duplicate issues"`
  and runs a quick search first.
- `commentOnIssue` checks for `preference: terse` and truncates.
- `navigate` checks `preference: opens CEO agent first` to pick sane
  default destinations.
- `triggerAgentRun` checks `relationship` rows to pick the user's
  "primary" agent when none specified.

Memory also **informs refusal**: if the user asked Papee to always
confirm destructive ops, Papee refuses the optional
`prefs.skipConfirmation` toggle.

### M.11 Consent & Transparency

Memory is visible and controllable:

- Chat command: `/memory` opens a modal listing all stored rows,
  grouped by type, with delete buttons.
- Chat command: `/forget <pattern>` wipes matching rows.
- On first memory write per session, Papee mentions it in the next
  natural turn: "Noted that you prefer terse replies — I'll keep it
  short."
- Memory export: JSON download from settings.
- Never stores: passwords, tokens, code bodies, PII not volunteered.
  A redaction pass runs before any write.

### M.12 Multi-User Awareness

In a shared company, Papee knows there are multiple teammates:

- Long memory scoped per (companyId × userId) — never cross-leaks.
- Shared memory rows exist at company scope for `events` and
  `relationship: agent` — everyone sees the same timeline.
- Papee can reference others: "{teammate name} deployed this yesterday"
  — pulled from shared events, not private memory.

### M.13 Wiring Diagram

```
┌────────────────────────────────────────────────────────────┐
│                   User interaction                         │
└────────────────────┬───────────────────────────────────────┘
                     │
      ┌──────────────┴──────────────┐
      │                             │
      ▼                             ▼
┌──────────────┐            ┌─────────────────┐
│ Turn-taking  │            │ Interject pipe  │
│ & state M.4/5│            │      M.6        │
└──────┬───────┘            └────────┬────────┘
       │                             │
       └──────────────┬──────────────┘
                      │
                      ▼
            ┌──────────────────┐
            │ Memory retrieve  │  ← papee_memory table
            │       M.3        │
            └────────┬─────────┘
                     │
                     ▼
            ┌──────────────────┐
            │ Voice prefix M.7 │
            │ + page context   │
            └────────┬─────────┘
                     │
                     ▼
            ┌──────────────────┐
            │ Claude call      │
            │ (streaming)      │
            └────────┬─────────┘
                     │
                     ▼
            ┌──────────────────┐
            │ Response router  │
            │  - chat render   │
            │  - streaming     │
            │    bubble (Z.8)  │
            │  - follow-up     │
            │    extraction    │
            │    (M.8)         │
            │  - memory write  │
            │    (M.2)         │
            └────────┬─────────┘
                     │
                     ▼
            ┌──────────────────┐
            │ animationSched   │ ← (Phase Z)
            └──────────────────┘
```

### M.14 Verification Checklist

1. **Recall**: restart browser, ask "what was I working on?" — Papee
   references stored `goal` rows within first sentence.
2. **Tone consistency**: 30-turn chat log scores <2 voice violations
   against the Z.7 + M.7 rules (manual review).
3. **Interjection without disturbance**: user types continuously for
   2 min; zero bubbles appear; one non-critical event is logged as
   "deferred".
4. **Escalation**: simulated critical event not clicked after 30s
   opens chat panel automatically.
5. **Memory TTL**: weekly decay correctly prunes rows that haven't
   been reconfirmed.
6. **`/memory` and `/forget`** commands work; `/forget all` resets
   cleanly.
7. **No cross-user leak**: two users on the same company see
   different personal memories but the same `events`.
8. **Streaming interrupt**: mid-stream click on Papee stops the
   stream within 300ms with a `stopping` pose.
9. **Topic recovery**: after user derails, Papee successfully
   resurfaces the prior topic in a later turn.
10. **Cooldown hygiene**: repeated identical triggers fire at most
    once per their declared cooldown.

---

## Rollout Order (updated)

1. **Infra** — `PapeeTool` envelope, `papee.enact()`, confirmation modal,
   undo toast, `papee_memory` table + migrations.
2. **New poses** — all Phase Z-required sprites at once (typing, writing,
   scanning, magnifying, digging, unlocking, throwing-switch, stopping,
   shush, broom, ledger, sleepy-nod, humming, yawning, stretching,
   squint, pacing, head-tilt, sigh-of-relief, speaking-gesture).
3. **Phase Z core** — Z.1 pool, Z.2 glue, Z.5 micro-behaviors, Z.6
   scheduler. (Everything else in Z depends on these three.)
4. **Tier 0 tools** (5) — exercise the envelope and Z.3 narrative arcs.
5. **Phase M core** — M.1 memory table, M.3 injection, M.4 state
   machine, M.7 voice file.
6. **Tier 1 tools** (13) — each with full arc.
7. **Z.7/Z.8** — bubble choreography + streaming.
8. **M.5/M.6** — turn-taking + interjection pipeline.
9. **Tier 2 tools** (7) — destructive, gated behind mature scheduler.
10. **M.8–M.12** — follow-ups, proactive summaries, multi-user,
    consent UI.
11. **Z.10** — pose blend masks (polish, last).

Feature flag `prefs.enablePapeeAbilities` gates everything from step 4
onward. Default `true` in dev, `false` in prod until stable.

### Success metric

> One user session with Papee present should feel like working
> alongside someone who knows the system, knows you, speaks up when
> it matters, stays out of the way when it doesn't, and always has
> something to do with their hands.
