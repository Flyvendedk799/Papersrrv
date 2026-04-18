/* ─────────────────────────────────────────────────────────────────────
 *  SelectedPanel — slide-in side panel for the current selection
 *
 *  Renders outside the R3F canvas as absolutely-positioned DOM, so we
 *  get crisp text and access to the existing UI primitives. Content
 *  depends on the kind of target selected.
 * ───────────────────────────────────────────────────────────────────── */

import { useNavigate } from "react-router-dom";
import type { SceneTarget } from "../data/types";
import type { Issue, IssueComment } from "@paperclipai/shared";
import { relativeTime } from "../../../lib/utils";

interface SelectedPanelProps {
  target: SceneTarget | null;
  onClose: () => void;
}

const PANEL_BG = "rgba(8, 8, 12, 0.92)";
const BORDER = "#3B3B4A";
const WARM = "#F5E9CB";
const DIM = "#A89A70";
const ACID = "#FF6B4A";

export function SelectedPanel({ target, onClose }: SelectedPanelProps) {
  const navigate = useNavigate();

  return (
    <div
      className="absolute top-1/2 left-6 md:left-10 z-20 max-w-[460px] pointer-events-none"
      style={{
        transform: target ? "translate(0, -50%)" : "translate(-24px, -50%)",
        opacity: target ? 1 : 0,
        transition:
          "opacity 300ms cubic-bezier(0.2,0.8,0.2,1), transform 300ms cubic-bezier(0.2,0.8,0.2,1)",
      }}
    >
      {target && (
        <div
          className="p-6 pointer-events-auto max-h-[70vh] overflow-y-auto backdrop-blur-md"
          style={{
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            color: WARM,
          }}
        >
          <PanelBody target={target} onNavigate={(to) => navigate(to)} />
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-3 h-8 font-mono text-[0.6rem] uppercase tracking-[0.14em] transition-colors"
              style={{
                border: `1px solid ${DIM}`,
                color: WARM,
                background: "transparent",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelBody({
  target,
  onNavigate,
}: {
  target: SceneTarget;
  onNavigate: (to: string) => void;
}) {
  switch (target.kind) {
    case "issue":
      return <IssueBody issue={target.data} />;
    case "ancestor":
      return (
        <NavigableBody
          kind="Parent matter"
          identifier={target.data.identifier}
          title={target.data.title}
          status={target.data.status}
          onOpen={() => onNavigate(`/issues/${target.data.identifier}`)}
        />
      );
    case "descendant":
      return (
        <NavigableBody
          kind={target.data.kind === "direct" ? "Sub-matter" : "Mentioned matter"}
          identifier={target.data.identifier}
          title={target.data.title}
          status={target.data.status}
          onOpen={() => onNavigate(`/issues/${target.data.identifier}`)}
        />
      );
    case "run": {
      const r = target.data;
      return (
        <div>
          <Kicker>Run · {r.agentName}</Kicker>
          <Headline>{r.runId.slice(0, 12)}</Headline>
          <MetaRow label="Started">{relativeTime(new Date(r.startedAt).toISOString())}</MetaRow>
          <MetaRow label="State">
            <span style={{ color: r.isLive ? ACID : DIM }}>
              {r.payload.status.toUpperCase()}
            </span>
          </MetaRow>
          <MetaRow label="Size">{Math.round(r.sizeRatio * 100)}% of max</MetaRow>
        </div>
      );
    }
    case "comment": {
      const c = target.data.payload as IssueComment;
      return (
        <div>
          <Kicker>
            Correspondence · {target.data.authorName} ·{" "}
            {relativeTime(new Date(target.data.createdAt).toISOString())}
          </Kicker>
          <div
            className="text-[0.86rem] leading-snug whitespace-pre-wrap max-w-[40ch] mt-2"
            style={{ color: WARM, opacity: 0.92 }}
          >
            {c.body}
          </div>
        </div>
      );
    }
    case "event":
      return (
        <div>
          <Kicker>Activity · {target.data.actorName}</Kicker>
          <div className="text-[0.9rem] mt-1" style={{ color: WARM }}>
            {target.data.verb}
          </div>
          <MetaRow label="When">
            {relativeTime(new Date(target.data.createdAt).toISOString())}
          </MetaRow>
        </div>
      );
    case "approval":
      return (
        <div>
          <Kicker>Approval</Kicker>
          <Headline>{target.data.status.toUpperCase()}</Headline>
          <MetaRow label="Requested">
            {relativeTime(new Date(target.data.requestedAt).toISOString())}
          </MetaRow>
          {target.data.decidedAt && (
            <MetaRow label="Decided">
              {relativeTime(new Date(target.data.decidedAt).toISOString())}
            </MetaRow>
          )}
        </div>
      );
  }
}

function IssueBody({ issue }: { issue: Issue }) {
  return (
    <div>
      <Kicker>
        The matter · {(issue.status ?? "").toUpperCase().replace(/_/g, " ")} ·{" "}
        {(issue.priority ?? "").toUpperCase()}
      </Kicker>
      <Headline>{issue.title}</Headline>
      {issue.description && (
        <div
          className="text-[0.84rem] leading-snug whitespace-pre-wrap max-w-[40ch] mt-2"
          style={{ color: WARM, opacity: 0.88 }}
        >
          {issue.description}
        </div>
      )}
    </div>
  );
}

function NavigableBody({
  kind,
  identifier,
  title,
  status,
  onOpen,
}: {
  kind: string;
  identifier: string;
  title: string;
  status: string;
  onOpen: () => void;
}) {
  return (
    <div>
      <Kicker>
        {kind} · § {identifier} · {status.toUpperCase().replace(/_/g, " ")}
      </Kicker>
      <Headline>{title}</Headline>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 inline-flex items-center gap-2 px-3 h-8 font-mono text-[0.62rem] uppercase tracking-[0.12em]"
        style={{
          background: ACID,
          color: "#0A0A10",
          border: `1px solid ${ACID}`,
        }}
      >
        Open matter
      </button>
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-mono text-[0.56rem] uppercase tracking-[0.2em] mb-2"
      style={{ color: DIM }}
    >
      {children}
    </div>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[1.2rem] leading-[1.22] font-semibold max-w-[36ch]"
      style={{ color: WARM }}
    >
      {children}
    </div>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mt-2 flex items-center gap-3 font-mono text-[0.64rem]"
      style={{ color: DIM }}
    >
      <span className="uppercase tracking-[0.1em]">{label}</span>
      <span style={{ color: WARM }}>{children}</span>
    </div>
  );
}
