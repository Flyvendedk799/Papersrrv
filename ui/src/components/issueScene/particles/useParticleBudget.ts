/**
 * useParticleBudget — adaptive LOD for the particle field.
 *
 * At mount we bucket based on coarse capability signals (float-RT support,
 * DPR, canvas size, prefers-reduced-motion). After mount we monitor EMA
 * frame time and downshift one bucket if fps drops below 50 for 2s. Upshift
 * back up if fps stays above 58 for 10s. Hysteresis prevents flapping.
 *
 * See plan §7.
 */
import { useEffect, useMemo, useState } from "react";
import type { WebGLRenderer } from "three";

import { detectGpgpuSupport } from "./gpgpu";
import type { ParticleTier } from "./types";

export interface BudgetContext {
  tier: ParticleTier;
  /** Reduced-motion user preference — particles render statically. */
  reducedMotion: boolean;
  /** GPGPU sim is available at the current tier. */
  gpgpuActive: boolean;
}

interface Options {
  /** True when this is the sticky mini-scene rather than the hero canvas. */
  isMini?: boolean;
  /** Override detected tier (e.g. `?particles=50k` dev flag). */
  override?: ParticleTier;
}

const TIER_ORDER: ParticleTier[] = ["potato", "mini", "default", "hero", "extreme"];

export function useParticleBudget(
  gl: WebGLRenderer | null,
  options: Options = {},
): BudgetContext {
  const reducedMotion = useReducedMotion();

  const initialTier = useMemo<ParticleTier>(() => {
    if (options.override) return options.override;
    if (reducedMotion) return "potato";
    if (options.isMini) return "mini";
    if (!gl) return "default";
    const support = detectGpgpuSupport(gl);
    if (!support.usable) return "potato";
    const dpr = gl.getPixelRatio();
    const canvas = gl.domElement;
    const area = canvas.clientWidth * canvas.clientHeight;
    if (dpr >= 2 && area >= 1_000_000) return "hero";
    if (area >= 500_000) return "default";
    return "mini";
  }, [gl, options.isMini, options.override, reducedMotion]);

  const [tier, setTier] = useState<ParticleTier>(initialTier);
  useEffect(() => setTier(initialTier), [initialTier]);

  // EMA fps monitor.
  // Guards:
  // - Minimum 5s gap between tier changes to avoid flapping (which was causing
  //   rapid render-target churn and GPU context loss in throttled environments).
  // - Detect rAF throttling (headless browsers, background tabs) by comparing
  //   rAF rate vs wall-clock; if throttled, freeze the tier at its current value.
  // - Require 2+ samples warmup before acting on EMA.
  useEffect(() => {
    if (reducedMotion) return;
    let ema = 60;
    let samples = 0;
    let lowSince = 0;
    let highSince = 0;
    let last = performance.now();
    let lastTierChange = performance.now();
    let stopped = false;

    // Detect rAF throttling: compare rAF frequency against setInterval once
    // per second.
    let rafInLastSecond = 0;
    const throttleProbe = setInterval(() => {
      const throttled = rafInLastSecond < 20; // < 20fps over 1s ≡ throttled
      if (throttled) {
        // Freeze sampling so we don't downshift based on fake-slow tab state.
        ema = 60;
        lowSince = 0;
        highSince = 0;
      }
      rafInLastSecond = 0;
    }, 1000);

    const tick = (now: number) => {
      if (stopped) return;
      rafInLastSecond += 1;
      const dt = now - last;
      last = now;
      const fps = dt > 0 ? 1000 / dt : 60;
      ema = ema * 0.92 + fps * 0.08;
      samples += 1;

      // Need warm-up + cooldown guard before any tier change.
      const cooledDown = now - lastTierChange > 5000;
      const warmed = samples > 120; // ~2s worth of samples at 60fps

      if (!cooledDown || !warmed) {
        requestAnimationFrame(tick);
        return;
      }

      if (ema < 45) {
        highSince = 0;
        if (lowSince === 0) lowSince = now;
        if (now - lowSince > 3000) {
          const i = TIER_ORDER.indexOf(tier);
          if (i > 0) {
            setTier(TIER_ORDER[i - 1]);
            lastTierChange = now;
          }
          lowSince = 0;
        }
      } else if (ema > 58) {
        lowSince = 0;
        if (highSince === 0) highSince = now;
        if (now - highSince > 12000) {
          const i = TIER_ORDER.indexOf(tier);
          const maxAllowed = TIER_ORDER.indexOf(initialTier);
          if (i < maxAllowed) {
            setTier(TIER_ORDER[i + 1]);
            lastTierChange = now;
          }
          highSince = 0;
        }
      } else {
        lowSince = 0;
        highSince = 0;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      stopped = true;
      clearInterval(throttleProbe);
    };
  }, [tier, initialTier, reducedMotion]);

  return {
    tier,
    reducedMotion,
    gpgpuActive: !reducedMotion && (gl ? detectGpgpuSupport(gl).usable : false),
  };
}

function useReducedMotion(): boolean {
  const [rm, setRm] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = () => setRm(mq.matches);
    mq.addEventListener?.("change", listener);
    return () => mq.removeEventListener?.("change", listener);
  }, []);
  return rm;
}
