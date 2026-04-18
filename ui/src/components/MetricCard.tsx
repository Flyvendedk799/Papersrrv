import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/lib/router";
import { cn } from "../lib/utils";

interface MetricCardProps {
  icon?: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
}

/*
 * BOARED MetricCard — editorial number block. Big italic Fraunces value,
 * mono caps label above. No icons, no rounded corners, hairline rule below.
 * Reads as a stat in a magazine sidebar.
 */
export function MetricCard({ value, label, description, to, onClick }: MetricCardProps) {
  const isClickable = !!(to || onClick);

  const inner = (
    <div
      className={cn(
        "h-full px-5 py-5 border-r border-[var(--boared-rule)] last:border-r-0 transition-colors",
        isClickable && "cursor-pointer hover:bg-foreground/[0.025]"
      )}
    >
      <p className="boared-label text-foreground mb-3">{label}</p>
      <p className="boared-display text-[2.4rem] sm:text-[2.85rem] leading-[0.95] text-foreground">
        {value}
      </p>
      {description && (
        <div className="font-mono text-[0.68rem] tracking-tight text-muted-foreground mt-3 hidden sm:block">
          {description}
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="no-underline text-inherit h-full block focus:outline-none focus-visible:[outline:2px_solid_var(--boared-acid)] focus-visible:outline-offset-[-2px]" onClick={onClick}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div className="h-full" onClick={onClick}>
        {inner}
      </div>
    );
  }

  return inner;
}
