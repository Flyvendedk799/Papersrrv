/**
 * ScrollProgressRail — thin acid bar fixed to the top of the
 * viewport that fills as the user scrolls the issue page.
 *
 * Not tied to a specific scroll element — listens to the first
 * ancestor that actually scrolls. Falls back to window scroll.
 */

import { useEffect, useRef, useState } from "react";

export function ScrollProgressRail({ target }: { target?: HTMLElement | null }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el: HTMLElement | Window = target ?? window;
    const compute = () => {
      const scrollY =
        target && "scrollTop" in target ? target.scrollTop : window.scrollY;
      const inner =
        target && "clientHeight" in target
          ? target.clientHeight
          : window.innerHeight;
      const totalHeight =
        target && "scrollHeight" in target
          ? target.scrollHeight
          : document.documentElement.scrollHeight;
      const max = Math.max(1, totalHeight - inner);
      setProgress(Math.min(1, Math.max(0, scrollY / max)));
    };
    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(compute);
    };
    el.addEventListener("scroll", onScroll as EventListener, { passive: true });
    compute();
    return () => {
      el.removeEventListener("scroll", onScroll as EventListener);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-0.5 z-[45] pointer-events-none"
      style={{
        background: "var(--boared-rule)",
      }}
    >
      <div
        className="h-full bg-[var(--boared-acid)] transition-transform duration-100"
        style={{
          transformOrigin: "left",
          transform: `scaleX(${progress})`,
        }}
      />
    </div>
  );
}
