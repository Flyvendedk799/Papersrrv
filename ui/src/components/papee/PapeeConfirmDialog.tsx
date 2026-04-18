import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PapeePose, type PapeeAnimState } from "./PapeeSprites";

export interface PapeeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
}

const POSE_MAP: Record<string, PapeeAnimState> = {
  danger: "alarmed",
  warning: "thinking",
  info: "idle",
};

export function PapeeConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Yes, do it",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
}: PapeeConfirmDialogProps) {
  const [bounce, setBounce] = useState(false);

  useEffect(() => {
    if (open) {
      setBounce(true);
      const timer = setTimeout(() => setBounce(false), 500);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const pose = POSE_MAP[variant] ?? "idle";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <div className="flex justify-center">
            <svg
              viewBox="-6 -8 60 80"
              className="h-12 w-12"
              style={{
                transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
                transform: bounce ? "translateY(-6px)" : "translateY(0)",
              }}
            >
              <PapeePose state={pose} />
            </svg>
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
