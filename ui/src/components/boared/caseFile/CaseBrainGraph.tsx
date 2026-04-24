/**
 * CaseBrainGraph — embed the Neurolayer 3D thought-space into the
 * issue page.
 *
 * Neurolayer is a self-contained vanilla Three.js app that lives under
 * `ui/public/neurolayer/`. We iframe it so its DOM, styles, and WebGL
 * context are fully isolated from the React app, then postMessage a
 * CASE payload to it on boot. The iframe's bridge script (see
 * `Mindspace.html`) waits for the message before initialising.
 *
 * Handshake:
 *   iframe 'load'        → we install a message listener
 *   iframe → NEUROLAYER_READY   → we postMessage NEUROLAYER_CASE
 *   iframe → NEUROLAYER_BOOTED  → we know the 3D scene mounted
 *
 * Prop changes trigger a fresh CASE post so the scene updates without a
 * full reload. The iframe is responsible for handling re-injection.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActivityEvent,
  Agent,
  Issue,
  IssueComment,
} from "@paperclipai/shared";
import type { RunForIssue } from "../../../api/activity";
import { cn } from "../../../lib/utils";
import {
  buildNeurolayerCase,
  type NeurolayerCase,
} from "./buildNeurolayerCase";

interface Props {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  loading?: boolean;
  className?: string;
  minHeight?: number;
  live?: boolean;
  /** When true, load Mindspace with `?embed=1` — its bridge adds a
   * `body.embed` class that hides the heavy side panels + timeline so
   * the 3D scene fills a narrow iframe. Leave false in the fullscreen
   * overlay, where there's room for the full chrome. */
  compact?: boolean;
}

const IFRAME_SRC = "/neurolayer/Mindspace.html";
const IFRAME_SRC_COMPACT = "/neurolayer/Mindspace.html?embed=1";

export function CaseBrainGraph({
  issue,
  comments,
  activity,
  childIssues,
  linkedRuns,
  agentMap,
  loading,
  className,
  minHeight = 640,
  live,
  compact,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const postedForRef = useRef<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [ready, setReady] = useState(false);

  /* Compute the CASE lazily. Pure function; cheap enough to rebuild on
   * any input change. Maps + Sets survive structured clone, so
   * postMessage transfers the whole payload intact. */
  const neurolayerCase = useMemo<NeurolayerCase>(
    () =>
      buildNeurolayerCase({
        issue,
        comments,
        activity,
        childIssues,
        linkedRuns,
        agentMap,
      }),
    [issue, comments, activity, childIssues, linkedRuns, agentMap],
  );

  /* Listen for bridge handshake. The iframe's onload fires before its
   * internal scripts execute, so we have to listen globally and filter
   * by source. */
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string } | null;
      if (!data || typeof data.type !== "string") return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (data.type === "NEUROLAYER_READY") setReady(true);
      if (data.type === "NEUROLAYER_BOOTED") setBooted(true);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /* Reset boot gates when the issue changes — the iframe is keyed on
   * issue.id and about to remount, so pending state from the previous
   * scene shouldn't leak into the veil or the posted-ref. */
  useEffect(() => {
    setReady(false);
    setBooted(false);
    postedForRef.current = null;
  }, [issue.id]);

  /* Deliver the CASE exactly once per issue. The Neurolayer engine is
   * snapshot-based — it reads window.CASE once on boot and builds the
   * scene from it. Previously we reloaded the iframe on every payload
   * change, which triggered a boot-loop because React Query refetches
   * produce a new `neurolayerCase` object identity even when the data
   * is unchanged. Instead: post once per issue.id. If the user opens a
   * different issue this component is unmounted/remounted by React's
   * keyed reconciliation, and the new mount boots cleanly. */
  useEffect(() => {
    if (!ready) return;
    if (postedForRef.current === issue.id) return;
    const cw = iframeRef.current?.contentWindow;
    if (!cw) return;
    cw.postMessage({ type: "NEUROLAYER_CASE", case: neurolayerCase }, "*");
    postedForRef.current = issue.id;
  }, [ready, issue.id, neurolayerCase]);

  return (
    <div
      className={cn("relative w-full", className)}
      // When a numeric minHeight is given we size inline; when the
      // caller passes minHeight=0 we defer to the className (e.g.
      // `h-full` inside the fullscreen overlay). Inline style always
      // beats class, so setting `height: 0` would blank the overlay.
      style={minHeight ? { height: minHeight } : undefined}
    >
      <iframe
        // Keying on the issue id makes React unmount + remount the
        // iframe when the user navigates to a different issue, so the
        // fresh mount does a clean handshake + CASE post for the new
        // scene instead of trying to live-swap into a stale one.
        key={`${issue.id}:${compact ? "c" : "f"}`}
        ref={iframeRef}
        src={compact ? IFRAME_SRC_COMPACT : IFRAME_SRC}
        title="Case thought space"
        className="w-full h-full border-0 block bg-[#1A1815]"
        allow="fullscreen"
      />
      {(!booted || loading) && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-[#1A1815]/60 backdrop-blur-sm">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[#F2E6C4]/70 animate-pulse">
            {loading ? "Synthesising…" : "Mounting thought space…"}
          </span>
        </div>
      )}
      {live && (
        <div className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-2 h-6 bg-[#1A1815]/85 border border-[#FF6B4A] font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[#FF6B4A]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#FF6B4A] opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#FF6B4A]" />
          </span>
          Live
        </div>
      )}
    </div>
  );
}
