import { useState, useRef, useCallback, createElement } from "react";
import {
  PapeeConfirmDialog,
  type PapeeConfirmDialogProps,
} from "@/components/papee/PapeeConfirmDialog";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
};

type DialogState = ConfirmOptions & { open: boolean };

export function usePapeeConfirm() {
  const [state, setState] = useState<DialogState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | undefined>(undefined);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      resolveRef.current?.(false);
      resolveRef.current = undefined;
      setState(null);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = undefined;
    setState(null);
  }, []);

  const ConfirmDialog = useCallback(
    () =>
      state
        ? createElement(PapeeConfirmDialog, {
            open: state.open,
            onOpenChange: handleOpenChange,
            title: state.title,
            description: state.description,
            confirmLabel: state.confirmLabel,
            cancelLabel: state.cancelLabel,
            variant: state.variant,
            onConfirm: handleConfirm,
          } satisfies PapeeConfirmDialogProps)
        : null,
    [state, handleOpenChange, handleConfirm],
  );

  return { confirm, ConfirmDialog } as const;
}
