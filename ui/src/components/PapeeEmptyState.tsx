import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PapeePose } from "./papee/PapeeSprites";
import type { PapeeAnimState } from "./papee/PapeeSprites";

export interface PapeeEmptyStateProps {
  message: string;
  pose?: PapeeAnimState;
  action?: string;
  onAction?: () => void;
  submessage?: string;
}

export function PapeeEmptyState({
  message,
  pose = "waving",
  action,
  onAction,
  submessage,
}: PapeeEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in slide-in-from-left-4 duration-500">
      {/* Papee character */}
      <div className="mb-2 animate-in slide-in-from-left-8 duration-700">
        <svg viewBox="-6 -8 60 80" width={80} height={100} fill="none">
          <PapeePose state={pose} />
        </svg>
      </div>

      {/* Speech bubble with tail pointing up at Papee */}
      <div className="relative max-w-[400px] animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both">
        {/* Tail triangle */}
        <div className="flex justify-center">
          <div
            className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-border"
          />
        </div>
        <div className="relative flex justify-center -mt-px">
          <div
            className="absolute w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[7px] border-b-card top-px"
          />
        </div>

        {/* Bubble body */}
        <div className="rounded-xl border border-border bg-card shadow-sm px-5 py-4">
          <p className="text-sm text-foreground leading-relaxed">{message}</p>
          {submessage && (
            <p className="text-xs text-muted-foreground mt-1.5">{submessage}</p>
          )}
        </div>
      </div>

      {/* Optional action button */}
      {action && onAction && (
        <div className="mt-4 animate-in fade-in duration-500 delay-500 fill-mode-both">
          <Button onClick={onAction}>
            <Plus className="h-4 w-4 mr-1.5" />
            {action}
          </Button>
        </div>
      )}
    </div>
  );
}
