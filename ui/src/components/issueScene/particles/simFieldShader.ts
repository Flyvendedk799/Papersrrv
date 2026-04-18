/**
 * Unified sim shader — handles both Role A (Field) and Role B (Wave)
 * particles in one pass. Role branching is coarse (two bodies, minimal
 * divergence) so this is fine at 16k particles; we can split into
 * scissored passes in Milestone 6 if perf demands it.
 *
 * ─── Role A: Field / orbit ─────────────────────────────────────────
 *  state.y = homeNodeIdx
 *  Force model: attraction to node + tangential swirl + jitter + damping.
 *
 * ─── Role B: Wave / edge-rider ─────────────────────────────────────
 *  state.y = edgeIdx
 *  vel.x  = t ∈ [0,1]   (position along bezier, advances each frame)
 *  vel.y  = speed       (1 / duration in seconds)
 *  vel.w  = lifetime    (>0 alive, ≤0 dead)
 *  Position is sampled from the edge's bezier at t; velocity pass advances
 *  t by speed*dt. When t > 1.0 the particle dies (lifetime = 0) and is
 *  available for reuse by the emit pass in Milestone 3.
 *
 * ─── Role Dead ─────────────────────────────────────────────────────
 *  Parked far off-screen until re-seeded.
 */
import { FULLSCREEN_VS } from "./gpgpu";

const COMMON = /* glsl */ `
  uniform sampler2D tPrevPos;
  uniform sampler2D tPrevVel;
  uniform sampler2D tPrevState;

  uniform sampler2D uNodeTex;
  uniform sampler2D uEdgeTex;
  uniform sampler2D uGroupTex;
  uniform float     uNodeCount;
  uniform float     uEdgeCount;
  uniform float     uMaxNodes;
  uniform float     uMaxEdges;
  uniform float     uMaxGroups;

  uniform float     uDt;
  uniform float     uTime;

  varying vec2 vUv;

  const float ROLE_DEAD   = 0.0;
  const float ROLE_FIELD  = 1.0;
  const float ROLE_WAVE   = 2.0;
  const float ROLE_CHRONO = 3.0;

  vec4 sampleNode(float n) {
    float u = (n + 0.5) / uMaxNodes;
    return texture2D(uNodeTex, vec2(u, 0.5));
  }

  // Edge texture has 3 rows: from, ctrl, to. Row y = 0 / 1 / 2.
  // Texel centered uv: u = (e + 0.5)/MAX_EDGES, v = (row + 0.5)/3.0
  vec4 sampleEdgeRow(float e, float row) {
    float u = (e + 0.5) / uMaxEdges;
    float v = (row + 0.5) / 3.0;
    return texture2D(uEdgeTex, vec2(u, v));
  }

  vec3 bezier3(vec3 a, vec3 b, vec3 c, float t) {
    float it = 1.0 - t;
    return it * it * a + 2.0 * it * t * b + t * t * c;
  }

  // Unpack packedKindGroup (kind * 256 + groupId) from node.w.
  float groupIdFromPacked(float packed) {
    return mod(packed, 256.0);
  }

  vec4 sampleGroup(float g) {
    float u = (g + 0.5) / uMaxGroups;
    return texture2D(uGroupTex, vec2(u, 0.5));
  }
`;

/** Position integration — handles Field (vel*dt) and Wave (bezier sample). */
export const SIM_FIELD_POSITION_FS = /* glsl */ `
  ${COMMON}

  void main() {
    vec4 pos   = texture2D(tPrevPos,   vUv);
    vec4 vel   = texture2D(tPrevVel,   vUv);
    vec4 state = texture2D(tPrevState, vUv);

    float role = state.x;

    if (role == ROLE_WAVE && vel.w > 0.0 && uEdgeCount > 0.5) {
      float edgeIdx = state.y;
      if (edgeIdx < uEdgeCount) {
        float t = clamp(vel.x, 0.0, 1.0);
        vec3 a = sampleEdgeRow(edgeIdx, 0.0).xyz;
        vec3 b = sampleEdgeRow(edgeIdx, 1.0).xyz;
        vec3 c = sampleEdgeRow(edgeIdx, 2.0).xyz;
        pos.xyz = bezier3(a, b, c, t);
      }
    } else {
      // Field (or fallback): standard position integration.
      pos.xyz += vel.xyz * uDt;
    }

    gl_FragColor = pos;
  }
`;

/** Velocity integration — computes field forces OR advances Wave t-parameter. */
export const SIM_FIELD_VELOCITY_FS = /* glsl */ `
  ${COMMON}

  vec3 swirl(vec3 toward) {
    return cross(vec3(0.0, 1.0, 0.0), toward);
  }

  void main() {
    vec4 pos   = texture2D(tPrevPos,   vUv);
    vec4 vel   = texture2D(tPrevVel,   vUv);
    vec4 state = texture2D(tPrevState, vUv);

    float role = state.x;

    if (role == ROLE_WAVE) {
      // Advance t along the edge. Dissolve when t > 1.0.
      float t = vel.x + vel.y * uDt;
      float alive = 1.0;
      if (t > 1.0) {
        // Dead — mark lifetime 0 so the emit pass can reuse this slot.
        t = 1.0;
        alive = 0.0;
      }
      // Repack: vel.x = t, vel.y = speed, vel.z = unused, vel.w = lifetime
      gl_FragColor = vec4(t, vel.y, 0.0, alive);
      return;
    }

    if (role == ROLE_FIELD && uNodeCount > 0.5 && state.y < uNodeCount) {
      vec4 node = sampleNode(state.y);
      vec3 home = node.xyz;
      vec3 toHome = home - pos.xyz;
      float d = max(length(toHome), 0.0001);

      // Primary home-node attraction — stronger so particles stay tight
      // around their cluster, reducing the "swarm flying around" feel.
      vec3 accel = (toHome / d) * 3.4 * smoothstep(0.0, 1.2, d);

      // Subtle tangential swirl — just enough for liveliness.
      accel += swirl(toHome) * 0.18;

      // Group cohesion — only kicks in for particles very far from their cluster.
      float groupId = groupIdFromPacked(node.w);
      if (groupId < uMaxGroups) {
        vec4 group = sampleGroup(groupId);
        if (group.w > 0.0) {
          vec3 toCentroid = group.xyz - pos.xyz;
          float gd = length(toCentroid);
          accel += toCentroid * 0.06 * smoothstep(2.0, 6.0, gd);
        }
      }

      // Chronology breathing — much gentler.
      float chrono = sin(uTime * 0.28 + pos.z * 0.06) * 0.06;
      accel.z += chrono;

      // Per-particle jitter — small, just a tissue-breath.
      float h = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      accel += vec3(sin(uTime * (0.9 + h * 0.5) + h * 10.0),
                    cos(uTime * (1.1 + h * 0.4) + h * 8.0),
                    sin(uTime * (0.8 + h * 0.6) + h * 12.0)) * 0.08;

      vel.xyz += accel * uDt;
      // Stronger damping — previous 0.965 let particles drift too far.
      vel.xyz *= 0.88;

      // Harder speed cap.
      float speed = length(vel.xyz);
      if (speed > 4.0) vel.xyz *= 4.0 / speed;

      gl_FragColor = vel;
      return;
    }

    // Dead / unassigned — park far from origin.
    vec3 parkTarget = normalize(pos.xyz + vec3(0.001, 0.001, 0.001)) * 22.0;
    vel.xyz += (parkTarget - pos.xyz) * 0.35 * uDt;
    vel.xyz *= 0.9;
    gl_FragColor = vel;
  }
`;

export const SIM_FIELD_VS = FULLSCREEN_VS;
