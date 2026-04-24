// Mindspace engine — a thinking brain.
// Anatomical two-hemisphere cortex + white matter, agents as functional regions,
// synapses firing with axon trails along causal chains.

(function () {
  const THREE = window.THREE;
  const C = window.CASE;

  const container = document.getElementById("stage");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000, 0);
  // Cinematic tone mapping + proper color space.
  if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (THREE.ACESFilmicToneMapping !== undefined) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Fog fades far geometry to ink without nuking the starfield backdrop.
  // Stars live at r=1200-1700, so fog must clear by then.
  scene.fog = new THREE.Fog(0x0B0710, 420, 1600);

  // ---------- Starfield backdrop ----------
  // Very distant, very dim points — gives the scene a sense of infinite space
  // behind the brain. Not part of the mind itself.
  (function addStarfield() {
    const starCount = 1400;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(starCount * 3);
    const c = new Float32Array(starCount * 3);
    const s = new Float32Array(starCount);
    const tmp = new THREE.Color();
    for (let i = 0; i < starCount; i++) {
      // Uniform on a distant sphere.
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 1200 + Math.random() * 500;
      p[i*3]   = Math.sin(phi) * Math.cos(theta) * r;
      p[i*3+1] = Math.cos(phi) * r * 0.6; // flatter so it frames the brain
      p[i*3+2] = Math.sin(phi) * Math.sin(theta) * r;
      // Cool violet-blue stars with a handful of warm accents.
      const warm = Math.random() < 0.08;
      if (warm) tmp.setHSL(0.08 + Math.random() * 0.04, 0.5, 0.5 + Math.random() * 0.3);
      else      tmp.setHSL(0.68 + Math.random() * 0.08, 0.35, 0.3 + Math.random() * 0.4);
      c[i*3] = tmp.r; c[i*3+1] = tmp.g; c[i*3+2] = tmp.b;
      s[i] = 1.5 + Math.random() * 3.5;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    g.setAttribute("aStarSize", new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `
        attribute vec3 color;
        attribute float aStarSize;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vC;
        varying float vT;
        void main() {
          vC = color;
          // Gentle twinkle — each star has its own phase via position hash.
          float ph = fract(sin(dot(position.xyz, vec3(12.9898,78.233,45.164))) * 43758.5453);
          vT = 0.55 + 0.45 * sin(uTime * 0.6 + ph * 6.28);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aStarSize * uPixelRatio * (500.0 / -mv.z);
        }`,
      fragmentShader: `
        varying vec3 vC;
        varying float vT;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float g = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vC * g * vT, g * vT * 0.7);
        }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    // Expose uniform for per-frame time update.
    window.__starMat = m;
  })();

  // ---------- Nebula — distant volumetric gas clouds ----------
  // Large soft additive sprites drifting far behind the brain. Gives depth
  // and a sense that the mindspace is embedded in something larger.
  (function addNebula() {
    const NEB = 22;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(NEB * 3);
    const c = new Float32Array(NEB * 3);
    const sz = new Float32Array(NEB);
    const ph = new Float32Array(NEB);
    const tmp = new THREE.Color();
    for (let i = 0; i < NEB; i++) {
      // Scatter far out, biased toward the horizontal band so they frame
      // the brain rather than box it in.
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * 0.6; // near equator
      const r = 900 + Math.random() * 600;
      p[i*3]   = Math.cos(theta) * Math.cos(phi) * r;
      p[i*3+1] = Math.sin(phi) * r;
      p[i*3+2] = Math.sin(theta) * Math.cos(phi) * r - 200;
      // Plum / rose / amber palette — matches the Boared ink.
      const pick = Math.random();
      if (pick < 0.45)      tmp.setHSL(0.78, 0.55, 0.32); // plum violet
      else if (pick < 0.80) tmp.setHSL(0.02, 0.55, 0.30); // rose ember
      else                  tmp.setHSL(0.08, 0.50, 0.28); // amber pocket
      c[i*3] = tmp.r; c[i*3+1] = tmp.g; c[i*3+2] = tmp.b;
      sz[i] = 600 + Math.random() * 900;
      ph[i] = Math.random() * Math.PI * 2;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uTintAmt: { value: 0 },
      },
      vertexShader: `
        attribute vec3 color;
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vC;
        varying float vA;
        void main() {
          vC = color;
          // Very slow breath so each cloud waxes and wanes independently.
          vA = 0.55 + 0.45 * sin(uTime * 0.08 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio * (400.0 / -mv.z);
        }`,
      fragmentShader: `
        varying vec3 vC;
        varying float vA;
        uniform vec3  uTint;
        uniform float uTintAmt;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          // Soft wide falloff — cloud, not star.
          float g = pow(smoothstep(0.5, 0.0, d), 1.3);
          // Blend nebula hue with the dominant-agent tint (slow, ambient).
          vec3 tinted = mix(vC, vC * 0.35 + uTint * 0.9, clamp(uTintAmt, 0.0, 0.8));
          gl_FragColor = vec4(tinted * g * vA, g * vA * 0.26);
        }`,
    });
    const pts = new THREE.Points(g, m);
    pts.renderOrder = -2; // behind everything
    pts.frustumCulled = false;
    scene.add(pts);
    window.__nebulaMat = m;
  })();

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 3000);
  camera.position.set(0, 60, 380);

  // ---------- Post-processing (unreal bloom) ----------
  // Adds a soft luminous halo around bright particles — reads as real light.
  // Thresholds tuned so only peaks (event pulses, chain glows) bloom hot,
  // while the base brain keeps its calm, clean look.
  let composer = null;
  try {
    if (THREE.EffectComposer && THREE.UnrealBloomPass) {
      composer = new THREE.EffectComposer(renderer);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(container.clientWidth, container.clientHeight);
      composer.addPass(new THREE.RenderPass(scene, camera));
      const bloom = new THREE.UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.55,   // strength
        0.75,   // radius
        0.18    // threshold — low so particles glow, but not so low it's a blur
      );
      composer.addPass(bloom);
      // Output pass handles sRGB / tone mapping back to the canvas.
      if (THREE.OutputPass) composer.addPass(new THREE.OutputPass());
    }
  } catch (err) {
    console.warn("[Mindspace] bloom setup failed, falling back to plain render:", err);
    composer = null;
  }

  // ---------- Orbit ----------
  const orbit = {
    target: new THREE.Vector3(0, 0, 0),
    theta: 0.9, phi: Math.PI * 0.40, radius: 300,
    targetTheta: 0.9, targetPhi: Math.PI * 0.40, targetRadius: 300,
    dragging: false, lastX: 0, lastY: 0,
    // Cinematic drift — the camera breathes slowly even when untouched.
    // This adds a sense of "live" presence rather than a static render.
    _driftT: 0,
    _driftAmp: 0.06,   // radians
    _driftAmpPhi: 0.03,
    // Mouse parallax — tiny lens shifts so the scene feels 3D.
    parallaxX: 0, parallaxY: 0,
    _pxTarget: 0, _pyTarget: 0,
    // Dolly: when focusing an agent, pull in; return when cleared.
    _dollyScale: 1,  _dollyTarget: 1,
    // Event pulse: on major events, a brief ease-in/out dolly nudge.
    _eventPulse: 0,    // magnitude (negative = zoom in)
    _eventPulseT: 0,   // seconds since trigger
    _eventPulseDur: 1.0,
    eventPulse(mag = 0.06, dur = 1.0) {
      // Accept largest pending pulse so rapid events stack cleanly.
      if (Math.abs(mag) > Math.abs(this._eventPulse) || this._eventPulseT > dur * 0.6) {
        this._eventPulse = mag;
        this._eventPulseT = 0;
        this._eventPulseDur = dur;
      }
    },
    // ---- Inertia (spin after release) ----
    velTheta: 0, velPhi: 0,
    _lastInteractT: 0, // timestamp of last user interaction (for idle gating)
    // ---- Target panning (look-point smoothly tracks a goal) ----
    _targetGoal: new THREE.Vector3(0, 0, 0),
    // Zoom-to-cursor: when wheeling over a world point, shift target so that
    // point stays under the cursor as we zoom. Computed fresh per wheel tick.
    // ---- Smooth fly-to focus ----
    _flyT: 0, _flyDur: 0,
    _flyFromTheta: 0, _flyFromPhi: 0, _flyFromRadius: 0,
    _flyFromTarget: new THREE.Vector3(),
    _flyToTheta: 0, _flyToPhi: 0, _flyToRadius: 0,
    _flyToTarget: new THREE.Vector3(),
    flyTo(opts) {
      // opts: {theta, phi, radius, target, duration}
      this._flyT = 0;
      this._flyDur = opts.duration ?? 1.0;
      this._flyFromTheta = this.targetTheta;
      this._flyFromPhi = this.targetPhi;
      this._flyFromRadius = this.targetRadius;
      this._flyFromTarget.copy(this._targetGoal);
      // Shortest path for theta
      let tt = opts.theta ?? this.targetTheta;
      let dTheta = tt - this.targetTheta;
      while (dTheta > Math.PI) dTheta -= Math.PI * 2;
      while (dTheta < -Math.PI) dTheta += Math.PI * 2;
      this._flyToTheta = this.targetTheta + dTheta;
      this._flyToPhi = opts.phi ?? this.targetPhi;
      this._flyToRadius = opts.radius ?? this.targetRadius;
      this._flyToTarget.copy(opts.target || this._targetGoal);
      // Kill inertia while flying.
      this.velTheta = 0; this.velPhi = 0;
    },
    update(dt) {
      this._driftT += dt;
      // ---- Fly-to (smooth easeInOutCubic) ----
      if (this._flyT < this._flyDur) {
        this._flyT = Math.min(this._flyDur, this._flyT + dt);
        const x = this._flyT / this._flyDur;
        const e = x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2;
        this.targetTheta = this._flyFromTheta + (this._flyToTheta - this._flyFromTheta) * e;
        this.targetPhi = this._flyFromPhi + (this._flyToPhi - this._flyFromPhi) * e;
        this.targetRadius = this._flyFromRadius + (this._flyToRadius - this._flyFromRadius) * e;
        this._targetGoal.copy(this._flyFromTarget).lerp(this._flyToTarget, e);
      }
      // ---- Inertia (free spin after fling) ----
      // Only active when not dragging and no fly-to is running.
      if (!this.dragging && this._flyT >= this._flyDur) {
        if (Math.abs(this.velTheta) > 0.00005 || Math.abs(this.velPhi) > 0.00005) {
          this.targetTheta += this.velTheta;
          this.targetPhi = Math.max(0.25, Math.min(Math.PI - 0.25, this.targetPhi + this.velPhi));
          // Exponential decay — friction. ~0.5s half-life at dt≈16ms.
          const decay = Math.pow(0.92, dt * 60);
          this.velTheta *= decay;
          this.velPhi *= decay;
          // Clamp at phi edges — bounce off gently instead of sticking.
          if (this.targetPhi <= 0.25 || this.targetPhi >= Math.PI - 0.25) this.velPhi = 0;
        } else {
          this.velTheta = 0; this.velPhi = 0;
        }
      }
      // Advance smoothed parallax toward target
      this.parallaxX += (this._pxTarget - this.parallaxX) * 0.05;
      this.parallaxY += (this._pyTarget - this.parallaxY) * 0.05;
      // Smooth target pan toward goal.
      this.target.lerp(this._targetGoal, 0.1);
      // Dolly easing
      this._dollyScale += (this._dollyTarget - this._dollyScale) * 0.05;
      // Event pulse envelope — sin(πt/dur) pulse then decays.
      let pulseK = 0;
      if (this._eventPulseT < this._eventPulseDur) {
        const x = this._eventPulseT / this._eventPulseDur;
        pulseK = Math.sin(x * Math.PI) * this._eventPulse;
        this._eventPulseT += dt;
      }
      // Continuous breath — slow 8s sine, ±0.5% radius.
      const breath = Math.sin(this._driftT * (Math.PI * 2 / 8)) * 0.006;

      // Damping — stiffer while user drives, softer during idle for a
      // cinematic settling feel.
      const stiff = this.dragging ? 0.22 : 0.08;
      this.theta  += (this.targetTheta  - this.theta)  * stiff;
      this.phi    += (this.targetPhi    - this.phi)    * stiff;
      this.radius += (this.targetRadius - this.radius) * 0.08;

      // Cinematic drift — two out-of-phase sines, not perceptible as a loop.
      const drT = Math.sin(this._driftT * 0.11) * this._driftAmp
                + Math.sin(this._driftT * 0.047 + 1.7) * this._driftAmp * 0.6;
      const drP = Math.sin(this._driftT * 0.073 + 0.8) * this._driftAmpPhi;

      const t = this.theta + drT + this.parallaxX * 0.18;
      const p = Math.max(0.2, Math.min(Math.PI - 0.2,
                this.phi + drP + this.parallaxY * 0.12));
      const r = this.radius * this._dollyScale * (1 + breath + pulseK);

      camera.position.set(
        this.target.x + r * Math.sin(p) * Math.sin(t),
        this.target.y + r * Math.cos(p),
        this.target.z + r * Math.sin(p) * Math.cos(t),
      );
      camera.lookAt(this.target);
    }
  };
  const dom = renderer.domElement;
  dom.style.touchAction = "none";
  dom.style.cursor = "grab";

  // ---- Helper: unproject cursor position to a world point on the brain sphere.
  // Used for zoom-to-cursor: we shift the look-target so the world point under
  // the cursor stays under the cursor as radius changes.
  const _rayHelper = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _sphereHelper = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 200);
  function cursorWorldPoint(ev) {
    const rect = dom.getBoundingClientRect();
    _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    _rayHelper.setFromCamera(_ndc, camera);
    const hit = new THREE.Vector3();
    // Try the bounding sphere first; fall back to a plane at target depth.
    if (_rayHelper.ray.intersectSphere(_sphereHelper, hit)) return hit;
    const planePoint = new THREE.Vector3();
    const planeNormal = camera.getWorldDirection(new THREE.Vector3()).negate();
    const plane = new THREE.Plane(planeNormal, -planeNormal.dot(orbit.target));
    _rayHelper.ray.intersectPlane(plane, planePoint);
    return planePoint;
  }

  // ---- Pointer handling: distinguishes rotate vs pan vs pinch; tracks multi-touch.
  const pointers = new Map(); // pointerId -> {x, y, type, button}
  let panMode = false;          // true when current gesture should pan, not rotate
  let pinchActive = false;
  let pinchLastDist = 0, pinchLastMidX = 0, pinchLastMidY = 0;
  let gestureStart = 0;         // ms — for click-vs-drag timing
  let lastMoveT = 0;            // ms — for inertia velocity calc
  let hintShown = false;

  function markInteraction() {
    orbit._lastInteractT = performance.now();
    if (!hintShown) dismissHint();
  }

  function dismissHint() {
    hintShown = true;
    const h = document.getElementById("ms-hint");
    if (h) h.classList.add("ms-hint--gone");
  }

  function screenToWorldPan(dx, dy) {
    // Pan distance scales with current radius so feel is constant.
    // Convert pixel delta to world delta in the camera's right/up plane.
    const rect = dom.getBoundingClientRect();
    const fov = camera.fov * Math.PI / 180;
    const worldPerPxY = (2 * Math.tan(fov / 2) * orbit.radius) / rect.height;
    const worldPerPxX = worldPerPxY; // square pixels
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    const v = new THREE.Vector3()
      .addScaledVector(right, -dx * worldPerPxX)
      .addScaledVector(up, dy * worldPerPxY);
    return v;
  }

  dom.addEventListener("pointerdown", (e) => {
    dom.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, button: e.button });
    markInteraction();
    gestureStart = performance.now();
    lastMoveT = gestureStart;

    // Determine pan mode: middle button, right button, or shift+left, or 2-finger touch.
    panMode = (e.button === 1) || (e.button === 2) || e.shiftKey;

    if (pointers.size === 1) {
      orbit.dragging = true;
      orbit.lastX = e.clientX; orbit.lastY = e.clientY;
      orbit._moved = 0;
      // Kill inertia on new grab.
      orbit.velTheta = 0; orbit.velPhi = 0;
      // Kill any fly-to — user took control.
      orbit._flyT = orbit._flyDur;
      dom.style.cursor = panMode ? "grabbing" : "grabbing";
    } else if (pointers.size === 2) {
      // Two-finger gesture → pinch/pan. Stop rotation.
      orbit.dragging = false;
      pinchActive = true;
      const pts = [...pointers.values()];
      const dx0 = pts[0].x - pts[1].x;
      const dy0 = pts[0].y - pts[1].y;
      pinchLastDist = Math.hypot(dx0, dy0);
      pinchLastMidX = (pts[0].x + pts[1].x) / 2;
      pinchLastMidY = (pts[0].y + pts[1].y) / 2;
    }
  });

  function endPointer(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    try { dom.releasePointerCapture(e.pointerId); } catch(_){}

    // Click detection: short duration AND small movement.
    const dur = performance.now() - gestureStart;
    if (pointers.size === 0 && orbit._moved < 6 && dur < 350) {
      onCanvasClick(e);
    }

    if (pointers.size < 2) pinchActive = false;
    if (pointers.size === 0) {
      orbit.dragging = false;
      panMode = false;
      dom.style.cursor = "grab";
    } else if (pointers.size === 1) {
      // Resume single-pointer rotate with the remaining touch.
      const [rem] = pointers.values();
      orbit.lastX = rem.x; orbit.lastY = rem.y;
      orbit.dragging = true;
    }
  }
  dom.addEventListener("pointerup", endPointer);
  dom.addEventListener("pointercancel", endPointer);
  dom.addEventListener("pointerleave", (e) => {
    // Only drop capture on leave if not capturing.
    if (!pointers.has(e.pointerId)) return;
    endPointer(e);
  });
  // Block native context menu so right-click-pan works cleanly.
  dom.addEventListener("contextmenu", (e) => e.preventDefault());

  dom.addEventListener("pointermove", (e) => {
    // Parallax: mouse position relative to canvas center drives camera offset
    const rect = dom.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top)  / rect.height) * 2 - 1;
    orbit._pxTarget = nx;
    orbit._pyTarget = ny;

    if (!pointers.has(e.pointerId)) {
      if (!orbit.dragging) { onCanvasHover(e); return; }
      return;
    }
    const p = pointers.get(e.pointerId);
    const prev = { x: p.x, y: p.y };
    p.x = e.clientX; p.y = e.clientY;

    if (pointers.size === 2 && pinchActive) {
      const pts = [...pointers.values()];
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      // Pinch → zoom.
      if (pinchLastDist > 0) {
        const ratio = pinchLastDist / dist;
        orbit.targetRadius = Math.max(150, Math.min(900, orbit.targetRadius * ratio));
      }
      // Two-finger drag → pan.
      const panDx = midX - pinchLastMidX;
      const panDy = midY - pinchLastMidY;
      orbit._targetGoal.add(screenToWorldPan(panDx, panDy));
      pinchLastDist = dist; pinchLastMidX = midX; pinchLastMidY = midY;
      markInteraction();
      return;
    }

    if (!orbit.dragging) return;

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    orbit._moved += Math.abs(dx) + Math.abs(dy);

    if (panMode) {
      orbit._targetGoal.add(screenToWorldPan(dx, dy));
    } else {
      orbit.targetTheta -= dx * 0.005;
      orbit.targetPhi = Math.max(0.25, Math.min(Math.PI - 0.25, orbit.targetPhi - dy * 0.005));
      // Track velocity for inertia — scale by time since last move so fast
      // flicks carry the most momentum regardless of framerate.
      const nowT = performance.now();
      const moveDt = Math.max(1, nowT - lastMoveT);
      // Blend so short bursts don't spike velocity above reasonable levels.
      orbit.velTheta = orbit.velTheta * 0.5 + (-dx * 0.005) * (16 / moveDt) * 0.5;
      orbit.velPhi   = orbit.velPhi * 0.5   + (-dy * 0.005) * (16 / moveDt) * 0.5;
      lastMoveT = nowT;
    }
    markInteraction();
  });

  // ---- Wheel zoom (trackpad + mouse), zoom-to-cursor ----
  dom.addEventListener("wheel", (e) => {
    e.preventDefault();
    markInteraction();
    // Trackpad deltas are small; mouse wheel deltas are chunky. Normalize.
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 20;         // line mode
    else if (e.deltaMode === 2) delta *= 400;   // page mode
    const zoomFactor = Math.exp(delta * 0.0015);
    const oldRadius = orbit.targetRadius;
    const newRadius = Math.max(150, Math.min(900, oldRadius * zoomFactor));
    if (newRadius === oldRadius) return;

    // Zoom-to-cursor: offset the target so the world point under the cursor
    // stays put as radius changes. Only meaningful when zooming in.
    const world = cursorWorldPoint(e);
    if (world) {
      const k = 1 - (newRadius / oldRadius); // 0 = no change, >0 = zooming in
      const offset = world.clone().sub(orbit._targetGoal).multiplyScalar(k * 0.6);
      orbit._targetGoal.add(offset);
    }
    orbit.targetRadius = newRadius;
  }, { passive: false });

  // ---- Keyboard shortcuts ----
  // Arrows rotate, +/- zoom, R resets, F focuses current hover/selection, Esc clears.
  window.addEventListener("keydown", (e) => {
    // Ignore when typing in a field.
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const step = e.shiftKey ? 0.18 : 0.06;
    let handled = true;
    switch (e.key) {
      case "ArrowLeft":  orbit.targetTheta -= step; break;
      case "ArrowRight": orbit.targetTheta += step; break;
      case "ArrowUp":
        orbit.targetPhi = Math.max(0.25, orbit.targetPhi - step); break;
      case "ArrowDown":
        orbit.targetPhi = Math.min(Math.PI - 0.25, orbit.targetPhi + step); break;
      case "+": case "=":
        orbit.targetRadius = Math.max(150, orbit.targetRadius * 0.85); break;
      case "-": case "_":
        orbit.targetRadius = Math.min(900, orbit.targetRadius * 1.18); break;
      case "r": case "R":
        // Reset: home angle, home radius, target at origin. Smooth fly.
        orbit.flyTo({
          theta: 0.9, phi: Math.PI * 0.40, radius: 300,
          target: new THREE.Vector3(0, 0, 0),
          duration: 1.0,
        });
        break;
      case "f": case "F": {
        const id = CFG.focusId || CFG.hoverId;
        if (id && window.MS?.focusThought) window.MS.focusThought(id);
        break;
      }
      case "Escape":
        if (CFG.focusId && window.MS?.focusThought) window.MS.focusThought(null);
        else handled = false;
        break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); markInteraction(); }
  });

  // ---- Double-click to focus site under cursor ----
  dom.addEventListener("dblclick", (e) => {
    const t = screenPick(e);
    if (t && window.MS?.focusThought) {
      window.MS.focusThought(t.id);
      markInteraction();
    }
  });

  // ---------- Palette ----------
  const PAL = C.palette;
  const BRAIN_BASE = new THREE.Color(0x6a4266);    // dim magenta-brown tissue
  const BRAIN_HIGHLIGHT = new THREE.Color(0xd59aa6); // warm flesh-pink
  const AXON_DIM = new THREE.Color(0x3a2a44);
  const SYNAPSE_BRIGHT = new THREE.Color(0xFFE8C8);
  const FIRE = new THREE.Color(0xFF9E5E);

  // Agent registry (case provides array + agentMap keyed by id)
  const agentMap = C.agentMap;  // Map id -> {id, name, hue, role, ...}
  function hueColor(h, s = 0.82, l = 0.58) {
    const c = new THREE.Color();
    c.setHSL(((h % 360) + 360) % 360 / 360, s, l);
    return c;
  }
  function agentColor(id) {
    const a = agentMap.get(id);
    if (!a) return new THREE.Color(0x9B8FAE);
    // Brighter, more saturated — the brain needs to *sing* with agent color,
    // not whisper it. Was s=0.82 l=0.58 → now s=0.92 l=0.65.
    return hueColor(a.hue ?? 260, 0.92, 0.65);
  }

  // ---------- Brain anatomy ----------
  // Build an ellipsoidal cortex (two hemispheres with a central sulcus).
  // Parameters tuned to look like a top/front 3/4 brain view.
  const BRAIN = {
    a: 180,   // x half-axis (hemisphere width)
    b: 135,   // y half-axis (height)
    c: 160,   // z half-axis (front-back depth)
    sulcus: 0,  // no hemispheric gap — unified brain silhouette
    shellFrac: 0.78, // particles on outer shell (cortex)
  };

  // Displace surface to give gyri/sulci (folded cortex) feel.
  function corticalDisplacement(x, y, z) {
    // Low-frequency noise using sin/cos combos (cheap, smooth).
    const f = 0.035;
    const s1 = Math.sin(x * f + y * f * 1.3) * Math.cos(z * f * 1.1);
    const s2 = Math.sin(y * f * 0.8 + z * f * 1.5) * Math.cos(x * f * 0.9);
    const s3 = Math.sin((x + y + z) * f * 0.6);
    return (s1 * 0.6 + s2 * 0.5 + s3 * 0.3) * 6.5; // ±amplitude
  }

  // Assign agents to cortical regions — each agent gets an area on the surface.
  const agentIds = [...agentMap.keys()];
  const regionCenters = agentIds.map((id, i) => {
    // Distribute across the ellipsoid — left hemisphere for half, right for half.
    const leftSide = i % 2 === 0;
    const t = Math.floor(i / 2) / Math.max(1, Math.floor(agentIds.length / 2));
    const theta = (t - 0.5) * Math.PI * 1.1;
    const phi = (Math.sin(i * 2.39) * 0.4 + 0.1) * Math.PI * 0.5;
    const x = (leftSide ? -1 : 1) * (BRAIN.a * 0.55 + BRAIN.sulcus);
    const y = BRAIN.b * 0.4 * Math.cos(phi);
    const z = BRAIN.c * 0.75 * Math.sin(theta);
    return {
      id,
      color: agentColor(id),
      center: new THREE.Vector3(x, y, z),
      name: agentMap.get(id)?.name || id,
    };
  });
  // Fallback if no agents
  if (regionCenters.length === 0) {
    regionCenters.push({ id: "root", color: new THREE.Color(0xB39DDB), center: new THREE.Vector3(0, 0, 0), name: "root" });
  }
  const regionById = new Map(regionCenters.map(r => [r.id, r]));

  // Assign each thought a "site" on the cortex — near its agent's region center,
  // with slight offset per-thought for variety.
  const thoughts = C.thoughts.slice();
  const byId = new Map(thoughts.map(t => [t.id, t]));
  const rootId = C.rootId;
  const primaryParent = new Map();
  for (const t of thoughts) {
    if (t.id === rootId) continue;
    const ps = C.parents.get(t.id) || [];
    primaryParent.set(t.id, ps[0] || rootId);
  }

  // Project a point onto the ellipsoid surface + apply displacement.
  function projectToCortex(x, y, z, hemi) {
    const v = new THREE.Vector3(x, y, z).normalize();
    const sx = v.x * BRAIN.a;
    const sy = v.y * BRAIN.b;
    const sz = v.z * BRAIN.c;
    const d = corticalDisplacement(sx, sy, sz);
    const out = new THREE.Vector3(sx, sy, sz).multiplyScalar(1 + d / 200);
    return out;
  }

  const thoughtSite = new Map(); // thought.id -> {pos, normal, region, hemi}
  for (const t of thoughts) {
    // Pick region by author. Fall back to rootId region if author isn't an agent.
    let region = regionById.get(t.author);
    if (!region) {
      // Hash id to a region so non-agent thoughts still cluster somewhere.
      region = regionCenters[hashStr(t.id) % regionCenters.length];
    }
    // Pick hemisphere from region center
    const hemi = region.center.x < 0 ? "L" : "R";
    // Small offset around region center; amount depends on depth (root closer to center).
    const seed = hashStr(t.id);
    const a = (seed % 997) / 997 * Math.PI * 2;
    const r = 0.15 + ((seed >> 3) % 1000) / 1000 * 0.55; // radial fraction within region
    const upVec = new THREE.Vector3(0, 1, 0);
    const rc = region.center.clone();
    const tangent = new THREE.Vector3().crossVectors(rc.clone().normalize(), upVec).normalize();
    const bitang = new THREE.Vector3().crossVectors(rc.clone().normalize(), tangent).normalize();
    const raw = rc.clone()
      .add(tangent.clone().multiplyScalar(Math.cos(a) * r * 55))
      .add(bitang.clone().multiplyScalar(Math.sin(a) * r * 55));
    const pos = projectToCortex(raw.x, raw.y, raw.z, hemi);
    // Normal ~ pos (ellipsoid outward)
    const normal = new THREE.Vector3(pos.x / BRAIN.a, pos.y / BRAIN.b, pos.z / BRAIN.c).normalize();
    thoughtSite.set(t.id, { pos, normal, region, hemi });
  }

  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // ---------- Particle population ----------
  const TOTAL = 32000;
  const CORTEX_COUNT = Math.floor(TOTAL * 0.85);  // cortex dominates
  const WHITE_COUNT  = Math.floor(TOTAL * 0.15);  // white-matter interior
  const DUST_COUNT   = 0;                          // no dust — keep the form clean

  const positions = new Float32Array(TOTAL * 3);
  const basePos  = new Float32Array(TOTAL * 3); // stable home position
  const colors   = new Float32Array(TOTAL * 3);
  const sizes    = new Float32Array(TOTAL);
  const seeds    = new Float32Array(TOTAL);
  const regionId = new Int16Array(TOTAL);  // index into regionCenters (-1 = dust)
  const kindFlag = new Uint8Array(TOTAL);  // 0=cortex, 1=white, 2=dust

  // Build cortex particles: sample ellipsoid surface uniformly, apply displacement,
  // assign to nearest region.
  for (let i = 0; i < CORTEX_COUNT; i++) {
    // Uniform on sphere
    const u = Math.random(), v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    let nx = Math.sin(phi) * Math.cos(theta);
    let ny = Math.cos(phi);
    let nz = Math.sin(phi) * Math.sin(theta);
    const hemi = nx < 0 ? "L" : "R";
    const sx = nx * BRAIN.a;
    const sy = ny * BRAIN.b;
    const sz = nz * BRAIN.c;
    const d = corticalDisplacement(sx, sy, sz);
    const pos = new THREE.Vector3(sx, sy, sz).multiplyScalar(1 + d / 180);

    basePos[i*3] = pos.x; basePos[i*3+1] = pos.y; basePos[i*3+2] = pos.z;
    positions[i*3] = pos.x; positions[i*3+1] = pos.y; positions[i*3+2] = pos.z;
    kindFlag[i] = 0;
    seeds[i] = Math.random();

    // Nearest region to color this point.
    let best = 0, bestD = Infinity;
    for (let k = 0; k < regionCenters.length; k++) {
      const c = regionCenters[k].center;
      // Only consider same-hemisphere regions
      if ((c.x < 0) !== (hemi === "L")) continue;
      const dx = c.x - pos.x, dy = c.y - pos.y, dz = c.z - pos.z;
      const dd = dx*dx + dy*dy + dz*dz;
      if (dd < bestD) { bestD = dd; best = k; }
    }
    regionId[i] = best;
    // Base color: bright region color with depth shading for form.
    const reg = regionCenters[best];
    const col = reg.color.clone();
    // Front-of-brain brighter than back so the shell reads as a form.
    const facing = Math.max(0, (pos.z / BRAIN.c) * 0.5 + 0.5);
    // Keep some facing-contrast so the brain reads dimensional, but the
    // midrange needs enough saturation that every region's color comes
    // through even on the back of the skull.
    col.multiplyScalar(0.58 + facing * 0.42);
    // Top-of-brain lighter for the crown.
    const lift = Math.max(0, pos.y / BRAIN.b);
    col.lerp(new THREE.Color(0xF5DCC8), lift * 0.12);
    colors[i*3] = col.r; colors[i*3+1] = col.g; colors[i*3+2] = col.b;
    sizes[i] = 2.1 + Math.random() * 1.3;
  }

  // White-matter particles — inside the ellipsoid, clustered along axis.
  for (let i = 0; i < WHITE_COUNT; i++) {
    const idx = CORTEX_COUNT + i;
    const r = Math.pow(Math.random(), 0.6) * 0.85;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const nx = Math.sin(phi) * Math.cos(theta) * r;
    const ny = Math.cos(phi) * r;
    const nz = Math.sin(phi) * Math.sin(theta) * r;
    const pos = new THREE.Vector3(nx * BRAIN.a * 0.85, ny * BRAIN.b * 0.85, nz * BRAIN.c * 0.85);
    basePos[idx*3] = pos.x; basePos[idx*3+1] = pos.y; basePos[idx*3+2] = pos.z;
    positions[idx*3] = pos.x; positions[idx*3+1] = pos.y; positions[idx*3+2] = pos.z;
    kindFlag[idx] = 1;
    seeds[idx] = Math.random();
    regionId[idx] = -1;
    const dim = new THREE.Color(0x5a4560).multiplyScalar(0.6 + Math.random() * 0.3);
    colors[idx*3] = dim.r; colors[idx*3+1] = dim.g; colors[idx*3+2] = dim.b;
    sizes[idx] = 0.9 + Math.random() * 0.8;
  }

  // Dust — very sparse ambient points, kept close to the brain as a faint halo.
  for (let i = 0; i < DUST_COUNT; i++) {
    const idx = CORTEX_COUNT + WHITE_COUNT + i;
    const r = 200 + Math.random() * 120;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const pos = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi) * 0.6,
      r * Math.sin(phi) * Math.sin(theta),
    );
    basePos[idx*3] = pos.x; basePos[idx*3+1] = pos.y; basePos[idx*3+2] = pos.z;
    positions[idx*3] = pos.x; positions[idx*3+1] = pos.y; positions[idx*3+2] = pos.z;
    kindFlag[idx] = 2;
    seeds[idx] = Math.random();
    regionId[idx] = -1;
    colors[idx*3] = 0.35; colors[idx*3+1] = 0.28; colors[idx*3+2] = 0.42;
    sizes[idx] = 0.4 + Math.random() * 0.4;
  }

  // Pulse and fire buffers (updated per-frame).
  const pulse = new Float32Array(TOTAL);  // 0..1 temporary boost
  const fireColor = new Float32Array(TOTAL * 3); // additive warm color

  // Geometry + shader material.
  const geom = new THREE.BufferGeometry();
  const posBA    = new THREE.BufferAttribute(positions, 3);
  const colorBA  = new THREE.BufferAttribute(colors, 3);
  const sizeBA   = new THREE.BufferAttribute(sizes, 1);
  const pulseBA  = new THREE.BufferAttribute(pulse, 1);
  const fireBA   = new THREE.BufferAttribute(fireColor, 3);
  const seedBA   = new THREE.BufferAttribute(seeds, 1);
  const flagBA   = new THREE.BufferAttribute(kindFlag, 1);
  const regionBA = new THREE.Float32BufferAttribute(new Float32Array(regionId), 1);
  posBA.usage = THREE.DynamicDrawUsage;
  pulseBA.usage = THREE.DynamicDrawUsage;
  fireBA.usage = THREE.DynamicDrawUsage;
  geom.setAttribute("position", posBA);
  geom.setAttribute("aColor", colorBA);
  geom.setAttribute("aSize", sizeBA);
  geom.setAttribute("aPulse", pulseBA);
  geom.setAttribute("aFire", fireBA);
  geom.setAttribute("aSeed", seedBA);
  geom.setAttribute("aFlag", flagBA);
  geom.setAttribute("aRegion", regionBA);
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 900);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uMorph: { value: 0 },       // 0..1 boot-in
      uAmbient: { value: 0.9 },
      uBreath: { value: 0 },      // global breath phase (0..1)
      // Thought-waves: up to 6 concurrent. Each has origin, startTime, color,
      // strength, speed, band width, and kind (encodes shell profile).
      //   kind 0 = thought    (small, soft)
      //   kind 1 = decision   (large, double shell)
      //   kind 2 = delegation (fast, directional — pierces across)
      //   kind 3 = action     (medium, warm)
      //   kind 4 = complete   (huge, golden)
      //   kind 5 = block      (red, stuttering)
      uWaveOrigins: { value: Array.from({length: 6}, () => new THREE.Vector3()) },
      uWaveDirs:    { value: Array.from({length: 6}, () => new THREE.Vector3()) },
      uWaveStart:   { value: new Array(6).fill(-999) },
      uWaveColor:   { value: Array.from({length: 6}, () => new THREE.Color(1,1,1)) },
      uWaveStrength:{ value: new Array(6).fill(0) },
      uWaveSpeed:   { value: new Array(6).fill(95) },
      uWaveKind:    { value: new Array(6).fill(0) },
      // Per-region activity levels (0..1) for Pass 2 shimmer state.
      // Supports up to 12 regions; indexed by regionId attribute.
      uRegionActivity: { value: new Array(12).fill(0) },
      uRegionMood:     { value: new Array(12).fill(0) }, // 0 idle, 1 thinking, 2 working, 3 blocked
      // Per-region "awake" (0..1): 0 = not yet delegated to (wears origin color),
      // 1 = fully revealed in agent color. Fades up as delegations land.
      uRegionAwake:    { value: new Array(12).fill(0) },
      // The unified origin color — what the whole brain looks like before any
      // region wakes. Typically the project-lead / root agent's color, dimmed.
      uOriginColor:    { value: new THREE.Color(0x9b7ea8) },
      // Global shockwave intensity multiplier — controls the cortex-wide
      // expanding shell that sweeps the whole brain per event.
      uShockwave:      { value: 1.0 },
      // Particle recruitment: dormant particles rush toward active sites for
      // ~0.6s after a major event, then settle back. Up to 4 concurrent.
      uRecruitOrigin:  { value: Array.from({length: 4}, () => new THREE.Vector3()) },
      uRecruitStart:   { value: new Array(4).fill(-999) },
      uRecruitStrength:{ value: new Array(4).fill(0) },
    },
    vertexShader: /* glsl */`
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPulse;
      attribute vec3 aFire;
      attribute float aSeed;
      attribute float aFlag;
      attribute float aRegion;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uMorph;
      uniform float uBreath;
      uniform vec3  uWaveOrigins[6];
      uniform vec3  uWaveDirs[6];
      uniform float uWaveStart[6];
      uniform vec3  uWaveColor[6];
      uniform float uWaveStrength[6];
      uniform float uWaveSpeed[6];
      uniform float uWaveKind[6];
      uniform float uShockwave;
      uniform vec3  uRecruitOrigin[4];
      uniform float uRecruitStart[4];
      uniform float uRecruitStrength[4];
      uniform float uRegionActivity[12];
      uniform float uRegionMood[12];
      uniform float uRegionAwake[12];
      uniform vec3  uOriginColor;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vDepth;

      float h11(float x) { return fract(sin(x * 43.1) * 4321.0); }

      void main() {
        // Global breath — synchronizes all regions (the mind "inhales" together).
        float breathAmp = 0.010 + 0.016 * uBreath;
        vec3 outward = normalize(position + vec3(0.001));
        vec3 wp = position + outward * (breathAmp * length(position));

        // --- Per-particle swarm motion ---
        // Each particle gently wanders around its target. Calm, not frantic —
        // the brain should feel alive at rest, with event-driven motion clearly
        // standing out against that baseline.
        float sA = aSeed * 6.2831;
        float sB = aSeed * 12.97 + 1.3;
        float sC = aSeed * 3.17 + 4.7;
        float fA = 0.35 + h11(aSeed) * 0.4;        // ~0.35–0.75 Hz
        float fB = 0.28 + h11(aSeed + 1.1) * 0.35;
        float fC = 0.42 + h11(aSeed + 2.3) * 0.35;
        vec3 swarm = vec3(
          sin(uTime * fA + sA) + 0.5 * sin(uTime * fB * 1.7 + sB),
          sin(uTime * fB + sB) + 0.5 * cos(uTime * fC * 1.3 + sC),
          sin(uTime * fC + sC) + 0.5 * sin(uTime * fA * 1.5 + sA * 0.7)
        );
        // Calm amplitude — cortex swims in a ~1.8 unit cloud.
        float swarmAmp = (aFlag < 0.5) ? 1.8 : (aFlag > 1.5 ? 3.0 : 1.3);
        wp += swarm * swarmAmp;

        // Boot-in morph
        wp = mix(position * 0.3, wp, uMorph);

        // --- Per-region mood shimmer (only applies to cortex) ---
        int rid = int(aRegion + 0.5);
        float regionAct = 0.0;
        float regionMood = 0.0;
        if (rid >= 0 && rid < 12) {
          regionAct = uRegionActivity[rid];
          regionMood = uRegionMood[rid];
        }

        float ph = aSeed * 6.2831;
        float t  = uTime;

        // Base idle shimmer — subtle, same everywhere.
        float baseShim = sin(t * 1.4 + ph) * 0.22 + cos(t * 1.9 + ph * 1.6) * 0.14;

        // Idle color breath: every cortex particle gently brightens in its
        // agent color so regions read as *alive* even without events.
        // Softer than before — was blowing out the warm regions.
        float idleBreath = 0.0;
        if (aFlag < 0.5) {
          idleBreath = (sin(t * 0.9 + ph * 0.7) * 0.5 + 0.5) * 0.14;
        }

        // Mood-driven shimmer (cortex only).
        float moodShim = 0.0;
        vec3  moodTint = vec3(0.0);
        if (aFlag < 0.5 && regionAct > 0.01) {
          if (regionMood < 0.5) {
            // idle — nothing
          } else if (regionMood < 1.5) {
            // thinking: slow inward-gathering shimmer
            moodShim = sin(t * 2.4 - length(position) * 0.06 + ph * 0.3) * 0.55 * regionAct;
            moodTint = vec3(0.3, 0.4, 0.7) * regionAct * 0.25;
          } else if (regionMood < 2.5) {
            // working: fast outward radiating shimmer
            moodShim = sin(t * 4.2 + length(position) * 0.08 + ph * 0.2) * 0.75 * regionAct;
            moodTint = aColor * regionAct * 0.4;
          } else {
            // blocked: stuttering, reddish flicker
            float stutter = step(0.6, h11(floor(t * 10.0) * 0.013 + ph));
            moodShim = stutter * (sin(t * 30.0 + ph) * 0.9) * regionAct;
            moodTint = vec3(1.0, 0.25, 0.22) * regionAct * 0.5;
          }
        }

        float totalShim = baseShim + moodShim;
        if (aFlag < 0.5) {
          wp += outward * totalShim * 0.9;
        } else {
          wp += vec3(totalShim, totalShim * 0.7, totalShim * 0.5) * 0.8;
        }

        // --- Idle flow (cortex) ---
        // Slow tangential drift along the brain surface so it feels alive at rest.
        // Attenuates where regions have event-driven activity so it doesn't fight pulses.
        if (aFlag < 0.5) {
          // Build a smooth tangential vector field via three offset sin/cos layers.
          // Coordinates are scaled so the pattern wraps slowly across the brain.
          vec3 q = position * 0.008;
          float T = t * 0.28; // base temporal speed (was 0.18 — now more animated)
          // Layer A — slow, broad currents
          float aX = sin(q.y * 1.7 + T) + sin(q.z * 2.1 - T * 0.7);
          float aY = cos(q.z * 1.3 - T) + sin(q.x * 1.9 + T * 0.8);
          float aZ = sin(q.x * 1.5 + T * 0.9) + cos(q.y * 2.0 - T * 0.6);
          // Layer B — mid-frequency eddies
          float bX = sin(q.y * 4.3 + t * 0.75 + ph) * 0.75;
          float bY = cos(q.z * 3.9 - t * 0.7 + ph * 1.3) * 0.75;
          float bZ = sin(q.x * 4.1 + t * 0.8 + ph * 0.7) * 0.75;
          // Layer C — faster filigree; breaks up uniformity, adds shimmer.
          float cX = sin(q.y * 7.3 + t * 1.4 + ph * 2.1) * 0.35;
          float cY = cos(q.z * 7.9 - t * 1.3 + ph * 1.7) * 0.35;
          float cZ = sin(q.x * 8.1 + t * 1.5 + ph * 2.5) * 0.35;
          vec3 flow = vec3(aX + bX + cX, aY + bY + cY, aZ + bZ + cZ);
          // Project flow onto the tangent plane (remove component along outward).
          flow = flow - outward * dot(flow, outward);
          // Swirl component: cross outward × flow for vortical motion along surface.
          vec3 swirl = cross(outward, flow) * 0.55;
          // Attenuate where the region is active — real events dominate locally.
          float idleWeight = 1.0 - clamp(regionAct * 1.4, 0.0, 0.95);
          // Gentle breath modulation so the whole brain inhales/exhales the flow.
          float breathBlend = 0.6 + 0.5 * uBreath;
          // Overall amp raised from 0.9 → 1.6 for visibly more flowy motion.
          wp += (flow + swirl) * 1.6 * idleWeight * breathBlend;

          // Tiny outward breathe ripple so the surface itself looks like it
          // inhales subtly — gives depth to the flow without ballooning the brain.
          float breatheRipple = sin(t * 0.45 + length(position) * 0.03 + ph * 0.4) * 0.4;
          wp += outward * breatheRipple * idleWeight * 0.5;
        }

        // --- Idle drift (white matter + dust) ---
        // Very slow meandering for inner fibers and far-field dust so the scene
        // never looks frozen. Smaller amplitude than cortex flow.
        if (aFlag > 0.5) {
          float T = t * 0.12;
          vec3 q = position * 0.006;
          vec3 drift = vec3(
            sin(q.y * 1.3 + T + ph),
            cos(q.z * 1.1 - T * 0.8),
            sin(q.x * 1.4 + T * 0.9 + ph * 1.2)
          );
          // Dust (flag=2) drifts slightly more freely; white matter stays tighter.
          float amp = (aFlag > 1.5) ? 1.6 : 0.5;
          wp += drift * amp;
          // Dust: also gentle swirl around Y so the halo feels like weather.
          if (aFlag > 1.5) {
            float a = t * 0.04 + ph * 0.8;
            float cx = cos(a), sx = sin(a);
            vec3 rot = vec3(
              wp.x * cx - wp.z * sx,
              wp.y,
              wp.x * sx + wp.z * cx
            );
            wp = mix(wp, rot, 0.015);
          }
        }

        // --- Thought-waves (kind-aware) ---
        float waveBoost = 0.0;
        vec3 waveTint = vec3(0.0);

        // --- Particle recruitment ---
        // Dormant particles in a shell [50..140] around a recruitment origin
        // briefly drift TOWARD the origin, then settle back. Reads as "the
        // brain pulling mass toward the thought site" on peak events.
        if (aFlag < 0.5) {
          for (int r = 0; r < 4; r++) {
            float rdt = uTime - uRecruitStart[r];
            if (rdt < 0.0 || rdt > 0.9) continue;
            vec3 toO = uRecruitOrigin[r] - position;
            float rdist = length(toO);
            // Shell band — only far-ish particles feel the tug.
            if (rdist < 45.0 || rdist > 180.0) continue;
            float bandW = smoothstep(45.0, 90.0, rdist) * (1.0 - smoothstep(140.0, 180.0, rdist));
            // Life envelope — rise fast, settle slowly (so there's an overshoot).
            float env = rdt < 0.18
              ? rdt / 0.18
              : (1.0 - (rdt - 0.18) / 0.72);
            // Overshoot pulse: particle moves ~4-8 units toward origin then back.
            float pull = env * bandW * uRecruitStrength[r];
            wp += normalize(toO + vec3(0.001)) * pull * 6.0;
            // Subtle color tint toward fire while recruited.
            waveTint += vec3(1.0, 0.82, 0.58) * pull * 0.15;
          }
        }
        for (int i = 0; i < 6; i++) {
          float dt = uTime - uWaveStart[i];
          if (dt < 0.0 || dt > 2.5) continue;
          float k = uWaveKind[i];
          float speed = uWaveSpeed[i];
          float radius = dt * speed;
          float dist = distance(position, uWaveOrigins[i]);

          // -------- GLOBAL SHOCKWAVE SHELL --------
          // Big cortex-wide expanding shell per event — sweeps the whole
          // brain. Independent of the local wave below; runs first so late
          // ticks still contribute even after the local wave has expired.
          if (uShockwave > 0.001 && dt < 2.2) {
            float gSpeed = 95.0;                          // big, fast shell
            float gRadius = dt * gSpeed;
            float gBand = 22.0;                           // wide crest
            float gHit = smoothstep(gBand, 0.0, abs(dist - gRadius));
            float gLife = 1.0 - smoothstep(0.0, 2.2, dt);
            float gAmount = gHit * gLife * uShockwave * (0.55 + uWaveStrength[i] * 0.35);
            waveBoost += gAmount * 0.9;
            waveTint += uWaveColor[i] * gAmount * 0.75;
            wp += outward * gAmount * 2.1;
          }

          // -------- LOCAL wave (kind-aware) --------
          // Hard cap: waves never sweep further than ~45 units from origin.
          if (dt > 1.4 || radius > 45.0 || dist > 55.0) continue;
          float dirAlign = 1.0;

          // Delegation (kind 2) is directional: stronger along dir, weaker elsewhere.
          if (k > 1.5 && k < 2.5) {
            vec3 toP = normalize(position - uWaveOrigins[i] + vec3(0.001));
            dirAlign = max(0.0, dot(toP, normalize(uWaveDirs[i])));
            dirAlign = pow(dirAlign, 3.0) * 1.5 + 0.15;
          }

          // Decision (kind 1) emits a DOUBLE shell.
          // Wider bands = more particles swept by each wave crest = more obvious shockwave.
          float band = (k < 0.5) ? 14.0 : (k < 1.5 ? 16.0 : (k < 2.5 ? 11.0 : (k < 3.5 ? 18.0 : (k < 4.5 ? 28.0 : 13.0))));
          float primary = smoothstep(band, 0.0, abs(dist - radius));
          float secondary = 0.0;
          if (k > 0.5 && k < 1.5) {
            // double shell — second ring trailing the first
            float r2 = max(0.0, radius - 28.0);
            secondary = smoothstep(band * 0.8, 0.0, abs(dist - r2)) * 0.65;
          }
          // Block (kind 5) stutters.
          float stutterMul = 1.0;
          if (k > 4.5) {
            stutterMul = step(0.5, h11(floor(dt * 12.0) * 0.1));
          }

          float bandHit = (primary + secondary) * dirAlign * stutterMul;
          float lifeFade = 1.0 - smoothstep(0.0, 1.4, dt);
          float hit = bandHit * lifeFade * uWaveStrength[i];
          waveBoost += hit;
          waveTint += uWaveColor[i] * hit;
          // Push particle outward (or along dir for delegation).
          if (k > 1.5 && k < 2.5) {
            wp += normalize(uWaveDirs[i]) * hit * 1.5;
          } else {
            wp += outward * hit * 1.6;
          }
        }

        vec4 mvPosition = modelViewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float s = aSize * (1.0 + aPulse * 3.0 + waveBoost * 3.2 + abs(moodShim) * 0.4);
        gl_PointSize = s * 4.2 * uPixelRatio * (420.0 / -mvPosition.z);

        // Resolve "awake" blend for this particle's region. Cortex only —
        // white matter and dust stay neutral regardless.
        float awake = 1.0;
        if (aFlag < 0.5 && rid >= 0 && rid < 12) {
          awake = uRegionAwake[rid];
        }
        // Mix from origin color → agent color as the region wakes.
        // Preserve the depth shading that's baked into aColor by using its
        // luminance as a shading mask on the origin color.
        float shade = (aColor.r + aColor.g + aColor.b) / 3.0;
        vec3 originShaded = uOriginColor * (0.4 + shade * 1.2);
        vec3 tinted = mix(originShaded, aColor, awake);
        vec3 base = tinted + moodTint;
        // Idle breath: add a gentle agent-color glow so cortex always reads
        // as *alive*. Subtle enough not to wash out mood/fire.
        base += aColor * idleBreath * awake * 0.35;
        vec3 fireC = aFire + waveTint * 1.05;
        vec3 hot = vec3(1.0, 0.82, 0.58);
        base = base + fireC;
        base = mix(base, hot, clamp(aPulse * 0.85 + waveBoost * 0.65, 0.0, 0.95));

        // Face-toward-camera shading: front cortex bright, back dim.
        vec3 nrm = normalize(position);
        vec3 viewDir = normalize((inverse(modelViewMatrix) * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        float facing = clamp(dot(nrm, viewDir) * 0.5 + 0.5, 0.0, 1.0);
        // Baseline cortex brightness. Lower mid-range keeps the back of the
        // brain visibly present (not swallowed by black) but stops the front
        // from blowing out into uniform amber under additive blending.
        float formMul = (aFlag < 0.5) ? (0.72 + pow(facing, 0.85) * 0.48) : 1.0;
        vColor = base * formMul;

        // Ambient sparkle: removed — no noise without cause.

        float backAlpha = (aFlag < 0.5) ? (0.72 + facing * 0.28) : 1.0;
        float flagA = (aFlag < 0.5) ? backAlpha : (aFlag < 1.5 ? 0.55 : 0.3);
        vAlpha = flagA * (0.95 + aPulse * 0.3 + waveBoost * 0.5);

        // Chromatic depth — far particles desaturate/cool in the fragment shader.
        // Brain particles span roughly -mvPosition.z in [280..540] typically.
        float zdist = -mvPosition.z;
        vDepth = clamp((zdist - 300.0) / 300.0, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vAlpha;
      varying float vDepth;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        float glow = pow(core, 2.2);
        // Chromatic depth: far particles desaturate toward cool/blue haze.
        // vDepth in [0..1] where 1 = far.
        float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
        vec3 haze = mix(vColor, vec3(lum) * vec3(0.7, 0.78, 1.05), vDepth * 0.45);
        vec3 c = mix(vColor, haze, vDepth * 0.65);
        gl_FragColor = vec4(c * glow, glow * vAlpha * (1.0 - vDepth * 0.18));
      }
    `
  });

  const points = new THREE.Points(geom, mat);
  scene.add(points);

  // ---------- Brain halo (soft glow behind the particles) ----------
  // A large ellipsoid mesh with a fresnel-like shader that glows warmly
  // at the silhouette and fades to transparent facing the camera. Acts as
  // a subtle mood light so the brain "sits" in space rather than floating.
  const haloGeom = new THREE.SphereGeometry(1, 48, 32);
  const haloMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: mat.uniforms.uTime,
      uColor: { value: new THREE.Color(0x4a2e5a) },   // cool violet rim
      uColorB: { value: new THREE.Color(0x6a3a2c) }, // warm ember pocket
      uIntensity: { value: 0.55 },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vPos;
      void main() {
        vN = normalize(normalMatrix * normal);
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uColorB;
      uniform float uIntensity;
      varying vec3 vN;
      varying vec3 vPos;
      void main() {
        // Fresnel: brighter at edges (back-side = front-facing normals point in)
        float fres = 1.0 - abs(dot(normalize(vN), vec3(0.0, 0.0, 1.0)));
        fres = pow(fres, 2.2);
        // Vertical gradient from violet (top) to warm ember (bottom-front).
        float vBlend = smoothstep(-1.0, 1.0, normalize(vPos).y);
        vec3 col = mix(uColorB, uColor, vBlend);
        // Slow breathing pulse.
        float breath = 0.85 + 0.15 * sin(uTime * 0.45);
        // Additive blending — alpha must be 1.0 so the add isn't modulated.
        // Fresnel already darkens the RGB at the silhouette, which is the
        // look we want; letting alpha fall off here caused a ring of apparent
        // darkness against bright particles behind the halo.
        gl_FragColor = vec4(col * fres * uIntensity * breath, 1.0);
      }`,
  });
  const halo = new THREE.Mesh(haloGeom, haloMat);
  // Slightly oversized around the brain ellipsoid (a,b,c = 150,100,120).
  halo.scale.set(220, 150, 180);
  scene.add(halo);

  // ---------- Neural core ----------
  // A soft bright sphere at the brain's center. Its intensity tracks the
  // EMA-smoothed global firing rate — the mind has a visible "heartbeat".
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { uIntensity: { value: 0 }, uColor: { value: new THREE.Color(0xffd8a8) } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uIntensity;
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vV;
      void main(){
        // Facing camera glows brightest; edges fall off.
        float f = pow(max(dot(vN, vV), 0.0), 1.4);
        float a = f * (0.10 + uIntensity * 0.55);
        gl_FragColor = vec4(uColor * (0.8 + uIntensity * 1.6), a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const neuralCore = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), coreMat);
  neuralCore.renderOrder = -2;
  neuralCore.scale.set(22, 18, 20);
  scene.add(neuralCore);

  // ---------- Axon chains (lines) ----------
  // For each parent-child edge, we build a smooth curve between sites, curving
  // outward along the cortical surface. Flow particles travel along curves
  // when firing. When idle, edges are drawn faintly.
  const edges = [];
  const edgeByChild = new Map();
  for (const [childId, parentId] of primaryParent.entries()) {
    const a = thoughtSite.get(parentId);
    const b = thoughtSite.get(childId);
    if (!a || !b) continue;
    // Curve: lift midpoint outward along averaged normal (for cortical sweep),
    // or arc across the midline if inter-hemispheric.
    const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5);
    const nrm = a.normal.clone().add(b.normal).normalize();
    let lift = 18;
    if (a.hemi !== b.hemi) {
      // Inter-hemispheric — curve up and through corpus-callosum-like bridge.
      mid.y += 28;
      mid.x *= 0.25; // pull toward centerline
      lift = 8;
    }
    const control = mid.clone().add(nrm.clone().multiplyScalar(lift));
    const curve = new THREE.QuadraticBezierCurve3(a.pos.clone(), control, b.pos.clone());
    const samples = curve.getPoints(22);
    // Also store a flat array of positions for the line.
    const arr = new Float32Array(samples.length * 3);
    for (let i = 0; i < samples.length; i++) {
      arr[i*3] = samples[i].x; arr[i*3+1] = samples[i].y; arr[i*3+2] = samples[i].z;
    }
    const e = {
      parentId, childId,
      curve,
      samples,
      positionsArr: arr,
      interHemi: a.hemi !== b.hemi,
      activity: 0, // decays over time
      lastFire: -Infinity,
    };
    edges.push(e);
    edgeByChild.set(childId, e);
  }

  // Idle edge mesh — one combined LineSegments for all edges, low opacity.
  const idleVerts = [];
  const idleCols = [];
  for (const e of edges) {
    const s = e.samples;
    const region = thoughtSite.get(e.parentId).region;
    const col = region.color.clone().multiplyScalar(0.7);
    for (let i = 0; i < s.length - 1; i++) {
      idleVerts.push(s[i].x, s[i].y, s[i].z, s[i+1].x, s[i+1].y, s[i+1].z);
      idleCols.push(col.r, col.g, col.b, col.r, col.g, col.b);
    }
  }
  const idleGeom = new THREE.BufferGeometry();
  idleGeom.setAttribute("position", new THREE.Float32BufferAttribute(idleVerts, 3));
  idleGeom.setAttribute("color", new THREE.Float32BufferAttribute(idleCols, 3));
  const idleMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const idleLines = new THREE.LineSegments(idleGeom, idleMat);
  scene.add(idleLines);

  // Active edges — bright animated line per edge, drawn only when firing.
  // We'll use a single buffer we rewrite each frame with only active edges.
  const MAX_ACTIVE = 120;
  const activeGeom = new THREE.BufferGeometry();
  const activePos = new Float32Array(MAX_ACTIVE * 24 * 3); // up to 24 segs * 2 verts * 3 coords
  const activeCol = new Float32Array(MAX_ACTIVE * 24 * 3);
  activeGeom.setAttribute("position", new THREE.BufferAttribute(activePos, 3));
  activeGeom.setAttribute("color", new THREE.BufferAttribute(activeCol, 3));
  const activeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, linewidth: 2 });
  const activeLines = new THREE.LineSegments(activeGeom, activeMat);
  scene.add(activeLines);

  // ---------- Firing bolts (traveling particles along edges) ----------
  const MAX_BOLTS = 1200;
  const bolts = []; // {edge, t, speed, color, life, kind}
  const boltGeom = new THREE.BufferGeometry();
  const boltPos = new Float32Array(MAX_BOLTS * 3);
  const boltCol = new Float32Array(MAX_BOLTS * 3);
  const boltSize = new Float32Array(MAX_BOLTS);
  boltGeom.setAttribute("position", new THREE.BufferAttribute(boltPos, 3));
  boltGeom.setAttribute("aColor", new THREE.BufferAttribute(boltCol, 3));
  boltGeom.setAttribute("aSize", new THREE.BufferAttribute(boltSize, 1));
  boltGeom.setDrawRange(0, 0);
  boltGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 900);
  const boltMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * (300.0 / -mv.z);
        vColor = aColor;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        float glow = pow(core, 1.6);
        gl_FragColor = vec4(vColor * glow, glow);
      }
    `
  });
  const boltPoints = new THREE.Points(boltGeom, boltMat);
  scene.add(boltPoints);

  // ---------- Synaptic Lightning (branching electric arcs) ----------
  // When a major event (decision / delegation / complete / block) fires,
  // emit a handful of branching forked arcs from the site. Purely visual —
  // zero data meaning — but communicates "this is a peak moment" viscerally.
  // Each arc = a polyline made of up to 12 segments, additive, cyan-white core.
  const MAX_ARCS = 64;              // concurrent arcs
  const ARC_SEGS = 12;              // segments per arc (vertices = ARC_SEGS)
  const arcGeom = new THREE.BufferGeometry();
  const arcPos = new Float32Array(MAX_ARCS * ARC_SEGS * 3);
  const arcCol = new Float32Array(MAX_ARCS * ARC_SEGS * 3);
  arcGeom.setAttribute("position", new THREE.BufferAttribute(arcPos, 3));
  arcGeom.setAttribute("color", new THREE.BufferAttribute(arcCol, 3));
  // Draw as one LineSegments per arc by indexing; we use separate LineStrips via
  // setDrawRange tricks won't work for multiple strips. Instead: a single
  // LineSegments drawing ARC_SEGS-1 segment-pairs per arc. Build index once.
  const arcIdx = new Uint16Array(MAX_ARCS * (ARC_SEGS - 1) * 2);
  for (let a = 0; a < MAX_ARCS; a++) {
    for (let s = 0; s < ARC_SEGS - 1; s++) {
      const base = a * ARC_SEGS;
      arcIdx[(a * (ARC_SEGS - 1) + s) * 2]     = base + s;
      arcIdx[(a * (ARC_SEGS - 1) + s) * 2 + 1] = base + s + 1;
    }
  }
  arcGeom.setIndex(new THREE.BufferAttribute(arcIdx, 1));
  arcGeom.setDrawRange(0, 0);
  arcGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 900);
  const arcMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    linewidth: 1, // WebGL caps at 1 but additive makes it read brighter
  });
  const arcLines = new THREE.LineSegments(arcGeom, arcMat);
  arcLines.frustumCulled = false;
  scene.add(arcLines);
  // Each arc: {slot, t, life, color, points:[Vec3...], targetPts:[Vec3...]}
  const arcs = [];
  let arcCursor = 0;

  function spawnLightning(origin, color, count = 3, spread = 80, kind = "decision") {
    // Kind tuning
    const isBlock = kind === "block";
    const len = isBlock ? spread * 0.55 : spread;
    for (let n = 0; n < count; n++) {
      if (arcs.length >= MAX_ARCS) arcs.shift();
      const slot = arcCursor % MAX_ARCS;
      arcCursor++;
      // Build jagged polyline from origin outward in a random-ish direction.
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.4) * 2,
        (Math.random() - 0.5) * 2
      ).normalize();
      // Tangent (for jitter perpendicular to main axis)
      const up = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const tan = new THREE.Vector3().crossVectors(dir, up).normalize();
      const bin = new THREE.Vector3().crossVectors(dir, tan).normalize();
      const pts = [];
      const segLen = len / (ARC_SEGS - 1);
      let cur = origin.clone();
      pts.push(cur.clone());
      for (let s = 1; s < ARC_SEGS; s++) {
        cur = cur.clone().addScaledVector(dir, segLen);
        // Perpendicular jitter decays toward tip so spine stays recognizable.
        const decay = Math.pow(1 - s / ARC_SEGS, 0.7);
        const jitterMag = segLen * 0.9 * (isBlock ? 1.4 : 1.0);
        cur.addScaledVector(tan, (Math.random() - 0.5) * jitterMag * decay);
        cur.addScaledVector(bin, (Math.random() - 0.5) * jitterMag * decay);
        pts.push(cur.clone());
      }
      const life = isBlock ? 0.55 : 0.38 + Math.random() * 0.18;
      arcs.push({ slot, t: 0, life, color: color.clone(), points: pts, kind });
    }
  }

  // ---------- God-rays (volumetric light shafts) ----------
  // On peak moments, emit a set of radial light shafts from the event site —
  // long, soft, billboarded quads that grow and fade. Reads as a burst of
  // light escaping the cortex. Kept sparse so it feels precious.
  const MAX_RAYS = 48;
  const rayQuadGeom = new THREE.PlaneGeometry(1, 1);
  function makeRayMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(1, 1, 1) },
        uAlpha: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uAlpha;
        void main() {
          // Shaft profile: bright centerline, soft feather at edges, tapered tip.
          float cx = abs(vUv.x - 0.5) * 2.0;     // 0 center → 1 edge
          float cy = vUv.y;                      // 0 base → 1 tip
          float feather = 1.0 - smoothstep(0.0, 1.0, cx);
          feather = pow(feather, 2.4);
          float shaft = (1.0 - cy) * feather;
          // Extra core hotspot near base
          float core = pow(feather, 5.0) * (1.0 - cy) * 1.4;
          vec3 col = uColor * (shaft + core * 0.7);
          gl_FragColor = vec4(col, (shaft * 0.7 + core * 0.3) * uAlpha);
        }
      `,
    });
  }
  const rays = []; // meshes currently active
  const rayPool = [];
  for (let i = 0; i < MAX_RAYS; i++) {
    const m = new THREE.Mesh(rayQuadGeom, makeRayMaterial());
    m.visible = false;
    m.renderOrder = 3;
    m.frustumCulled = false;
    scene.add(m);
    rayPool.push(m);
  }
  let rayCursor = 0;
  function spawnGodRays(origin, color, count = 6, length = 140) {
    for (let n = 0; n < count; n++) {
      const m = rayPool[rayCursor % MAX_RAYS];
      rayCursor++;
      // Random outward direction, biased upward for drama.
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.4 - 0.2,
        (Math.random() - 0.5) * 2
      ).normalize();
      const len = length * (0.7 + Math.random() * 0.6);
      const width = 18 + Math.random() * 14;
      m.scale.set(width, len, 1);
      m.position.copy(origin).addScaledVector(dir, len * 0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      m.quaternion.copy(quat);
      m.material.uniforms.uColor.value.copy(color);
      m.material.uniforms.uAlpha.value = 0;
      m.userData.life = 0.9 + Math.random() * 0.4;
      m.userData.t = 0;
      m.userData.baseLen = len;
      m.userData.baseW = width;
      m.userData.dir = dir;
      m.userData.origin = origin.clone();
      m.visible = true;
      if (!rays.includes(m)) rays.push(m);
    }
  }

  // ---------- Thought trails (fading wakes behind bolts) ----------
  // Each bolt leaves a fading trail of points — reads as bioluminescent wake
  // through the axon. Trails use a separate BufferGeometry of points.
  const MAX_TRAIL_POINTS = 2400;
  const trailGeom = new THREE.BufferGeometry();
  const trailPos = new Float32Array(MAX_TRAIL_POINTS * 3);
  const trailCol = new Float32Array(MAX_TRAIL_POINTS * 3);
  const trailSize = new Float32Array(MAX_TRAIL_POINTS);
  const trailAge = new Float32Array(MAX_TRAIL_POINTS); // 0..1 (1 = fresh, 0 = dead)
  trailGeom.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeom.setAttribute("aColor", new THREE.BufferAttribute(trailCol, 3));
  trailGeom.setAttribute("aSize", new THREE.BufferAttribute(trailSize, 1));
  trailGeom.setAttribute("aAge", new THREE.BufferAttribute(trailAge, 1));
  trailGeom.setDrawRange(0, 0);
  trailGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 900);
  const trailMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAge;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAge;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * aAge * uPixelRatio * (300.0 / -mv.z);
        vColor = aColor;
        vAge = aAge;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAge;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        float glow = pow(core, 2.0);
        gl_FragColor = vec4(vColor * glow * vAge, glow * vAge * 0.85);
      }
    `
  });
  const trailPoints = new THREE.Points(trailGeom, trailMat);
  trailPoints.frustumCulled = false;
  scene.add(trailPoints);
  let trailCursor = 0;
  function emitTrail(x, y, z, color, size) {
    const i = trailCursor % MAX_TRAIL_POINTS;
    trailCursor++;
    trailPos[i*3] = x; trailPos[i*3+1] = y; trailPos[i*3+2] = z;
    trailCol[i*3] = color.r; trailCol[i*3+1] = color.g; trailCol[i*3+2] = color.b;
    trailSize[i] = size;
    trailAge[i] = 1.0;
  }

  // ---------- Neural Constellations ----------
  // When multiple regions fire within a short window, draw fading lines
  // connecting their centers — the brain showing you it's routing thought
  // across areas. Always represents real co-activity.
  const MAX_CONSTELLATION_LINES = 32;
  const constGeom = new THREE.BufferGeometry();
  const constPos = new Float32Array(MAX_CONSTELLATION_LINES * 2 * 3);
  const constCol = new Float32Array(MAX_CONSTELLATION_LINES * 2 * 3);
  constGeom.setAttribute("position", new THREE.BufferAttribute(constPos, 3));
  constGeom.setAttribute("color", new THREE.BufferAttribute(constCol, 3));
  constGeom.setDrawRange(0, 0);
  constGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 900);
  const constMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const constLines = new THREE.LineSegments(constGeom, constMat);
  constLines.frustumCulled = false;
  scene.add(constLines);
  const constellations = []; // {a:regionIdx, b:regionIdx, t, life, color}
  function tryConstellation(now) {
    // Find all regions with activity > threshold in the last 1.2s
    const hot = [];
    for (let r = 0; r < regionCenters.length; r++) {
      const aid = regionIdToAgentId[r];
      const st = agentState.get(aid);
      if (!st) continue;
      if (st.activity > 0.35 && (now - (st.lastFireT ?? -99)) < 1.6) {
        hot.push(r);
      }
    }
    if (hot.length < 2) return;
    // Draw edges in a fan from the most-recent region to the others.
    // Avoid duplicates — only add a line if one isn't already alive between the pair.
    const latest = hot.reduce((best, r) => {
      const s = agentState.get(regionIdToAgentId[r]);
      const bs = agentState.get(regionIdToAgentId[best]);
      return (s.lastFireT ?? -99) > (bs.lastFireT ?? -99) ? r : best;
    }, hot[0]);
    for (const other of hot) {
      if (other === latest) continue;
      const exists = constellations.find(c =>
        (c.a === latest && c.b === other) || (c.a === other && c.b === latest)
      );
      if (exists) { exists.t = 0; continue; } // refresh instead
      const col = regionCenters[latest].color.clone().lerp(regionCenters[other].color, 0.5);
      constellations.push({ a: latest, b: other, t: 0, life: 1.4, color: col });
      if (constellations.length > MAX_CONSTELLATION_LINES) constellations.shift();
    }
  }

  // ---------- Energy Meridians ----------
  // Slow-flowing curved lines along the brain surface — a few long arcs
  // that wrap between regions like latitude lines. They are ALWAYS there,
  // quietly pulsing, and brighten when their endpoints are active. Think
  // "the brain's always humming; here are the main pathways."
  const MERIDIAN_COUNT = 14;
  const MERIDIAN_SEGS = 48;
  const meridianGeom = new THREE.BufferGeometry();
  const merPos = new Float32Array(MERIDIAN_COUNT * MERIDIAN_SEGS * 3);
  const merCol = new Float32Array(MERIDIAN_COUNT * MERIDIAN_SEGS * 3);
  meridianGeom.setAttribute("position", new THREE.BufferAttribute(merPos, 3));
  meridianGeom.setAttribute("color", new THREE.BufferAttribute(merCol, 3));
  // Index as segments
  const merIdx = new Uint16Array(MERIDIAN_COUNT * (MERIDIAN_SEGS - 1) * 2);
  for (let m = 0; m < MERIDIAN_COUNT; m++) {
    for (let s = 0; s < MERIDIAN_SEGS - 1; s++) {
      const base = m * MERIDIAN_SEGS;
      merIdx[(m * (MERIDIAN_SEGS - 1) + s) * 2]     = base + s;
      merIdx[(m * (MERIDIAN_SEGS - 1) + s) * 2 + 1] = base + s + 1;
    }
  }
  meridianGeom.setIndex(new THREE.BufferAttribute(merIdx, 1));
  meridianGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 300);
  const meridianMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.7,
  });
  const meridianLines = new THREE.LineSegments(meridianGeom, meridianMat);
  meridianLines.frustumCulled = false;
  scene.add(meridianLines);
  // Build meridian curves: great-circle-ish arcs between random region pairs,
  // projected onto the brain ellipsoid surface.
  const meridians = [];
  (function buildMeridians() {
    const A = BRAIN.a * 1.01, B = BRAIN.b * 1.01, D = BRAIN.d * 1.01;
    for (let m = 0; m < MERIDIAN_COUNT; m++) {
      // Pick two random region centers (weighted by distance — prefer moderate spans).
      let bestPair = null;
      for (let tries = 0; tries < 6; tries++) {
        const i = Math.floor(Math.random() * regionCenters.length);
        let j = Math.floor(Math.random() * regionCenters.length);
        if (j === i) j = (j + 1) % regionCenters.length;
        if (!bestPair) bestPair = [i, j];
        else {
          const d = regionCenters[i].center.distanceTo(regionCenters[j].center);
          if (d > 100 && d < 280) { bestPair = [i, j]; break; }
        }
      }
      const [i, j] = bestPair;
      const start = regionCenters[i].center.clone();
      const end = regionCenters[j].center.clone();
      // Midpoint bulged outward along ellipsoid normal for the arc to ride the surface.
      const mid = start.clone().add(end).multiplyScalar(0.5);
      const midDir = mid.clone().normalize();
      const bulge = midDir.multiplyScalar(80 + Math.random() * 40);
      const midPt = mid.clone().add(bulge);
      // Store the quadratic Bézier handles + endpoint colors.
      meridians.push({
        start, mid: midPt, end,
        regA: i, regB: j,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.35,
      });
    }
  })();
  function updateMeridians(now) {
    for (let m = 0; m < meridians.length; m++) {
      const md = meridians[m];
      const stA = agentState.get(regionIdToAgentId[md.regA]);
      const stB = agentState.get(regionIdToAgentId[md.regB]);
      const actA = stA ? stA.activity : 0;
      const actB = stB ? stB.activity : 0;
      const activity = Math.max(actA, actB);
      const base = m * MERIDIAN_SEGS;
      const colA = regionCenters[md.regA].color;
      const colB = regionCenters[md.regB].color;
      for (let s = 0; s < MERIDIAN_SEGS; s++) {
        const t = s / (MERIDIAN_SEGS - 1);
        // Quadratic Bézier: (1-t)² start + 2(1-t)t mid + t² end
        const u = 1 - t;
        const x = u * u * md.start.x + 2 * u * t * md.mid.x + t * t * md.end.x;
        const y = u * u * md.start.y + 2 * u * t * md.mid.y + t * t * md.end.y;
        const z = u * u * md.start.z + 2 * u * t * md.mid.z + t * t * md.end.z;
        merPos[(base + s) * 3]     = x;
        merPos[(base + s) * 3 + 1] = y;
        merPos[(base + s) * 3 + 2] = z;
        // Flowing pulse along meridian — brighter when either endpoint is active.
        const flow = Math.sin((t - now * md.speed * 0.5) * Math.PI * 2 + md.phase) * 0.5 + 0.5;
        const endBlend = t; // start side vs end side
        const hue = colA.clone().lerp(colB, endBlend);
        const baseBright = 0.10 + flow * 0.08;                   // idle
        const activeBright = activity * (0.4 + flow * 0.8);      // event-linked flare
        const br = baseBright + activeBright;
        merCol[(base + s) * 3]     = hue.r * br;
        merCol[(base + s) * 3 + 1] = hue.g * br;
        merCol[(base + s) * 3 + 2] = hue.b * br;
      }
    }
    meridianGeom.attributes.position.needsUpdate = true;
    meridianGeom.attributes.color.needsUpdate = true;
  }

  // ---------- Shockwave rings (billboarded expanding rings at event sites) ----------
  // Data-sublime: every event leaves a visible record — a concentric ring
  // expanding from the thought site, thinning and fading.
  const RING_POOL = 24;
  const ringGeom = new THREE.RingGeometry(0.88, 1.0, 56, 1);
  const ringMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
    },
    vertexShader: `
      attribute float aBirth;
      attribute float aLife;         // seconds lifetime
      attribute float aMaxRadius;    // end radius
      attribute vec3  aOrigin;
      attribute vec3  aColor;
      attribute float aCritical;     // 0..1 — critical events draw thicker, brighter
      uniform float uTime;
      varying float vAge;
      varying float vAgeFrac;
      varying vec3  vColor;
      varying float vCritical;
      varying vec2  vUv;
      void main() {
        vUv = uv;
        float age = uTime - aBirth;
        float frac = clamp(age / aLife, 0.0, 1.0);
        vAge = age;
        vAgeFrac = frac;
        vColor = aColor;
        vCritical = aCritical;

        // Expand radius from 0 -> aMaxRadius using ease-out cubic
        float eo = 1.0 - pow(1.0 - frac, 3.0);
        float radius = aMaxRadius * eo;

        // Position is ring's local (in XY plane), scaled
        vec3 pos = position * radius;

        // Billboard: transform ring into camera-facing plane.
        // modelViewMatrix position of origin first, then add billboarded offset.
        vec4 mvOrigin = modelViewMatrix * vec4(aOrigin, 1.0);
        vec4 mvPos = mvOrigin + vec4(pos.x, pos.y, 0.0, 0.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uStrength;
      varying float vAgeFrac;
      varying vec3  vColor;
      varying float vCritical;
      varying vec2  vUv;
      void main() {
        if (vAgeFrac >= 1.0) discard;
        // Fade envelope: quick bright start, long soft tail.
        float fade = (1.0 - vAgeFrac);
        float alpha = fade * fade * 0.85;
        // Edge falloff — inner/outer thin fade so it reads as a ring
        float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(0.0, 0.12, 1.0 - vUv.y);
        alpha *= edge;
        // Critical events are more saturated + thicker
        vec3 col = mix(vColor, vColor * 1.6 + vec3(0.2), vCritical * 0.6);
        gl_FragColor = vec4(col, alpha * (0.8 + vCritical * 0.8) * uStrength);
      }
    `,
  });
  const ringMesh = new THREE.InstancedMesh(ringGeom, ringMat, RING_POOL);
  ringMesh.frustumCulled = false;
  ringMesh.renderOrder = 3;
  // Instance attributes
  const ringBirth  = new Float32Array(RING_POOL).fill(-10);
  const ringLife   = new Float32Array(RING_POOL).fill(1);
  const ringRadius = new Float32Array(RING_POOL).fill(1);
  const ringOrigin = new Float32Array(RING_POOL * 3);
  const ringColor  = new Float32Array(RING_POOL * 3);
  const ringCrit   = new Float32Array(RING_POOL).fill(0);
  ringGeom.setAttribute("aBirth", new THREE.InstancedBufferAttribute(ringBirth, 1));
  ringGeom.setAttribute("aLife", new THREE.InstancedBufferAttribute(ringLife, 1));
  ringGeom.setAttribute("aMaxRadius", new THREE.InstancedBufferAttribute(ringRadius, 1));
  ringGeom.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(ringOrigin, 3));
  ringGeom.setAttribute("aColor", new THREE.InstancedBufferAttribute(ringColor, 3));
  ringGeom.setAttribute("aCritical", new THREE.InstancedBufferAttribute(ringCrit, 1));
  const ringBirthBA  = ringGeom.attributes.aBirth;
  const ringLifeBA   = ringGeom.attributes.aLife;
  const ringRadBA    = ringGeom.attributes.aMaxRadius;
  const ringOriginBA = ringGeom.attributes.aOrigin;
  const ringColorBA  = ringGeom.attributes.aColor;
  const ringCritBA   = ringGeom.attributes.aCritical;
  // Ring mesh: added to scene but visibility + strength gated by CFG.ringPulse.
  scene.add(ringMesh);
  ringMesh.visible = false; // toggled by CFG.ringPulse > 0
  let ringCursor = 0;
  function spawnRing(origin, color, kind, critical = false) {
    const i = ringCursor % RING_POOL;
    ringCursor++;
    const now = mat.uniforms.uTime.value;
    ringBirth[i]  = now;
    // Life + radius scale by kind semantic
    const big = kind === "complete" || kind === "delegation" || kind === "decision" || critical;
    ringLife[i]   = big ? 2.2 : 1.4;
    ringRadius[i] = big ? 52 : 28;
    // Origin
    ringOrigin[i*3]   = origin.x;
    ringOrigin[i*3+1] = origin.y;
    ringOrigin[i*3+2] = origin.z;
    // Color (brighter for rings)
    ringColor[i*3]   = Math.min(1.5, color.r * 1.25);
    ringColor[i*3+1] = Math.min(1.5, color.g * 1.25);
    ringColor[i*3+2] = Math.min(1.5, color.b * 1.25);
    ringCrit[i] = critical ? 1.0 : 0.0;
    ringBirthBA.needsUpdate = true;
    ringLifeBA.needsUpdate = true;
    ringRadBA.needsUpdate = true;
    ringOriginBA.needsUpdate = true;
    ringColorBA.needsUpdate = true;
    ringCritBA.needsUpdate = true;
  }

  // ---------- Synapse flashes (bright point at site) ----------
  // Per-thought site decay buffer.
  const siteFire = new Map(); // id -> {t, color, kind}
  const siteFireDur = 1.4;

  // ---------- Event playback ----------
  const CFG = {
    playing: true,
    speed: 1,
    cursorTime: 0, // set to tMin after events are built
    filterKinds: new Set(),
    focusId: null,
    showEdges: true,
    showLabels: true,
    pulse: 1,
    ringPulse: 0,  // independent ring intensity (0 = hidden)
    shockwave: 1,  // cortex-wide expanding shell intensity (0 = off)
    trail: null, // causal trail (set of edge+thought ids) for focused/hovered
    hoverId: null,
  };

  // Event list sorted — use thoughts themselves (each has ts).
  const events = thoughts.slice().sort((a,b) => a.ts - b.ts).map(t => ({
    ts: t.ts, thoughtId: t.id, kind: t.kind,
  }));
  const tMin = events[0]?.ts || 0;
  const tMax = events[events.length-1]?.ts || 1;
  const tSpan = (tMax - tMin) || 1;
  CFG.cursorTime = tMin;
  let evIdx = 0;

  function rebuildActiveLines(activeList, now) {
    // For each active edge, write its sample segments and color to buffer.
    let segVertCount = 0;
    for (const e of activeList) {
      const s = e.samples;
      // Pulse color from region.
      const reg = thoughtSite.get(e.parentId).region;
      const strength = Math.min(1, e.activity);
      const col = reg.color.clone().lerp(SYNAPSE_BRIGHT, 0.4 * strength);
      for (let i = 0; i < s.length - 1 && segVertCount < MAX_ACTIVE * 24; i++) {
        // Brightness along edge tapers toward the head (moving along +t).
        const base = i / (s.length - 1);
        const bright = 0.25 + 0.9 * strength * Math.pow(base, 0.6);
        const c = col.clone().multiplyScalar(bright);
        activePos[segVertCount*3]   = s[i].x;   activePos[segVertCount*3+1] = s[i].y;   activePos[segVertCount*3+2] = s[i].z;
        activeCol[segVertCount*3]   = c.r;      activeCol[segVertCount*3+1] = c.g;      activeCol[segVertCount*3+2] = c.b;
        segVertCount++;
        activePos[segVertCount*3]   = s[i+1].x; activePos[segVertCount*3+1] = s[i+1].y; activePos[segVertCount*3+2] = s[i+1].z;
        activeCol[segVertCount*3]   = c.r;      activeCol[segVertCount*3+1] = c.g;      activeCol[segVertCount*3+2] = c.b;
        segVertCount++;
      }
    }
    activeGeom.setDrawRange(0, segVertCount);
    activeGeom.attributes.position.needsUpdate = true;
    activeGeom.attributes.color.needsUpdate = true;
  }

  function spawnBolt(edge, color, kind, speed = 0.9) {
    if (bolts.length >= MAX_BOLTS) return;
    bolts.push({
      edge, t: 0, speed, color: color.clone(),
      life: 1, kind,
    });
  }

  // ---------- Agent state model ----------
  // Per-agent derived state for per-region shimmer/mood and the HUD.
  // Activity = instantaneous firing intensity (0..1), decays over ~1.8s.
  // Mood    = idle(0) / thinking(1) / working(2) / blocked(3)
  const agentState = new Map(); // agentId -> {activity, mood, moodUntil, openWork: Set<chainId>, blockedChains: Set<chainId>, lastFireT}
  for (const id of agentMap.keys()) {
    agentState.set(id, {
      activity: 0, mood: 0, moodUntil: 0,
      openWork: new Set(), blockedChains: new Set(),
      lastFireT: -1e9,
      // Regions start partially awake so every agent reads as a distinct
      // color zone from t=0. First real event ramps them the rest of the way.
      awake: 0.55,
    });
  }

  // Map regionId -> agentId for fast uniform push.
  const regionIdToAgentId = regionCenters.map(r => r.id);

  // Called by fireSynapse on every real event. Updates the state machine.
  function applyAgentState(thought, now) {
    const aid = thought.author;
    const st = agentState.get(aid);
    if (!st) return;
    st.lastFireT = now;
    st.activity = Math.min(1.2, st.activity + 0.55);
    // Each event ramps the region's awake further toward 1 (identity fully
    // revealed). Starts at 0.55 so regions always read as distinct colors.
    st.awake = Math.min(1, st.awake + 0.25);
    const chainId = thought.chainId || thought.id;
    const sem = thought.semantic || thought.kind;

    switch (sem) {
      case "delegation": {
        // The CHILD agent (target of delegation) goes "working".
        // Find first child thought of this one → its author is the worker.
        const firstChild = thoughts.find(t => primaryParent.get(t.id) === thought.id);
        const workerId = firstChild?.author;
        if (workerId && agentState.has(workerId)) {
          const ws = agentState.get(workerId);
          ws.openWork.add(chainId);
          ws.mood = 2; ws.moodUntil = now + 8.0;
          // Delegation awakens the recipient's region faster.
          ws.awake = Math.min(1, ws.awake + 0.2);
        }
        // The SENDER (this thought's author) continues thinking briefly.
        st.mood = Math.max(st.mood, 1); st.moodUntil = Math.max(st.moodUntil, now + 2.0);
        break;
      }
      case "block": {
        st.blockedChains.add(chainId);
        st.mood = 3; st.moodUntil = now + 6.0;
        break;
      }
      case "retry": {
        st.blockedChains.delete(chainId);
        st.mood = 2; st.moodUntil = now + 3.0;
        break;
      }
      case "complete": {
        st.openWork.delete(chainId);
        st.blockedChains.delete(chainId);
        // Brief "thinking" afterglow.
        st.mood = 1; st.moodUntil = now + 1.0;
        break;
      }
      case "decision": {
        st.mood = Math.max(st.mood, 1); st.moodUntil = Math.max(st.moodUntil, now + 2.0);
        break;
      }
      default: {
        // comment, thought, subissue, action, etc — thinking
        st.mood = Math.max(st.mood, 1); st.moodUntil = Math.max(st.moodUntil, now + 1.6);
      }
    }
  }

  // Per-frame update of agent state → shader uniforms.
  function updateAgentStateUniforms(dt, now) {
    const actArr = mat.uniforms.uRegionActivity.value;
    const moodArr = mat.uniforms.uRegionMood.value;
    const awakeArr = mat.uniforms.uRegionAwake.value;
    for (let r = 0; r < regionCenters.length && r < 12; r++) {
      const aid = regionIdToAgentId[r];
      const st = agentState.get(aid);
      if (!st) { actArr[r] = 0; moodArr[r] = 0; awakeArr[r] = 0; continue; }

      // Ramp awake → 1 over ~1.8s once triggered. One-way; regions stay colored.
      if (st.awake > 0 && st.awake < 1) {
        st.awake = Math.min(1, st.awake + dt / 1.8);
      }
      awakeArr[r] = st.awake;

      // Decay activity toward baseline.
      st.activity = Math.max(0, st.activity - dt * 0.6);

      // Compute effective mood: blocked always wins if any blocked chains.
      let mood = 0;
      if (st.blockedChains.size > 0) mood = 3;
      else if (st.openWork.size > 0) mood = 2;
      else if (st.moodUntil > now) mood = st.mood || 1;
      else mood = 0;

      // Activity floor based on mood so working/blocked regions always shimmer.
      let base = 0;
      if (mood === 1) base = 0.35;
      else if (mood === 2) base = 0.55;
      else if (mood === 3) base = 0.70;
      const activity = Math.max(st.activity, base);

      actArr[r] = activity;
      moodArr[r] = mood;
    }
  }
  // Kind encoding:
  //   0 = thought    — small soft shell
  //   1 = decision   — larger + double-shell (the mind committing)
  //   2 = delegation — directional beam from parent region to child region
  //   3 = action     — medium warm shell
  //   4 = complete   — huge golden burst
  //   5 = block      — stuttering red shell
  const WAVE_SLOTS = 6;
  let waveNext = 0;
  const KIND_CODE = { thought: 0, comment: 0, subissue: 0, decision: 1, delegation: 2, action: 3, retry: 3, merge: 3, complete: 4, block: 5, issue: 0 };
  const KIND_SPEED = [35, 30, 50, 35, 25, 22]; // idx = kind code — kept small so waves stay LOCAL to the thought site
  // Bumped: restore the louder particle shockwave the user preferred.
  const KIND_STRENGTH = [1.0, 1.6, 1.3, 1.15, 2.0, 1.3];

  // Recruitment pool (up to 4 concurrent).
  let recruitNext = 0;
  function spawnRecruit(origin, strength = 1.0) {
    const i = recruitNext;
    recruitNext = (recruitNext + 1) % 4;
    mat.uniforms.uRecruitOrigin.value[i].copy(origin);
    mat.uniforms.uRecruitStart.value[i] = mat.uniforms.uTime.value;
    mat.uniforms.uRecruitStrength.value[i] = strength;
  }

  function spawnWave(origin, color, kind, dir) {
    const kc = (typeof kind === "number") ? kind : (KIND_CODE[kind] ?? 0);
    const i = waveNext;waveNext = (waveNext + 1) % WAVE_SLOTS;
    mat.uniforms.uWaveOrigins.value[i].copy(origin);
    mat.uniforms.uWaveDirs.value[i].copy(dir || origin).normalize();
    mat.uniforms.uWaveStart.value[i] = mat.uniforms.uTime.value;
    mat.uniforms.uWaveColor.value[i].copy(color);
    mat.uniforms.uWaveStrength.value[i] = KIND_STRENGTH[kc] * (CFG?.pulse ?? 1);
    mat.uniforms.uWaveSpeed.value[i] = KIND_SPEED[kc];
    mat.uniforms.uWaveKind.value[i] = kc;
  }

  function fireSynapse(thought) {
    const site = thoughtSite.get(thought.id);
    if (!site) return;
    // Feed the neural-core heartbeat: major events pulse harder.
    const sem0 = thought.semantic || thought.kind;
    const boost = sem0 === "complete" ? 1.3
               : sem0 === "decision" ? 1.0
               : sem0 === "delegation" ? 0.7
               : sem0 === "block" ? 0.8
               : 0.5;
    coreActivity = Math.min(1.3, coreActivity + boost);
    const color = site.region.color.clone();
    // Semantic kind drives behavior; surface kind is left for filter chips.
    const sem = thought.semantic || thought.kind;
    // Synapse flash at site.
    siteFire.set(thought.id, { t: 1, color: color.clone(), kind: sem });

    // Agent state update for per-region mood shimmer and HUD.
    applyAgentState(thought, mat.uniforms.uTime.value);

    // Thought-wave — kind-aware. For delegation, pass direction toward child.
    let dir = null;
    if (sem === "delegation") {
      // Find a child thought to aim at; use the first one in thoughts[].
      const firstChild = thoughts.find(t => primaryParent.get(t.id) === thought.id);
      if (firstChild) {
        const cs = thoughtSite.get(firstChild.id);
        if (cs) dir = cs.pos.clone().sub(site.pos);
      }
    }
    spawnWave(site.pos, color, sem, dir);

    // Synaptic lightning — dramatic branching arcs on major beats.
    // Decisions fork 3 arcs; delegation 2 (one aimed at child); complete 5 (gold storm);
    // block: 4 short red stutters. Thoughts and subissues get nothing.
    if (sem === "decision") {
      spawnLightning(site.pos, color, 3, 75, "decision");
    } else if (sem === "delegation") {
      spawnLightning(site.pos, color, 2, 95, "delegation");
    } else if (sem === "complete") {
      spawnLightning(site.pos, color.clone().lerp(new THREE.Color(0xFFE8C8), 0.35), 5, 90, "complete");
    } else if (sem === "block") {
      spawnLightning(site.pos, new THREE.Color(0xff6b5a), 4, 55, "block");
    } else if (sem === "action") {
      spawnLightning(site.pos, color, 1, 45, "action");
    }

    // God-rays — escape-of-light bursts on peak events.
    if (sem === "complete") {
      spawnGodRays(site.pos, color.clone().lerp(new THREE.Color(0xFFE8C8), 0.5), 8, 180);
    } else if (sem === "decision") {
      spawnGodRays(site.pos, color, 5, 140);
    } else if (sem === "delegation") {
      spawnGodRays(site.pos, color, 4, 160);
    } else if (sem === "block") {
      spawnGodRays(site.pos, new THREE.Color(0xff6b5a), 3, 100);
    }

    // Try to form a constellation — if multiple regions just fired.
    tryConstellation(mat.uniforms.uTime.value);

    // Particle recruitment — dormant particles sprint toward peak events.
    if (sem === "complete") spawnRecruit(site.pos, 1.3);
    else if (sem === "decision") spawnRecruit(site.pos, 1.0);
    else if (sem === "delegation") spawnRecruit(site.pos, 0.85);

    // Camera breathing event pulse — brief zoom-in nudge.
    // Negative mag = camera pulls in toward the site; returns smoothly.
    if (sem === "complete") orbit.eventPulse(-0.05, 1.4);
    else if (sem === "decision") orbit.eventPulse(-0.035, 1.0);
    else if (sem === "block") orbit.eventPulse(0.025, 0.8);   // pulls OUT — "oh no"
    else if (sem === "delegation") orbit.eventPulse(-0.025, 1.1);

    // Ring pulse — only when user has opted in via ringPulse tweak.
    if ((CFG.ringPulse ?? 0) > 0.001) {
      spawnRing(site.pos, color, sem, !!thought.critical);
    }

    // Pulse nearby cortex particles (within region & close to site).
    const sx = site.pos.x, sy = site.pos.y, sz = site.pos.z;
    // Cheap O(N) — but gated: only scan cortex.
    const radius = 26;
    const radSq = radius * radius;
    for (let i = 0; i < CORTEX_COUNT; i++) {
      const dx = basePos[i*3] - sx, dy = basePos[i*3+1] - sy, dz = basePos[i*3+2] - sz;
      const dd = dx*dx + dy*dy + dz*dz;
      if (dd < radSq) {
        const w = 1 - Math.sqrt(dd) / radius;
        pulse[i] = Math.max(pulse[i], w * 0.9);
        fireColor[i*3]   = Math.max(fireColor[i*3],   color.r * w * 0.35);
        fireColor[i*3+1] = Math.max(fireColor[i*3+1], color.g * w * 0.35);
        fireColor[i*3+2] = Math.max(fireColor[i*3+2], color.b * w * 0.35);
      }
    }

    // Activate the edge from parent and send a bolt traveling along it toward child.
    const parentId = primaryParent.get(thought.id);
    if (parentId) {
      const e = edgeByChild.get(thought.id);
      if (e) {
        e.activity = 1;
        e.lastFire = performance.now();
        // Number of bolts varies with kind — decisions & delegations spark multiples.
        const count = sem === "decision" ? 3 : sem === "delegation" ? 2 : 1;
        const speed = sem === "delegation" ? 0.6 : sem === "action" ? 1.0 : 0.8;
        for (let i = 0; i < count; i++) {
          spawnBolt(e, color, sem, speed * (0.8 + Math.random() * 0.4));
        }
        // Delegation gets an extra "handoff packet" — a bigger, slower bolt.
        if (sem === "delegation") {
          spawnBolt(e, color.clone().multiplyScalar(1.4), "delegation-packet", 0.5);
        }
      }
    } else {
      // Root — big initial flash already via siteFire.
    }

    // For decisions / completions: secondary burst outward on region neighbors.
    if (sem === "decision" || sem === "complete") {
      // Also pulse children edges (downstream pre-activation hint).
      const kids = [...edges].filter(e => e.parentId === thought.id).slice(0, 4);
      for (const k of kids) {
        k.activity = Math.max(k.activity, 0.6);
      }
    }

    // CINEMATIC CAMERA — for major events, nudge the camera to LOOK at the site
    // without fighting user input. Only if user hasn't manually focused or is dragging.
    if (!orbit.dragging && !CFG.focusId) {
      const majorKinds = new Set(["decision", "delegation", "complete", "block"]);
      if (majorKinds.has(sem)) {
        const p = site.pos;
        const targetTheta = Math.atan2(p.x, p.z);
        const targetPhi = Math.acos(Math.max(-1, Math.min(1, p.y / Math.max(0.01, p.length()))));
        // Shortest-path blend for theta.
        let dTheta = targetTheta - orbit.targetTheta;
        while (dTheta > Math.PI) dTheta -= Math.PI * 2;
        while (dTheta < -Math.PI) dTheta += Math.PI * 2;
        const weight = sem === "complete" ? 0.18 : sem === "delegation" ? 0.12 : 0.10;
        orbit.targetTheta += dTheta * weight;
        orbit.targetPhi += (targetPhi - orbit.targetPhi) * weight * 0.5;
        // A brief slight zoom-in on completes to emphasize the chain-glow.
        if (sem === "complete") {
          orbit.targetRadius = Math.max(240, orbit.targetRadius - 20);
        }
      }
    }

    // COMPLETION CHAIN-GLOW — walk ancestors; briefly re-activate every edge
    // in the completed chain and re-flash each ancestor site in its color.
    if (sem === "complete") {
      let cur = thought.id;
      let depth = 0;
      while (cur && depth < 20) {
        const p = primaryParent.get(cur);
        if (!p) break;
        const e = edgeByChild.get(cur);
        if (e) {
          // Ripple delay by depth so it reads as a wave back toward the root.
          const delay = depth * 80; // ms
          setTimeout(() => {
            e.activity = Math.max(e.activity, 0.9);
            spawnBolt(e, color.clone().multiplyScalar(1.2), "complete", 0.7);
          }, delay);
        }
        // Ancestor re-flash.
        const aSite = thoughtSite.get(p);
        if (aSite) {
          const ancDelay = depth * 80 + 40;
          setTimeout(() => {
            siteFire.set(p + "_chain" + thought.id, {
              t: 0.85, color: color.clone(), kind: "complete-echo",
            });
          }, ancDelay);
        }
        cur = p;
        depth++;
      }
    }
  }

  // Advance playback: fire all events whose ts <= cursor.
  function advanceTo(ts) {
    while (evIdx < events.length && events[evIdx].ts <= ts) {
      const ev = events[evIdx++];
      const th = byId.get(ev.thoughtId);
      if (th) fireSynapse(th);
      // Also notify UI.
      if (window.MS_UI?.onEvent) window.MS_UI.onEvent(ev, th);
    }
  }

  function rewindTo(ts) {
    // Reset to start, replay up to ts (cheap with this count).
    evIdx = 0;
    // Clear state.
    for (let i = 0; i < TOTAL; i++) { pulse[i] = 0; fireColor[i*3]=0; fireColor[i*3+1]=0; fireColor[i*3+2]=0; }
    bolts.length = 0;
    siteFire.clear();
    for (const e of edges) e.activity = 0;
    // Clear agent state (regions become idle).
    for (const st of agentState.values()) {
      st.activity = 0; st.mood = 0; st.moodUntil = 0;
      st.openWork.clear(); st.blockedChains.clear();
      st.awake = 0.55;  // regions retain their color identity between playbacks
    }
    advanceTo(ts);
  }

  // ---------- Labels ----------
  // HTML labels for agent regions, positioned by projecting region centers.
  const labelsRoot = document.createElement("div");
  labelsRoot.className = "mindspace-labels";
  container.appendChild(labelsRoot);
  const regionLabels = regionCenters.map(r => {
    const el = document.createElement("div");
    el.className = "region-label";
    el.innerHTML = `<span class="dot" style="background:${'#' + r.color.getHexString()}"></span><span class="name">${r.name}</span>`;
    labelsRoot.appendChild(el);
    return el;
  });

  function updateLabels() {
    if (!CFG.showLabels) {
      for (const el of regionLabels) el.style.display = "none";
      return;
    }
    const w = container.clientWidth, h = container.clientHeight;
    for (let i = 0; i < regionCenters.length; i++) {
      const r = regionCenters[i];
      // Offset label out along the region normal so it floats above the surface.
      const p = r.center.clone().multiplyScalar(1.18);
      const v = p.clone().project(camera);
      const x = (v.x + 1) * 0.5 * w;
      const y = (1 - (v.y + 1) * 0.5) * h;
      const behind = v.z > 1;
      const el = regionLabels[i];
      if (behind) { el.style.display = "none"; continue; }
      el.style.display = "flex";
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  // ---------- Hover + Click picking ----------
  // Since we have thousands of tiny particles, we pick by raycasting against
  // a "sites" bounding-sphere test in screen space (cheap).
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 6 };

  function screenPick(ev) {
    const rect = dom.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    const ndc = new THREE.Vector2(x, y);
    raycaster.setFromCamera(ndc, camera);
    // Project all thought sites to screen and find nearest.
    let best = null, bestD = 22;
    for (const t of thoughts) {
      const s = thoughtSite.get(t.id); if (!s) continue;
      const p = s.pos.clone().project(camera);
      const sx = (p.x + 1) * 0.5 * rect.width;
      const sy = (1 - (p.y + 1) * 0.5) * rect.height;
      const dx = ev.clientX - rect.left - sx;
      const dy = ev.clientY - rect.top - sy;
      const dd = Math.sqrt(dx*dx + dy*dy);
      if (dd < bestD && p.z < 1) { bestD = dd; best = t; }
    }
    return best;
  }

  function onCanvasHover(ev) {
    const t = screenPick(ev);
    CFG.hoverId = t?.id || null;
    window.MS_UI?.setHover(CFG.hoverId, ev.clientX, ev.clientY);
    updateTrail();
  }

  function onCanvasClick(ev) {
    const t = screenPick(ev);
    if (t) {
      if (ev.shiftKey && window.MS_UI?.enterChainBrowse) {
        window.MS_UI.enterChainBrowse(t.id);
      } else {
        window.MS.focusThought(t.id);
      }
    } else {
      window.MS.focusThought(null);
    }
  }

  // ---------- Causal trail ----------
  // Set of edges + sites that light up when hovering / focusing a thought —
  // the whole ancestral chain back to root.
  function computeTrail(id) {
    if (!id) return null;
    const edgesIn = new Set();
    const sitesIn = new Set();
    let cur = id;
    let guard = 0;
    while (cur && guard++ < 200) {
      sitesIn.add(cur);
      const parent = primaryParent.get(cur);
      if (parent) {
        const edge = edgeByChild.get(cur);
        if (edge) edgesIn.add(edge);
      }
      cur = primaryParent.get(cur);
    }
    return { edges: edgesIn, sites: sitesIn };
  }

  function updateTrail() {
    const id = CFG.focusId || CFG.hoverId;
    CFG.trail = computeTrail(id);
  }

  // ---------- Public API ----------
  window.__MSscene = scene;
  window.__MSmat = mat;
  window.__MShalo = halo;
  window.MS = {
    cfg: CFG,
    case: C,
    thoughts, byId,
    thoughtSite,
    regionCenters,
    focusThought(id) {
      CFG.focusId = id || null;
      if (id) {
        const s = thoughtSite.get(id);
        if (s) {
          // Aim the camera so the site is nicely framed — camera sits on
          // the far side of the site from the brain center, at a gentler
          // phi for a slight down-angle.
          const dir = s.pos.clone().normalize();
          const theta = Math.atan2(dir.x, dir.z);
          const phi = Math.acos(Math.max(-1, Math.min(1, dir.y))) * 0.75 + Math.PI * 0.10;
          const tgt = s.pos.clone().multiplyScalar(0.55);
          orbit.flyTo({
            theta, phi,
            radius: 240,
            target: tgt,
            duration: 1.1,
          });
          orbit._dollyTarget = 0.82;
        }
      } else {
        orbit.flyTo({
          theta: orbit.targetTheta, // keep current angle
          phi: orbit.targetPhi,
          radius: 300,
          target: new THREE.Vector3(0, 0, 0),
          duration: 0.9,
        });
        orbit._dollyTarget = 1;
      }
      updateTrail();
      window.MS_UI?.onFocus(CFG.focusId);
    },
    hover(id) { CFG.hoverId = id; updateTrail(); },
    toggleKind(k) { if (CFG.filterKinds.has(k)) CFG.filterKinds.delete(k); else CFG.filterKinds.add(k); },
    // Big cinematic ring centered on origin + region pulses.
    // Phase-shift / major beat moments call this to ripple the whole field.
    spawnPhaseShockwave(colorHex = 0xE8A598) {
      // Removed — was too visually loud. Phase changes now register via the
      // phase title overlay and timeline band only.
    },
    // Timeline hover: return the thought closest to a given frac.
    thoughtAtFrac(frac) {
      const ts = tMin + frac * tSpan;
      let best = null, bestD = Infinity;
      for (const t of thoughts) {
        const d = Math.abs(t.ts - ts);
        if (d < bestD) { bestD = d; best = t; }
        if (t.ts > ts && d > bestD) break;
      }
      return best;
    },
    setLabels(v) { CFG.showLabels = !!v; },
    setPulse(v) { CFG.pulse = v; },
    setRingPulse(v) {
      CFG.ringPulse = v;
      ringMesh.visible = v > 0.001;
    },
    setShockwave(v) {
      CFG.shockwave = v;
      mat.uniforms.uShockwave.value = v;
    },
    setEdges(v) { CFG.showEdges = !!v; idleLines.visible = !!v; },
    setPlaying(v) { CFG.playing = !!v; },
    setSpeed(v) { CFG.speed = v; },
    seek(frac) {
      const ts = tMin + frac * tSpan;
      CFG.cursorTime = ts;
      rewindTo(ts);
    },
    getTimeFraction() { return (CFG.cursorTime - tMin) / tSpan; },
    getStats() {
      return {
        total: TOTAL,
        events: events.length,
        firedUpTo: evIdx,
        bolts: bolts.length,
      };
    },
    // Per-frame snapshot of agent state for the HUD.
    getAgentStates() {
      const out = [];
      for (const r of regionCenters) {
        const st = agentState.get(r.id);
        if (!st) continue;
        let mood = 0;
        if (st.blockedChains.size > 0) mood = 3;
        else if (st.openWork.size > 0) mood = 2;
        else if (st.moodUntil > mat.uniforms.uTime.value) mood = st.mood || 1;
        out.push({
          id: r.id,
          name: r.name,
          color: `#${r.color.getHexString()}`,
          activity: st.activity,
          mood,                       // 0=idle 1=thinking 2=working 3=blocked
          openWork: st.openWork.size,
          blocked: st.blockedChains.size,
        });
      }
      return out;
    },
  };

  // ---------- Animation loop ----------
  const clock = new THREE.Clock();
  let bootStart = performance.now();
  let bootDone = false;
  let lastStats = 0;
  // Neural core heartbeat — EMA of firing events. fireSynapse adds to it;
  // animate() decays it and pushes it into the core shader.
  let coreActivity = 0;

  function animate() {
    try {
    const now = performance.now();
    const dt = Math.min(0.05, clock.getDelta());
    mat.uniforms.uTime.value = now * 0.001;
    if (window.__starMat) window.__starMat.uniforms.uTime.value = now * 0.001;
    if (window.__nebulaMat) {
      window.__nebulaMat.uniforms.uTime.value = now * 0.001;
      // Dominant-agent tint: pick region with highest activity, blend target toward it.
      // Slow LERP so nebula "remembers" the tone of the last ~2-3 seconds of work.
      let maxAct = 0, bestR = -1;
      for (let r = 0; r < regionCenters.length; r++) {
        const aid = regionIdToAgentId[r];
        const st = agentState.get(aid);
        if (!st) continue;
        if (st.activity > maxAct) { maxAct = st.activity; bestR = r; }
      }
      const tintU = window.__nebulaMat.uniforms.uTint.value;
      const tintAmtU = window.__nebulaMat.uniforms.uTintAmt;
      if (bestR >= 0 && maxAct > 0.08) {
        const targetC = regionCenters[bestR].color;
        // Slow lerp — nebula is "atmospheric memory", doesn't react instantly.
        tintU.r += (targetC.r - tintU.r) * 0.02;
        tintU.g += (targetC.g - tintU.g) * 0.02;
        tintU.b += (targetC.b - tintU.b) * 0.02;
        tintAmtU.value += (Math.min(0.55, maxAct * 0.8) - tintAmtU.value) * 0.04;
      } else {
        tintAmtU.value += (0 - tintAmtU.value) * 0.02;
      }
    }
    ringMat.uniforms.uTime.value = now * 0.001;
    ringMat.uniforms.uStrength.value = CFG.ringPulse ?? 0;
    // Global breath: slow sine 0..1, roughly 4s period.
    mat.uniforms.uBreath.value = 0.5 + 0.5 * Math.sin(now * 0.0016);
    // Wave strength decay over ~2.5s life (matches shader life).
    const wStarts = mat.uniforms.uWaveStart.value;
    const wStr = mat.uniforms.uWaveStrength.value;
    const tNow = mat.uniforms.uTime.value;
    for (let i = 0; i < 6; i++) {
      const age = tNow - wStarts[i];
      if (age > 3.0) wStr[i] = 0;
    }

    if (!bootDone) {
      const p = Math.min(1, (now - bootStart) / 2800);
      mat.uniforms.uMorph.value = 1 - Math.pow(1 - p, 3);
      if (p >= 1) bootDone = true;
    } else {
      mat.uniforms.uMorph.value = 1;
    }

    // Playback cursor.
    if (CFG.playing && bootDone) {
      CFG.cursorTime += dt * CFG.speed * tSpan / 35; // ~35s full run at 1x
      if (CFG.cursorTime >= tMax) {
        // Loop with a pause
        if (now - (CFG._loopStamp || 0) > 2000) {
          CFG._loopStamp = now;
          CFG.cursorTime = tMin;
          rewindTo(tMin);
        } else {
          CFG.cursorTime = tMax;
        }
      }
      advanceTo(CFG.cursorTime);
    }

    // Decay per-particle pulse + fire color.
    const decay = Math.pow(0.02, dt); // fast-ish decay
    for (let i = 0; i < TOTAL; i++) {
      pulse[i] *= decay;
      fireColor[i*3]   *= decay;
      fireColor[i*3+1] *= decay;
      fireColor[i*3+2] *= decay;
    }
    pulseBA.needsUpdate = true;
    fireBA.needsUpdate = true;

    // Update bolts.
    let writeIdx = 0;
    const activeEdges = [];
    const seenEdge = new Set();
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.t += b.speed * dt;
      if (b.t >= 1) {
        // Arrive — flash target site again, then remove.
        const tid = b.edge.childId;
        const site = thoughtSite.get(tid);
        if (site) {
          siteFire.set(tid, { t: 1, color: b.color.clone(), kind: b.kind });
          // Pulse site particles.
          const sx = site.pos.x, sy = site.pos.y, sz = site.pos.z;
          const radius = 22, radSq = radius * radius;
          for (let k = 0; k < CORTEX_COUNT; k++) {
            const dx = basePos[k*3] - sx, dy = basePos[k*3+1] - sy, dz = basePos[k*3+2] - sz;
            const dd = dx*dx + dy*dy + dz*dz;
            if (dd < radSq) {
              const w = 1 - Math.sqrt(dd) / radius;
              pulse[k] = Math.max(pulse[k], w * 0.75);
            }
          }
        }
        bolts.splice(i, 1);
        continue;
      }
      b.edge.activity = Math.max(b.edge.activity, 1 - b.t * 0.3);
      if (!seenEdge.has(b.edge)) { seenEdge.add(b.edge); activeEdges.push(b.edge); }

      // Position on curve.
      const p = b.edge.curve.getPointAt(b.t);
      boltPos[writeIdx*3]   = p.x;
      boltPos[writeIdx*3+1] = p.y;
      boltPos[writeIdx*3+2] = p.z;
      const fade = Math.sin(b.t * Math.PI); // bright mid-travel
      const c = b.color.clone().lerp(SYNAPSE_BRIGHT, 0.4 + 0.4 * fade);
      boltCol[writeIdx*3]   = c.r;
      boltCol[writeIdx*3+1] = c.g;
      boltCol[writeIdx*3+2] = c.b;
      boltSize[writeIdx] = (b.kind === "delegation-packet" ? 22 : b.kind === "delegation" ? 14 : b.kind === "subissue" ? 12 : b.kind === "complete" ? 13 : 9) * (0.8 + fade * 1.0);
      // Emit trail particle — fading wake at this bolt's position.
      // Emit ~every other tick per bolt to cap cost.
      if ((b._trailTick = (b._trailTick || 0) + 1) % 2 === 0) {
        emitTrail(p.x, p.y, p.z, c, boltSize[writeIdx] * 0.85);
      }
      writeIdx++;
    }
    boltGeom.setDrawRange(0, writeIdx);
    boltGeom.attributes.position.needsUpdate = true;
    boltGeom.attributes.aColor.needsUpdate = true;
    boltGeom.attributes.aSize.needsUpdate = true;

    // ---------- Trail decay ----------
    // All trail particles age toward 0 each frame; stale ones render invisibly.
    {
      const trailDecay = Math.pow(0.08, dt); // ~1.1s half-life
      let maxLive = 0;
      for (let i = 0; i < MAX_TRAIL_POINTS; i++) {
        if (trailAge[i] > 0) {
          trailAge[i] *= trailDecay;
          if (trailAge[i] < 0.02) trailAge[i] = 0;
          else if (i + 1 > maxLive) maxLive = i + 1;
        }
      }
      trailGeom.setDrawRange(0, MAX_TRAIL_POINTS); // render all; invisible ones just contribute 0
      trailGeom.attributes.aAge.needsUpdate = true;
      // Position/color only updated when emitted — so also flag them once per frame.
      trailGeom.attributes.position.needsUpdate = true;
      trailGeom.attributes.aColor.needsUpdate = true;
      trailGeom.attributes.aSize.needsUpdate = true;
    }

    // ---------- Lightning arcs update ----------
    // Each arc flickers: points stay put, colors pulse at ~30Hz for first ~0.2s,
    // then fade. Lines are additive so flickering reads as electric.
    let arcWriteCount = 0;
    for (let i = arcs.length - 1; i >= 0; i--) {
      const a = arcs[i];
      a.t += dt;
      const frac = a.t / a.life;
      if (frac >= 1) { arcs.splice(i, 1); continue; }
      // Flicker: first ~40% strobes, then fades.
      const strobe = frac < 0.4
        ? (Math.sin(a.t * 90 + a.slot * 13) * 0.5 + 0.5) * 0.8 + 0.2
        : (1 - (frac - 0.4) / 0.6);
      const strength = Math.max(0, strobe);
      // Re-jitter last segments slightly each frame for "living" arc look.
      const base = a.slot * ARC_SEGS;
      for (let s = 0; s < ARC_SEGS; s++) {
        const p = a.points[s];
        // Tiny time-jitter: later segments wiggle more.
        const wig = (s / ARC_SEGS) * 0.7;
        const jx = Math.sin(a.t * 42 + s * 1.7 + a.slot) * wig;
        const jy = Math.cos(a.t * 39 + s * 2.1 + a.slot) * wig;
        const jz = Math.sin(a.t * 45 + s * 1.3 + a.slot) * wig;
        arcPos[(base + s) * 3]     = p.x + jx;
        arcPos[(base + s) * 3 + 1] = p.y + jy;
        arcPos[(base + s) * 3 + 2] = p.z + jz;
        // Color: bright cyan-white core + agent color tint, multiplied by strength.
        // Tip fades to hot white; body keeps agent hue.
        const tipMix = Math.pow(s / (ARC_SEGS - 1), 1.8);
        const r = (a.color.r * (1 - tipMix) + 1.0 * tipMix) * strength * 1.7;
        const g = (a.color.g * (1 - tipMix) + 1.0 * tipMix) * strength * 1.7;
        const b = (a.color.b * (1 - tipMix) + 1.0 * tipMix) * strength * 1.7;
        arcCol[(base + s) * 3]     = r;
        arcCol[(base + s) * 3 + 1] = g;
        arcCol[(base + s) * 3 + 2] = b;
      }
      arcWriteCount++;
    }
    // Collapse inactive slots: zero both positions AND colors so no stale
    // geometry remains. Previously only colors were cleared, which left lines
    // at their last jittered locations — with AdditiveBlending that should be
    // invisible, but some drivers still rasterize faint dark streaks when the
    // alpha channel is 1.0 on a black line. Zeroing positions eliminates the
    // line entirely (degenerate segment, both endpoints at origin).
    {
      const activeSlots = new Set(arcs.map(a => a.slot));
      for (let slot = 0; slot < MAX_ARCS; slot++) {
        if (activeSlots.has(slot)) continue;
        const base = slot * ARC_SEGS;
        for (let s = 0; s < ARC_SEGS; s++) {
          const o = (base + s) * 3;
          arcPos[o]     = 0;
          arcPos[o + 1] = 0;
          arcPos[o + 2] = 0;
          arcCol[o]     = 0;
          arcCol[o + 1] = 0;
          arcCol[o + 2] = 0;
        }
      }
    }
    arcGeom.setDrawRange(0, MAX_ARCS * (ARC_SEGS - 1) * 2);
    arcGeom.attributes.position.needsUpdate = true;
    arcGeom.attributes.color.needsUpdate = true;

    // ---------- God-rays update ----------
    // Ease-out scale up (length grows), alpha punches in fast then decays.
    for (let i = rays.length - 1; i >= 0; i--) {
      const m = rays[i];
      m.userData.t += dt;
      const rl = m.userData.life;
      const rf = m.userData.t / rl;
      if (rf >= 1) {
        m.visible = false;
        m.material.uniforms.uAlpha.value = 0;
        rays.splice(i, 1);
        continue;
      }
      // Alpha: fast rise (first 12%), slow decay.
      const a = rf < 0.12
        ? (rf / 0.12)
        : Math.pow(1 - (rf - 0.12) / 0.88, 1.6);
      m.material.uniforms.uAlpha.value = a * 1.15;
      // Length grows from 0.3 → 1.0 as it escapes.
      const growth = 0.35 + (1 - Math.pow(1 - rf, 2)) * 0.65;
      const L = m.userData.baseLen * growth;
      m.scale.set(m.userData.baseW * (0.7 + rf * 0.3), L, 1);
      m.position.copy(m.userData.origin).addScaledVector(m.userData.dir, L * 0.5);
    }

    // ---------- Constellation lines update ----------
    {
      let cWrite = 0;
      for (let i = constellations.length - 1; i >= 0; i--) {
        const c = constellations[i];
        c.t += dt;
        if (c.t >= c.life) { constellations.splice(i, 1); continue; }
        const frac = c.t / c.life;
        // Envelope: fast rise (0..10%), gentle decay.
        const env = frac < 0.1 ? (frac / 0.1) : Math.pow(1 - (frac - 0.1) / 0.9, 1.4);
        const brightness = env * 1.1;
        const pa = regionCenters[c.a].center;
        const pb = regionCenters[c.b].center;
        constPos[cWrite * 6]     = pa.x;
        constPos[cWrite * 6 + 1] = pa.y;
        constPos[cWrite * 6 + 2] = pa.z;
        constPos[cWrite * 6 + 3] = pb.x;
        constPos[cWrite * 6 + 4] = pb.y;
        constPos[cWrite * 6 + 5] = pb.z;
        constCol[cWrite * 6]     = c.color.r * brightness;
        constCol[cWrite * 6 + 1] = c.color.g * brightness;
        constCol[cWrite * 6 + 2] = c.color.b * brightness;
        constCol[cWrite * 6 + 3] = c.color.r * brightness;
        constCol[cWrite * 6 + 4] = c.color.g * brightness;
        constCol[cWrite * 6 + 5] = c.color.b * brightness;
        cWrite++;
      }
      constGeom.setDrawRange(0, cWrite * 2);
      constGeom.attributes.position.needsUpdate = true;
      constGeom.attributes.color.needsUpdate = true;
    }

    // ---------- Energy meridians update (always live) ----------
    updateMeridians(mat.uniforms.uTime.value);

    // Edge activity decay.
    for (const e of edges) {
      if (e.activity > 0) {
        e.activity *= Math.pow(0.1, dt); // quick decay
        if (e.activity > 0.01) {
          if (!seenEdge.has(e)) { seenEdge.add(e); activeEdges.push(e); }
        } else {
          e.activity = 0;
        }
      }
    }
    // Trail edges — always active (dim) while hovered/focused.
    if (CFG.trail) {
      for (const e of CFG.trail.edges) {
        e.activity = Math.max(e.activity, 0.55);
        if (!seenEdge.has(e)) { seenEdge.add(e); activeEdges.push(e); }
      }
      // Pulse trail site particles gently.
      for (const id of CFG.trail.sites) {
        const site = thoughtSite.get(id);
        if (!site) continue;
        const sx = site.pos.x, sy = site.pos.y, sz = site.pos.z;
        const radius = 14, radSq = radius * radius;
        for (let k = 0; k < CORTEX_COUNT; k++) {
          const dx = basePos[k*3] - sx, dy = basePos[k*3+1] - sy, dz = basePos[k*3+2] - sz;
          const dd = dx*dx + dy*dy + dz*dz;
          if (dd < radSq) {
            const w = 1 - Math.sqrt(dd) / radius;
            pulse[k] = Math.max(pulse[k], w * 0.4);
          }
        }
      }
    }
    rebuildActiveLines(activeEdges, now);

    // Apply site fire (bright flash at each thought's site).
    for (const [id, s] of siteFire) {
      s.t -= dt / siteFireDur;
      if (s.t <= 0) { siteFire.delete(id); continue; }
      const site = thoughtSite.get(id);
      if (!site) continue;
      // Find nearest N cortex points to site and boost their pulse.
      // (We already pulsed them on spawn; here we sustain the site core.)
      const sx = site.pos.x, sy = site.pos.y, sz = site.pos.z;
      const radius = 8, radSq = radius * radius;
      for (let k = 0; k < CORTEX_COUNT; k++) {
        const dx = basePos[k*3] - sx, dy = basePos[k*3+1] - sy, dz = basePos[k*3+2] - sz;
        const dd = dx*dx + dy*dy + dz*dz;
        if (dd < radSq) {
          pulse[k] = Math.max(pulse[k], s.t * 0.95);
          fireColor[k*3]   = Math.max(fireColor[k*3],   s.color.r * s.t * 0.5);
          fireColor[k*3+1] = Math.max(fireColor[k*3+1], s.color.g * s.t * 0.5);
          fireColor[k*3+2] = Math.max(fireColor[k*3+2], s.color.b * s.t * 0.5);
        }
      }
    }

    // Gentle auto-rotate when idle — but wait a good while after user
    // interaction so we don't fight their intent, and skip entirely when
    // inertia is still decaying or a fly-to is running.
    const idleFor = (performance.now() - orbit._lastInteractT) / 1000;
    const inertiaActive = Math.abs(orbit.velTheta) > 0.001 || Math.abs(orbit.velPhi) > 0.001;
    const flying = orbit._flyT < orbit._flyDur;
    if (!orbit.dragging && !CFG.focusId && !CFG.hoverId && !inertiaActive && !flying && idleFor > 6) {
      // Ramp in gently over ~2s after the grace period ends.
      const ramp = Math.min(1, (idleFor - 6) / 2);
      orbit.targetTheta += 0.0004 * ramp;
      // Gentle vertical drift — camera breathes up and down very slowly.
      const idleFloat = Math.sin(now * 0.00014) * 0.02;
      orbit.targetPhi += (Math.PI * 0.40 + idleFloat - orbit.targetPhi) * 0.005 * ramp;
    }
    orbit.update(dt);
    // Neural core heartbeat — decay + push to shader. Adds a subtle breath
    // term so the mind visibly "breathes" even during quiet stretches.
    coreActivity = Math.max(0, coreActivity - dt * 1.6);
    const coreBreath = 0.18 + Math.sin(performance.now() * 0.0012) * 0.05;
    coreMat.uniforms.uIntensity.value = Math.min(1, coreActivity + coreBreath);
    // Tint core toward dominant agent (reusing nebula tint color).
    if (window.__nebulaMat) {
      coreMat.uniforms.uColor.value.lerp(window.__nebulaMat.uniforms.uTint.value, 0.04);
    }
    updateLabels();

    // Update per-region shimmer uniforms (Pass 2).
    updateAgentStateUniforms(dt, mat.uniforms.uTime.value);

    // ---------- Ambient activity: no random noise. All motion is driven by real events. ----------
    // (Removed: random ambient bolts, random micro-sparkles, random region waves.)
    // The only ambient motion is the per-particle shimmer + global breath in the shader,
    // and the per-region activity (added in Pass 2).

    // Stats broadcast.
    if (now - lastStats > 200) {
      lastStats = now;
      window.MS_UI?.onStats?.(window.MS.getStats());
      window.MS_UI?.onTick?.(window.MS.getTimeFraction());
    }

    try {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    } catch (err) {
      console.error("[Mindspace] render threw:", err);
    }
    } catch (outerErr) {
      console.error("[Mindspace] animate threw:", outerErr);
    }
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    if (composer) composer.setSize(container.clientWidth, container.clientHeight);
  });

  // Kick off.
  if (window.MS_UI?.onReady) window.MS_UI.onReady();
  animate();
})();
