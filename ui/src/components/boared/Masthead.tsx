import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search, Sun, Moon, Menu, X, Rows3, Rows2 } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { QuickAccessStrip } from "./QuickAccessStrip";
import { useDensity } from "../../hooks/useDensity";
import { NavLink, useLocation } from "@/lib/router";
import { useDialog } from "../../context/DialogContext";
import { useCompany } from "../../context/CompanyContext";
import { useTheme } from "../../context/ThemeContext";
import { useSidebar } from "../../context/SidebarContext";
import { sidebarBadgesApi } from "../../api/sidebarBadges";
import { heartbeatsApi } from "../../api/heartbeats";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/utils";
import { isFeatureEnabled } from "../../lib/featureFlags";
import { Wordmark } from "./Wordmark";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/*
 * BOARED Masthead — the editorial top bar that replaces the entire
 * left rail + sidebar + breadcrumb chrome of the legacy Paperclip layout.
 *
 * Slot map (left → right):
 *   1. Wordmark
 *   2. Company switcher (popover) — replaces CompanyRail
 *   3. Section nav (primary 6) — replaces top sidebar items
 *   4. "More" archive (overflow) — replaces secondary sidebar items
 *   5. Search (Cmd+K trigger), date stamp, theme toggle
 *
 * Mobile: collapses to wordmark + hamburger; full-screen overlay for nav.
 */

interface PrimaryNavItem {
  to: string;
  label: string;
  liveCount?: number;
  badge?: number;
  alert?: boolean;
}

const PRIMARY_NAV_STATIC: Array<{ to: string; label: string; key: string }> = [
  { to: "/dashboard", label: "Today", key: "dashboard" },
  { to: "/issues", label: "Issues", key: "issues" },
  { to: "/projects", label: "Projects", key: "projects" },
  { to: "/agents/all", label: "Agents", key: "agents" },
  { to: "/workflows", label: "Workflows", key: "workflows" },
  { to: "/inbox", label: "Inbox", key: "inbox" },
];

// GitHub tab is appended behind the `github_tab_enabled` flag (4.0 B1).
// Projects stays in place; both live alongside until the umbrella flag
// flips on for a deployment (per backlog 4.0 B1 / E1 continuity rule).
const PRIMARY_NAV: Array<{ to: string; label: string; key: string }> =
  isFeatureEnabled("github_tab_enabled")
    ? [
        ...PRIMARY_NAV_STATIC.slice(0, 3),
        { to: "/github", label: "GitHub", key: "github" },
        ...PRIMARY_NAV_STATIC.slice(3),
      ]
    : PRIMARY_NAV_STATIC;

const ARCHIVE_NAV: Array<{ to: string; label: string }> = [
  { to: "/goals", label: "Goals" },
  { to: "/files", label: "Files" },
  { to: "/skills", label: "Skills" },
  { to: "/org", label: "Organization" },
  { to: "/secrets", label: "Secrets" },
  { to: "/costs", label: "Costs" },
  { to: "/activity", label: "Activity" },
  { to: "/approvals/pending", label: "Approvals" },
  { to: "/company/settings", label: "Settings" },
  { to: "/docs", label: "Docs" },
];

function openCommandPalette() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
}

export function Masthead() {
  const { isMobile } = useSidebar();
  const { selectedCompany, selectedCompanyId, companies, setSelectedCompanyId } = useCompany();
  const { theme, toggleTheme } = useTheme();
  // Apply density class to <html> so CSS variables propagate.
  const { density, toggle: toggleDensity } = useDensity();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [archiveMenuOpen, setArchiveMenuOpen] = useState(false);

  const { data: sidebarBadges } = useQuery({
    queryKey: queryKeys.sidebarBadges(selectedCompanyId!),
    queryFn: () => sidebarBadgesApi.get(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;
  const inboxCount = sidebarBadges?.inbox ?? 0;
  const inboxAlert = (sidebarBadges?.failedRuns ?? 0) > 0;

  const navMeta: Record<string, PrimaryNavItem> = {
    dashboard: { to: "/dashboard", label: "Today", liveCount: liveRunCount },
    inbox: { to: "/inbox", label: "Inbox", badge: inboxCount, alert: inboxAlert },
  };

  if (isMobile) {
    return <MastheadMobile
      mobileMenuOpen={mobileMenuOpen}
      setMobileMenuOpen={setMobileMenuOpen}
      navMeta={navMeta}
      selectedCompany={selectedCompany}
      companies={companies}
      setSelectedCompanyId={setSelectedCompanyId}
      theme={theme}
      toggleTheme={toggleTheme}
      density={density}
      toggleDensity={toggleDensity}
    />;
  }

  return (
    <header className="relative z-30 shrink-0 bg-background">
      {/* Row 1 — wordmark, company, section nav, utilities */}
      <div className="flex items-stretch h-14 px-6 gap-6 border-b border-foreground">
        {/* Wordmark */}
        <div className="flex items-center shrink-0">
          <NavLink to="/dashboard" className="focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]">
            <Wordmark />
          </NavLink>
        </div>

        {/* Company switcher */}
        <Popover open={companyMenuOpen} onOpenChange={setCompanyMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 px-2 -ml-2 hover:text-foreground/80 transition-colors group/co focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
              aria-label="Switch organization"
            >
              {selectedCompany?.brandColor && (
                <span
                  className="size-2 shrink-0"
                  style={{ backgroundColor: selectedCompany.brandColor }}
                  aria-hidden
                />
              )}
              <span className="font-sans text-[0.82rem] text-foreground max-w-[16ch] truncate">
                {selectedCompany?.name ?? "—"}
              </span>
              <ChevronDown className="size-3 text-muted-foreground group-hover/co:text-foreground transition-colors" strokeWidth={1.75} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={0} className="w-64 p-0">
            <div className="flex flex-col">
              {companies.map((company) => {
                const isCurrent = company.id === selectedCompanyId;
                return (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => {
                      setSelectedCompanyId(company.id);
                      setCompanyMenuOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 text-left transition-colors border-b border-[var(--boared-rule)] last:border-b-0",
                      isCurrent ? "bg-foreground text-background" : "hover:bg-foreground/5"
                    )}
                  >
                    {company.brandColor && (
                      <span className="size-2 shrink-0" style={{ backgroundColor: company.brandColor }} />
                    )}
                    <span className="text-[0.82rem] truncate flex-1">
                      {company.name}
                    </span>
                    <span className="font-mono text-[0.62rem] opacity-50">
                      {company.issuePrefix}
                    </span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Vertical rule */}
        <div className="w-px bg-foreground/20 my-3" aria-hidden />

        {/* Primary section nav */}
        <nav className="flex items-stretch gap-0 flex-1 min-w-0 overflow-hidden">
          {PRIMARY_NAV.map((item) => {
            const meta = navMeta[item.key];
            return (
              <NavItem
                key={item.key}
                to={item.to}
                label={item.label}
                liveCount={meta?.liveCount}
                badge={meta?.badge}
                alert={meta?.alert}
              />
            );
          })}

          {/* Archive overflow */}
          <Popover open={archiveMenuOpen} onOpenChange={setArchiveMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative flex items-center gap-1.5 px-3 text-[0.82rem] text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)] focus-visible:outline-offset-[-2px]"
              >
                More
                <ChevronDown className="size-3" strokeWidth={1.75} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={0} className="w-56 p-0">
              <div className="flex flex-col">
                {ARCHIVE_NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setArchiveMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center px-4 py-2 text-[0.82rem] border-b border-[var(--boared-rule)] last:border-b-0 transition-colors",
                        isActive ? "bg-foreground text-background" : "text-foreground hover:bg-foreground/5"
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </nav>

        {/* Right utilities */}
        <div className="flex items-stretch gap-0 shrink-0">
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex items-center gap-2 px-4 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)] focus-visible:outline-offset-[-2px]"
            title="Search · ⌘K"
          >
            <Search className="size-3.5" strokeWidth={1.75} />
            <span className="font-mono text-[0.62rem] tracking-tight">⌘K</span>
          </button>
          {/* Activity bell — unread indicator + popover with recent
           * events across the org. */}
          <div className="flex items-center px-2">
            <NotificationBell />
          </div>
          <button
            type="button"
            onClick={toggleDensity}
            className="flex items-center justify-center w-11 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)] focus-visible:outline-offset-[-2px]"
            aria-label={`Switch to ${density === "compact" ? "comfortable" : "compact"} density`}
            title={density === "compact" ? "Compact · click for comfortable" : "Comfortable · click for compact"}
          >
            {density === "compact" ? (
              <Rows2 className="size-3.5" strokeWidth={1.75} />
            ) : (
              <Rows3 className="size-3.5" strokeWidth={1.75} />
            )}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center justify-center w-11 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)] focus-visible:outline-offset-[-2px]"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <Sun className="size-3.5" strokeWidth={1.75} />
            ) : (
              <Moon className="size-3.5" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

/* Single nav item — mono caps, tight padding, acid underline on active. */
function NavItem({
  to,
  label,
  liveCount,
  badge,
  alert,
}: {
  to: string;
  label: string;
  liveCount?: number;
  badge?: number;
  alert?: boolean;
}) {
  const location = useLocation();
  // Mark dashboard active under any /dashboard prefix; mark inbox active under /inbox*; etc.
  const pathStem = to.split("/")[1];
  const isActive = pathStem ? location.pathname.includes(`/${pathStem}`) : false;

  return (
    <NavLink
      to={to}
      className={({ isActive: navActive }) =>
        cn(
          "relative flex items-center gap-2 px-3 text-[0.82rem] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)] focus-visible:outline-offset-[-2px]",
          navActive || isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          // Active = thin underline anchored at the masthead bottom
          (navActive || isActive) && "after:content-[''] after:absolute after:left-3 after:right-3 after:-bottom-px after:h-[2px] after:bg-foreground"
        )
      }
    >
      <span>{label}</span>
      {alert && <span className="size-1.5 bg-destructive" aria-label="Alert" />}
      {liveCount != null && liveCount > 0 && (
        <span className="flex items-center gap-1">
          <span className="size-1.5 bg-[var(--boared-acid)]" aria-hidden />
          <span className="font-mono text-[0.62rem] text-foreground tabular-nums">{liveCount}</span>
        </span>
      )}
      {badge != null && badge > 0 && (
        <span className="font-mono text-[0.62rem] text-muted-foreground tabular-nums">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

/* ----------------------------------------------------------------------
 *  Mobile masthead — wordmark + hamburger overlay.
 * --------------------------------------------------------------------- */

interface MastheadMobileProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  navMeta: Record<string, PrimaryNavItem>;
  selectedCompany: ReturnType<typeof useCompany>["selectedCompany"];
  companies: ReturnType<typeof useCompany>["companies"];
  setSelectedCompanyId: ReturnType<typeof useCompany>["setSelectedCompanyId"];
  theme: ReturnType<typeof useTheme>["theme"];
  toggleTheme: ReturnType<typeof useTheme>["toggleTheme"];
  density: ReturnType<typeof useDensity>["density"];
  toggleDensity: ReturnType<typeof useDensity>["toggle"];
}

function MastheadMobile({
  mobileMenuOpen,
  setMobileMenuOpen,
  navMeta,
  selectedCompany,
  companies,
  setSelectedCompanyId,
  theme,
  toggleTheme,
  density,
  toggleDensity,
}: MastheadMobileProps) {
  return (
    <>
      <header className="relative z-30 shrink-0 bg-background">
        <div className="flex items-center justify-between h-14 px-4 border-b border-foreground">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            className="flex items-center justify-center size-10 -ml-2 focus:outline-none"
          >
            <Menu className="size-5 text-foreground" strokeWidth={1.75} />
          </button>
          <NavLink to="/dashboard">
            <Wordmark size="sm" />
          </NavLink>
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Search"
            className="flex items-center justify-center size-10 -mr-2 focus:outline-none"
          >
            <Search className="size-4 text-foreground" strokeWidth={2} />
          </button>
        </div>
        <div className="h-px bg-[var(--boared-acid)]" aria-hidden />
      </header>

      {/* Full-screen mobile overlay menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between h-14 px-4 border-b border-foreground">
            <Wordmark size="sm" />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
              className="flex items-center justify-center size-10 -mr-2"
            >
              <X className="size-5 text-foreground" strokeWidth={1.75} />
            </button>
          </div>
          <div className="h-px bg-[var(--boared-acid)]" aria-hidden />
          <nav className="flex-1 overflow-y-auto px-4 py-6">
            {/* Company switcher row */}
            <div className="boared-label mb-3 text-foreground">Organization</div>
            <div className="flex flex-col mb-8 border-y border-[var(--boared-rule)]">
              {companies.map((company) => {
                const isCurrent = company.id === selectedCompany?.id;
                return (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => setSelectedCompanyId(company.id)}
                    className={cn(
                      "flex items-center gap-3 py-3 text-left border-b border-[var(--boared-rule)] last:border-b-0",
                      isCurrent && "bg-foreground/5"
                    )}
                  >
                    {company.brandColor && (
                      <span className="size-3 shrink-0" style={{ backgroundColor: company.brandColor }} />
                    )}
                    <span className="font-mono text-[0.78rem] flex-1 truncate">{company.name}</span>
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">
                      {company.issuePrefix}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="boared-label mb-3 text-foreground">Sections</div>
            <div className="flex flex-col mb-8 border-y border-[var(--boared-rule)]">
              {[...PRIMARY_NAV, ...ARCHIVE_NAV].map((item) => {
                const key = "key" in item ? (item as { key: string }).key : undefined;
                const meta = key ? navMeta[key] : undefined;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center justify-between py-3 border-b border-[var(--boared-rule)] last:border-b-0",
                        "font-mono uppercase tracking-[0.12em] text-[0.78rem]",
                        isActive ? "text-foreground" : "text-muted-foreground"
                      )
                    }
                  >
                    <span>{item.label}</span>
                    {meta?.alert && <span className="size-1.5 bg-destructive" />}
                    {meta?.liveCount && meta.liveCount > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="size-1.5 bg-[var(--boared-acid)]" />
                        <span className="font-mono text-[0.6rem]">{meta.liveCount} LIVE</span>
                      </span>
                    )}
                    {meta?.badge && meta.badge > 0 && (
                      <span className="font-mono text-[0.65rem] bg-foreground/10 px-1.5 py-0.5">
                        {meta.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>

            {/* Mobile quick-access — pinned cases + recents live
             * in the drawer so mobile users get one-tap navigation
             * to where they've been. */}
            <div className="py-3 border-y border-[var(--boared-rule)]">
              <QuickAccessStrip />
            </div>

            <button
              type="button"
              onClick={() => {
                toggleTheme();
              }}
              className="flex items-center justify-between w-full py-3 border-t border-[var(--boared-rule)] font-mono uppercase tracking-[0.12em] text-[0.78rem] text-muted-foreground"
            >
              <span>Theme</span>
              <span className="flex items-center gap-2">
                {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                <span>{theme === "dark" ? "Light" : "Dark"}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                toggleDensity();
              }}
              className="flex items-center justify-between w-full py-3 border-y border-[var(--boared-rule)] font-mono uppercase tracking-[0.12em] text-[0.78rem] text-muted-foreground"
            >
              <span>Density</span>
              <span className="flex items-center gap-2">
                {density === "compact" ? <Rows2 className="size-3.5" /> : <Rows3 className="size-3.5" />}
                <span>{density === "compact" ? "Comfortable" : "Compact"}</span>
              </span>
            </button>
          </nav>
          <div className="px-4 py-3 border-t border-[var(--boared-rule)]">
            <a href="/docs" className="text-[0.78rem] text-muted-foreground hover:text-foreground transition-colors">
              Documentation →
            </a>
          </div>
        </div>
      )}
    </>
  );
}
