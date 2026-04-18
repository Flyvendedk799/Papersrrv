/**
 * File-viewing performance instrumentation (backlog 2.0 D2 / 1.5 C2).
 *
 * Budgets (p75, tunable) — from backlog 2.0 D2:
 *   panel_open:             < 150 ms
 *   filter_switch:          < 150 ms
 *   quick_preview_open:     < 300 ms
 *   modal_open:             < 500 ms
 *   compare_launch_small:   < 400 ms
 *   compare_launch_large:   < 1200 ms
 *   markdown_render_small:  < 400 ms
 *   save:                   < 1000 ms
 *
 * We emit to console.debug + a lightweight in-memory ring so any
 * future telemetry backend can subscribe.
 */

import { isFeatureEnabled } from "./featureFlags";

export type FilePerfEventName =
  | "panel_open"
  | "filter_switch"
  | "evidence_attach"
  | "diff_launch"
  | "markdown_render"
  | "quick_preview_open"
  | "modal_open"
  | "compare_launch_small"
  | "compare_launch_large"
  | "save";

export const BUDGET_MS: Record<FilePerfEventName, number> = {
  panel_open: 150,
  filter_switch: 150,
  evidence_attach: 400,
  diff_launch: 600,
  markdown_render: 400,
  quick_preview_open: 300,
  modal_open: 500,
  compare_launch_small: 400,
  compare_launch_large: 1200,
  save: 1000,
};

interface PerfSample {
  name: FilePerfEventName;
  durationMs: number;
  exceededBudget: boolean;
  at: number;
  detail?: Record<string, unknown>;
}

const RING_MAX = 200;
const ring: PerfSample[] = [];
type Listener = (sample: PerfSample) => void;
const listeners = new Set<Listener>();

function record(sample: PerfSample) {
  ring.push(sample);
  if (ring.length > RING_MAX) ring.shift();
  listeners.forEach((l) => {
    try { l(sample); } catch { /* ignore listener error */ }
  });
  if (sample.exceededBudget) {
    // eslint-disable-next-line no-console
    console.warn(
      `[filePerf] ${sample.name} exceeded budget: ${sample.durationMs.toFixed(0)}ms > ${BUDGET_MS[sample.name]}ms`,
      sample.detail ?? {},
    );
  } else if (isFeatureEnabled("perf_instrumentation")) {
    // eslint-disable-next-line no-console
    console.debug(`[filePerf] ${sample.name}: ${sample.durationMs.toFixed(0)}ms`, sample.detail ?? {});
  }
}

export function markFilePerf(
  name: FilePerfEventName,
  durationMs: number,
  detail?: Record<string, unknown>,
): void {
  if (!isFeatureEnabled("perf_instrumentation")) return;
  record({
    name,
    durationMs,
    exceededBudget: durationMs > BUDGET_MS[name],
    at: Date.now(),
    detail,
  });
}

/** Convenience: start a measure, returns a stop() that records it. */
export function startFilePerf(
  name: FilePerfEventName,
  detail?: Record<string, unknown>,
): () => void {
  const t0 = performance.now();
  return () => markFilePerf(name, performance.now() - t0, detail);
}

export function getFilePerfSamples(): readonly PerfSample[] {
  return ring.slice();
}

export function subscribeFilePerf(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Default fallback policy when a budget is exceeded:
 * - quick_preview_open > 3x budget → caller may opt to collapse heavy modules.
 * Callers can check this to decide whether to auto-disable features.
 */
export function shouldDegrade(name: FilePerfEventName, durationMs: number): boolean {
  return durationMs > BUDGET_MS[name] * 3;
}
