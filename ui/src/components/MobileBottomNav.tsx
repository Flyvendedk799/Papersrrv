import { useMemo } from "react";
import { NavLink, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { sidebarBadgesApi } from "../api/sidebarBadges";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

/*
 * BOARED mobile bottom nav — five mono caps text labels separated by
 * thin vertical rules. No icons, no rounding. The active tab gets a thick
 * acid bar above it (matching the desktop masthead's section nav).
 */

interface MobileBottomNavProps {
  visible: boolean;
}

interface MobileNavLinkItem {
  type: "link";
  to: string;
  label: string;
  badge?: number;
}

interface MobileNavActionItem {
  type: "action";
  label: string;
  onClick: () => void;
}

type MobileNavItem = MobileNavLinkItem | MobileNavActionItem;

export function MobileBottomNav({ visible }: MobileBottomNavProps) {
  const location = useLocation();
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialog();

  const { data: sidebarBadges } = useQuery({
    queryKey: queryKeys.sidebarBadges(selectedCompanyId!),
    queryFn: () => sidebarBadgesApi.get(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const items = useMemo<MobileNavItem[]>(
    () => [
      { type: "link", to: "/dashboard", label: "Today" },
      { type: "link", to: "/issues", label: "Issues" },
      { type: "action", label: "New", onClick: () => openNewIssue() },
      { type: "link", to: "/agents/all", label: "Agents" },
      { type: "link", to: "/inbox", label: "Inbox", badge: sidebarBadges?.inbox },
    ],
    [openNewIssue, sidebarBadges?.inbox],
  );

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30 border-t-2 border-foreground bg-background transition-transform duration-200 ease-out md:hidden pb-[env(safe-area-inset-bottom)]",
        visible ? "translate-y-0" : "translate-y-full",
      )}
      aria-label="Mobile navigation"
    >
      <div className="grid h-14 grid-cols-5 divide-x divide-[var(--boared-rule)]">
        {items.map((item) => {
          if (item.type === "action") {
            const active = /\/issues\/new(?:\/|$)/.test(location.pathname);
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={cn(
                  "relative flex flex-col items-center justify-center font-mono uppercase tracking-[0.12em] text-[0.62rem]",
                  active ? "text-[var(--boared-acid-ink)] bg-[var(--boared-acid)]" : "text-foreground bg-foreground/5",
                )}
              >
                {item.label}
                {!active && (
                  <span className="absolute top-0 left-0 right-0 h-px bg-[var(--boared-acid)]" />
                )}
              </button>
            );
          }

          return (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-col items-center justify-center gap-0.5 font-mono uppercase tracking-[0.12em] text-[0.62rem] transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  isActive && "after:content-[''] after:absolute after:top-0 after:left-1 after:right-1 after:h-[3px] after:bg-[var(--boared-acid)]",
                )
              }
            >
              {({ isActive: _isActive }) => (
                <>
                  <span>{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="absolute top-1.5 right-2 font-mono text-[0.5rem] bg-foreground text-background px-1 py-px">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
