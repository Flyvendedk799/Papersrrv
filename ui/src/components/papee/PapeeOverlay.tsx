import { useEffect, useRef, useState } from "react";
import { usePapeeOptional } from "../../context/PapeeContext";
import { useSidebar } from "../../context/SidebarContext";
import { usePapeeNavigation } from "../../hooks/usePapeePosition";
import { usePapeeReactions } from "../../hooks/usePapeeReactions";
import { usePapeeProactive } from "../../hooks/usePapeeProactive";
import { PapeeCharacter } from "./PapeeCharacter";
import type { PapeeAnimState } from "./PapeeSprites";
import { PapeeMiniIndicator } from "./PapeeMiniIndicator";
import { PapeeChat } from "./PapeeChat";
import { cn } from "../../lib/utils";
import { telemetry } from "../../lib/papee-telemetry";

/**
 * PapeeOverlay — the fixed overlay container that renders Papee on top of the UI.
 */
export function PapeeOverlay() {
  const papee = usePapeeOptional();
  const { isMobile } = useSidebar();
  usePapeeNavigation();
  usePapeeReactions();
  usePapeeProactive();

  // Track speech bubble visibility for exit animation
  const [visibleBubble, setVisibleBubble] = useState<string | null>(null);
  const [bubbleExiting, setBubbleExiting] = useState(false);

  // §Z.4 ghost trail
  const [ghosts, setGhosts] = useState<PapeeGhost[]>([]);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastPosTsRef = useRef<number>(0);
  useEffect(() => {
    if (!papee?.position) return;
    const prev = lastPosRef.current;
    const prevTs = lastPosTsRef.current;
    const now = performance.now();
    lastPosRef.current = papee.position;
    lastPosTsRef.current = now;
    if (!prev) return;
    const dx = papee.position.x - prev.x;
    const dy = papee.position.y - prev.y;
    const dist = Math.hypot(dx, dy);
    const dtMs = now - prevTs;
    // Diagnostic: log every non-trivial position change so we can see
    // whether the spring is stepping smoothly or jumping.
    if (dist > 50) {
      telemetry.log("pos.step", {
        dist: Math.round(dist),
        dtMs: Math.round(dtMs),
        from: { x: Math.round(prev.x), y: Math.round(prev.y) },
        to: { x: Math.round(papee.position.x), y: Math.round(papee.position.y) },
        state: papee.animState,
      });
    }
    if (dist < 400) return;
    telemetry.log("ghost.spawn", {
      dist: Math.round(dist),
      dtMs: Math.round(dtMs),
      from: { x: Math.round(prev.x), y: Math.round(prev.y) },
      to: { x: Math.round(papee.position.x), y: Math.round(papee.position.y) },
      state: papee.animState,
      count: dist > 800 ? 3 : 1,
    });
    const newGhosts: PapeeGhost[] = [{ id: nextGhostId++, x: prev.x, y: prev.y, state: papee.animState, spawnedAt: performance.now() }];
    if (dist > 800) {
      newGhosts.push({ id: nextGhostId++, x: prev.x + dx / 3, y: prev.y + dy / 3, state: papee.animState, spawnedAt: performance.now() });
      newGhosts.push({ id: nextGhostId++, x: prev.x + (dx * 2) / 3, y: prev.y + (dy * 2) / 3, state: papee.animState, spawnedAt: performance.now() });
    }
    setGhosts((g) => [...g, ...newGhosts]);
    const t = setTimeout(() => {
      const cutoff = performance.now() - 400;
      setGhosts((g) => g.filter((gh) => gh.spawnedAt > cutoff));
    }, 450);
    return () => clearTimeout(t);
  }, [papee?.position, papee?.animState]);

  useEffect(() => {
    if (papee?.speechBubble) {
      setBubbleExiting(false);
      setVisibleBubble(papee.speechBubble);
    } else if (visibleBubble) {
      // Animate out
      setBubbleExiting(true);
      const t = setTimeout(() => { setVisibleBubble(null); setBubbleExiting(false); }, 250);
      return () => clearTimeout(t);
    }
  }, [papee?.speechBubble]);

  if (!papee || !papee.prefs.visible) return null;

  const isRight = papee.prefs.position === "bottom-right";
  const hasActivity = papee.animState !== "idle" && papee.animState !== "idle-blink"
    && papee.animState !== "idle-look-around" && papee.animState !== "sleeping";

  return (
    <>
      {/* Chat panel — rendered as sibling for independent positioning */}
      <PapeeChat />

      {/* Papee character + speech bubble container */}
      <div
        className={cn(
          "fixed z-[80] pointer-events-none flex flex-col gap-2",
          isRight ? "right-4 items-end" : "left-4 items-start",
          isMobile ? "bottom-[calc(5rem+env(safe-area-inset-bottom)+0.5rem)]" : "bottom-4",
        )}
        role="complementary"
        aria-label="Papee assistant"
      >
        {/* Speech bubble with enter/exit animation */}
        {visibleBubble && !papee.chatOpen && (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "pointer-events-auto relative max-w-[260px] rounded-xl border border-border",
              "bg-card/95 backdrop-blur-sm px-3.5 py-2.5 text-xs text-foreground shadow-lg",
              bubbleExiting
                ? "animate-out fade-out-0 zoom-out-95 duration-200"
                : "papee-speech-bubble",
            )}
          >
            <p className="leading-relaxed">{visibleBubble}</p>
            {/* Tail pointing down toward character */}
            <div
              className={cn(
                "absolute -bottom-[6px] w-3 h-3 rotate-45",
                "border-b border-r border-border bg-card/95",
                isRight ? "right-5" : "left-5",
              )}
            />
          </div>
        )}

        {/* Character or mini indicator */}
        <div className="pointer-events-auto relative">
          {/* Ground shadow under character */}
          {!papee.prefs.minimized && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70%] h-2 rounded-full bg-foreground/5 dark:bg-foreground/10 blur-[3px]" />
          )}

          {/* §Z.7 bubble stack — sits above the character */}
          <PapeeBubbleStack bubbles={papee.bubbleStack} side={isRight ? "right" : "left"} />

          {/* §Z.8 streaming dialog bubble */}
          {papee.streamingText !== null && (
            <PapeeStreamingBubble
              text={papee.streamingText}
              streaming={papee.streamingActive}
              side={isRight ? "right" : "left"}
              onInterrupt={() => {
                papee.setStreamingActive(false);
                papee.setAnimState("stopping");
              }}
            />
          )}

          {papee.prefs.minimized ? (
            <PapeeMiniIndicator
              onClick={() => papee.updatePrefs({ minimized: false })}
              hasActivity={hasActivity}
              className="papee-entrance"
            />
          ) : (
            <div className="papee-entrance">
              <PapeeCharacter
                state={papee.animState}
                size={isMobile ? "sm" : "md"}
                onClick={() => papee.toggleChat()}
                chatOpen={papee.chatOpen}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
