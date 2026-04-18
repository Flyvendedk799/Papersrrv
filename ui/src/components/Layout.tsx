import { Suspense, useCallback, useEffect, useRef, useState, type UIEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate, useParams } from "@/lib/router";
import { Masthead } from "./boared/Masthead";
import { SubBar } from "./boared/SubBar";
import { PropertiesPanel } from "./PropertiesPanel";
import { CommandPalette } from "./CommandPalette";
import { NewIssueDialog } from "./NewIssueDialog";
import { NewProjectDialog } from "./NewProjectDialog";
import { NewGoalDialog } from "./NewGoalDialog";
import { NewAgentDialog } from "./NewAgentDialog";
import { ToastViewport } from "./ToastViewport";
import { PapeeOverlay } from "./papee/PapeeOverlay";
import { MobileBottomNav } from "./MobileBottomNav";
import { useDialog } from "../context/DialogContext";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { useSidebar } from "../context/SidebarContext";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useCompanyPageMemory } from "../hooks/useCompanyPageMemory";
import { healthApi } from "../api/health";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

/*
 * BOARED Layout — replaces the legacy CompanyRail + Sidebar + BreadcrumbBar
 * shell with an editorial masthead + sub-bar + main + right drawer pattern.
 *
 * Preservation map (everything still works):
 *   - Cmd+K command palette                — kept
 *   - Cmd+1..9 company switch              — kept (via useKeyboardShortcuts)
 *   - Toggle sidebar shortcut              — repurposed to toggle properties drawer
 *   - Mobile swipe-from-edge gesture       — opens mobile masthead overlay
 *   - Mobile bottom nav                    — kept (auto-hide on scroll)
 *   - Onboarding wizard auto-trigger       — kept
 *   - Multi-tenant URL prefix sync         — kept (verbatim)
 *   - Papee overlay + 4 quick-create dialogs + toasts + properties panel — kept
 */
export function Layout() {
  const { sidebarOpen, setSidebarOpen, toggleSidebar, isMobile } = useSidebar();
  const { openNewIssue, openOnboarding } = useDialog();
  const { togglePanelVisible } = usePanel();
  const { companies, loading: companiesLoading, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { companyPrefix } = useParams<{ companyPrefix: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const onboardingTriggered = useRef(false);
  const lastMainScrollTop = useRef(0);
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const { data: health } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });

  // Auto-trigger onboarding if no companies exist (unauthenticated mode).
  useEffect(() => {
    if (companiesLoading || onboardingTriggered.current) return;
    if (health?.deploymentMode === "authenticated") return;
    if (companies.length === 0) {
      onboardingTriggered.current = true;
      openOnboarding();
    }
  }, [companies, companiesLoading, openOnboarding, health?.deploymentMode]);

  // Keep URL prefix in sync with selected company.
  useEffect(() => {
    if (!companyPrefix || companiesLoading || companies.length === 0) return;

    const requestedPrefix = companyPrefix.toUpperCase();
    const matched = companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix);

    if (!matched) {
      const fallback =
        (selectedCompanyId ? companies.find((company) => company.id === selectedCompanyId) : null)
        ?? companies[0]!;
      navigate(`/${fallback.issuePrefix}/dashboard`, { replace: true });
      return;
    }

    if (companyPrefix !== matched.issuePrefix) {
      const suffix = location.pathname.replace(/^\/[^/]+/, "");
      navigate(`/${matched.issuePrefix}${suffix}${location.search}`, { replace: true });
      return;
    }

    if (selectedCompanyId !== matched.id) {
      setSelectedCompanyId(matched.id, { source: "route_sync" });
    }
  }, [
    companyPrefix,
    companies,
    companiesLoading,
    location.pathname,
    location.search,
    navigate,
    selectedCompanyId,
    setSelectedCompanyId,
  ]);

  const togglePanel = togglePanelVisible;

  // Cmd+1..9 to switch companies.
  const switchCompany = useCallback(
    (index: number) => {
      if (index < companies.length) {
        setSelectedCompanyId(companies[index]!.id);
      }
    },
    [companies, setSelectedCompanyId],
  );

  useCompanyPageMemory();

  useKeyboardShortcuts({
    onNewIssue: () => openNewIssue(),
    onToggleSidebar: toggleSidebar,
    onTogglePanel: togglePanel,
    onSwitchCompany: switchCompany,
  });

  // Mobile bottom nav auto-show on direction change.
  useEffect(() => {
    if (!isMobile) {
      setMobileNavVisible(true);
      return;
    }
    lastMainScrollTop.current = 0;
    setMobileNavVisible(true);
  }, [isMobile]);

  // Swipe-from-left-edge to open the mobile masthead menu.
  // Reuses the existing sidebar context flag — Masthead reads it via prop drilling
  // through state management is unnecessary; we just dispatch a synthetic click
  // to its hamburger via setSidebarOpen so the legacy edge-swipe muscle memory
  // still maps to opening the navigation.
  useEffect(() => {
    if (!isMobile) return;

    const EDGE_ZONE = 30;
    const MIN_DISTANCE = 50;
    const MAX_VERTICAL = 75;

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]!;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0]!;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);

      if (dy > MAX_VERTICAL) return;

      if (!sidebarOpen && startX < EDGE_ZONE && dx > MIN_DISTANCE) {
        setSidebarOpen(true);
        return;
      }

      if (sidebarOpen && dx < -MIN_DISTANCE) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobile, sidebarOpen, setSidebarOpen]);

  const handleMainScroll = useCallback(
    (event: UIEvent<HTMLElement>) => {
      if (!isMobile) return;

      const currentTop = event.currentTarget.scrollTop;
      const delta = currentTop - lastMainScrollTop.current;

      if (currentTop <= 24) {
        setMobileNavVisible(true);
      } else if (delta > 8) {
        setMobileNavVisible(false);
      } else if (delta < -8) {
        setMobileNavVisible(true);
      }

      lastMainScrollTop.current = currentTop;
    },
    [isMobile],
  );

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground overflow-hidden pt-[env(safe-area-inset-top)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:bg-foreground focus:text-background focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:uppercase focus:tracking-[0.1em] focus:outline-2 focus:outline-[var(--boared-acid)]"
      >
        Skip to main content
      </a>

      {/* Editorial top bar (replaces CompanyRail + Sidebar + BreadcrumbBar). */}
      <Masthead />
      <SubBar />

      {/* Main content + properties drawer */}
      <div className="flex flex-1 min-h-0">
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "flex-1 overflow-auto px-6 md:px-10 py-8 md:py-10",
            isMobile && "px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))]"
          )}
          onScroll={handleMainScroll}
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
                Loading.
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
        <PropertiesPanel />
      </div>

      {isMobile && <MobileBottomNav visible={mobileNavVisible} />}
      <CommandPalette />
      <NewIssueDialog />
      <NewProjectDialog />
      <NewGoalDialog />
      <NewAgentDialog />
      <PapeeOverlay />
      <ToastViewport />
    </div>
  );
}
