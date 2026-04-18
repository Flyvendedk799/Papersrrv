/* particleGL — WebGL2 point-sprite renderer with FBO trail buffer + breathing */

export interface CameraUniforms {
  targetX: number; targetY: number; targetZ: number;
  rotY: number; rotX: number; focal: number; zoom: number;
  centerX: number; centerY: number;
}

const VS = `#version 300 es
precision highp float;
in vec4 a_pos; // xyz = position, w = kind (0=ambient, 1=comment, 2=run, 3=activity, 4=subissue, 5=issue, 6=ancestor)
uniform vec3 u_target; uniform float u_rotY, u_rotX, u_focal, u_zoom, u_dpr, u_intro, u_time;
uniform vec2 u_center, u_screen;
out float v_alpha, v_kill;
out float v_kind;
void main() {
  vec3 r = a_pos.xyz - u_target;
  float k = a_pos.w;
  v_kind = k;
  float cY=cos(u_rotY),sY=sin(u_rotY); float x1=r.x*cY+r.z*sY, z1=-r.x*sY+r.z*cY;
  float cX=cos(u_rotX),sX=sin(u_rotX); float y2=r.y*cX-z1*sX, z2=r.y*sX+z1*cX;
  float d=u_focal+z2; if(d<20.0){gl_Position=vec4(0,-2,0,1);v_alpha=0.0;v_kill=1.0;gl_PointSize=0.0;return;}
  float sc=(u_focal/d)*u_zoom; vec2 scr=vec2(x1*sc+u_center.x,y2*sc+u_center.y);
  gl_Position=vec4((scr.x/u_screen.x)*2.0-1.0,1.0-(scr.y/u_screen.y)*2.0,0,1);
  float dp=clamp(sc,0.12,1.6);
  // Kind-based sizing: runs and subissues are larger+brighter so the
  // flow toward structural elements is visible. Activity and ambient
  // are smaller to reduce noise.
  float ks = 1.0;
  if (k > 1.5 && k < 2.5) ks = 1.6;       // run: 60% bigger
  else if (k > 3.5 && k < 4.5) ks = 1.5;   // subissue: 50% bigger
  else if (k > 0.5 && k < 1.5) ks = 1.2;   // comment: 20% bigger
  else if (k > 5.5 && k < 6.5) ks = 1.4;   // ancestor: 40% bigger
  else if (k > 2.5 && k < 3.5) ks = 0.7;   // activity: 30% smaller
  else if (k < 0.5) ks = 0.75;              // ambient: 25% smaller
  gl_PointSize=max(1.5, dp * 3.0 * u_dpr * ks);
  float phase=float(gl_VertexID)*0.0011;
  float breathe=0.55+0.45*sin(u_time*0.7+phase);
  v_alpha=dp*0.55*u_intro*breathe*ks; v_kill=0.0;
}`;

const FS = `#version 300 es
precision mediump float;
in float v_alpha, v_kill;
in float v_kind;
out vec4 fragColor;
void main() {
  if(v_kill>0.5||v_alpha<0.01)discard;
  vec2 uv=gl_PointCoord-vec2(0.5); float d=length(uv)*2.0; if(d>1.0)discard;
  float f=1.0-smoothstep(0.55,1.0,d);
  // Kind-based tinting — saturated enough to read the flow structure at a
  // glance while still feeling cohesive with the warm-cream particle field.
  vec3 col = vec3(0.95, 0.90, 0.77); // ambient: warm cream
  float k = v_kind;
  if (k > 0.5 && k < 1.5) col = vec3(0.45, 0.82, 0.95);  // comment: cyan
  else if (k > 1.5 && k < 2.5) col = vec3(1.0, 0.72, 0.30);  // run: amber-orange
  else if (k > 2.5 && k < 3.5) col = vec3(0.55, 0.60, 0.75); // activity: dim blue-gray
  else if (k > 3.5 && k < 4.5) col = vec3(0.35, 0.88, 0.60); // subissue: emerald
  else if (k > 4.5 && k < 5.5) col = vec3(0.95, 0.90, 0.77); // issue: cream
  else if (k > 5.5 && k < 6.5) col = vec3(0.82, 0.72, 0.45); // ancestor: warm gold
  float a=f*v_alpha;
  fragColor=vec4(col*a,a);
}`;

const QV = `#version 300 es
in vec2 a_pos; out vec2 v_uv; void main(){v_uv=a_pos*0.5+0.5;gl_Position=vec4(a_pos,0,1);}`;
const FADE_FS = `#version 300 es
precision mediump float; uniform float u_fade; out vec4 fc; void main(){fc=vec4(0,0,0,u_fade);}`;
const BLIT_FS = `#version 300 es
precision mediump float; in vec2 v_uv; uniform sampler2D u_tex; out vec4 fc; void main(){fc=texture(u_tex,v_uv);}`;

function link(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const c = (t: number, s: string) => { const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh); return sh; };
  const p = gl.createProgram()!;
  gl.attachShader(p, c(gl.VERTEX_SHADER, vs)); gl.attachShader(p, c(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p); return p;
}

export class ParticleGL {
  private gl: WebGL2RenderingContext;
  private pProg: WebGLProgram; private fProg: WebGLProgram; private bProg: WebGLProgram;
  private pVAO: WebGLVertexArrayObject; private qVAO: WebGLVertexArrayObject;
  private posBuf: WebGLBuffer;
  private fbo: WebGLFramebuffer | null = null; private fboTex: WebGLTexture | null = null;
  private cap = 0; private cssW = 1; private cssH = 1; private dpr = 1;
  private uT: Record<string, WebGLUniformLocation> = {};

  static tryCreate(canvas: HTMLCanvasElement): ParticleGL | null {
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false, premultipliedAlpha: true, powerPreference: "high-performance" });
    if (!gl) return null;
    try { return new ParticleGL(gl); } catch { return null; }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.pProg = link(gl, VS, FS); this.fProg = link(gl, QV, FADE_FS); this.bProg = link(gl, QV, BLIT_FS);
    this.pVAO = gl.createVertexArray()!; gl.bindVertexArray(this.pVAO);
    this.posBuf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    const a = gl.getAttribLocation(this.pProg, "a_pos"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.qVAO = gl.createVertexArray()!; gl.bindVertexArray(this.qVAO);
    const qb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const qa = gl.getAttribLocation(this.fProg, "a_pos"); if (qa >= 0) { gl.enableVertexAttribArray(qa); gl.vertexAttribPointer(qa, 2, gl.FLOAT, false, 0, 0); }
    gl.bindVertexArray(null);
    const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n)!;
    this.uT = {
      target: u(this.pProg, "u_target"), rotY: u(this.pProg, "u_rotY"), rotX: u(this.pProg, "u_rotX"),
      focal: u(this.pProg, "u_focal"), zoom: u(this.pProg, "u_zoom"), center: u(this.pProg, "u_center"),
      screen: u(this.pProg, "u_screen"), dpr: u(this.pProg, "u_dpr"), intro: u(this.pProg, "u_intro"),
      time: u(this.pProg, "u_time"), fade: u(this.fProg, "u_fade"), tex: u(this.bProg, "u_tex"),
    };
  }

  resize(w: number, h: number, dpr: number) {
    this.cssW = w; this.cssH = h; this.dpr = dpr;
    const gl = this.gl, pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
    const c = gl.canvas as HTMLCanvasElement; c.width = pw; c.height = ph; c.style.width = `${w}px`; c.style.height = `${h}px`;
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.fboTex) gl.deleteTexture(this.fboTex);
    this.fbo = gl.createFramebuffer(); this.fboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pw, ph, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
    gl.viewport(0, 0, pw, ph); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(positions: Float32Array, count: number, cam: CameraUniforms, intro: number, fade: number, timeSec: number) {
    if (count <= 0) return;
    const gl = this.gl, pw = (gl.canvas as HTMLCanvasElement).width, ph = (gl.canvas as HTMLCanvasElement).height;
    if (count > this.cap) { gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf); gl.bufferData(gl.ARRAY_BUFFER, count * 16, gl.DYNAMIC_DRAW); this.cap = count; }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions, 0, count * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, pw, ph);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
    // Fade
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.fProg); gl.uniform1f(this.uT.fade, fade);
    gl.bindVertexArray(this.qVAO); gl.drawArrays(gl.TRIANGLES, 0, 6);
    // Particles
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.pProg);
    gl.uniform3f(this.uT.target, cam.targetX, cam.targetY, cam.targetZ);
    gl.uniform1f(this.uT.rotY, cam.rotY); gl.uniform1f(this.uT.rotX, cam.rotX);
    gl.uniform1f(this.uT.focal, cam.focal); gl.uniform1f(this.uT.zoom, cam.zoom);
    gl.uniform2f(this.uT.center, cam.centerX, cam.centerY);
    gl.uniform2f(this.uT.screen, this.cssW, this.cssH);
    gl.uniform1f(this.uT.dpr, this.dpr); gl.uniform1f(this.uT.intro, intro);
    gl.uniform1f(this.uT.time, timeSec);
    gl.bindVertexArray(this.pVAO); gl.drawArrays(gl.POINTS, 0, count);
    // Blit
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, pw, ph);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.bProg); gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex); gl.uniform1i(this.uT.tex, 0);
    gl.bindVertexArray(this.qVAO); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null); gl.disable(gl.BLEND);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.pProg); gl.deleteProgram(this.fProg); gl.deleteProgram(this.bProg);
    if (this.fbo) gl.deleteFramebuffer(this.fbo); if (this.fboTex) gl.deleteTexture(this.fboTex);
  }
}
