import { useEffect, useRef, useState } from "react";
import { useSidebar } from "../context/SidebarContext";
import { usePanel } from "../context/PanelContext";
import { useDialog } from "../context/DialogContext";
import type { SafeZone } from "../lib/papee-stations";

const SIDEBAR_WIDTH = 240; // w-60
const COMPANY_RAIL_WIDTH = 48;
const SIDEBAR_TOTAL = SIDEBAR_WIDTH + COMPANY_RAIL_WIDTH; // 288
const PANEL_WIDTH = 320; // w-80
const TOP_BREADCRUMB = 48;
const MOBILE_BOTTOM_NAV = 80;
const EDGE_MARGIN = 16;

interface LayoutAwareness {
  safeZone: SafeZone;
  modalOpen: boolean;
  isMobile: boolean;
}

function computeSafeZone(
  sidebarOpen: boolean,
  panelVisible: boolean,
  isMobile: boolean,
  width: number,
  height: number,
): SafeZone {
  const left = (!isMobile && sidebarOpen ? SIDEBAR_TOTAL : 0) + EDGE_MARGIN;
  const right = width - (!isMobile && panelVisible ? PANEL_WIDTH : 0) - EDGE_MARGIN;
  const top = TOP_BREADCRUMB + EDGE_MARGIN;
  const bottomInset = isMobile ? MOBILE_BOTTOM_NAV : 0;
  const bottom = height - bottomInset - EDGE_MARGIN;
  return { left, right, top, bottom };
}

/**
 * Computes the on-screen safe zone Papee can occupy without colliding
 * with the sidebar, side panel, top breadcrumb bar, or mobile nav.
 *
 * Also flags whether a modal dialog is open (Papee should fade out).
 */
export function usePapeeLayoutAwareness(): LayoutAwareness {
  const { sidebarOpen, isMobile } = useSidebar();
  const { panelVisible } = usePanel();
  const dialog = useDialog();

  const modalOpen =
    dialog.newIssueOpen ||
    dialog.newProjectOpen ||
    dialog.newGoalOpen ||
    dialog.newAgentOpen ||
    dialog.onboardingOpen;

  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  }));

  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    function onResize() {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setViewport({ width: window.innerWidth, height: window.innerHeight });
      });
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const safeZone = computeSafeZone(sidebarOpen, panelVisible, isMobile, viewport.width, viewport.height);

  return { safeZone, modalOpen, isMobile };
}
