import type { Goal } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { StatusBadge } from "./StatusBadge";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { useState } from "react";

/* ─────────────────────────────────────────────────────────────────────
 *  GoalTree → "The Tenets"
 *
 *  Each goal becomes a numbered tenet in an editorial constitution.
 *  Top-level goals are roman numerals (I, II, III…). Children are nested
 *  underneath as sub-clauses, indented and prefixed with their parent's
 *  number plus a hairline rule. Reads as a printed proclamation, not a
 *  collapsible tree of cards.
 *
 *  Same data, same routing — pure visual swap.
 * ────────────────────────────────────────────────────────────────────── */

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

function romanFor(index: number): string {
  return ROMAN[index] ?? `${index + 1}`;
}

interface GoalTreeProps {
  goals: Goal[];
  goalLink?: (goal: Goal) => string;
  onSelect?: (goal: Goal) => void;
}

interface GoalNodeProps {
  goal: Goal;
  children: Goal[];
  allGoals: Goal[];
  depth: number;
  numeral: string;
  goalLink?: (goal: Goal) => string;
  onSelect?: (goal: Goal) => void;
}

function GoalNode({ goal, children, allGoals, depth, numeral, goalLink, onSelect }: GoalNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = children.length > 0;
  const link = goalLink?.(goal);

  const inner = (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-3.5">
      <span
        className={cn(
          "font-mono uppercase tracking-[0.05em] tabular-nums shrink-0",
          depth === 0 ? "text-[0.78rem] text-foreground" : "text-[0.66rem] text-muted-foreground",
        )}
      >
        {numeral}.
      </span>
      <div className="min-w-0">
        <div className={cn("flex items-center gap-2", depth === 0 ? "boared-display text-[1.05rem] leading-snug text-foreground" : "text-[0.85rem] text-foreground")}>
          {hasChildren && (
            <button
              type="button"
              className="p-0.5 -ml-1"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              <ChevronRight
                className={cn("h-3 w-3 transition-transform text-muted-foreground", expanded && "rotate-90")}
              />
            </button>
          )}
          <span className="truncate">{goal.title}</span>
        </div>
        {goal.level && (
          <span className="boared-label text-muted-foreground mt-1 inline-block">
            {goal.level}
          </span>
        )}
      </div>
      <StatusBadge status={goal.status} />
    </div>
  );

  return (
    <div>
      {link ? (
        <Link
          to={link}
          className="block no-underline text-inherit border-b border-[var(--boared-rule)] hover:bg-foreground/[0.025] transition-colors"
          style={{ paddingLeft: `${depth * 32}px`, paddingRight: "8px" }}
        >
          {inner}
        </Link>
      ) : (
        <div
          className="cursor-pointer border-b border-[var(--boared-rule)] hover:bg-foreground/[0.025] transition-colors"
          style={{ paddingLeft: `${depth * 32}px`, paddingRight: "8px" }}
          onClick={() => onSelect?.(goal)}
        >
          {inner}
        </div>
      )}
      {hasChildren && expanded && (
        <div>
          {children.map((child, i) => (
            <GoalNode
              key={child.id}
              goal={child}
              children={allGoals.filter((g) => g.parentId === child.id)}
              allGoals={allGoals}
              depth={depth + 1}
              numeral={`${numeral}.${i + 1}`}
              goalLink={goalLink}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GoalTree({ goals, goalLink, onSelect }: GoalTreeProps) {
  const goalIds = new Set(goals.map((g) => g.id));
  const roots = goals.filter((g) => !g.parentId || !goalIds.has(g.parentId));

  if (goals.length === 0) {
    return (
      <p className="font-mono text-[0.72rem] text-muted-foreground italic py-4">
        No tenets on the books.
      </p>
    );
  }

  return (
    <div className="border-t-2 border-foreground">
      {roots.map((goal, i) => (
        <GoalNode
          key={goal.id}
          goal={goal}
          children={goals.filter((g) => g.parentId === goal.id)}
          allGoals={goals}
          depth={0}
          numeral={romanFor(i)}
          goalLink={goalLink}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
