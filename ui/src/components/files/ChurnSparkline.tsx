/**
 * Compact inline SVG sparkline for a file's daily-churn profile.
 *
 * Decisions:
 *   - Pure SVG (no dependency) so it can live inside list rows without
 *     shipping a charting library and without affecting layout cost.
 *   - Bars (not lines) so that zero-days are visually honest — a line
 *     chart would imply interpolation where there is none.
 *   - Colour comes from the `--chart-1`/`--foreground` tokens so it
 *     adopts the current theme and stays neutral in dense rows.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export interface ChurnSparklineProps {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
  /** Render flat faint bars when all values are zero. */
  quietWhenEmpty?: boolean;
  ariaLabel?: string;
}

export function ChurnSparkline({
  values,
  className,
  width = 64,
  height = 16,
  quietWhenEmpty = true,
  ariaLabel,
}: ChurnSparklineProps) {
  const data = useMemo(() => {
    if (!values.length) return [] as number[];
    const max = Math.max(1, ...values);
    return values.map((v) => Math.max(0, v) / max);
  }, [values]);

  if (!data.length) return null;

  const isEmpty = quietWhenEmpty && values.every((v) => !v);
  const bars = data.length;
  const gap = 1;
  const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars);

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? `Churn over last ${values.length} days`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("shrink-0", className)}
      preserveAspectRatio="none"
    >
      {data.map((v, i) => {
        const h = isEmpty ? 1 : Math.max(1, v * (height - 2));
        const x = i * (barWidth + gap);
        const y = height - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={h}
            rx={0.5}
            className={isEmpty ? "fill-muted-foreground/20" : "fill-foreground/70"}
          />
        );
      })}
    </svg>
  );
}
