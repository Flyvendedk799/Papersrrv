import { Button } from "@/components/ui/button";
import { PapeeDefs, PapeePose } from "@/components/papee/PapeeSprites";
import "@/components/papee/papee-animations.css";

interface PapeeErrorDisplayProps {
  title?: string;
  message: string;
  action?: string;
  onAction?: () => void;
}

export function PapeeErrorDisplay({
  title = "Something went wrong",
  message,
  action,
  onAction,
}: PapeeErrorDisplayProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
      <svg viewBox="-6 -8 60 80" width={64} height={80} fill="none" className="papee-alarm-shake">
        <PapeeDefs />
        <PapeePose state="alarmed" />
      </svg>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && onAction && (
        <Button onClick={onAction} variant="outline" className="mt-2">
          {action}
        </Button>
      )}
    </div>
  );
}
