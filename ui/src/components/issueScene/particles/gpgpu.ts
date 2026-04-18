/**
 * GPGPU ping-pong infrastructure for the neuron-native particle field.
 *
 * Wraps the three.js scaffolding needed to run fullscreen-quad sim passes
 * that read from `tPrev` and write to `tNext` render targets, ping-ponging
 * each frame. Used by ParticleField.tsx to integrate particle state on the
 * GPU instead of the CPU.
 *
 * Key invariants:
 * - `frameloop="always"` is required on the containing Canvas.
 * - Sim passes run at `useFrame` priority < 0 (before the main render).
 * - After each pass we MUST restore the main render target (`gl.setRenderTarget(null)`).
 * - Float RT support is feature-detected; we fall back to HalfFloat.
 *
 * See plan: /Users/tobiasmastek/.claude/plans/gleaming-cooking-blanket.md §2
 */
import * as THREE from "three";

export interface GpgpuSupport {
  /** WebGL2 context available (required for any GPGPU path). */
  webgl2: boolean;
  /** EXT_color_buffer_float — required for RGBA32F RTs. */
  float: boolean;
  /** EXT_color_buffer_half_float — fallback for 16-bit RTs. */
  halfFloat: boolean;
  /** Net: can we do GPGPU at all with at least 16-bit precision? */
  usable: boolean;
  /** The texture type we should create RTs with. */
  textureType: THREE.TextureDataType;
}

export function detectGpgpuSupport(gl: THREE.WebGLRenderer): GpgpuSupport {
  const ctx = gl.getContext() as WebGL2RenderingContext | WebGLRenderingContext;
  const webgl2 = typeof WebGL2RenderingContext !== "undefined" && ctx instanceof WebGL2RenderingContext;
  const float = !!gl.extensions.get("EXT_color_buffer_float");
  const halfFloat = !!gl.extensions.get("EXT_color_buffer_half_float") || float;
  const usable = webgl2 && (float || halfFloat);
  const textureType = float ? THREE.FloatType : THREE.HalfFloatType;
  return { webgl2, float, halfFloat, usable, textureType };
}

/** A pair of render targets that ping-pong per frame. */
export class PingPongRT {
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private tick = 0;

  constructor(
    public readonly size: number,
    textureType: THREE.TextureDataType,
    debugLabel = "pp",
  ) {
    const opts: THREE.RenderTargetOptions = {
      type: textureType,
      format: THREE.RGBAFormat,
      // NearestFilter is mandatory — linear sampling isn't guaranteed for
      // float/half-float RTs on all drivers (iOS Safari especially).
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    };
    this.a = new THREE.WebGLRenderTarget(size, size, opts);
    this.b = new THREE.WebGLRenderTarget(size, size, opts);
    this.a.texture.name = `${debugLabel}.a`;
    this.b.texture.name = `${debugLabel}.b`;
  }

  /** The RT we most recently wrote into (safe to sample). */
  get current(): THREE.WebGLRenderTarget {
    return this.tick % 2 === 0 ? this.a : this.b;
  }

  /** The RT we are about to write into (NOT safe to sample). */
  get next(): THREE.WebGLRenderTarget {
    return this.tick % 2 === 0 ? this.b : this.a;
  }

  /** Call after a successful pass to flip. */
  swap(): void {
    this.tick += 1;
  }

  /** Seed both RTs from a CPU-side DataTexture. Used on init and ctx-loss. */
  seed(gl: THREE.WebGLRenderer, data: THREE.DataTexture): void {
    const seedMat = new THREE.ShaderMaterial({
      uniforms: { tSeed: { value: data } },
      vertexShader: FULLSCREEN_VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSeed;
        varying vec2 vUv;
        void main() { gl_FragColor = texture2D(tSeed, vUv); }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const { scene, camera } = getFullscreenQuad(seedMat);
    gl.setRenderTarget(this.a);
    gl.render(scene, camera);
    gl.setRenderTarget(this.b);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    seedMat.dispose();
  }

  dispose(): void {
    this.a.dispose();
    this.b.dispose();
  }
}

/** Vertex shader for a fullscreen quad — passes uv through unchanged. */
export const FULLSCREEN_VS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Run a single sim pass: write the output of `material` into `target`.
 * Restores the main render target on exit.
 */
export function runPass(
  gl: THREE.WebGLRenderer,
  material: THREE.ShaderMaterial,
  target: THREE.WebGLRenderTarget,
): void {
  const prev = gl.getRenderTarget();
  const { scene, camera } = getFullscreenQuad(material);
  gl.setRenderTarget(target);
  gl.render(scene, camera);
  gl.setRenderTarget(prev);
}

/**
 * A single lazily-constructed fullscreen quad scene + ortho camera, reused
 * across all passes. We swap `material` onto the mesh before each `render()`.
 */
let quadScene: THREE.Scene | null = null;
let quadCamera: THREE.OrthographicCamera | null = null;
let quadMesh: THREE.Mesh | null = null;

function getFullscreenQuad(material: THREE.ShaderMaterial): {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
} {
  if (!quadScene || !quadCamera || !quadMesh) {
    quadScene = new THREE.Scene();
    quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geom = new THREE.PlaneGeometry(2, 2);
    quadMesh = new THREE.Mesh(geom, material);
    quadMesh.frustumCulled = false;
    quadScene.add(quadMesh);
  }
  quadMesh.material = material;
  return { scene: quadScene, camera: quadCamera };
}

/**
 * Build a CPU-side DataTexture of initial particle state. Used to seed the
 * ping-pong RTs at startup and after webglcontextlost.
 *
 * Layout (RGBA32F):
 *   position RT: (x, y, z, birthTime)
 *   velocity RT: (vx, vy, vz, lifetime)
 *   state RT:    (role, groupId, homeNodeIdOrEdgeId, subPhase)
 */
export function buildSeedTexture(
  size: number,
  fill: (i: number, out: [number, number, number, number]) => void,
): THREE.DataTexture {
  const data = new Float32Array(size * size * 4);
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < size * size; i += 1) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    fill(i, out);
    const o = i * 4;
    data[o] = out[0];
    data[o + 1] = out[1];
    data[o + 2] = out[2];
    data[o + 3] = out[3];
  }
  const tex = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
