import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePapeeOptional } from "../../context/PapeeContext";
import { usePapeeTargetRegistryOptional } from "../../context/PapeeTargetRegistry";
import "./papee-highlight.css";

const CHARACTER_CENTER_OFFSET = { x: 28, y: 36 };
const HIGHLIGHT_DURATION_MS = 4000;
const RING_PADDING = 6;
const VIEWPORT_MARGIN = 12;

interface Frame {
  ringLeft: number;
  ringTop: number;
  ringWidth: number;
  ringHeight: number;
  linePath: string | null;
}

export function PapeeHighlightOverlay() {
  const papee = usePapeeOptional();
  const registry = usePapeeTargetRegistryOptional();
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null);
  const rafRef = useRef<number | null>(null);

  const highlightTarget = papee?.highlightTarget ?? null;

  // Reactive rAF loop: re-reads Papee position + target rect every frame
  // so the line follows Papee and the ring follows scroll/layout.
  useEffect(() => {
    if (!highlightTarget || !registry || !papee) {
      setVisible(false);
      setFadingOut(false);
      setFrame(null);
      return;
    }

    const initial = registry.getTarget(highlightTarget);
    if (!initial) return;

    setVisible(true);
    setFadingOut(false);

    const tick = () => {
      registry.refreshRect(highlightTarget);
      const target = registry.getTarget(highlightTarget);
      if (!target) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const r = target.rect;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Clamp the ring itself so it never extends past the viewport edges.
      const ringLeft = Math.max(VIEWPORT_MARGIN, r.left - RING_PADDING);
      const ringTop = Math.max(VIEWPORT_MARGIN, r.top - RING_PADDING);
      const ringRight = Math.min(vw - VIEWPORT_MARGIN, r.right + RING_PADDING);
      const ringBottom = Math.min(vh - VIEWPORT_MARGIN, r.bottom + RING_PADDING);
      const ringWidth = Math.max(0, ringRight - ringLeft);
      const ringHeight = Math.max(0, ringBottom - ringTop);

      // Connecting line — computed each frame from current Papee position.
      let linePath: string | null = null;
      const targetInView = r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
      if (papee.position && targetInView && ringWidth > 0 && ringHeight > 0) {
        const papeeCenter = {
          x: papee.position.x + CHARACTER_CENTER_OFFSET.x,
          y: papee.position.y + CHARACTER_CENTER_OFFSET.y,
        };
        // Aim for the nearest edge of the clamped ring, not the center —
        // avoids drawing through the ring.
        const targetCenter = {
          x: Math.max(ringLeft, Math.min(ringLeft + ringWidth, papeeCenter.x)),
          y: Math.max(ringTop, Math.min(ringTop + ringHeight, papeeCenter.y)),
        };
        // Mid-curve offset, clamped inside viewport
        const midX = (papeeCenter.x + targetCenter.x) / 2;
        const rawMidY = (papeeCenter.y + targetCenter.y) / 2 - 24;
        const midY = Math.max(VIEWPORT_MARGIN, Math.min(vh - VIEWPORT_MARGIN, rawMidY));
        const pxClamped = Math.max(VIEWPORT_MARGIN, Math.min(vw - VIEWPORT_MARGIN, papeeCenter.x));
        const pyClamped = Math.max(VIEWPORT_MARGIN, Math.min(vh - VIEWPORT_MARGIN, papeeCenter.y));
        linePath = `M ${pxClamped} ${pyClamped} Q ${midX} ${midY} ${targetCenter.x} ${targetCenter.y}`;
      }

      setFrame({ ringLeft, ringTop, ringWidth, ringHeight, linePath });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const fadeOutAt = HIGHLIGHT_DURATION_MS - 500;
    const fadeTimer = setTimeout(() => setFadingOut(true), fadeOutAt);
    const clearTimer = setTimeout(() => {
      papee.setHighlightTarget(null);
      setVisible(false);
      setFadingOut(false);
    }, HIGHLIGHT_DURATION_MS);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      clearTimeout(fadeTimer);
      clearTimeout(clearTimer);
    };
  }, [highlightTarget, registry, papee]);

  if (!visible || !frame) return null;

  return createPortal(
    <div
      className={fadingOut ? "papee-highlight-fading-out" : ""}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 75,
        pointerEvents: "none",
        overflow: "hidden",
        willChange: "opacity",
      }}
      aria-hidden="true"
    >
      {frame.ringWidth > 0 && frame.ringHeight > 0 && (
        <div
          className="papee-highlight-ring"
          style={{
            left: frame.ringLeft,
            top: frame.ringTop,
            width: frame.ringWidth,
            height: frame.ringHeight,
          }}
        />
      )}
      {frame.linePath && (
        <svg
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0, overflow: "hidden" }}
          aria-hidden="true"
        >
          <path d={frame.linePath} className="papee-highlight-line" />
        </svg>
      )}
    </div>,
    document.body,
  );
}