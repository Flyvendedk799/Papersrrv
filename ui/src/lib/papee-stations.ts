export interface PapeeStation {
  id: string;
  /** 0 = left, 1 = right — fraction of safe zone width */
  x: number;
  /** 0 = top, 1 = bottom — fraction of safe zone height */
  y: number;
  label?: string;
}

export const PAGE_STATIONS: Record<string, PapeeStation[]> = {
  dashboard: [
    { id: "default", x: 0.95, y: 0.88, label: "Corner watch" },
    { id: "activity", x: 0.75, y: 0.55, label: "Near activity feed" },
    { id: "metrics", x: 0.5, y: 0.25, label: "Near metric cards" },
    { id: "top-right", x: 0.92, y: 0.15, label: "Observer" },
    { id: "left-middle", x: 0.15, y: 0.5, label: "Left margin" },
    { id: "center-bottom", x: 0.5, y: 0.9, label: "Center bottom" },
  ],
  agents: [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "list-top", x: 0.5, y: 0.2 },
    { id: "list-middle", x: 0.7, y: 0.5 },
    { id: "list-bottom", x: 0.5, y: 0.85 },
    { id: "far-left", x: 0.1, y: 0.5 },
  ],
  "agent-detail": [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "header", x: 0.5, y: 0.15 },
    { id: "mid", x: 0.85, y: 0.5 },
    { id: "left", x: 0.15, y: 0.5 },
  ],
  "agent-run": [
    { id: "default", x: 0.9, y: 0.5, label: "Watching run" },
    { id: "top", x: 0.5, y: 0.15 },
    { id: "bottom", x: 0.5, y: 0.9 },
  ],
  issues: [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "list", x: 0.7, y: 0.5 },
    { id: "top", x: 0.5, y: 0.2 },
    { id: "left-side", x: 0.15, y: 0.5 },
  ],
  "issue-detail": [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "thread", x: 0.6, y: 0.4 },
    { id: "header", x: 0.5, y: 0.15 },
    { id: "far-right", x: 0.92, y: 0.5 },
  ],
  "project-detail": [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "header", x: 0.5, y: 0.15 },
    { id: "mid", x: 0.8, y: 0.5 },
  ],
  projects: [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "list", x: 0.5, y: 0.4 },
  ],
  workflows: [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "top", x: 0.5, y: 0.2 },
  ],
  "workflow-detail": [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "header", x: 0.5, y: 0.15 },
  ],
  secrets: [
    { id: "default", x: 0.5, y: 0.85, label: "Guarding" },
    { id: "vault", x: 0.55, y: 0.5 },
    { id: "top", x: 0.4, y: 0.2 },
    { id: "left", x: 0.15, y: 0.5 },
  ],
  costs: [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "top", x: 0.5, y: 0.15 },
    { id: "charts", x: 0.7, y: 0.5 },
  ],
  activity: [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "top", x: 0.5, y: 0.2 },
    { id: "middle", x: 0.8, y: 0.5 },
  ],
  org: [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "center", x: 0.5, y: 0.5 },
  ],
  inbox: [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "top", x: 0.5, y: 0.2 },
  ],
  other: [
    { id: "default", x: 0.95, y: 0.85 },
    { id: "middle", x: 0.5, y: 0.5 },
  ],
};

export interface SafeZone {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Convert a station's percentage coordinates to viewport pixels,
 * accounting for sidebar width, panel width, and character size.
 */
export function resolveStation(
  station: PapeeStation,
  safeZone: SafeZone,
  characterSize: { width: number; height: number },
): { x: number; y: number } {
  const zoneWidth = Math.max(0, safeZone.right - safeZone.left - characterSize.width);
  const zoneHeight = Math.max(0, safeZone.bottom - safeZone.top - characterSize.height);
  return {
    x: safeZone.left + station.x * zoneWidth,
    y: safeZone.top + station.y * zoneHeight,
  };
}

/** Find station by id, or return first, or null if page unknown */
export function findStation(page: string, stationId: string = "default"): PapeeStation | null {
  const stations = PAGE_STATIONS[page] ?? PAGE_STATIONS.other;
  if (!stations || stations.length === 0) return null;
  return stations.find((s) => s.id === stationId) ?? stations[0] ?? null;
}