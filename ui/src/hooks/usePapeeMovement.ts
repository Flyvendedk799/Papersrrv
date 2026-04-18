import { useCallback, useEffect, useRef } from "react";
import { usePapee } from "../context/PapeeContext";
import { telemetry } from "../lib/papee-telemetry";

const TARGET_FPS = 60;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

const STIFFNESS = 0.015;
const DAMPING = 0.9;

const SETTLE_DISTANCE = 0.5;
const SETTLE_VELOCITY = 0.1;
const WALK_THRESHOLD = 3;

interface SafeZone {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface MovementApi {
  moveTo: (x: number, y: number) => void;
  moveToElement: (rect: DOMRect) => void;
  isMoving: boolean;
  stop: () => void;
}

/**
 * RAF-driven spring interpolation between Papee's current position
 * and its target position. Clamps to the provided safe zone (falls
 * back to the viewport) and respects prefers-reduced-motion.
 */
export function usePapeeMovement(safeZone?: SafeZone): MovementApi {
  const papee = usePapee();
  const { position, targetPosition, setPosition, setTargetPosition, setIsMoving, setAnimState } = papee;
  const safeZoneRef = useRef<SafeZone | undefined>(safeZone);
  safeZoneRef.current = safeZone;

  // Refs mirror context state so the RAF loop sees fresh values without re-binding
  const positionRef = useRef(position);
  const targetRef = useRef(targetPosition);
  const velocityRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const lastRenderAtRef = useRef(0);
  const movingRef = useRef(false);
  const animStateRef = useRef(papee.animState);
  const frameCounterRef = useRef(0);
  const reducedMotionLoggedRef = useRef(false);

  positionRef.current = position;
  targetRef.current = targetPosition;
  animStateRef.current = papee.animState;

  useEffect(() => {
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

    function stopLoop() {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    function step(time: number) {
      rafRef.current = requestAnimationFrame(step);

      if (time - lastRenderAtRef.current < FRAME_INTERVAL_MS) return;
      lastRenderAtRef.current = time;

      const current = positionRef.current;
      const target = targetRef.current;
      if (!current || !target) return;

      // Reduced motion: snap instantly
      if (motionMedia.matches) {
        if (!reducedMotionLoggedRef.current) {
          telemetry.log("movement.reducedMotion", { active: true });
          reducedMotionLoggedRef.current = true;
        }
        const jump = Math.hypot(target.x - current.x, target.y - current.y);
        if (jump > 5) {
          telemetry.log("movement.snap", {
            dist: Math.round(jump),
            from: { x: Math.round(current.x), y: Math.round(current.y) },
            to: { x: Math.round(target.x), y: Math.round(target.y) },
          });
        }
        positionRef.current = { x: target.x, y: target.y };
        velocityRef.current = { x: 0, y: 0 };
        setPosition({ x: target.x, y: target.y });
        if (movingRef.current) {
          movingRef.current = false;
          setIsMoving(false);
          if (animStateRef.current === "walking") setAnimState("idle");
        }
        return;
      }

      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);

      const velocity = velocityRef.current;
      velocity.x = (velocity.x + dx * STIFFNESS) * DAMPING;
      velocity.y = (velocity.y + dy * STIFFNESS) * DAMPING;

      const nextX = current.x + velocity.x;
      const nextY = current.y + velocity.y;
      // Clamp to the safe zone (which excludes sidebars/chrome) when
      // we have one, otherwise fall back to the raw viewport. Clamping
      // to the viewport here was the root cause of the spring-vs-reclamp
      // oscillation at edges: the spring would overshoot into the
      // sidebar, PapeeMovementEngine would snap him back, and the two
      // would fight each frame.
      const zone = safeZoneRef.current;
      const minX = zone ? zone.left : 4;
      const minY = zone ? zone.top : 4;
      const maxX = zone ? zone.right - 72 : window.innerWidth - 72;
      const maxY = zone ? zone.bottom - 80 : window.innerHeight - 80;
      const clampedX = Math.max(minX, Math.min(nextX, maxX));
      const clampedY = Math.max(minY, Math.min(nextY, maxY));
      // If the clamp bit, kill the offending velocity component so we
      // don't keep accumulating force into a wall.
      if (clampedX !== nextX) velocity.x = 0;
      if (clampedY !== nextY) velocity.y = 0;
      const nextPos = { x: clampedX, y: clampedY };
      const frameDelta = Math.hypot(nextPos.x - current.x, nextPos.y - current.y);
      positionRef.current = nextPos;
      setPosition(nextPos);

      frameCounterRef.current += 1;
      if (frameCounterRef.current % 6 === 0 && frameDelta > 1) {
        telemetry.log("spring.frame", {
          frame: frameCounterRef.current,
          frameDelta: Math.round(frameDelta * 10) / 10,
          vx: Math.round(velocity.x * 10) / 10,
          vy: Math.round(velocity.y * 10) / 10,
          pos: { x: Math.round(nextPos.x), y: Math.round(nextPos.y) },
          target: { x: Math.round(target.x), y: Math.round(target.y) },
          remaining: Math.round(distance),
        });
      }

      const speed = Math.hypot(velocity.x, velocity.y);
      const settled = distance < SETTLE_DISTANCE && speed < SETTLE_VELOCITY;

      if (settled) {
        // Snap to final — but re-clamp to the current viewport so
        // callers that asked for a target just outside the safe area
        // can't pin Papee off-screen. Mirrors the per-frame clamp.
        const sMaxX = window.innerWidth - 72;
        const sMaxY = window.innerHeight - 80;
        const finalX = Math.max(4, Math.min(target.x, sMaxX));
        const finalY = Math.max(4, Math.min(target.y, sMaxY));
        positionRef.current = { x: finalX, y: finalY };
        velocityRef.current = { x: 0, y: 0 };
        setPosition({ x: finalX, y: finalY });
        if (movingRef.current) {
          movingRef.current = false;
          setIsMoving(false);
          if (animStateRef.current === "walking") setAnimState("idle");
        }
        return;
      }

      if (distance > WALK_THRESHOLD && !movingRef.current) {
        movingRef.current = true;
        setIsMoving(true);
        if (animStateRef.current === "idle" || animStateRef.current === "idle-blink" || animStateRef.current === "idle-look-around") {
          setAnimState("walking");
        }
      }
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      stopLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveTo = useCallback(
    (x: number, y: number) => {
      setTargetPosition({ x, y });
      targetRef.current = { x, y };
    },
    [setTargetPosition],
  );

  const moveToElement = useCallback(
    (rect: DOMRect) => {
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      setTargetPosition({ x, y });
      targetRef.current = { x, y };
    },
    [setTargetPosition],
  );

  const stop = useCallback(() => {
    const cur = positionRef.current;
    if (cur) {
      setTargetPosition({ x: cur.x, y: cur.y });
      targetRef.current = { x: cur.x, y: cur.y };
    }
    velocityRef.current = { x: 0, y: 0 };
    if (movingRef.current) {
      movingRef.current = false;
      setIsMoving(false);
      if (animStateRef.current === "walking") setAnimState("idle");
    }
  }, [setIsMoving, setAnimState, setTargetPosition]);

  return { moveTo, moveToElement, isMoving: papee.isMoving, stop };
}