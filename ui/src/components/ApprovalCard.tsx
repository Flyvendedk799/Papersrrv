import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { typeLabel, ApprovalPayloadRenderer } from "./ApprovalPayload";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import type { Approval, Agent } from "@paperclipai/shared";

/*
 * BOARED ApprovalCard — petition awaiting signature.
 *
 * Replaces the SaaS card pattern (rounded box, colored status icons, button
 * row) with a typewritten petition document: a stamped header, the payload
 * filed in the body, and a dotted-line "signature" tray at the foot.
 *
 * Each petition stacks directly into a vertical column with hairline rules
 * between — no card chrome, no rounded corners, no colors except the one
 * acid for "approve".
 */

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting signature",
  approved: "Signed off",
  rejected: "Refused",
  revision_requested: "Sent back",
};

export function ApprovalCard({
  approval,
  requesterAgent,
  onApprove,
  onReject,
  onOpen,
  detailLink,
  isPending,
}: {
  approval: Approval;
  requesterAgent: Agent | null;
  onApprove: () => void;
  onReject: () => void;
  onOpen?: () => void;
  detailLink?: string;
  isPending: boolean;
}) {
  const label = typeLabel[approval.type] ?? approval.type;
  const isAwaiting = approval.status === "pending" || approval.status === "revision_requested";
  const statusText = STATUS_LABEL[approval.status] ?? approval.status;

  return (
    <article className="relative border-b border-[var(--boared-rule)] py-6 px-1">
      {/* Stamped status mark — top right */}
      <div
        className={cn(
          "absolute top-4 right-1 inline-flex items-center px-2 py-1 border font-mono text-[0.58rem] uppercase tracking-[0.12em]",
          isAwaiting
            ? "border-foreground text-foreground"
            : approval.status === "approved"
              ? "border-[var(--boared-acid)] text-[var(--boared-acid)]"
              : "border-muted-foreground text-muted-foreground",
        )}
      >
        {statusText}
      </div>

      {/* Petition header — typewritten meta block */}
      <header className="mb-4">
        <div className="boared-label text-foreground mb-1.5">Petition · {label}</div>
        <div className="font-mono text-[0.66rem] uppercase tracking-[0.06em] text-muted-foreground flex items-center gap-2 flex-wrap">
          <span>Filed {timeAgo(approval.createdAt)}</span>
          {requesterAgent && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>By {requesterAgent.name}</span>
            </>
          )}
        </div>
      </header>

      {/* Body — payload */}
      <div className="max-w-[680px] mb-5">
        <ApprovalPayloadRenderer type={approval.type} payload={approval.payload} />
      </div>

      {approval.decisionNote && (
        <div className="max-w-[680px] mb-5 pt-3 border-t border-[var(--boared-rule)]">
          <div className="boared-label text-muted-foreground mb-1">Note</div>
          <p className="font-mono text-[0.74rem] italic text-muted-foreground">
            {approval.decisionNote}
          </p>
        </div>
      )}

      {/* Signature tray — dotted line + approve / reject */}
      {isAwaiting && (
        <div className="max-w-[680px] flex items-end justify-between gap-4 pt-2">
          <div className="flex-1 flex items-end gap-2">
            <span className="boared-label text-muted-foreground pb-0.5">Sign</span>
            <span
              className="flex-1 h-px self-end mb-1.5"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to right, var(--boared-rule) 0 4px, transparent 4px 8px)",
              }}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onReject} disabled={isPending}>
              Refuse
            </Button>
            <Button variant="acid" size="sm" onClick={onApprove} disabled={isPending}>
              Sign off
            </Button>
          </div>
        </div>
      )}

      {/* Detail link */}
      <div className="max-w-[680px] mt-3">
        {detailLink ? (
          <Link
            to={detailLink}
            className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground transition-colors no-underline"
          >
            Open file →
          </Link>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground transition-colors"
          >
            Open file →
          </button>
        )}
      </div>
    </article>
  );
}
