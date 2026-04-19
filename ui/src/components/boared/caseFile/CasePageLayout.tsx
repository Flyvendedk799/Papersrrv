/**
 * CasePageLayout — the outer frame of a /issues/:id page.
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  lineage → back to ancestor                                │
 *   ├─────────────────────────────────┬──────────────────────────┤
 *   │                                 │                          │
 *   │  HERO  (title · abstract)       │  Sidebar                 │
 *   │                                 │                          │
 *   │  Problem (description)          │   Properties             │
 *   │                                 │   Dates                  │
 *   │  [ banner if any ]              │   Activity summary       │
 *   │                                 │   Cost summary           │
 *   │  What was made                  │   Actions                │
 *   │                                 │                          │
 *   │  How it got here (graph)        │                          │
 *   │                                 │                          │
 *   │  Conversation                   │                          │
 *   │                                 │                          │
 *   └─────────────────────────────────┴──────────────────────────┘
 *
 * Two-column grid at md+. Single column on mobile — the sidebar
 * flips below the main content (or into a bottom sheet via the
 * props button in the mobile sticky header). Everything lives
 * inside the 1280 px page shell.
 */

import { cn } from "../../../lib/utils";

interface Props {
  lineage?: React.ReactNode;
  chapterNav?: React.ReactNode;
  hero: React.ReactNode;
  main: React.ReactNode;
  sidebar: React.ReactNode;
  className?: string;
}

export function CasePageLayout({
  lineage,
  chapterNav,
  hero,
  main,
  sidebar,
  className,
}: Props) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {lineage}
      <div
        className={cn(
          "grid gap-6 md:gap-8",
          // On lg+, three columns: chapter nav · main · sidebar.
          // On md only, two columns: main · sidebar.
          // On mobile, single column (sidebar flows below main).
          "md:grid-cols-[minmax(0,1fr)_minmax(240px,300px)]",
          "lg:grid-cols-[160px_minmax(0,1fr)_minmax(240px,300px)]",
        )}
      >
        {/* Chapter nav — leftmost column on lg+, hidden otherwise. */}
        {chapterNav ? (
          <div className="hidden lg:block">{chapterNav}</div>
        ) : (
          <div className="hidden lg:block" />
        )}

        {/* Main column */}
        <div className="flex flex-col gap-8 min-w-0">
          {hero}
          {main}
        </div>

        {/* Sidebar */}
        <aside className="md:sticky md:top-4 md:self-start md:h-fit md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">
          {sidebar}
        </aside>
      </div>
    </div>
  );
}
