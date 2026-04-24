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
}

const IFRAME_SRC = "/neurolayer/Mindspace.html";

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
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
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

  /* Push the CASE when the iframe signals ready, and re-push whenever
   * the payload changes. The bridge replaces window.CASE and boots on
   * first message; subsequent messages will update window.CASE but the
   * scene won't re-layout unless we reload — so for mid-session prop
   * changes the simplest path is a soft src refresh. */
  const lastCaseRef = useRef<NeurolayerCase | null>(null);
  useEffect(() => {
    if (!ready) return;
    const cw = iframeRef.current?.contentWindow;
    if (!cw) return;
    if (lastCaseRef.current === null) {
      // First delivery — boot with this payload.
      cw.postMessage({ type: "NEUROLAYER_CASE", case: neurolayerCase }, "*");
      lastCaseRef.current = neurolayerCase;
      return;
    }
    // Subsequent updates — reload the iframe so the scene rebuilds.
    // Cheap: mindspace.js + ui.js are cached, only shaders re-link.
    lastCaseRef.current = neurolayerCase;
    if (iframeRef.current) {
      setReady(false);
      setBooted(false);
      // Force a reload; bridge will handshake again.
      iframeRef.current.src = IFRAME_SRC + "?t=" + Date.now();
    }
  }, [ready, neurolayerCase]);

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ height: minHeight }}
    >
      <iframe
        ref={iframeRef}
        src={IFRAME_SRC}
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
