(function () {
  const C = window.CASE;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // ---------- Header ----------
  $("#caseId").textContent = C.caseId;
  $("#caseTitle").textContent = C.title;
  $("#caseSubtitle").textContent = C.subtitle;

  // Status chip
  const ri = C.rawIssue;
  $("#issueStatus").textContent = ri.status.replace("_", " ");
  $("#issueStatus").dataset.status = ri.status;
  $("#issuePriority").textContent = ri.priority;
  $("#issuePriority").dataset.priority = ri.priority;

  // Roster (agents + users)
  const roster = $("#roster");
  const rosterMembers = [];
  for (const a of C.agents) rosterMembers.push({ id: a.id, name: a.name, role: a.role, hue: a.hue, isAgent: true });
  for (const u of C.users) rosterMembers.push({ id: u.id, name: u.name, role: "user", hue: u.hue, isAgent: false });
  for (const m of rosterMembers) {
    const el = document.createElement("button");
    el.className = "member";
    el.dataset.id = m.id;
    el.innerHTML = `
      <span class="av" style="background: hsl(${m.hue} 55% 62%); color: hsl(${m.hue} 55% 62%)">${m.name[0]}</span>
      <span class="info">
        <span class="row1">
          <span class="nm">${m.name}</span>
          <span class="rl">${m.role}</span>
        </span>
        <span class="row2">
          <span class="mood" data-mood="0"></span>
          <span class="mood-label">idle</span>
          <span class="meter"><span class="fill" style="background: hsl(${m.hue} 70% 62%)"></span></span>
        </span>
      </span>
    `;
    el.addEventListener("click", () => {
      // Focus first thought by this author
      const t = window.MS.thoughts.find(x => x.author === m.id);
      if (t) window.MS.focusThought(t.id);
    });
    roster.appendChild(el);
  }

  // ---------- Live roster state updater ----------
  const moodWord = ["idle", "thinking", "working", "blocked"];
  function updateRosterState() {
    // Always reschedule — otherwise a single early miss (before MS boots)
    // silently kills live updates for the whole session.
    requestAnimationFrame(updateRosterState);
    if (!window.MS?.getAgentStates) return;
    const states = window.MS.getAgentStates();
    const byId = new Map(states.map(s => [s.id, s]));
    const members = roster.querySelectorAll(".member");
    members.forEach(el => {
      const id = el.dataset.id;
      const s = byId.get(id);
      if (!s) {
        el.classList.remove("alive", "blocked", "working", "thinking");
        return;
      }
      const fill = el.querySelector(".fill");
      const moodDot = el.querySelector(".mood");
      const moodLbl = el.querySelector(".mood-label");
      if (fill) fill.style.width = Math.min(100, s.activity * 100) + "%";
      if (moodDot) moodDot.dataset.mood = String(s.mood);
      if (moodLbl) moodLbl.textContent = moodWord[s.mood];
      el.classList.toggle("alive", s.activity > 0.04);
      el.classList.toggle("thinking", s.mood === 1);
      el.classList.toggle("working",  s.mood === 2);
      el.classList.toggle("blocked",  s.mood === 3);
    });
  }
  requestAnimationFrame(updateRosterState);

  // ---------- Kind filter ----------
  const kinds = [
    { k: "comment",  label: "Comments",   color: "#F2E6C4" },
    { k: "run",      label: "Runs",       color: "#C8B8F0" },
    { k: "subissue", label: "Sub-issues", color: "#FFD19A" },
    { k: "activity", label: "Activity",   color: "#A8C6D6" },
  ];
  const kindFilter = $("#kindFilter");
  for (const { k, label, color } of kinds) {
    const count = C.thoughts.filter(t => t.kind === k).length;
    const el = document.createElement("button");
    el.className = "kind-chip";
    el.dataset.kind = k;
    el.innerHTML = `<span class="dot" style="background:${color}"></span><span class="l">${label}</span><span class="c">${count}</span>`;
    el.addEventListener("click", () => {
      el.classList.toggle("off");
      window.MS.toggleKind(k);
    });
    kindFilter.appendChild(el);
  }

  // ---------- Thought stream (timeline list) ----------
  const streamEl = $("#thoughtStream");
  function fmtTime(ts) {
    const d = new Date(ts);
    const base = new Date(C.rawIssue.createdAt).getTime();
    const deltaMin = Math.round((ts - base) / 60000);
    const h = Math.floor(deltaMin / 60);
    const m = deltaMin % 60;
    return `+${h}h${String(m).padStart(2,'0')}`;
  }
  function kindLabel(t) {
    if (t.kind === "comment") return "comment";
    if (t.kind === "run") return `run · ${t.status || ""}`;
    if (t.kind === "subissue") return `sub · ${t.ref?.status || ""}`;
    if (t.kind === "activity") return (t.ref?.action || "activity").replace(".", " → ");
    if (t.kind === "issue") return "root";
    return t.kind;
  }

  function buildStream() {
    streamEl.innerHTML = "";
    const sorted = [...C.thoughts].sort((a, b) => a.ts - b.ts);
    for (const t of sorted) {
      if (t.kind === "issue") continue;
      const row = document.createElement("button");
      row.className = `stream-row kind-${t.kind}` + (C.critical.has(t.id) ? " crit" : "") + (t.isLive ? " live" : "");
      row.dataset.id = t.id;
      row.style.setProperty("--h", t.hue || 40);
      // Per-row author-color band — faint agent color along the left edge.
      row.style.setProperty("--author", `hsl(${t.hue || 40} 62% 64%)`);
      row.innerHTML = `
        <span class="rail"></span>
        <span class="t">${fmtTime(t.ts)}</span>
        <span class="ky">${kindLabel(t)}</span>
        <span class="au">${t.authorName || ""}</span>
        <span class="bd">${escapeHtml(t.label)}</span>
      `;
      row.addEventListener("click", () => window.MS.focusThought(t.id));
      row.addEventListener("mouseenter", () => window.MS.hover(t.id));
      row.addEventListener("mouseleave", () => window.MS.hover(null));
      streamEl.appendChild(row);
    }
  }
  function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  buildStream();

  // ---------- Hover tooltip ----------
  const tip = $("#hoverTip");
  function setHover(id, x, y) {
    if (!id) { tip.style.opacity = 0; return; }
    const t = window.MS.byId.get(id);
    if (!t) return;
    tip.style.opacity = 1;
    tip.style.transform = `translate(${Math.min(window.innerWidth - 340, x + 14)}px, ${Math.min(window.innerHeight - 160, y + 14)}px)`;
    tip.querySelector(".k").textContent = kindLabel(t);
    tip.querySelector(".au").textContent = t.authorName || "";
    tip.querySelector(".bd").textContent = t.body || t.label;
    tip.querySelector(".ts").textContent = new Date(t.ts).toLocaleString();
    tip.dataset.kind = t.kind;
    // Highlight row
    $$(".stream-row.hovering").forEach(r => r.classList.remove("hovering"));
    const row = streamEl.querySelector(`[data-id="${id}"]`);
    if (row) row.classList.add("hovering");
  }

  // ---------- Detail panel ----------
  const panel = $("#detailPanel");
  const closeBtn = $("#detailClose");
  function authorColor(hue) { return `hsl(${hue || 40} 55% 68%)`; }
  function chainList(id) {
    const ancestors = [];
    const descendants = [];
    const qA = [...(C.parents.get(id) || [])];
    const seenA = new Set(qA);
    while (qA.length) {
      const p = qA.shift();
      ancestors.push(p);
      for (const pp of C.parents.get(p) || []) if (!seenA.has(pp)) { seenA.add(pp); qA.push(pp); }
    }
    const qD = [...(C.children.get(id) || [])];
    const seenD = new Set(qD);
    while (qD.length) {
      const c = qD.shift();
      descendants.push(c);
      for (const cc of C.children.get(c) || []) if (!seenD.has(cc)) { seenD.add(cc); qD.push(cc); }
    }
    return { ancestors, descendants };
  }

  function renderThought(t) {
    if (!t) { panel.classList.remove("open"); return; }
    panel.classList.add("open");
    panel.dataset.kind = t.kind;
    const isCrit = C.critical.has(t.id);
    const canJump = t.kind === "subissue";
    const body = t.body || t.label;
    const meta = [];
    if (t.kind === "run") {
      const r = t.ref;
      meta.push(`<div class="kv"><span>status</span><b>${r.status}</b></div>`);
      meta.push(`<div class="kv"><span>source</span><b>${r.invocationSource}</b></div>`);
      meta.push(`<div class="kv"><span>started</span><b>${r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}</b></div>`);
      meta.push(`<div class="kv"><span>finished</span><b>${r.finishedAt ? new Date(r.finishedAt).toLocaleString() : "—"}</b></div>`);
    } else if (t.kind === "subissue") {
      const s = t.ref;
      meta.push(`<div class="kv"><span>id</span><b>${s.identifier}</b></div>`);
      meta.push(`<div class="kv"><span>status</span><b>${s.status}</b></div>`);
      meta.push(`<div class="kv"><span>priority</span><b>${s.priority}</b></div>`);
      meta.push(`<div class="kv"><span>assignee</span><b>${C.agentMap.get(s.assigneeAgentId)?.name || "—"}</b></div>`);
    } else if (t.kind === "comment") {
      meta.push(`<div class="kv"><span>author</span><b>${t.authorName}</b></div>`);
      meta.push(`<div class="kv"><span>at</span><b>${new Date(t.ts).toLocaleString()}</b></div>`);
    } else if (t.kind === "activity") {
      const a = t.ref;
      meta.push(`<div class="kv"><span>action</span><b>${a.action}</b></div>`);
      meta.push(`<div class="kv"><span>actor</span><b>${t.authorName}</b></div>`);
      if (a.runId) meta.push(`<div class="kv"><span>run</span><b>${a.runId}</b></div>`);
      if (a.details?.from && a.details?.to) meta.push(`<div class="kv"><span>change</span><b>${a.details.from} → ${a.details.to}</b></div>`);
    } else if (t.kind === "issue") {
      const i = t.ref;
      meta.push(`<div class="kv"><span>id</span><b>${i.identifier}</b></div>`);
      meta.push(`<div class="kv"><span>status</span><b>${i.status}</b></div>`);
      meta.push(`<div class="kv"><span>priority</span><b>${i.priority}</b></div>`);
    }

    const ch = chainList(t.id);
    const chainRow = (id, dir) => {
      const o = window.MS.byId.get(id); if (!o) return "";
      return `<button class="chain-row" data-id="${id}">
        <span class="dir">${dir}</span>
        <span class="kdot kind-${o.kind}"></span>
        <span class="kk">${o.kind}</span>
        <span class="au">${o.authorName || ""}</span>
        <span class="bd">${escapeHtml(o.label)}</span>
      </button>`;
    };

    panel.querySelector(".panel-body").innerHTML = `
      <div class="head">
        <span class="kind-pill kind-${t.kind}">${t.kind}</span>
        ${isCrit ? '<span class="crit-pill">critical path</span>' : ""}
        ${t.isLive ? '<span class="live-pill"><span class="p"></span>live</span>' : ""}
      </div>
      <div class="author">
        <span class="av" style="background:${authorColor(t.hue)}; color:${authorColor(t.hue)}">${(t.authorName||"?")[0]}</span>
        <div>
          <div class="nm">${t.authorName || "—"}</div>
          <div class="ts">${new Date(t.ts).toLocaleString()}</div>
        </div>
      </div>
      <div class="body">${escapeHtml(body)}</div>
      <div class="meta-grid">${meta.join("")}</div>
      ${canJump ? `<button class="jump" data-jump="${t.ref?.id}">↳ Jump into ${t.ref?.identifier}</button>` : ""}
      <div class="chain">
        <div class="section-label"><span>Caused by</span><span class="hint">${ch.ancestors.length}</span></div>
        ${ch.ancestors.length ? ch.ancestors.map(id => chainRow(id, "↑")).join("") : '<div class="empty">root thought</div>'}
        <div class="section-label" style="margin-top:14px"><span>Led to</span><span class="hint">${ch.descendants.length}</span></div>
        ${ch.descendants.length ? ch.descendants.map(id => chainRow(id, "↓")).join("") : '<div class="empty">terminal thought</div>'}
      </div>
    `;
    panel.querySelectorAll(".chain-row").forEach(r => {
      r.addEventListener("click", () => window.MS.focusThought(r.dataset.id));
    });
    const jump = panel.querySelector(".jump");
    if (jump) jump.addEventListener("click", () => {
      alert("Re-rooting to sub-issue isn't wired in this mock — but this is where the router would push to the child issue's Thought Space.");
    });

    // Highlight stream row
    $$(".stream-row.focused").forEach(r => r.classList.remove("focused"));
    const row = streamEl.querySelector(`[data-id="${t.id}"]`);
    if (row) { row.classList.add("focused"); row.scrollIntoViewIfNeeded?.(); }
  }

  closeBtn.addEventListener("click", () => window.MS.focusThought(null));

  function onFocus(id) {
    if (!id) {
      panel.classList.remove("open");
      $$(".stream-row.focused").forEach(r => r.classList.remove("focused"));
      return;
    }
    renderThought(window.MS.byId.get(id));
  }

  // ---------- Legend (critical path) ----------
  $("#critCount").textContent = C.critical.size;

  // ---------- HUD stats ----------
  const counts = { comment: 0, run: 0, subissue: 0, activity: 0 };
  for (const t of C.thoughts) if (counts[t.kind] != null) counts[t.kind]++;
  $("#hudStats").innerHTML = `
    <span class="s"><span class="k">Comments</span><span class="v">${counts.comment}</span></span>
    <span class="sep"></span>
    <span class="s"><span class="k">Runs</span><span class="v">${counts.run}</span></span>
    <span class="sep"></span>
    <span class="s"><span class="k">Sub-issues</span><span class="v">${counts.subissue}</span></span>
    <span class="sep"></span>
    <span class="s"><span class="k">Activity</span><span class="v">${counts.activity}</span></span>
    <span class="sep"></span>
    <span class="s"><span class="k">Critical path</span><span class="v" style="color:#FF6B4A">${C.critical.size}</span></span>
  `;

  // ====================================================
  // UX OVERLAYS — opening, phases, now-spotlight, progress, closing, chain-browse
  // ====================================================

  // --- UX 1: Opening ceremony ---
  const openingEl = $("#openingOverlay");
  openingEl.querySelector(".oo-title").textContent = C.title;
  openingEl.querySelector(".oo-sub").textContent = C.subtitle || (C.rawIssue?.description || "");
  // Show on load, hide once boot-in finishes.
  setTimeout(() => openingEl.classList.add("on"), 30);
  setTimeout(() => { openingEl.classList.remove("on"); openingEl.classList.add("off"); }, 2600);
  setTimeout(() => { openingEl.style.display = "none"; }, 3400);

  // --- UX 2: Phase detection ---
  // Segment the timeline into phases by event-kind rhythm:
  //   Understanding — before first delegation
  //   Planning      — first delegation → first run/subissue
  //   Executing     — runs/subissues/actions
  //   Resolving     — from first complete onward
  //   Resolved      — after final complete
  const sortedThoughts = [...C.thoughts].sort((a, b) => a.ts - b.ts);
  const phases = [];
  (function buildPhases() {
    const firstDelegation = sortedThoughts.find(t => t.semantic === "delegation");
    const firstExec = sortedThoughts.find(t => t.kind === "run" || t.kind === "subissue");
    const firstComplete = sortedThoughts.find(t => t.semantic === "complete" && t.kind !== "run");
    const lastComplete = [...sortedThoughts].reverse().find(t => t.semantic === "complete");
    const t0 = sortedThoughts[0].ts;
    const tEnd = sortedThoughts[sortedThoughts.length - 1].ts;
    phases.push({ id: "understand", idx: 1, name: "Understanding", start: t0 });
    if (firstDelegation) phases.push({ id: "plan",      idx: 2, name: "Planning",       start: firstDelegation.ts });
    if (firstExec)       phases.push({ id: "execute",   idx: 3, name: "Executing",      start: firstExec.ts });
    if (firstComplete)   phases.push({ id: "resolve",   idx: 4, name: "Resolving",      start: firstComplete.ts });
    if (lastComplete)    phases.push({ id: "resolved",  idx: 5, name: "Resolved",       start: lastComplete.ts });
    // Fill end markers.
    for (let i = 0; i < phases.length; i++) phases[i].end = phases[i+1]?.start ?? tEnd + 1;
  })();

  const phaseTitleEl = $("#phaseTitle");
  const PHASE_HEX = {
    understand: 0x81A8D4,   // cool blue
    plan:       0x9FC1A7,   // muted green
    execute:    0xD2AA64,   // amber
    resolve:    0xE8A598,   // rose
    resolved:   0xBDA7D0,   // violet
  };
  let currentPhaseId = null;
  function updatePhase(ts) {
    const p = phases.find(p => ts >= p.start && ts < p.end) || phases[0];
    if (!p || p.id === currentPhaseId) return;
    const wasPrior = currentPhaseId;  // for transitions
    currentPhaseId = p.id;
    phaseTitleEl.querySelector(".pt-idx").textContent = String(p.idx).padStart(2, "0");
    phaseTitleEl.querySelector(".pt-name").textContent = p.name;
    phaseTitleEl.classList.remove("on");
    // Reflow + fade in
    void phaseTitleEl.offsetWidth;
    phaseTitleEl.classList.add("on");
    // Auto-fade after 3s of stability.
    clearTimeout(phaseTitleEl._fadeTO);
    phaseTitleEl._fadeTO = setTimeout(() => phaseTitleEl.classList.remove("on"), 3400);
    // Phase-transition shockwave: a global ring in the phase's color.
    // Skip on very first phase (the boot sequence already does its own thing).
    if (wasPrior) {
      window.MS?.spawnPhaseShockwave?.(PHASE_HEX[p.id] ?? 0xE8A598);
    }
  }

  // --- UX 3: Now-spotlight subtitle ---
  const nowEl = $("#nowSpotlight");
  const VERBS = {
    decision:  "decides",
    delegation:"delegates to",
    block:     "is blocked",
    retry:     "retries",
    complete:  "completes",
    thinking:  "thinks about",
    root:      "receives",
  };
  let nowFadeTO = null;
  function showNow(thought) {
    if (!thought) return;
    const who = thought.authorName || "—";
    const sem = thought.semantic || "thinking";
    const verb = VERBS[sem] || "notes";
    const what = thought.label || thought.body || "";
    nowEl.querySelector(".ns-who").textContent = who;
    nowEl.querySelector(".ns-who").style.color = `hsl(${thought.hue || 40} 55% 68%)`;
    nowEl.querySelector(".ns-verb").textContent = verb;
    nowEl.querySelector(".ns-what").textContent = what.length > 120 ? what.slice(0, 118) + "…" : what;
    nowEl.classList.add("on");
    clearTimeout(nowFadeTO);
    nowFadeTO = setTimeout(() => nowEl.classList.remove("on"), 4500);
  }

  // --- UX 4: Progress ring ---
  // Draw a thin SVG ring overlay around the brain, filling with playback fraction.
  const ringSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ringSvg.setAttribute("id", "progressRing");
  ringSvg.setAttribute("viewBox", "0 0 100 100");
  ringSvg.innerHTML = `
    <defs>
      <linearGradient id="progGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#E8A598"/>
        <stop offset="1" stop-color="#C8B8F0"/>
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(243,234,218,0.08)" stroke-width="0.7"/>
    <circle id="progFill" cx="50" cy="50" r="42" fill="none" stroke="url(#progGrad)" stroke-width="0.9"
      stroke-dasharray="263.89" stroke-dashoffset="263.89" transform="rotate(-90 50 50)"
      stroke-linecap="round" />
    <text x="50" y="52" text-anchor="middle" dominant-baseline="middle"
      fill="rgba(243,234,218,0.4)" font-family="JetBrains Mono, monospace" font-size="4" letter-spacing="0.2"
      id="progLabel">0%</text>`;
  Object.assign(ringSvg.style, {
    position: "fixed",
    right: "340px",
    bottom: "60px",
    width: "120px",
    height: "120px",
    pointerEvents: "none",
    opacity: "0.85",
    zIndex: "15",
  });
  document.body.appendChild(ringSvg);
  const progFill = ringSvg.querySelector("#progFill");
  const progLabel = ringSvg.querySelector("#progLabel");
  function updateProgressRing(frac) {
    const circ = 263.89; // 2πr with r=42
    progFill.setAttribute("stroke-dashoffset", circ * (1 - Math.max(0, Math.min(1, frac))));
    progLabel.textContent = Math.round(frac * 100) + "%";
  }

  // --- UX 5: Closing climax ---
  const closingEl = $("#closingOverlay");
  const finalComplete = [...sortedThoughts].reverse().find(t => t.semantic === "complete");
  let closingFired = false;
  function maybeFireClosing(ts) {
    if (closingFired || !finalComplete) return;
    if (ts < finalComplete.ts) return;
    closingFired = true;
    // Count stats.
    const totalEvents = sortedThoughts.length;
    const totalAgents = new Set(sortedThoughts.map(t => t.author)).size;
    const span = sortedThoughts[sortedThoughts.length - 1].ts - sortedThoughts[0].ts;
    const hrs = Math.round(span / 3600_000);
    closingEl.querySelector(".co-title").textContent = C.title;
    closingEl.querySelector(".co-stats").innerHTML = `
      <span class="stat"><b>${totalEvents}</b>thoughts</span>
      <span class="stat"><b>${totalAgents}</b>agents</span>
      <span class="stat"><b>${hrs}h</b>elapsed</span>`;
    // Delay to let the chain-glow play first.
    setTimeout(() => closingEl.classList.add("on"), 1000);
    // Auto-fade after 6s.
    setTimeout(() => closingEl.classList.remove("on"), 7500);
  }
  function resetClosing() {
    closingFired = false;
    closingEl.classList.remove("on");
  }

  // --- UX 6: Chain-browse mode ---
  const chainBanner = $("#chainBanner");
  chainBanner.querySelector(".cb-exit").addEventListener("click", () => exitChainBrowse());

  let chainMode = null; // { chainIds: Set, startTs, endTs, rootId, color }
  function enterChainBrowse(thoughtId) {
    if (!thoughtId) return;
    // Walk ancestors and descendants to gather the full chain.
    const chainIds = new Set([thoughtId]);
    // Ancestors.
    let cur = thoughtId;
    const parentsMap = new Map(C.thoughts.map(t => [t.id, t])); // not used, we use MS
    const primaryParent = window.MS.case ? null : null; // not accessible; use own walk via causal edges
    // Fall back: use C.edges if present.
    const childrenByParent = new Map();
    for (const [cid, parents] of Object.entries(C.causal?.parents || {})) {
      for (const p of parents) {
        if (!childrenByParent.has(p)) childrenByParent.set(p, []);
        childrenByParent.get(p).push(cid);
      }
    }
    // Ancestors via causal.parents.
    const parentsOf = C.causal?.parents || {};
    const visited = new Set();
    const queueUp = [thoughtId];
    while (queueUp.length) {
      const id = queueUp.pop();
      if (visited.has(id)) continue;
      visited.add(id); chainIds.add(id);
      for (const p of (parentsOf[id] || [])) queueUp.push(p);
    }
    const queueDown = [thoughtId];
    const visitedD = new Set();
    while (queueDown.length) {
      const id = queueDown.pop();
      if (visitedD.has(id)) continue;
      visitedD.add(id); chainIds.add(id);
      for (const c of (childrenByParent.get(id) || [])) queueDown.push(c);
    }
    // Time bounds.
    const ids = [...chainIds];
    const thoughts = ids.map(i => C.thoughtMap?.get(i) || sortedThoughts.find(t => t.id === i)).filter(Boolean);
    if (!thoughts.length) return;
    const startTs = Math.min(...thoughts.map(t => t.ts));
    const endTs = Math.max(...thoughts.map(t => t.ts));
    chainMode = { chainIds, startTs, endTs, rootId: thoughtId };
    document.body.classList.add("chain-browse");
    chainBanner.querySelector(".cb-count").textContent = `${chainIds.size} thoughts`;
    const color = `hsl(${(thoughts[0].hue || 40)} 55% 68%)`;
    chainBanner.querySelector(".cb-dot").style.background = color;
    chainBanner.querySelector(".cb-dot").style.color = color;
    // Seek engine to start of chain.
    if (window.MS?.seek) {
      const tMin = Math.min(...sortedThoughts.map(t => t.ts));
      const tMax = Math.max(...sortedThoughts.map(t => t.ts));
      const frac = (startTs - tMin) / (tMax - tMin);
      window.MS.seek(Math.max(0, frac - 0.02));
    }
    // Focus the original thought.
    window.MS.focusThought(thoughtId);
  }
  function exitChainBrowse() {
    chainMode = null;
    document.body.classList.remove("chain-browse");
    window.MS.focusThought(null);
  }

  // ====================================================

  // ---------- Bottom timeline scrubber ----------
  const tlEl = $("#timeline");
  const tlTrack = $("#tlTrack");
  const tlPhases = $("#tlPhases");
  const tlEvents = $("#tlEvents");
  const tlFill = $("#tlFill");
  const tlHead = $("#tlHead");
  const tlPlay = $("#tlPlay");
  const tlCursor = $("#tlCursor");
  const tlTotal = $("#tlTotal");
  const tlCaption = $("#tlCaption");

  const tlMin = sortedThoughts[0].ts;
  const tlMax = sortedThoughts[sortedThoughts.length - 1].ts;
  const tlSpan = Math.max(1, tlMax - tlMin);

  function fmtDur(sec) {
    const s = Math.max(0, Math.floor(sec));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `+${d}d${String(h).padStart(2, "0")}h`;
    return `+${h}h${String(m).padStart(2, "0")}`;
  }
  tlTotal.textContent = fmtDur(tlSpan);

  // Build phase bands
  tlPhases.innerHTML = "";
  phases.forEach((p, i) => {
    const w = ((p.end - p.start) / tlSpan) * 100;
    const band = document.createElement("div");
    band.className = "tl-phase";
    band.style.width = w + "%";
    band.style.background = [
      "rgba(129, 168, 212, 0.07)",
      "rgba(159, 193, 167, 0.07)",
      "rgba(210, 170, 100, 0.08)",
      "rgba(232, 165, 152, 0.10)",
      "rgba(120, 160, 200, 0.06)",
    ][i % 5];
    const lab = document.createElement("div");
    lab.className = "tl-phase-label";
    lab.textContent = p.name;
    band.appendChild(lab);
    tlPhases.appendChild(band);
  });

  // Build event ticks (sample if very dense)
  tlEvents.innerHTML = "";
  const kindHue = { message: 40, tool_call: 195, tool_result: 195, reasoning: 280, observation: 160, write: 210, run: 30, subissue: 340, artifact: 45 };
  const tickStep = Math.max(1, Math.floor(sortedThoughts.length / 400));
  for (let i = 0; i < sortedThoughts.length; i += tickStep) {
    const t = sortedThoughts[i];
    const tick = document.createElement("div");
    tick.className = "tl-ev" + (t.critical ? " crit" : "");
    const frac = (t.ts - tlMin) / tlSpan;
    tick.style.left = (frac * 100) + "%";
    tick.style.setProperty("--h", String(kindHue[t.kind] ?? 40));
    tlEvents.appendChild(tick);
  }

  let tlScrubbing = false;

  // Ghost cursor — shows on hover, displays the nearest event.
  const tlGhost = document.createElement("div");
  tlGhost.className = "tl-ghost";
  tlTrack.appendChild(tlGhost);
  const tlTip = document.createElement("div");
  tlTip.className = "tl-tip";
  tlEl.appendChild(tlTip);

  function setGhost(frac, show) {
    if (!show) { tlGhost.classList.remove("on"); tlTip.classList.remove("on"); return; }
    const pct = Math.max(0, Math.min(1, frac)) * 100;
    tlGhost.style.left = pct + "%";
    tlGhost.classList.add("on");
    const t = window.MS?.thoughtAtFrac?.(frac);
    if (t) {
      const who = t.author || "—";
      const head = t.title || (t.body ? t.body.slice(0, 60) : t.kind);
      tlTip.innerHTML = `<div class="tt-who">${who} · ${t.kind}</div><div class="tt-head">${head}</div>`;
      const trackRect = tlTrack.getBoundingClientRect();
      const elRect = tlEl.getBoundingClientRect();
      const x = (trackRect.left - elRect.left) + frac * trackRect.width;
      tlTip.style.left = x + "px";
      tlTip.classList.add("on");
    }
  }

  function setTimelineFrac(frac) {
    const pct = Math.max(0, Math.min(1, frac)) * 100;
    tlFill.style.width = pct + "%";
    tlHead.style.left = pct + "%";
    tlCursor.textContent = fmtDur(frac * tlSpan);
    // Update caption with nearest event's summary
    const ts = tlMin + frac * tlSpan;
    let best = sortedThoughts[0], bestD = Infinity;
    for (const t of sortedThoughts) {
      const d = Math.abs(t.ts - ts);
      if (d < bestD) { bestD = d; best = t; }
      if (t.ts > ts && d > bestD) break;
    }
    if (best) {
      const who = best.author || "—";
      const head = best.title || best.body?.slice(0, 80) || best.kind;
      tlCaption.textContent = `${who} · ${head}`;
    }
  }

  function onTrackPoint(e) {
    const r = tlTrack.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - r.left;
    const frac = Math.max(0, Math.min(1, x / r.width));
    setTimelineFrac(frac);
    window.MS.seek?.(frac);
  }
  tlTrack.addEventListener("pointerdown", (e) => {
    tlScrubbing = true;
    tlTrack.setPointerCapture(e.pointerId);
    window.MS.setPlaying?.(false);
    tlPlay.classList.add("paused");
    tlPlay.textContent = "▶";
    onTrackPoint(e);
  });
  tlTrack.addEventListener("pointermove", (e) => {
    if (!tlScrubbing) return;
    onTrackPoint(e);
  });
  tlTrack.addEventListener("pointerup", (e) => {
    tlScrubbing = false;
    try { tlTrack.releasePointerCapture(e.pointerId); } catch(_){}
  });

  // Ghost-hover on the track — preview the thought without seeking.
  tlTrack.addEventListener("pointerenter", () => setGhost(0, false));
  tlTrack.addEventListener("pointermove", (e) => {
    if (tlScrubbing) return;
    const r = tlTrack.getBoundingClientRect();
    const x = e.clientX - r.left;
    setGhost(x / r.width, true);
  });
  tlTrack.addEventListener("pointerleave", () => setGhost(0, false));

  // Play/pause
  let tlPlaying = true;
  tlPlay.addEventListener("click", () => {
    tlPlaying = !tlPlaying;
    window.MS.setPlaying?.(tlPlaying);
    tlPlay.classList.toggle("paused", !tlPlaying);
    tlPlay.textContent = tlPlaying ? "▶" : "❚❚";
  });

  // Wire all the engine hooks.
  window.MS_UI = {
    setHover,
    onFocus,
    onReady() {
      // Engine is ready — nothing special; overlay is already timed.
    },
    onEvent(ev, thought) {
      if (!thought) return;
      showNow(thought);
      // If in chain-browse mode and we've passed the chain's end, auto-exit.
      if (chainMode && thought.ts > chainMode.endTs + 1) {
        // don't auto-exit; user can esc. But we could pause at the end.
      }
    },
    onStats(s) { /* already surfaced via #hudStats in onTick path */ },
    onTick(frac) {
      updateProgressRing(frac);
      // Find a representative ts for the cursor to drive phase detection.
      const tMin = sortedThoughts[0].ts;
      const tMax = sortedThoughts[sortedThoughts.length - 1].ts;
      const ts = tMin + frac * (tMax - tMin);
      updatePhase(ts);
      maybeFireClosing(ts);
      if (frac < 0.02) resetClosing();
      if (!tlScrubbing) setTimelineFrac(frac);
    },
    enterChainBrowse,
    exitChainBrowse,
  };

  // ---------- Tweaks ----------
  const TWEAKS = /*EDITMODE-BEGIN*/{
    "layout": "tiered",
    "edges": "filaments",
    "labels": true,
    "pulse": 1.0,
    "ringPulse": 0,
    "shockwave": 1.0,
    "spacing": 1.0
  }/*EDITMODE-END*/;

  const panelT = $("#tweaksPanel");
  const SLIDER_LBL = { pulse: "pulseLbl", ringPulse: "ringPulseLbl", shockwave: "shockwaveLbl", spacing: "spacingLbl" };
  function fmtSlider(k, v) {
    if ((k === "ringPulse" || k === "shockwave") && v < 0.01) return "off";
    return (+v).toFixed(2);
  }
  function syncTweakUI() {
    $$("#tweaksPanel [data-tweak]").forEach(el => {
      const k = el.dataset.tweak;
      const v = el.dataset.value;
      if (String(TWEAKS[k]) === String(v)) el.classList.add("on");
      else el.classList.remove("on");
    });
    $$("#tweaksPanel [data-slider]").forEach(el => {
      const k = el.dataset.slider;
      el.value = TWEAKS[k];
      const lbl = document.getElementById(SLIDER_LBL[k]);
      if (lbl) lbl.textContent = fmtSlider(k, TWEAKS[k]);
    });
  }

  // Apply defaults
  window.MS.setEdges?.(TWEAKS.edges);
  window.MS.setLabels?.(TWEAKS.labels);
  window.MS.setPulse?.(TWEAKS.pulse);
  window.MS.setRingPulse?.(TWEAKS.ringPulse);
  window.MS.setShockwave?.(TWEAKS.shockwave);
  syncTweakUI();

  panelT.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tweak]");
    if (!btn) return;
    const k = btn.dataset.tweak;
    let v = btn.dataset.value;
    if (v === "true") v = true; else if (v === "false") v = false;
    TWEAKS[k] = v;
    if (k === "edges") window.MS.setEdges?.(v);
    if (k === "labels") window.MS.setLabels?.(v);
    syncTweakUI();
    try { window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*"); } catch(_){}
  });
  panelT.addEventListener("input", (e) => {
    const sl = e.target.closest("[data-slider]"); if (!sl) return;
    const k = sl.dataset.slider;
    const v = parseFloat(sl.value);
    TWEAKS[k] = v;
    if (k === "pulse") window.MS.setPulse?.(v);
    if (k === "ringPulse") window.MS.setRingPulse?.(v);
    if (k === "shockwave") window.MS.setShockwave?.(v);
    const lbl = document.getElementById(SLIDER_LBL[k]);
    if (lbl) lbl.textContent = fmtSlider(k, v);
    try { window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*"); } catch(_){}
  });

  $("#tweaksClose").addEventListener("click", () => panelT.classList.remove("open"));
  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.type === "__activate_edit_mode") panelT.classList.add("open");
    else if (d.type === "__deactivate_edit_mode") panelT.classList.remove("open");
  });
  try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch(_){}

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (document.body.classList.contains("chain-browse")) {
        window.MS_UI?.exitChainBrowse?.();
      } else {
        window.MS.focusThought(null);
      }
    }
  });
})();
