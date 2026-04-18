import type { PapeeInteractionEvent, PapeeRitualId } from "@paperclipai/shared";

export const RITUAL_LIBRARY: Record<PapeeRitualId, { title: string; steps: string[] }> = {
  pulse_sweep: {
    title: "Pulse Sweep",
    steps: ["Scan signal", "Prioritize risk", "Decide first move"],
  },
  focus_sprint: {
    title: "Focus Sprint",
    steps: ["Pick target", "Generate brief", "Commit next action"],
  },
  wrap_prepare: {
    title: "Wrap & Prepare",
    steps: ["Review movement", "De-noise queue", "Set next-start cue"],
  },
};

export type RitualProgressMap = Record<string, { step: number; completedAt?: string | null }>;

export function interactionDelta(event: PapeeInteractionEvent) {
  switch (event.type) {
    case "pet":
      return { bondDelta: 3, energyDelta: 4 };
    case "cue":
      return { bondDelta: 2, energyDelta: 2 };
    case "toy":
      return { bondDelta: 1, energyDelta: 2 };
    case "mission_step":
      return { bondDelta: 2, energyDelta: -1 };
    case "swipe":
      return { bondDelta: 1, energyDelta: -1 };
    case "chat_prompt":
      return { bondDelta: 1, energyDelta: -1 };
    case "focus_action":
      return { bondDelta: 2, energyDelta: -2 };
    default:
      return { bondDelta: 0, energyDelta: 0 };
  }
}

export function advanceRitualProgress(
  ritualId: PapeeRitualId,
  progress: RitualProgressMap,
  action: "advance" | "complete",
  nowIso: string,
) {
  const current = Math.max(0, progress[ritualId]?.step ?? 0);
  const maxStep = RITUAL_LIBRARY[ritualId].steps.length - 1;
  const nextStep = action === "complete" ? maxStep : Math.min(maxStep, current + 1);
  const completed = nextStep >= maxStep;
  const progressed = nextStep !== current || action === "complete";
  const nextProgress: RitualProgressMap = {
    ...progress,
    [ritualId]: {
      step: nextStep,
      completedAt: completed ? nowIso : null,
    },
  };
  return {
    progress: nextProgress,
    currentStep: current,
    nextStep,
    completed,
    progressed,
  };
}
