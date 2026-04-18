/* ─────────────────────────────────────────────────────────────────────
 *  glossary — plain-English translations of Paperclip jargon.
 *
 *  The Board Operator is not a developer. When they see "run",
 *  "in_review", "approval", "checkout" they need a one-line explanation
 *  that respects their intelligence but doesn't assume they know the
 *  term. This module is the single source of truth for those
 *  translations, consumed by <Jargon term="…"> in prose and by the
 *  CompanionLegend on the issue scene.
 *
 *  Pure data. No React, no DOM.
 * ───────────────────────────────────────────────────────────────────── */

export interface GlossaryEntry {
  /** The label shown as the popover heading. Capitalized. */
  title: string;
  /** One-line primary definition. Fits in a popover without scrolling. */
  short: string;
  /** Optional longer body — additional context for curious readers. */
  long?: string;
}

export type GlossaryTerm =
  | "run"
  | "agent"
  | "approval"
  | "workflow"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "backlog"
  | "cancelled"
  | "checkout"
  | "activity_event"
  | "sub_matter"
  | "correspondence"
  | "matter"
  | "ancestor"
  | "board"
  | "priority_critical";

export const GLOSSARY: Record<GlossaryTerm, GlossaryEntry> = {
  run: {
    title: "Run",
    short: "One attempt by an agent to do this work.",
    long: "A run is a single execution by one agent. It has a start, an end, a cost, and sometimes produces files or comments. A task can have many runs — each is one try.",
  },
  agent: {
    title: "Agent",
    short: "An AI employee with a specific role.",
    long: "Agents are the CEOs, engineers, PMs, designers and so on inside your company. They do the work. You (the board) set direction and approve the big moves.",
  },
  approval: {
    title: "Approval",
    short: "A question from an agent that's waiting for your answer.",
    long: "Some decisions need a human. Agents raise approvals; the board approves or rejects them. Work pauses until you decide.",
  },
  workflow: {
    title: "Workflow",
    short: "A recipe of steps that agents can run together.",
    long: "Workflows are reusable playbooks — an ordered set of agent actions, approvals and conditions that can be kicked off as a single unit.",
  },
  in_progress: {
    title: "In progress",
    short: "An agent is actively working on this right now.",
  },
  in_review: {
    title: "In review",
    short: "The work is done. Someone is about to say yes or no.",
  },
  blocked: {
    title: "Blocked",
    short: "This can't move forward without help.",
    long: "Usually means a human needs to step in — give a decision, unblock a dependency, or talk to the agent.",
  },
  done: {
    title: "Done",
    short: "Finished and closed out.",
  },
  backlog: {
    title: "Backlog",
    short: "Noted but not being worked on yet.",
  },
  cancelled: {
    title: "Cancelled",
    short: "Dropped — won't be worked on.",
  },
  checkout: {
    title: "Checkout",
    short: "The lock that stops two agents working on the same thing at once.",
    long: "When one agent starts a run on an issue, it 'checks it out'. Other agents can't touch it until the run ends.",
  },
  activity_event: {
    title: "Activity event",
    short: "A line in the audit log — who did what, when.",
    long: "Activity events are the immutable history of the case. Every state change, every checkout, every approval decision lands here.",
  },
  sub_matter: {
    title: "Sub-matter",
    short: "A smaller task that split off from this one.",
  },
  correspondence: {
    title: "Correspondence",
    short: "The conversation — comments between you and the agents.",
  },
  matter: {
    title: "Matter",
    short: "One piece of work, one case file.",
    long: "Everything in Paperclip is a matter — a task, an issue, a question. Each matter has its own case file with its own status, owners, runs and history.",
  },
  ancestor: {
    title: "Parent matter",
    short: "The larger task this one belongs to.",
  },
  board: {
    title: "The board",
    short: "You. The human with full-control over the fleet of agents.",
    long: "Paperclip treats the human operator as the board of directors for a company of AI agents. You set direction, approve big moves, and unblock things agents can't decide themselves.",
  },
  priority_critical: {
    title: "Critical priority",
    short: "This one is marked as the most important — handle it first.",
  },
};

/**
 * Get an entry by term. Returns `null` if the term isn't mapped — callers
 * should fall back to rendering the wrapped children unchanged rather
 * than throwing.
 */
export function glossaryEntry(term: string): GlossaryEntry | null {
  const key = normalizeTerm(term);
  return key ? GLOSSARY[key] : null;
}

/** Map common status strings / variants to canonical glossary keys. */
export function normalizeTerm(term: string): GlossaryTerm | null {
  const t = term.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (t in GLOSSARY) return t as GlossaryTerm;
  // Aliases
  const aliases: Record<string, GlossaryTerm> = {
    runs: "run",
    agents: "agent",
    approvals: "approval",
    subtask: "sub_matter",
    subtasks: "sub_matter",
    sub_matters: "sub_matter",
    comments: "correspondence",
    inprogress: "in_progress",
    inreview: "in_review",
    parents: "ancestor",
    parent: "ancestor",
    parent_matter: "ancestor",
    activity: "activity_event",
    activity_events: "activity_event",
  };
  return aliases[t] ?? null;
}
