/* ─────────────────────────────────────────────────────────────────────
 *  Compass — orientation indicator for the Deliberation Sphere.
 *
 *  Small circular HUD in the bottom-right that shows which way the
 *  camera is facing, with labeled directions:
 *    · N (top)  = PARENTS direction (+Y)
 *    · E (right) = NOW on the time axis (+X)
 *    · S (bottom) = SUB-MATTERS direction (-Y)
 *    · W (left) = PAST on the time axis (-X)
 *
 *  An inner pointer tracks the camera's current XZ heading so the
 *  user never loses track of which way is "up" when the sphere is
 *  tilted. Click the dial face to reset the camera.
 *
 *  Uses drei's useThree inside a tiny <Html>-free DOM overlay driven
 *  by a ref-based subscription so it only repaints at ~6 fps — no
 *  per-frame React re-renders.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { createPortal } from "react-dom";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

/**
 * Internal R3F component — reads the camera heading on each frame
 * and writes it onto a mutable ref so the DOM overlay can render
 * from it without React re-rendering.
 */
export function CompassInScene({
  headingRef,
  controlsRef,
}: {
  headingRef: React.MutableRefObject<number>;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  useFrame(() => {
    const ctrl = controlsRef.current;
    const target = ctrl?.target;
    const dx = camera.position.x - (target?.x ?? 0);
    const dz = camera.position.z - (target?.z ?? 0);
    // atan2(x, z) so north (+Z toward camera) reads as 0°.
    // We want: heading = angle the camera is LOOKING at in XZ plane.
    const h = Math.atan2(dx, dz);
    headingRef.current = h;
  });
  return null;
}

/**
 * DOM compass overlay. Portal-mounted so it sits above the canvas
 * regardless of the R3F Canvas' own DOM. Updates at ~6 fps via
 * requestAnimationFrame, reading from the headingRef that
 * CompassInScene populates.
 */
export function CompassOverlay({
  headingRef,
  onReset,
  container,
}: {
  headingRef: React.MutableRefObject<number>;
  onReset: () => void;
  container: HTMLElement | null;
}) {
  const pointerRef = useRef<SVGPolygonElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 150) {
        // Throttle to ~6 fps — compass readability doesn't need 60.
        last = now;
        const h = headingRef.current;
        const el = pointerRef.current;
        if (el) {
          // Convert radians → degrees; rotate the pointer so it points
          // toward the direction the camera is looking in world XZ.
          const deg = (h * 180) / Math.PI;
          el.setAttribute("transform", `rotate(${deg} 36 36)`);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [headingRef]);

  if (!container) return null;

  const dial = (
    <div
      className="absolute z-10 pointer-events-auto"
      style={{
        right: 20,
        bottom: 76,
      }}
    >
      <button
        type="button"
        onClick={onReset}
        aria-label="Reset camera to overview"
        title="Reset view (R)"
        className="block rounded-full border"
        style={{
          width: 72,
          height: 72,
          background:
            "color-mix(in oklch, var(--boared-paper, #F2F0EA) 92%, transparent)",
          borderColor: "var(--boared-rule, #D8D6CF)",
          color: "var(--boared-ink, #1A1A18)",
          cursor: "pointer",
          position: "relative",
          boxShadow:
            "0 6px 20px color-mix(in oklch, var(--boared-ink, #1A1A18) 20%, transparent)",
        }}
      >
        <svg
          viewBox="0 0 72 72"
          width={72}
          height={72}
          style={{ display: "block" }}
          aria-hidden="true"
        >
          {/* Outer notches */}
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI) / 4;
            const x1 = 36 + Math.sin(a) * 30;
            const y1 = 36 - Math.cos(a) * 30;
            const x2 = 36 + Math.sin(a) * 34;
            const y2 = 36 - Math.cos(a) * 34;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--boared-rule, #D8D6CF)"
                strokeWidth={1}
              />
            );
          })}
          {/* Cardinal letters */}
          <text
            x={36}
            y={14}
            fontSize={9}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill="var(--boared-ink, #1A1A18)"
            style={{ letterSpacing: "0.15em", fontWeight: 600 }}
          >
            UP
          </text>
          <text
            x={62}
            y={39}
            fontSize={8}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill="var(--boared-ink-soft, #3F3F3A)"
            style={{ letterSpacing: "0.15em" }}
          >
            NOW
          </text>
          <text
            x={36}
            y={63}
            fontSize={8}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill="var(--boared-ink-soft, #3F3F3A)"
            style={{ letterSpacing: "0.15em" }}
          >
            DOWN
          </text>
          <text
            x={10}
            y={39}
            fontSize={8}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill="var(--boared-ink-soft, #3F3F3A)"
            style={{ letterSpacing: "0.15em" }}
          >
            PAST
          </text>
          {/* Pointer — arrow pointing where the camera is looking. */}
          <polygon
            ref={pointerRef}
            points="36,20 32,38 36,34 40,38"
            fill="var(--boared-acid, #B22B1A)"
            transform="rotate(0 36 36)"
          />
          {/* Center dot */}
          <circle
            cx={36}
            cy={36}
            r={2}
            fill="var(--boared-ink, #1A1A18)"
          />
        </svg>
      </button>
    </div>
  );

  return createPortal(dial, container);
}


