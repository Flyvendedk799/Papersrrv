import { cn } from "@/lib/utils";

/*
 * BOARED wordmark — the logotype that appears in the masthead and login.
 * Italic Fraunces, wide tracking, with the acid dot inserted via CSS in
 * `.boared-wordmark::after` (see index.css).
 *
 * Two surfaces:
 *   <Wordmark />        — the chrome logotype (1.05rem default).
 *   <Wordmark size="lg" /> — the splash / login / 404 logotype.
 */
export function Wordmark({
  className,
  size = "default",
  href,
  onClick,
}: {
  className?: string;
  size?: "default" | "sm" | "lg";
  href?: string;
  onClick?: () => void;
}) {
  const sizeClass =
    size === "lg" ? "text-[2.5rem]" : size === "sm" ? "text-[0.85rem]" : "text-[1.05rem]";
  const content = (
    <span className={cn("boared-wordmark", sizeClass, className)} aria-label="Boared">
      Boared
    </span>
  );
  if (href) {
    return (
      <a href={href} onClick={onClick} className="inline-block focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]">
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="inline-block bg-transparent border-0 p-0 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]">
        {content}
      </button>
    );
  }
  return content;
}
