import { Fragment } from "react";
import { Link } from "@/lib/router";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";

/*
 * BOARED SubBar — secondary navigation strip beneath the masthead.
 * Holds the breadcrumb trail (left, mono small caps) and an optional
 * page-level actions slot (right, populated via the PageActions context
 * by individual pages).
 *
 * Hairline-rule bottom border keeps it visually anchored to the masthead
 * without competing with it for weight.
 */
export function SubBar() {
  const { breadcrumbs } = useBreadcrumbs();
  if (breadcrumbs.length === 0) return null;

  return (
    <div className="shrink-0 h-9 px-6 flex items-center min-w-0 overflow-hidden border-b border-[var(--boared-rule)] bg-background">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
        <ol className="flex items-center gap-2 min-w-0 font-mono uppercase tracking-[0.1em] text-[0.62rem]">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <Fragment key={i}>
                {i > 0 && <li className="text-muted-foreground/50 shrink-0">/</li>}
                <li className={isLast ? "min-w-0" : "shrink-0"}>
                  {isLast || !crumb.href ? (
                    <span className="text-foreground truncate block">{crumb.label}</span>
                  ) : (
                    <Link
                      to={crumb.href}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
