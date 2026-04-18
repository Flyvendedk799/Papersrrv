import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PapeeAnimState } from "../components/papee/PapeeSprites";
import {
  EMPTY_STACK,
  applyShush,
  makeBubble,
  pruneExpired,
  pushBubble as pushBubbleFn,
  type BubbleSeverity,
  type QueuedBubble,
  type StackState,
} from "../lib/papee-bubbles";
import { telemetry } from "../lib/papee-telemetry";

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
  try {
    localStorage.setItem(`paperclip:papee-${key}`, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
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
  // Boared-rebrand additions (default priority is "normal = 1")
  "typing": 1,
  "writing": 1,
  "scanning": 1,
  "speaking-gesture": 1,
  "guarding": 2,
  "magnifying": 1,
  "shush": 1,
  "sleepy-nod": 0,
  "pointing-left": 1,
  "pointing-right": 1,
  "squint": 1,
  "stretching": 0,
  "ledger": 1,
  "yawning": 0,
  "pacing": 1,
  "digging": 1,
  "humming": 0,
  "broom": 1,
  "unlocking": 1,
  "head-tilt": 0,
  "stopping": 1,
  "throwing-switch": 2,
  "sigh-of-relief": 0,
};

/* ---- Context ---- */

export interface PapeePosition {
  x: number;
  y: number;
}

interface PapeeContextValue {
  // Preferences
  prefs: PapeePreferences;
  updatePrefs: (patch: Partial<PapeePreferences>) => void;

  // Animation state
  animState: PapeeAnimState;
  setAnimState: (state: PapeeAnimState) => void;
  queueReaction: (state: PapeeAnimState, durationMs: number) => void;

  // Chat
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;

  // Single-slot legacy speech bubble
  speechBubble: string | null;
  setSpeechBubble: React.Dispatch<React.SetStateAction<string | null>>;
  showSpeechBubble: (text: string, durationMs?: number) => void;

  // Stacked bubbles (§Z.7)
  bubbleStack: QueuedBubble[];
  pushBubble: (text: string, severity?: BubbleSeverity) => void;
  shushBubbles: () => void;
  clearBubbles: () => void;

  // Position + movement (spring-driven)
  position: PapeePosition;
  setPosition: React.Dispatch<React.SetStateAction<PapeePosition>>;
  targetPosition: PapeePosition;
  setTargetPosition: React.Dispatch<React.SetStateAction<PapeePosition>>;
  isMoving: boolean;
  setIsMoving: React.Dispatch<React.SetStateAction<boolean>>;

  // Streaming chat (§Z.8)
  streamingActive: boolean;
  setStreamingActive: React.Dispatch<React.SetStateAction<boolean>>;
  streamingText: string;
  setStreamingText: React.Dispatch<React.SetStateAction<string>>;

  // Boared-rebrand: last tool result + topic stack used by PapeeMobile.
  lastToolResult: import("@paperclipai/shared").PapeeToolResult | null;
  setLastToolResult: React.Dispatch<
    React.SetStateAction<import("@paperclipai/shared").PapeeToolResult | null>
  >;
  topicStack: string[];
  setTopicStack: React.Dispatch<React.SetStateAction<string[]>>;
  /** Push a topic onto the topic stack (Boared §M.8). */
  pushTopic: (topic: string) => void;

  /** Mood label (Boared). */
  mood: import("../lib/papee-personality").PapeeMood;

  /** Pointing-highlight helpers (Boared Phase 4). */
  highlightTarget: string | null;
  setHighlightTarget: (id: string | null) => void;

  /** Undo-toast helpers (Boared tool enact flow). */
  showUndoToast: (
    message: string,
    onUndo?: () => void | Promise<void>,
    timeoutMs?: number,
  ) => void;
  dismissUndoToast: () => void;
}

export interface ChatMessage {
  id: string;
  role: "user" | "papee";
  content: string;
  actions?: {
    type: "navigate" | "wake_agent" | "show_issue" | "grant_secret";
    label: string;
    payload: Record<string, string>;
  }[];
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

function initialCornerPosition(prefCorner: PapeePreferences["position"]): PapeePosition {
  if (typeof window === "undefined") return { x: 800, y: 600 };
  const x = prefCorner === "bottom-right" ? window.innerWidth - 120 : 40;
  const y = window.innerHeight - 160;
  return { x, y };
}

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

  // ─── Position (spring-driven in-provider) ───
  const [position, setPosition] = useState<PapeePosition>(() =>
    initialCornerPosition(prefs.position),
  );
  const [targetPosition, setTargetPosition] = useState<PapeePosition>(() =>
    initialCornerPosition(prefs.position),
  );
  const [isMoving, setIsMoving] = useState(false);

  // When the corner preference changes, re-anchor Papee there.
  useEffect(() => {
    const anchor = initialCornerPosition(prefs.position);
    setTargetPosition(anchor);
  }, [prefs.position]);

  // Simple spring integrator — reads target, nudges position, sets isMoving.
  useEffect(() => {
    let raf = 0;
    const vel = { x: 0, y: 0 };
    const STIFFNESS = 0.015;
    const DAMPING = 0.9;
    const SETTLE_DIST = 0.5;
    const SETTLE_VEL = 0.1;

    const tick = () => {
      setPosition((pos) => {
        const dx = targetPosition.x - pos.x;
        const dy = targetPosition.y - pos.y;
        vel.x = vel.x * DAMPING + dx * STIFFNESS;
        vel.y = vel.y * DAMPING + dy * STIFFNESS;
        const next = { x: pos.x + vel.x, y: pos.y + vel.y };
        const dist = Math.hypot(dx, dy);
        const speed = Math.hypot(vel.x, vel.y);
        if (dist < SETTLE_DIST && speed < SETTLE_VEL) {
          setIsMoving(false);
          return targetPosition;
        }
        setIsMoving(true);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetPosition]);

  // ─── Bubble stack (§Z.7) ───
  const [bubbleStackState, setBubbleStackState] = useState<StackState>(EMPTY_STACK);
  useEffect(() => {
    if (bubbleStackState.bubbles.length === 0) return;
    const t = setInterval(() => {
      setBubbleStackState((prev) => pruneExpired(prev));
    }, 250);
    return () => clearInterval(t);
  }, [bubbleStackState.bubbles.length]);
  const pushBubble = useCallback((text: string, severity: BubbleSeverity = "normal") => {
    setBubbleStackState((prev) => pushBubbleFn(prev, makeBubble(text, severity)));
  }, []);
  const shushBubbles = useCallback(() => {
    setBubbleStackState((prev) => applyShush(prev));
  }, []);
  const clearBubbles = useCallback(() => setBubbleStackState(EMPTY_STACK), []);

  // ─── Streaming chat (§Z.8) ───
  const [streamingActive, setStreamingActive] = useState(false);
  const [streamingText, setStreamingText] = useState<string>("");

  // ─── Boared: last tool result + topic stack (consumed by PapeeMobile) ───
  const [lastToolResult, setLastToolResult] =
    useState<import("@paperclipai/shared").PapeeToolResult | null>(null);
  const [topicStack, setTopicStack] = useState<string[]>([]);
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);
  const pushTopic = useCallback((topic: string) => {
    setTopicStack((prev) => {
      const withoutDup = prev.filter((t) => t !== topic);
      return [topic, ...withoutDup].slice(0, 3);
    });
  }, []);
  // Undo-toast behavior isn't fully re-wired yet; keep a no-op pair so
  // the tool enact flow can compile and dispatch without crashing.
  const showUndoToast = useCallback<PapeeContextValue["showUndoToast"]>(
    () => {
      /* boared stub — real toast surface to be restored */
    },
    [],
  );
  const dismissUndoToast = useCallback(() => {
    /* boared stub */
  }, []);
  // Mood is read from the personality hook elsewhere; we store the
  // last-known string here so consumers can read it synchronously.
  const mood: import("../lib/papee-personality").PapeeMood = "curious";

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

  const animStateRef = useRef(animState);
  animStateRef.current = animState;

  const setAnimState = useCallback((state: PapeeAnimState) => {
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
    reactionQueue.current.sort((a, b) => b.priority - a.priority);
    const next = reactionQueue.current.shift()!;
    setAnimStateRaw(next.state);
    if (next.durationMs > 0) {
      reactionTimer.current = setTimeout(() => {
        processQueue();
      }, next.durationMs);
    }
  }, []);

  const queueReaction = useCallback(
    (state: PapeeAnimState, durationMs: number) => {
      const priority = PRIORITY[state] ?? 0;
      const currentPriority = PRIORITY[animStateRef.current] ?? 0;
      if (priority > currentPriority) {
        if (reactionTimer.current) clearTimeout(reactionTimer.current);
        setAnimStateRaw(state);
        telemetry.log("reaction.interrupt", {
          state,
          priority,
          durationMs,
          prev: animStateRef.current,
          prevPriority: currentPriority,
        });
        if (durationMs > 0) {
          reactionTimer.current = setTimeout(() => {
            processQueue();
          }, durationMs);
        }
        return;
      }
      if (!reactionQueue.current.some((r) => r.state === state)) {
        reactionQueue.current.push({ state, durationMs, priority });
        telemetry.log("reaction.queue", { state, priority, durationMs });
      }
    },
    [processQueue],
  );

  const toggleChat = useCallback(() => {
    setChatOpen((prev) => !prev);
    if (animStateRef.current === "sleeping") setAnimStateRaw("idle");
  }, []);

  const showSpeechBubble = useCallback((text: string, durationMs = 4000) => {
    if (speechTimer.current) clearTimeout(speechTimer.current);
    setSpeechBubble(text);
    telemetry.log("bubble.speech", { text: text.slice(0, 120), durationMs });
    speechTimer.current = setTimeout(() => setSpeechBubble(null), durationMs);
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
      if (speechTimer.current) clearTimeout(speechTimer.current);
      reactionQueue.current = [];
    };
  }, []);

  // Idle micro-animations
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

  const value = useMemo<PapeeContextValue>(
    () => ({
      prefs,
      updatePrefs,
      animState,
      setAnimState,
      queueReaction,
      chatOpen,
      setChatOpen,
      toggleChat,
      chatMessages,
      setChatMessages,
      speechBubble,
      setSpeechBubble,
      showSpeechBubble,
      bubbleStack: bubbleStackState.bubbles,
      pushBubble,
      shushBubbles,
      clearBubbles,
      position,
      setPosition,
      targetPosition,
      setTargetPosition,
      isMoving,
      setIsMoving,
      streamingActive,
      setStreamingActive,
      streamingText,
      setStreamingText,
      lastToolResult,
      setLastToolResult,
      topicStack,
      setTopicStack,
      pushTopic,
      mood,
      highlightTarget,
      setHighlightTarget,
      showUndoToast,
      dismissUndoToast,
    }),
    [
      prefs,
      updatePrefs,
      animState,
      setAnimState,
      queueReaction,
      lastToolResult,
      topicStack,
      pushTopic,
      mood,
      highlightTarget,
      setHighlightTarget,
      showUndoToast,
      dismissUndoToast,
      chatOpen,
      toggleChat,
      chatMessages,
      speechBubble,
      showSpeechBubble,
      bubbleStackState.bubbles,
      pushBubble,
      shushBubbles,
      clearBubbles,
      position,
      targetPosition,
      isMoving,
      streamingActive,
      streamingText,
    ],
  );

  return <PapeeCtx.Provider value={value}>{children}</PapeeCtx.Provider>;
}
