import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PapeeEmptyState } from "./PapeeEmptyState";
import type { PapeeAnimState } from "./papee/PapeeSprites";
import { usePapeeOptional } from "../context/PapeeContext";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: string;
  onAction?: () => void;
  /** Show the Papee character variant instead of the editorial blank slate. */
  papee?: boolean;
  /** Papee pose when papee is true (default: "waving"). */
  papeePose?: PapeeAnimState;
  /** Secondary smaller text shown below the message (Papee variant only). */
  submessage?: string;
}

/*
 * BOARED EmptyState — editorial blank slate. A thin rule, a kicker label,
 * a single declarative line in display italic. No friendly icon block.
 * The blank state is a deliberate quiet space, not a reassurance.
 */
export function EmptyState({
  icon: _icon,
  message,
  action,
  onAction,
  papee,
  papeePose,
  submessage,
}: EmptyStateProps) {
  const papeeCtx = usePapeeOptional();

  if (papee && papeeCtx) {
    return (
      <PapeeEmptyState
        message={message}
        pose={papeePose}
        action={action}
        onAction={onAction}
        submessage={submessage}
      />
    );
  }

  return (
    <div className="flex flex-col items-start justify-center max-w-xl py-20 border-t border-[var(--boared-rule)]">
      <span className="boared-label mb-4">Nothing here</span>
      <p className="boared-display text-[1.65rem] leading-[1.15] text-foreground mb-6 max-w-[28ch]">
        {message}
      </p>
      {action && onAction && (
        <Button onClick={onAction} variant="outline">
          {action}
        </Button>
      )}
    </div>
  );
}
