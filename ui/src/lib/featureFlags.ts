/**
 * Lightweight feature flags (backlog 3.0 foundation).
 *
 * Flags are read once per page load from:
 *   - import.meta.env.VITE_FF_<FLAG_KEY>=on|off
 *   - localStorage key "paperclip.ff.<flag_key>"="on"|"off"
 *   - ?ff=flag1,flag2 / ?ffoff=flag1 URL overrides (this session only)
 *
 * Flag naming: lower_snake_case. Defaults are conservative: new features
 * ship default-off so the existing experience stays intact until the flag
 * is flipped for a deployment.
 */

export type FeatureFlagKey =
  | "backlog_tab_enabled"; // 3.0 E3 — umbrella flag for the Backlog tab

const DEFAULTS: Record<FeatureFlagKey, boolean> = {
  // Backlog tab is default-off. Opt in via VITE_FF_BACKLOG_TAB_ENABLED=on,
  // `?ff=backlog_tab_enabled`, or `localStorage["paperclip.ff.backlog_tab_enabled"]="on"`.
  backlog_tab_enabled: false,
};

function envFlag(key: FeatureFlagKey): boolean | null {
  try {
    const envKey = `VITE_FF_${key.toUpperCase()}` as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any).env as Record<string, string | undefined> | undefined;
    if (!env) return null;
    const raw = env[envKey];
    if (raw === "on" || raw === "true" || raw === "1") return true;
    if (raw === "off" || raw === "false" || raw === "0") return false;
  } catch {
    // SSR / other non-vite env: ignore
  }
  return null;
}

function localFlag(key: FeatureFlagKey): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`paperclip.ff.${key}`);
    if (raw === "on" || raw === "true" || raw === "1") return true;
    if (raw === "off" || raw === "false" || raw === "0") return false;
  } catch {
    return null;
  }
  return null;
}

function urlOverride(key: FeatureFlagKey): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const search = new URLSearchParams(window.location.search);
    const turnOn = (search.get("ff") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const turnOff = (search.get("ffoff") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (turnOn.includes(key)) return true;
    if (turnOff.includes(key)) return false;
  } catch {
    return null;
  }
  return null;
}

export function isFeatureEnabled(key: FeatureFlagKey): boolean {
  const url = urlOverride(key);
  if (url !== null) return url;
  const loc = localFlag(key);
  if (loc !== null) return loc;
  const env = envFlag(key);
  if (env !== null) return env;
  return DEFAULTS[key];
}

/** React hook wrapper. Flags are evaluated once per render. */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return isFeatureEnabled(key);
}

/** Debug helper: dump all flag values (for diagnostics UI). */
export function getAllFlagValues(): Record<FeatureFlagKey, boolean> {
  const out = {} as Record<FeatureFlagKey, boolean>;
  (Object.keys(DEFAULTS) as FeatureFlagKey[]).forEach((k) => {
    out[k] = isFeatureEnabled(k);
  });
  return out;
}
