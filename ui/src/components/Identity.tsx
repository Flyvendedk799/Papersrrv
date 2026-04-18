import { cn } from "@/lib/utils";

type IdentitySize = "xs" | "sm" | "default" | "lg";

export interface IdentityProps {
  name: string;
  /** Kept for API compatibility but unused — Boared identities have no avatar. */
  avatarUrl?: string | null;
  /** Kept for API compatibility but unused. */
  initials?: string;
  size?: IdentitySize;
  className?: string;
}

/*
 * BOARED Identity — newspaper-byline name strip.
 *
 * Replaces the SaaS pattern of avatar-bubble + name with a typographic
 * byline. People in this product are referred to like correspondents in a
 * register: a small uppercase tracking name, no portrait, no badge.
 *
 * The avatar is gone entirely. The shape, the gap, the bubble — all of it.
 */

const sizeClass: Record<IdentitySize, string> = {
  xs: "text-[0.62rem]",
  sm: "text-[0.66rem]",
  default: "text-[0.72rem]",
  lg: "text-[0.78rem]",
};

export function Identity({ name, size = "default", className }: IdentityProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.06em] text-foreground truncate",
        sizeClass[size],
        className,
      )}
    >
      <span className="text-muted-foreground">·</span>
      <span className="truncate">{name}</span>
    </span>
  );
}
