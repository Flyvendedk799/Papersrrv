/**
 * Display shader for the unified particle field.
 *
 * Vertex shader looks up position from `tPos` (current ping-pong RT) at
 * the per-vertex `aIndex` uv. Color is sampled from `uNodeColorTex` using
 * the particle's `homeNodeIdx` (stored in `tState.g`), then tinted
 * primarily by the node's agent/status color with cream as a highlight.
 * Fragment draws a soft circular sprite via `discard`.
 *
 * Tuning notes:
 * - Additive blending + thousands of sprites saturates quickly. We
 *   keep per-sprite alpha VERY low (0.14 base) so clusters read as
 *   cream-gold mist rather than a blown-out white haze.
 * - Point size is capped aggressively so even at hero tier the cloud
 *   looks like tissue, not confetti.
 */
export const RENDER_VS = /* glsl */ `
  uniform sampler2D tPos;
  uniform sampler2D tVel;
  uniform sampler2D tState;
  uniform sampler2D uNodeColorTex;
  uniform float     uMaxNodes;
  uniform float     uPixelRatio;
  uniform float     uPointScale;
  attribute vec2    aIndex;

  varying float vSpeed;
  varying float vDepth;
  varying vec3  vColor;
  varying float vRole;

  vec4 sampleNodeColor(float n) {
    float u = (n + 0.5) / uMaxNodes;
    return texture2D(uNodeColorTex, vec2(u, 0.5));
  }

  void main() {
    vec4 posSample = texture2D(tPos, aIndex);
    vec4 velSample = texture2D(tVel, aIndex);
    vec4 stateSample = texture2D(tState, aIndex);
    vec3 worldPos = posSample.xyz;
    vSpeed = length(velSample.xyz);
    vRole = stateSample.x;

    float homeIdx = stateSample.y;
    vec4 nodeColor = sampleNodeColor(homeIdx);
    // Favor the node's agent/status color heavily — cream only as a
    // subtle highlight. This makes agents visibly cluster in their own
    // tint instead of everything reading as a cream haze.
    vec3 cream = vec3(0.965, 0.898, 0.774);
    vColor = mix(nodeColor.rgb, cream, 0.18);

    vec4 mv = modelViewMatrix * vec4(worldPos, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;

    // Tighter size range so even 30k particles don't carpet the viewport.
    // Wave particles (role 2) read a touch larger so pulses are visible.
    float sizeBase = uPointScale * uPixelRatio * (6.5 / max(vDepth, 0.01));
    if (vRole > 1.5) sizeBase *= 1.35;
    gl_PointSize = clamp(sizeBase, 0.7, 7.0);
  }
`;

export const RENDER_FS = /* glsl */ `
  uniform float uBrightness;
  varying float vSpeed;
  varying float vDepth;
  varying vec3  vColor;
  varying float vRole;

  void main() {
    // Circular sprite with soft quadratic falloff.
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c);
    if (d2 > 0.25) discard;
    float a = 1.0 - (d2 * 4.0);
    a *= a;

    // Wave particles (role 2) are hotter and slightly brighter because
    // they're the storytelling element — everything else is steady tissue.
    float hot = clamp(vSpeed * 0.06, 0.0, 0.35);
    float wave = (vRole > 1.5) ? 0.45 : 0.0;
    vec3 color = vColor * (0.55 + hot + wave) * uBrightness;

    // Very low per-sprite alpha — we rely on density to build the cloud,
    // not on individual particle brightness. Prevents additive saturation.
    float waveAlpha = (vRole > 1.5) ? 1.7 : 1.0;
    gl_FragColor = vec4(color, a * 0.14 * waveAlpha);
  }
`;
