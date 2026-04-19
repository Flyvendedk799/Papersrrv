/**
 * Server-side feature flags (simple env-driven).
 *
 * Pattern mirrors the UI's `featureFlags.ts`:
 *   - Read from process.env.PAPERCLIP_FF_<FLAG> or PAPERCLIP_FF_<FLAG>_DEFAULT.
 *   - Env values accepted: on/true/1 (enabled) | off/false/0 (disabled).
 *   - Unknown/missing env → fallback to compiled-in default.
 *
 * Default off for new features until they reach production readiness.
 */

export type ServerFeatureFlag =
  | "github_tab_enabled" // backlog 4.0 umbrella flag
  | "github_pat_auth" // backlog 4.0 sub-flag — enable PAT-based connections
  | "github_webhooks" // backlog 4.0 A3 — enable /api/webhooks/github ingress
  | "pr_actions"; // backlog 4.0 B3 — enable PR mutations (comment/approve/merge)

const DEFAULTS: Record<ServerFeatureFlag, boolean> = {
  github_tab_enabled: false,
  github_pat_auth: false,
  github_webhooks: false,
  pr_actions: false,
};

function readEnv(key: ServerFeatureFlag): boolean | null {
  const envKey = `PAPERCLIP_FF_${key.toUpperCase()}`;
  const raw = process.env[envKey];
  if (raw == null) return null;
  const normalized = raw.trim().toLowerCase();
  if (["on", "true", "1", "yes"].includes(normalized)) return true;
  if (["off", "false", "0", "no"].includes(normalized)) return false;
  return null;
}

export function isServerFeatureEnabled(key: ServerFeatureFlag): boolean {
  const fromEnv = readEnv(key);
  if (fromEnv != null) return fromEnv;
  return DEFAULTS[key];
}
