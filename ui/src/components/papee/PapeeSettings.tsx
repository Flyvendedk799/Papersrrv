import { useState, useCallback, type ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { usePapee } from "../../context/PapeeContext";
import { useToast } from "../../context/ToastContext";
import {
  ArrowLeft,
  ArrowRight,
  Minus,
  BellOff,
  Bell,
  EyeOff,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface PapeeSettingsProps {
  children: ReactNode;
}

/**
 * PapeeSettings — right-click context menu for Papee character.
 * Wraps children (the character) and opens a popover on contextmenu.
 */
export function PapeeSettings({ children }: PapeeSettingsProps) {
  const [open, setOpen] = useState(false);
  const papee = usePapee();
  const { pushPapeeToast } = useToast();

  const isRight = papee.prefs.position === "bottom-right";

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen((prev) => !prev);
    },
    [],
  );

  const handleTogglePosition = useCallback(() => {
    papee.updatePrefs({
      position: isRight ? "bottom-left" : "bottom-right",
    });
    setOpen(false);
  }, [papee, isRight]);

  const handleMinimize = useCallback(() => {
    papee.updatePrefs({ minimized: true });
    setOpen(false);
  }, [papee]);

  const handleToggleMute = useCallback(() => {
    papee.updatePrefs({ muteReactions: !papee.prefs.muteReactions });
  }, [papee]);

  const handleHide = useCallback(() => {
    papee.updatePrefs({ visible: false });
    setOpen(false);
    const isMac = navigator.platform?.toUpperCase().includes("MAC") ||
      (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform === "macOS";
    pushPapeeToast({
      title: "Papee hidden",
      body: `Press ${isMac ? "\u2318" : "Ctrl"}+. to bring back`,
      tone: "info",
      ttlMs: 5000,
    });
  }, [papee, pushPapeeToast]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div onContextMenu={handleContextMenu}>{children}</div>
      </PopoverTrigger>
      <PopoverContent
        side={isRight ? "left" : "right"}
        align="end"
        sideOffset={8}
        className="w-56 p-0"
      >
        <div className="flex flex-col py-1">
          {/* Position toggle */}
          <SettingsButton onClick={handleTogglePosition}>
            {isRight ? (
              <>
                <ArrowLeft className="size-3.5" />
                <span>Move to left</span>
              </>
            ) : (
              <>
                <ArrowRight className="size-3.5" />
                <span>Move to right</span>
              </>
            )}
          </SettingsButton>

          {/* Minimize */}
          <SettingsButton onClick={handleMinimize}>
            <Minus className="size-3.5" />
            <span>Minimize Papee</span>
          </SettingsButton>

          <Separator />

          {/* Mute reactions toggle */}
          <SettingsButton onClick={handleToggleMute}>
            {papee.prefs.muteReactions ? (
              <BellOff className="size-3.5" />
            ) : (
              <Bell className="size-3.5" />
            )}
            <span className="flex-1 text-left">Mute reactions</span>
            <ToggleSwitch checked={papee.prefs.muteReactions} />
          </SettingsButton>

          <Separator />

          {/* Hide Papee */}
          <SettingsButton onClick={handleHide} variant="danger">
            <EyeOff className="size-3.5" />
            <span>Hide Papee</span>
          </SettingsButton>

          <Separator />

          {/* Version info */}
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
            Papee v1.0 &mdash; Process Chain Manager
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ---- Internal sub-components ---- */

function SettingsButton({
  children,
  onClick,
  variant,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-xs w-full text-left",
        "transition-colors duration-100 cursor-pointer",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:bg-accent",
        variant === "danger" && "text-destructive hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function ToggleSwitch({ checked }: { checked: boolean }) {
  return (
    <div
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors duration-200",
        checked
          ? "bg-primary border-primary"
          : "bg-muted border-border",
      )}
      aria-hidden="true"
    >
      <span
        className={cn(
          "block size-3 rounded-full bg-background shadow-sm transition-transform duration-200",
          checked ? "translate-x-3" : "translate-x-0",
        )}
      />
    </div>
  );
}

function Separator() {
  return <div className="my-1 h-px bg-border" />;
}
