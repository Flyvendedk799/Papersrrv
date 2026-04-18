import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PapeeAnimState } from "../components/papee/PapeeSprites";

/* ---- Preferences ---- */

interface PapeePreferences {
  visible: boolean;
  position: "bottom-left" | "bottom-right";
  minimized: boolean;
  muteReactions: boolean;
  /** PAPEE_TOOLS_PLAN.md §Z.9 — opt-in foley audio cues. */
  enableSounds: boolean;
  /** PAPEE_TOOLS_PLAN.md §Z.8 — opt-in streaming chat bubble. */
  enableStreaming: boolean;
}

const PREF_DEFAULTS: PapeePreferences = {
  visible: true,
  position: "bottom-right",
  minimized: false,
  muteReactions: false,
  enableSounds: false,
  enableStreaming: true,
};

function readPref<K extends keyof PapeePreferences>(key: K): PapeePreferences[K] {
  try {
    const raw = localStorage.getItem(`paperclip:papee-${key}`);
    if (raw === null) return PREF_DEFAULTS[key];
    return JSON.parse(raw) as PapeePreferences[K];
  } catch {
    return PREF_DEFAULTS[key];
  }
}

function writePref<K extends keyof PapeePreferences>(key: K, value: PapeePreferences[K]) {
  localStorage.setItem(`paperclip:papee-${key}`, JSON.stringify(value));
}

/* ---- Reaction queue ---- */

interface QueuedReaction {
  state: PapeeAnimState;
  durationMs: number;
  priority: number;
}

const PRIORITY: Record<PapeeAnimState, number> = {
  "idle": 0,
  "idle-blink": 0,
  "idle-look-around": 0,
  "sleeping": 0,
  "walking": 1,
  "waving": 1,
  "thumbs-up": 1,
  "thinking": 2,
  "celebrating": 2,
  "jumping": 2,
  "alarmed": 3,
};

/* ---- Context ---- */

interface PapeeContextValue {
  prefs: PapeePreferences;
  updatePrefs: (patch: Partial<PapeePreferences>) => void;
  animState: PapeeAnimState;
  setAnimState: (state: PapeeAnimState) => void;
  queueReaction: (state: PapeeAnimState, durationMs: number) => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
  speechBubble: string | null;
  showSpeechBubble: (text: string, durationMs?: number) => void;
  // Chat message persistence (survives navigation)
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "papee";
  content: string;
  actions?: { type: "navigate" | "wake_agent" | "show_issue" | "grant_secret"; label: string; payload: Record<string, string> }[];
  /** PAPEE_TOOLS_PLAN.md §M.8 — clickable suggestion chips. */
  followUps?: string[];
  timestamp: number;
}

const PapeeCtx = createContext<PapeeContextValue | null>(null);

export function usePapee() {
  const ctx = useContext(PapeeCtx);
  if (!ctx) throw new Error("usePapee must be used within PapeeProvider");
  return ctx;
}

export function usePapeeOptional() {
  return useContext(PapeeCtx);
}

/* ---- Provider ---- */

export function PapeeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<PapeePreferences>(() => ({
    visible: readPref("visible"),
    position: readPref("position"),
    minimized: readPref("minimized"),
    muteReactions: readPref("muteReactions"),
    enableSounds: readPref("enableSounds"),
    enableStreaming: readPref("enableStreaming"),
  }));

  const [animState, setAnimStateRaw] = useState<PapeeAnimState>("idle");
  const [chatOpen, setChatOpen] = useState(false);
  const [speechBubble, setSpeechBubble] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const reactionQueue = useRef<QueuedReaction[]>([]);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePrefs = useCallback((patch: Partial<PapeePreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      for (const key of Object.keys(patch) as (keyof PapeePreferences)[]) {
        writePref(key, next[key] as never);
      }
      return next;
    });
  }, []);

  const setAnimState = useCallback((state: PapeeAnimState) => {
    // PAPEE_TOOLS_PLAN.md — authoritative setter.
    // Cancel any outstanding reactionQueue auto-revert timer so the
    // caller's pose isn't clobbered 1-3s later by a leftover
    // queueReaction cleanup. Direct setAnimState === "this is the
    // current truth, forget whatever was pending".
    if (reactionTimer.current) {
      clearTimeout(reactionTimer.current);
      reactionTimer.current = null;
    }
    reactionQueue.current = [];
    const prev = animStateRef.current;
    setAnimStateRaw(state);
    telemetry.log("anim.set", { from: prev, to: state });
  }, []);

  const processQueue = useCallback(() => {
    if (reactionQueue.current.length === 0) {
      setAnimStateRaw("idle");
      return;
    }
    // Sort by priority descending
    reactionQueue.current.sort((a, b) => b.priority - a.priority);
    const next = reactionQueue.current.shift()!;
    setAnimStateRaw(next.state);

    if (next.durationMs > 0) {
      reactionTimer.current = setTimeout(() => {
        processQueue();
      }, next.durationMs);
    }
  }, []);

  const animStateRef = useRef(animState);
  animStateRef.current = animState;

  const queueReaction = useCallback(
    (state: PapeeAnimState, durationMs: number) => {
      const priority = PRIORITY[state] ?? 0;
      const currentPriority = PRIORITY[animStateRef.current] ?? 0;

      // If higher priority than current, interrupt
      if (priority > currentPriority) {
        if (reactionTimer.current) clearTimeout(reactionTimer.current);
        setAnimStateRaw(state);
        telemetry.log("reaction.interrupt", { state, priority, durationMs, prev: animStateRef.current, prevPriority: currentPriority });
        if (durationMs > 0) {
          reactionTimer.current = setTimeout(() => {
            processQueue();
          }, durationMs);
        }
        return;
      }

      // Otherwise queue (avoid duplicates)
      if (!reactionQueue.current.some((r) => r.state === state)) {
        reactionQueue.current.push({ state, durationMs, priority });
        telemetry.log("reaction.queue", { state, priority, durationMs });
      }
    },
    [processQueue],
  );

  const toggleChat = useCallback(() => {
    setChatOpen((prev) => !prev);
    if (animState === "sleeping") setAnimStateRaw("idle");
  }, [animState]);

  const showSpeechBubble = useCallback((text: string, durationMs = 4000) => {
    if (speechTimer.current) clearTimeout(speechTimer.current);
    setSpeechBubble(text);
    telemetry.log("bubble.speech", { text: text.slice(0, 120), durationMs });
    speechTimer.current = setTimeout(() => setSpeechBubble(null), durationMs);
  }, []);

  // Cleanup timers and queue
  useEffect(() => {
    return () => {
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
      if (speechTimer.current) clearTimeout(speechTimer.current);
      reactionQueue.current = [];
    };
  }, []);

  // Idle sub-animations (blink every 3-5s, look around every 10-15s)
  useEffect(() => {
    if (animState !== "idle") return;
    const blinkInterval = setInterval(() => {
      setAnimStateRaw("idle-blink");
      setTimeout(() => setAnimStateRaw("idle"), 200);
    }, 3000 + Math.random() * 2000);

    const lookInterval = setInterval(() => {
      setAnimStateRaw("idle-look-around");
      setTimeout(() => setAnimStateRaw("idle"), 1500);
    }, 10000 + Math.random() * 5000);

    return () => {
      clearInterval(blinkInterval);
      clearInterval(lookInterval);
    };
  }, [animState]);

  return (
    <PapeeCtx.Provider
      value={{
        prefs,
        updatePrefs,
        animState,
        setAnimState,
        queueReaction,
        chatOpen,
        setChatOpen,
        toggleChat,
        speechBubble,
        showSpeechBubble,
        chatMessages,
        setChatMessages,
      }}
    >
      {children}
    </PapeeCtx.Provider>
  );
}
