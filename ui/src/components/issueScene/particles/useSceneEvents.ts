/**
 * useSceneEvents — diff successive IssueGraph snapshots into a stream of
 * "events" that the particle field reacts to.
 *
 * What qualifies as an event:
 *   - A new run appeared (RUN_STARTED)
 *   - A new comment appeared (COMMENT_POSTED)
 *   - A new approval appeared / status changed (APPROVAL_DECIDED)
 *   - A new causal link kind="spawn" appeared (SUBISSUE_SPAWNED — drives
 *     the branching wave effect in M4)
 *
 * The hook returns two things:
 *   - eventQueue: recently-observed events, each tagged with a decaying
 *     heat value (0..1) so ParticleField can bias wave-particle density
 *     toward recently-active edges.
 *   - recentlyActive: a Set<edgeId> for quick lookup during seeding.
 *
 * Events older than STALE_MS are ignored to avoid firing a storm of
 * backdated pulses when react-query refetches on focus/reconnect.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { IssueGraph } from "../data/types";
import { EventKind } from "./types";

export interface SceneEvent {
  kind: EventKind;
  /** Domain id of the source node (agent / issue / run). */
  sourceDomainId: string;
  /** Domain id of the target node (comment / run / approval / sub-issue). */
  targetDomainId: string;
  /** Timestamp (ms since epoch). */
  at: number;
  /** Decay-damped heat, 1.0 when fresh, approaches 0 after FADE_MS. */
  heat: number;
}

/** Ignore events older than this (prevents refetch storms). */
const STALE_MS = 5 * 60 * 1000;
/** Event heat fades to 0 over this window. */
const FADE_MS = 4 * 1000;
/** Max concurrent events retained. */
const MAX_QUEUE = 64;

export interface SceneEventsOutput {
  eventQueue: SceneEvent[];
  /** Set of target domain ids touched in the last FADE_MS window. */
  recentlyActive: Set<string>;
  /** Monotonic counter — changes each time a new event is emitted. Useful
   *  as a useEffect dependency when ParticleField needs to re-seed. */
  changeToken: number;
}

export function useSceneEvents(graph: IssueGraph | undefined): SceneEventsOutput {
  const prevRef = useRef<{
    runIds: Set<string>;
    commentIds: Set<string>;
    approvalIds: Set<string>;
    spawnKeys: Set<string>;
  }>({ runIds: new Set(), commentIds: new Set(), approvalIds: new Set(), spawnKeys: new Set() });

  const queueRef = useRef<SceneEvent[]>([]);
  const [changeToken, setChangeToken] = useState(0);

  useEffect(() => {
    if (!graph) return;
    const now = Date.now();
    const events: SceneEvent[] = [];
    const prev = prevRef.current;

    // RUN_STARTED — new run id.
    const newRunIds = new Set<string>();
    for (const r of graph.runs) {
      newRunIds.add(r.runId);
      if (!prev.runIds.has(r.runId)) {
        const at = r.startedAt || now;
        if (now - at <= STALE_MS) {
          events.push({
            kind: EventKind.RunStarted,
            sourceDomainId: graph.root.id,
            targetDomainId: r.runId,
            at,
            heat: 1,
          });
        }
      }
    }

    // COMMENT_POSTED
    const newCommentIds = new Set<string>();
    for (const c of graph.comments) {
      newCommentIds.add(c.id);
      if (!prev.commentIds.has(c.id)) {
        const at = c.createdAt || now;
        if (now - at <= STALE_MS) {
          events.push({
            kind: EventKind.CommentPosted,
            sourceDomainId: c.author,
            targetDomainId: c.id,
            at,
            heat: 1,
          });
        }
      }
    }

    // APPROVAL_DECIDED
    const newApprovalIds = new Set<string>();
    for (const a of graph.approvals) {
      newApprovalIds.add(a.id);
      if (!prev.approvalIds.has(a.id)) {
        const at = a.decidedAt || a.requestedAt || now;
        if (now - at <= STALE_MS) {
          events.push({
            kind: EventKind.ApprovalDecided,
            sourceDomainId: graph.root.id,
            targetDomainId: a.id,
            at,
            heat: 1,
          });
        }
      }
    }

    // SUBISSUE_SPAWNED — new "spawn" causal link
    const newSpawnKeys = new Set<string>();
    for (const link of graph.causalLinks) {
      if (link.targetKind !== "spawn") continue;
      const key = `${link.sourceId}->${link.targetId}`;
      newSpawnKeys.add(key);
      if (!prev.spawnKeys.has(key)) {
        events.push({
          kind: EventKind.SubissueSpawned,
          sourceDomainId: link.sourceId,
          targetDomainId: link.targetId,
          at: now, // causal link timestamp not exposed; use now
          heat: 1,
        });
      }
    }

    prevRef.current = {
      runIds: newRunIds,
      commentIds: newCommentIds,
      approvalIds: newApprovalIds,
      spawnKeys: newSpawnKeys,
    };

    if (events.length > 0) {
      // Cap emission rate — if a refetch dumps too many at once, keep the
      // freshest. Without this a reconnect could produce a visible storm.
      const fresh = events
        .sort((a, b) => b.at - a.at)
        .slice(0, 20);
      // Merge with existing queue, drop stale + over-capacity.
      const merged = [...fresh, ...queueRef.current]
        .filter((e) => now - e.at < FADE_MS + STALE_MS)
        .slice(0, MAX_QUEUE);
      queueRef.current = merged;
      setChangeToken((t) => t + 1);
    }
  }, [graph]);

  // Decay heat every 200ms — cheap setInterval, only fires when the
  // component is mounted and an event has been queued.
  useEffect(() => {
    if (queueRef.current.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      let changed = false;
      queueRef.current = queueRef.current
        .map((e) => {
          const age = now - e.at;
          const heat = Math.max(0, 1 - age / FADE_MS);
          if (heat !== e.heat) changed = true;
          return { ...e, heat };
        })
        .filter((e) => e.heat > 0);
      if (changed && queueRef.current.length === 0) setChangeToken((t) => t + 1);
    }, 250);
    return () => clearInterval(id);
  }, [changeToken]);

  const recentlyActive = useMemo(() => {
    const now = Date.now();
    const set = new Set<string>();
    for (const e of queueRef.current) {
      if (now - e.at < FADE_MS) set.add(e.targetDomainId);
    }
    return set;
  }, [changeToken]);

  return {
    eventQueue: queueRef.current,
    recentlyActive,
    changeToken,
  };
}
