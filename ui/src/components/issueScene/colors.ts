/** Issue-scene color palette — status colors, agent colors, kind tints */

const STATUS_COLORS: Record<string, { main: string; emissive: string }> = {
  backlog:     { main: "#6B7280", emissive: "#4B5563" },
  todo:        { main: "#38BDF8", emissive: "#0EA5E9" },
  in_progress: { main: "#F59E0B", emissive: "#D97706" },
  in_review:   { main: "#A78BFA", emissive: "#7C3AED" },
  done:        { main: "#34D399", emissive: "#059669" },
  blocked:     { main: "#EF4444", emissive: "#DC2626" },
  cancelled:   { main: "#9CA3AF", emissive: "#6B7280" },
};

export function statusColor(status: string): { main: string; emissive: string } {
  return STATUS_COLORS[status] ?? STATUS_COLORS.todo;
}

const AGENT_PALETTE = [
  "#B22B1A", "#C2185B", "#D97706", "#2E7D32",
  "#1B5E7A", "#00838F", "#6A1B9A", "#8D6E63",
  "#E65100", "#1565C0", "#00695C", "#AD1457",
];

export function agentColor(agentId: string | null | undefined): string {
  if (!agentId) return "#888888";
  let h = 0;
  for (let i = 0; i < agentId.length; i++)
    h = (h * 131 + agentId.charCodeAt(i)) | 0;
  return AGENT_PALETTE[Math.abs(h) % AGENT_PALETTE.length];
}

export const WARM_CREAM = "#F2E6C4";
export const WARM_GOLD = "#C4A44A";
export const VOID_BG = "#08080A";
export const ACID_RED = "#FF6B4A";
export const APPROVAL_PENDING = "#FF4444";
export const APPROVAL_APPROVED = "#34D399";
export const APPROVAL_REJECTED = "#EF4444";
