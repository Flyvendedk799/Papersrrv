import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePapeeOptional } from "../context/PapeeContext";
import { usePapeeNavigation } from "./usePapeePosition";
import { usePapeeTargetRegistryOptional } from "../context/PapeeTargetRegistry";
import { usePapeePointing } from "./usePapeePointing";
import { usePapeeLayoutAwareness } from "./usePapeeLayoutAwareness";
import { PAGE_STATIONS, resolveStation } from "../lib/papee-stations";
import { useCompany } from "../context/CompanyContext";
import type { PapeeHealthCheck } from "../api/papee";

const MIN_TICK_MS = 5000;
const MAX_TICK_MS = 9000;
const SPEECH_COOLDOWN_MS = 15_000;
const USER_INTERACTION_COOLDOWN_MS = 3000;
const IDLE_PATROL_THRESHOLD_MS = 10_000;
const WANDER_CHANCE = 0.35; // 35% chance per tick to wander even when user is active
const PAPEE_CHAR_SIZE = { width: 56, height: 72 };

/**
 * The main Papee behavior loop — ticks every 4-6 seconds and decides what
 * Papee should do given current mood, health, visible targets and page.
 *
 * This is the "AI brain" that orchestrates Phases 1-5 into continuous,
 * context-aware behavior. It never interrupts the user: it respects
 * interaction cooldowns, chat/modal state, muted reactions and mobile.
 */
export function usePapeeBehaviorLoop() {
  const papee = usePapeeOptional();
  const pageInfo = usePapeeNavigation();
  const registry = usePapeeTargetRegistryOptional();
  const { pointAt, lookAt } = usePapeePointing();
  const { safeZone, modalOpen, isMobile } = usePapeeLayoutAwareness();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const lastSpeechAtRef = useRef(0);
  const lastUserInteractionAtRef = useRef(0);
  const lastActivityAtRef = useRef(Date.now());
  const patrolIndexRef = useRef(0);
  const recentTargetIdsRef = useRef<Set<string>>(new Set());

  // Mirror frequently-changing values into refs so the interval effect
  // doesn't re-run when they change (position, safeZone, etc)
  const papeeRef = useRef(papee);
  papeeRef.current = papee;
  const safeZoneRef = useRef(safeZone);
  safeZoneRef.current = safeZone;
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const pointAtRef = useRef(pointAt);
  pointAtRef.current = pointAt;
  const lookAtRef = useRef(lookAt);
  lookAtRef.current = lookAt;
  const companyIdRef = useRef(selectedCompanyId);
  companyIdRef.current = selectedCompanyId;
  const pageRef = useRef(pageInfo.page);
  pageRef.current = pageInfo.page;
  const modalOpenRef = useRef(modalOpen);
  modalOpenRef.current = modalOpen;

  // Track user interaction (click / key / scroll / mousemove)
  useEffect(() => {
    function markInteraction() {
      const now = Date.now();
      lastUserInteractionAtRef.current = now;
      lastActivityAtRef.current = now;
    }
    window.addEventListener("click", markInteraction);
    window.addEventListener("keydown", markInteraction);
    window.addEventListener("scroll", markInteraction, { passive: true, capture: true });
    window.addEventListener("mousemove", markInteraction, { passive: true });
    return () => {
      window.removeEventListener("click", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      window.removeEventListener("scroll", markInteraction, { capture: true });
      window.removeEventListener("mousemove", markInteraction);
    };
  }, []);

  // Clear recent-target cache and reset patrol when page changes.
  useEffect(() => {
    recentTargetIdsRef.current.clear();
    patrolIndexRef.current = 0;
  }, [pageInfo.page]);

  // The main interval effect only depends on isMobile (stable) and muteReactions.
  // Everything else is read via refs so effect doesn't tear down on every re-render.
  const muteReactions = papee?.prefs.muteReactions ?? false;

  useEffect(() => {
    if (isMobile || muteReactions) return;

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function schedule() {
      if (cancelled) return;
      const delay = MIN_TICK_MS + Math.random() * (MAX_TICK_MS - MIN_TICK_MS);
      timerId = setTimeout(tick, delay);
    }

    function tick() {
      if (cancelled) return;
      const p = papeeRef.current;
      if (!p) { schedule(); return; }

      // Don't run when chat open or modal open
      if (p.chatOpen || modalOpenRef.current) { schedule(); return; }

      const now = Date.now();
      const sinceInteraction = now - lastUserInteractionAtRef.current;
      if (sinceInteraction < USER_INTERACTION_COOLDOWN_MS) { schedule(); return; }

      const health = queryClient.getQueryData<PapeeHealthCheck>([
        "papee",
        "health",
        companyIdRef.current,
      ]);

      const reg = registryRef.current;
      const visibleTargets = reg?.getVisibleTargets() ?? [];
      const canSpeak = now - lastSpeechAtRef.current >= SPEECH_COOLDOWN_MS;

      // 1. Urgent mood + critical health issue → point & alarm.
      if (p.mood === "urgent" && health) {
        const errorIssue = health.issues.find((i) => i.severity === "critical");
        if (errorIssue) {
          const targetCategory = errorIssue.type === "agent_error" ? "agent" : "issue";
          const matchingTarget = visibleTargets.find(
            (t) => t.category === targetCategory && !recentTargetIdsRef.current.has(t.id),
          );
          if (matchingTarget) {
            recentTargetIdsRef.current.add(matchingTarget.id);
            pointAtRef.current(matchingTarget.id);
            if (canSpeak) {
              p.showSpeechBubble(`Look! ${errorIssue.message}`, 4000);
              lastSpeechAtRef.current = now;
            }
            p.queueReaction("alarmed", 3000);
            schedule();
            return;
          }
        }
      }

      // 2. Alert mood + warning → look + thinking pose.
      if (p.mood === "alert" && health) {
        const warning = health.issues.find((i) => i.severity === "warn");
        if (warning) {
          const matchingTarget = visibleTargets.find((t) => !recentTargetIdsRef.current.has(t.id));
          if (matchingTarget) {
            recentTargetIdsRef.current.add(matchingTarget.id);
            lookAtRef.current(matchingTarget.id);
            p.queueReaction("thinking", 2500);
            if (canSpeak) {
              p.showSpeechBubble(warning.message, 3500);
              lastSpeechAtRef.current = now;
            }
            schedule();
            return;
          }
        }
      }

      // 3. User idle >10s → deterministic patrol between page stations.
      const sinceActivity = now - lastActivityAtRef.current;
      if (sinceActivity > IDLE_PATROL_THRESHOLD_MS) {
        const stations = PAGE_STATIONS[pageRef.current] ?? PAGE_STATIONS.other ?? [];
        if (stations.length > 1) {
          patrolIndexRef.current = (patrolIndexRef.current + 1) % stations.length;
          const nextStation = stations[patrolIndexRef.current];
          if (nextStation) {
            const resolved = resolveStation(nextStation, safeZoneRef.current, PAPEE_CHAR_SIZE);
            p.setTargetPosition(resolved);
          }
        }
        schedule();
        return;
      }

      // 4. Ambient wander — even while user is active, occasionally move to a new station.
      if (Math.random() < WANDER_CHANCE) {
        const stations = PAGE_STATIONS[pageRef.current] ?? PAGE_STATIONS.other ?? [];
        if (stations.length > 1) {
          const randomIdx = Math.floor(Math.random() * stations.length);
          const station = stations[randomIdx];
          if (station) {
            const resolved = resolveStation(station, safeZoneRef.current, PAPEE_CHAR_SIZE);
            p.setTargetPosition(resolved);
          }
        }
      }

      // 5. Scan behavior — occasional gaze shifts to visible targets.
      if (visibleTargets.length > 1 && Math.random() < 0.4) {
        const randomTarget = visibleTargets[Math.floor(Math.random() * visibleTargets.length)];
        if (randomTarget && !recentTargetIdsRef.current.has(randomTarget.id)) {
          lookAtRef.current(randomTarget.id);
        }
      }

      schedule();
    }

    schedule();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [isMobile, muteReactions, queryClient]);
}