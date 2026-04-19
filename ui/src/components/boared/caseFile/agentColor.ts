/**
 * agentColor — stable per-agent color keyed on a string seed
 * (agent id or agent name). The same seed always produces the same
 * color so a given agent looks identical wherever they appear in
 * the case-file page: graph node, sidebar chip, thread card.
 *
 * Palette stays within the Boared design tokens so nothing
 * clashes with the paper surround. Six tones spread around the
 * hue circle for visual distinction between neighbouring agents.
 */

const PALETTE = [
  { tint: "var(--boared-feature)", ink: "var(--boared-ink)" },
  { tint: "var(--boared-info)", ink: "var(--boared-ink)" },
  { tint: "var(--boared-review)", ink: "var(--boared-ink)" },
  { tint: "var(--boared-warn)", ink: "var(--boared-ink)" },
  { tint: "var(--boared-success)", ink: "var(--boared-ink)" },
  { tint: "var(--boared-live)", ink: "var(--boared-ink)" },
] as const;

function hash(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function agentColor(seed: string | null | undefined): {
  tint: string;
  ink: string;
} {
  if (!seed) return PALETTE[0];
  return PALETTE[hash(seed) % PALETTE.length];
}
