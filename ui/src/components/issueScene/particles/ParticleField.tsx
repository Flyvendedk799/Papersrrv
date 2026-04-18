/**
 * ParticleField — the neuron-native particle system.
 *
 * M1: each particle is assigned a `homeNodeId` at seed time and, per frame,
 * feels an attraction force toward that node's centroid (sampled from the
 * graph nodeTex uniform inside the sim shader). Result: 16k+ particles
 * form density clusters around each issue/run/comment/approval/sub-issue,
 * replacing the discrete orbit meshes with one breathing tissue.
 *
 * See plan: /Users/tobiasmastek/.claude/plans/gleaming-cooking-blanket.md
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { IssueGraph } from "../data/types";
import {
  buildGraphTextures,
  disposeBundle,
  assignHomeNodeIds,
  type GraphTextureBundle,
} from "./graphTextures";
import {
  PingPongRT,
  buildSeedTexture,
  detectGpgpuSupport,
  runPass,
} from "./gpgpu";
import {
  SIM_FIELD_POSITION_FS,
  SIM_FIELD_VELOCITY_FS,
  SIM_FIELD_VS,
} from "./simFieldShader";
import { RENDER_FS, RENDER_VS } from "./renderShader";
import type { ParticleBudget, ParticleTier } from "./types";
import { Role, budgetFor } from "./types";
import { useSceneEvents } from "./useSceneEvents";
import { useParticleBudget } from "./useParticleBudget";

interface ParticleFieldProps {
  /** Optional tier override — when omitted, tier is auto-detected + adaptive. */
  tier?: ParticleTier;
  /** Issue graph. When provided, particles home to real node centroids. */
  graph?: IssueGraph;
  /** Global brightness multiplier. */
  brightness?: number;
  /** Base point size (pre-depth-attenuation). */
  pointScale?: number;
  /** When false, skip all sim passes (for offscreen). */
  active?: boolean;
  /** True for the sticky mini-scene — forces the 5k mini tier. */
  isMini?: boolean;
}

const MAX_NODES_UNIFORM = 256;
const MAX_EDGES_UNIFORM = 512;
const MAX_GROUPS_UNIFORM = 64;

export function ParticleField({
  tier: tierOverride,
  graph,
  brightness = 1.0,
  pointScale = 1.0,
  active = true,
  isMini = false,
}: ParticleFieldProps) {
  const { gl } = useThree();

  const support = useMemo(() => detectGpgpuSupport(gl), [gl]);
  const budgetCtx = useParticleBudget(gl, { isMini, override: tierOverride });
  const tier = budgetCtx.tier;
  const budget = useMemo(() => budgetFor({ tier }), [tier]);
  const simActive = active && !budgetCtx.reducedMotion && budgetCtx.gpgpuActive;

  // If the WebGL context is already lost at mount (common in headless /
  // context-exhausted preview environments), render nothing and don't
  // allocate GPU resources. A real browser will not hit this path.
  const initialContextLost = useMemo(() => {
    const raw = gl.getContext();
    return !!(raw && raw.isContextLost && raw.isContextLost());
  }, [gl]);

  // Detect new events from graph diffs; re-seed wave particles when events fire.
  const { recentlyActive, eventQueue, changeToken } = useSceneEvents(graph);

  // Ping-pong render targets — recreated on tier change, disposed on unmount.
  const rts = useMemo(() => {
    if (!support.usable || initialContextLost) return null;
    const size = budget.gridSize;
    const pos = new PingPongRT(size, support.textureType, "pos");
    const vel = new PingPongRT(size, support.textureType, "vel");
    const state = new PingPongRT(size, support.textureType, "state");
    return { pos, vel, state, size };
  }, [support.usable, support.textureType, budget.gridSize, initialContextLost]);

  // Scene objects (geometry + materials) — stable across graph changes.
  const scene = useMemo(
    () => buildScene(budget, brightness, pointScale),
    [budget, brightness, pointScale],
  );

  // Graph textures — rebuilt when graph topology changes.
  const bundleRef = useRef<GraphTextureBundle | null>(null);
  useEffect(() => {
    // Dispose the old bundle first to avoid GPU texture leaks.
    disposeBundle(bundleRef.current);
    bundleRef.current = graph ? buildGraphTextures(graph) : null;

    const nodeTex = bundleRef.current?.nodeTex ?? null;
    const colorTex = bundleRef.current?.nodeColorTex ?? null;
    const edgeTex = bundleRef.current?.edgeTex ?? null;
    const groupTex = bundleRef.current?.groupTex ?? null;
    const nodeCount = bundleRef.current?.nodeCount ?? 0;
    const edgeCount = bundleRef.current?.edgeCount ?? 0;

    scene.simVelMat.uniforms.uNodeTex.value = nodeTex;
    scene.simPosMat.uniforms.uNodeTex.value = nodeTex;
    scene.simVelMat.uniforms.uEdgeTex.value = edgeTex;
    scene.simPosMat.uniforms.uEdgeTex.value = edgeTex;
    scene.simVelMat.uniforms.uGroupTex.value = groupTex;
    scene.simPosMat.uniforms.uGroupTex.value = groupTex;
    scene.simVelMat.uniforms.uNodeCount.value = nodeCount;
    scene.simPosMat.uniforms.uNodeCount.value = nodeCount;
    scene.simVelMat.uniforms.uEdgeCount.value = edgeCount;
    scene.simPosMat.uniforms.uEdgeCount.value = edgeCount;
    scene.renderMaterial.uniforms.uNodeColorTex.value = colorTex;

    // Dev probe — lets tests / screenshots verify the bundle is live.
    if (typeof window !== "undefined") {
      (window as unknown as { __particleFieldGraph?: unknown }).__particleFieldGraph = {
        nodeCount,
        edgeCount: bundleRef.current?.edgeCount ?? 0,
        sampleNodes: bundleRef.current?.nodes.slice(0, 5).map((n) => ({
          kind: n.kind,
          id: n.domainId,
          pos: n.pos,
        })),
      };
    }
  }, [graph, scene]);

  // Seed the RTs when RTs are ready AND when graph changes (so homeNodeIds are current).
  // `changeToken` bumps when new events fire, triggering a targeted wave re-seed so
  // recent events produce a visible pulse burst.
  useEffect(() => {
    if (!rts) return;
    seedParticles(gl, rts, budget, bundleRef.current, recentlyActive, eventQueue);
    if (typeof window !== "undefined") {
      (window as unknown as { __particleFieldMounted?: unknown }).__particleFieldMounted = {
        tier: budget.tier,
        total: budget.total,
        grid: budget.gridSize,
        support: { webgl2: support.webgl2, float: support.float, halfFloat: support.halfFloat },
        mountedAt: Date.now(),
      };
    }
  }, [gl, rts, budget, support, graph, changeToken, recentlyActive]);

  // Handle webglcontextlost / webglcontextrestored.
  useEffect(() => {
    if (!rts) return;
    const canvas = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
    };
    const onRestored = () => {
      seedParticles(gl, rts, budget, bundleRef.current, recentlyActive, eventQueue);
    };
    canvas.addEventListener("webglcontextlost", onLost, false);
    canvas.addEventListener("webglcontextrestored", onRestored, false);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, rts, budget, recentlyActive, eventQueue]);

  // Pixel-ratio updates (external monitor plug).
  useEffect(() => {
    scene.renderMaterial.uniforms.uPixelRatio.value = gl.getPixelRatio();
  }, [gl, scene]);

  // Per-frame sim. Priority -1 runs BEFORE R3F's main render pass.
  const lastRef = useRef<number>(0);
  useFrame((state) => {
    if (!rts) return;
    // Guard against lost contexts — skip sim passes entirely so we don't
    // thrash WebGL while the driver is recovering.
    const rawGl = gl.getContext();
    if (rawGl && rawGl.isContextLost && rawGl.isContextLost()) return;
    if (!simActive) {
      // Reduced motion / inactive — render the current frozen field once.
      scene.renderMaterial.uniforms.tPos.value = rts.pos.current.texture;
      scene.renderMaterial.uniforms.tVel.value = rts.vel.current.texture;
      scene.renderMaterial.uniforms.tState.value = rts.state.current.texture;
      return;
    }

    const now = state.clock.getElapsedTime();
    const dt = lastRef.current === 0 ? 1 / 60 : Math.min(0.033, now - lastRef.current);
    lastRef.current = now;

    // Velocity pass — reads prev pos/vel/state + nodeTex, writes next vel.
    scene.simVelMat.uniforms.tPrevPos.value = rts.pos.current.texture;
    scene.simVelMat.uniforms.tPrevVel.value = rts.vel.current.texture;
    scene.simVelMat.uniforms.tPrevState.value = rts.state.current.texture;
    scene.simVelMat.uniforms.uDt.value = dt;
    scene.simVelMat.uniforms.uTime.value = now;
    runPass(gl, scene.simVelMat, rts.vel.next);
    rts.vel.swap();

    // Position pass — reads prev pos + the just-written vel.
    scene.simPosMat.uniforms.tPrevPos.value = rts.pos.current.texture;
    scene.simPosMat.uniforms.tPrevVel.value = rts.vel.current.texture;
    scene.simPosMat.uniforms.tPrevState.value = rts.state.current.texture;
    scene.simPosMat.uniforms.uDt.value = dt;
    scene.simPosMat.uniforms.uTime.value = now;
    runPass(gl, scene.simPosMat, rts.pos.next);
    rts.pos.swap();

    scene.renderMaterial.uniforms.tPos.value = rts.pos.current.texture;
    scene.renderMaterial.uniforms.tVel.value = rts.vel.current.texture;
    scene.renderMaterial.uniforms.tState.value = rts.state.current.texture;
  }, -1);

  // Cleanup
  useEffect(() => {
    return () => {
      rts?.pos.dispose();
      rts?.vel.dispose();
      rts?.state.dispose();
      scene.renderMaterial.dispose();
      scene.simPosMat.dispose();
      scene.simVelMat.dispose();
      scene.pointsGeom.dispose();
      disposeBundle(bundleRef.current);
      bundleRef.current = null;
    };
  }, [rts, scene]);

  return (
    <points
      geometry={scene.pointsGeom}
      material={scene.renderMaterial}
      frustumCulled={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Scene construction
// ---------------------------------------------------------------------------

interface BuiltScene {
  pointsGeom: THREE.BufferGeometry;
  renderMaterial: THREE.ShaderMaterial;
  simPosMat: THREE.ShaderMaterial;
  simVelMat: THREE.ShaderMaterial;
}

function buildScene(
  budget: ParticleBudget,
  brightness: number,
  pointScale: number,
): BuiltScene {
  const size = budget.gridSize;
  const count = size * size;

  // Per-vertex UV into the ping-pong grid.
  const indexArray = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const x = i % size;
    const y = Math.floor(i / size);
    indexArray[i * 2] = (x + 0.5) / size;
    indexArray[i * 2 + 1] = (y + 0.5) / size;
  }

  const pointsGeom = new THREE.BufferGeometry();
  pointsGeom.setAttribute("aIndex", new THREE.BufferAttribute(indexArray, 2));
  pointsGeom.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(count * 3), 3),
  );
  pointsGeom.setDrawRange(0, count);
  pointsGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const renderMaterial = new THREE.ShaderMaterial({
    vertexShader: RENDER_VS,
    fragmentShader: RENDER_FS,
    uniforms: {
      tPos: { value: null },
      tVel: { value: null },
      tState: { value: null },
      uNodeColorTex: { value: null },
      uMaxNodes: { value: MAX_NODES_UNIFORM },
      uPixelRatio: { value: typeof window !== "undefined" ? window.devicePixelRatio : 1 },
      uPointScale: { value: pointScale },
      uBrightness: { value: brightness },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const simUniforms = () => ({
    tPrevPos: { value: null },
    tPrevVel: { value: null },
    tPrevState: { value: null },
    uNodeTex: { value: null },
    uEdgeTex: { value: null },
    uGroupTex: { value: null },
    uNodeCount: { value: 0 },
    uEdgeCount: { value: 0 },
    uMaxNodes: { value: MAX_NODES_UNIFORM },
    uMaxEdges: { value: MAX_EDGES_UNIFORM },
    uMaxGroups: { value: MAX_GROUPS_UNIFORM },
    uDt: { value: 1 / 60 },
    uTime: { value: 0 },
  });

  const simPosMat = new THREE.ShaderMaterial({
    vertexShader: SIM_FIELD_VS,
    fragmentShader: SIM_FIELD_POSITION_FS,
    uniforms: simUniforms(),
    depthTest: false,
    depthWrite: false,
  });

  const simVelMat = new THREE.ShaderMaterial({
    vertexShader: SIM_FIELD_VS,
    fragmentShader: SIM_FIELD_VELOCITY_FS,
    uniforms: simUniforms(),
    depthTest: false,
    depthWrite: false,
  });

  return { pointsGeom, renderMaterial, simPosMat, simVelMat };
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

function seedParticles(
  gl: THREE.WebGLRenderer,
  rts: { pos: PingPongRT; vel: PingPongRT; state: PingPongRT; size: number },
  budget: ParticleBudget,
  bundle: GraphTextureBundle | null,
  recentlyActive: Set<string>,
  eventQueue: import("./useSceneEvents").SceneEvent[],
): void {
  const { size } = rts;

  // Precompute home-node assignment if we have a graph.
  const homeIds = bundle
    ? assignHomeNodeIds(budget.field, bundle.nodes)
    : null;

  // Live-edge assignment for wave particles. We distribute the wave
  // budget across live-pulse edges so each one carries ~8 rolling droplets
  // (staggered phase) — replaces the old Synapses + NetworkFiring pools.
  const waveAssignments = bundle
    ? assignWaveParticles(budget.wave, bundle, recentlyActive, eventQueue)
    : [];

  const positions = buildSeedTexture(size, (i, out) => {
    if (i >= budget.total) {
      out[0] = 1e6;
      out[1] = 1e6;
      out[2] = 1e6;
      out[3] = 0;
      return;
    }
    if (homeIds && i < budget.field && bundle && bundle.nodeCount > 0) {
      const n = bundle.nodes[homeIds[i]];
      // Scatter in a small sphere around the home node so particles
      // arrive at the cluster immediately rather than drifting from origin.
      const r = 0.6 + Math.random() * 1.2;
      const phi = Math.random() * Math.PI * 2;
      const cosT = Math.random() * 2 - 1;
      const sinT = Math.sqrt(1 - cosT * cosT);
      out[0] = n.pos[0] + sinT * Math.cos(phi) * r;
      out[1] = n.pos[1] + cosT * r * 0.7;
      out[2] = n.pos[2] + sinT * Math.sin(phi) * r;
      out[3] = 0; // birthTime
    } else {
      // No-graph fallback: spherical shell around origin (M0 behavior).
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 5 + Math.random() * 13;
      out[0] = s * Math.cos(phi) * r;
      out[1] = u * r * 0.7;
      out[2] = s * Math.sin(phi) * r;
      out[3] = 0;
    }
  });

  const velocities = buildSeedTexture(size, (i, out) => {
    if (i >= budget.total) {
      out[3] = 0;
      return;
    }
    if (i >= budget.field) {
      // Wave slot. Encode (t, speed, _, lifetime) per shader contract.
      const waveIdx = i - budget.field;
      const assn = waveAssignments[waveIdx];
      if (assn) {
        out[0] = assn.t0; // staggered initial t
        out[1] = assn.speed;
        out[2] = 0;
        out[3] = 1; // alive
      } else {
        // No live edge to ride — park as dead.
        out[3] = 0;
      }
      return;
    }
    out[0] = (Math.random() - 0.5) * 0.5;
    out[1] = (Math.random() - 0.5) * 0.25;
    out[2] = (Math.random() - 0.5) * 0.5;
    out[3] = 1; // lifetime
  });

  const states = buildSeedTexture(size, (i, out) => {
    if (i >= budget.total) {
      out[0] = Role.Dead;
      return;
    }
    if (i >= budget.field) {
      const waveIdx = i - budget.field;
      const assn = waveAssignments[waveIdx];
      if (assn) {
        out[0] = Role.Wave;
        out[1] = assn.edgeIdx;
        out[2] = 0;
        out[3] = 0;
      } else {
        out[0] = Role.Dead;
      }
      return;
    }
    out[0] = Role.Field;
    out[1] = homeIds ? homeIds[i] : 0;
    out[2] = 0;
    out[3] = 0;
  });

  rts.pos.seed(gl, positions);
  rts.vel.seed(gl, velocities);
  rts.state.seed(gl, states);

  positions.dispose();
  velocities.dispose();
  states.dispose();
}

interface WaveAssignment {
  edgeIdx: number;
  t0: number;      // initial t ∈ [0,1)
  speed: number;   // 1 / duration (s⁻¹) — varies to avoid lockstep
}

/**
 * Distribute `waveCount` particles across edges, weighted by:
 *   - livePulse flag (3× base weight)
 *   - strength (0..1 multiplier)
 *   - recentlyActive set (5× boost for 4s after an event fires)
 *
 * Particles on a given edge are phase-staggered so each edge reads as a
 * continuous flowing stream.
 */
function assignWaveParticles(
  waveCount: number,
  bundle: GraphTextureBundle,
  recentlyActive: Set<string>,
  eventQueue: import("./useSceneEvents").SceneEvent[],
): WaveAssignment[] {
  if (waveCount <= 0 || bundle.edgeCount === 0) return [];

  // Build a (source,target) → max-heat lookup for spawn events so we can
  // pick them out for the branching-wave effect (dense + fast).
  const spawnHeat = new Map<string, number>();
  for (const ev of eventQueue) {
    if (ev.kind !== 5 /* EventKind.SubissueSpawned */) continue;
    const key = ev.sourceDomainId + "->" + ev.targetDomainId;
    spawnHeat.set(key, Math.max(ev.heat, spawnHeat.get(key) ?? 0));
  }

  // Weight each edge.
  const weights = new Float32Array(bundle.edgeCount);
  const spawnBoosts = new Float32Array(bundle.edgeCount);
  let totalWeight = 0;
  for (let i = 0; i < bundle.edgeCount; i += 1) {
    const e = bundle.edges[i];
    let w = 0.4 + e.strength * 0.6; // base 0.4–1.0
    if (e.livePulse) w *= 3;
    if (recentlyActive.has(e.sourceDomainId) || recentlyActive.has(e.targetDomainId)) {
      w *= 5;
    }
    // Sub-issue spawn edges get an extra 12× on top — this produces the
    // visible "branching wave" that peels off the parent cluster and
    // materialises into the new descendant.
    const spawnKey = e.sourceDomainId + "->" + e.targetDomainId;
    const reverseKey = e.targetDomainId + "->" + e.sourceDomainId;
    const spawn = Math.max(spawnHeat.get(spawnKey) ?? 0, spawnHeat.get(reverseKey) ?? 0);
    if (spawn > 0) {
      w *= 1 + spawn * 11;
      spawnBoosts[i] = spawn;
    }
    weights[i] = w;
    totalWeight += w;
  }
  if (totalWeight === 0) totalWeight = 1;

  // Allocate particles proportional to weight.
  const perEdgeCount = new Int32Array(bundle.edgeCount);
  let allocated = 0;
  for (let i = 0; i < bundle.edgeCount; i += 1) {
    perEdgeCount[i] = Math.floor((weights[i] / totalWeight) * waveCount);
    allocated += perEdgeCount[i];
  }
  // Round-robin the remainder.
  for (let i = 0; allocated < waveCount; i = (i + 1) % bundle.edgeCount) {
    perEdgeCount[i] += 1;
    allocated += 1;
  }

  const out: WaveAssignment[] = [];
  for (let edgeIdx = 0; edgeIdx < bundle.edgeCount; edgeIdx += 1) {
    const count = perEdgeCount[edgeIdx];
    if (count === 0) continue;
    const e = bundle.edges[edgeIdx];
    const boosted =
      recentlyActive.has(e.sourceDomainId) || recentlyActive.has(e.targetDomainId);
    const spawn = spawnBoosts[edgeIdx];
    for (let k = 0; k < count; k += 1) {
      // Spawn particles race across faster so the branching wave is
      // visibly distinct from steady-state live pulses.
      let speed: number;
      if (spawn > 0) {
        speed = 2.4 + Math.random() * 1.2; // 2.4–3.6 s⁻¹
      } else if (boosted) {
        speed = 1.6 + Math.random() * 0.8;
      } else {
        speed = 0.9 + Math.random() * 0.5;
      }
      out.push({
        edgeIdx,
        // For spawn events, pack particles tightly at t=0 so they launch
        // together as a front rather than spread around the loop.
        t0: spawn > 0 ? Math.random() * 0.1 : (k / count) + Math.random() * 0.03,
        speed,
      });
    }
  }
  return out;
}
