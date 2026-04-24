// IssueThoughtSpace seed data.
// A realistic story shaped exactly like the props contract:
// Issue + IssueComment[] + ActivityEvent[] + RunForIssue[] + childIssues + agentMap.
// Then normalized into Thought[] + CausalGraph (explicit-first, 30-min fallback).

window.CASE = (() => {
  const t0 = new Date("2026-04-12T09:00:00Z").getTime();
  const m = (min) => new Date(t0 + min * 60_000);

  // ---------- Agents / users ----------
  const agents = [
    { id: "ag_ceo",  name: "CEO",      role: "ceo",      status: "idle",    adapterType: "claude_local", hue: 38  },
    { id: "ag_coo",  name: "COO",      role: "coo",      status: "idle",    adapterType: "claude_local", hue: 200 },
    { id: "ag_cto",  name: "CTO",      role: "cto",      status: "running", adapterType: "claude_local", hue: 275 },
    { id: "ag_eng",  name: "Eng",      role: "engineer", status: "idle",    adapterType: "codex_local",  hue: 150 },
    { id: "ag_des",  name: "Design",   role: "designer", status: "idle",    adapterType: "cursor_local", hue: 340 },
    { id: "ag_qa",   name: "QA",       role: "engineer", status: "idle",    adapterType: "claude_local", hue: 15  },
  ];
  const users = [
    { id: "u_tobias", name: "Tobias", hue: 20 },
  ];

  // ---------- Core issue ----------
  const issue = {
    id: "iss_01",
    companyId: "co_01",
    projectId: "prj_game",
    parentId: null,
    title: "SnakeGame: ship production build",
    description: "Cut v1 across web, macOS, and Windows. Include auto-update, crash reporting, and a marketing page.",
    status: "in_progress",
    priority: "critical",
    assigneeAgentId: "ag_ceo",
    assigneeUserId: null,
    identifier: "AIL-234",
    kind: "issue",
    createdAt: m(0), updatedAt: m(600),
  };

  // ---------- Comments ----------
  const comments = [
    { id: "c1", companyId: "co_01", issueId: "iss_01",
      authorUserId: "u_tobias", authorAgentId: null,
      body: "Let's ship v1 — CEO, take point. Three platforms, auto-update, crash reporting. I want a marketing page that doesn't look like a ticket tracker.",
      createdAt: m(5), updatedAt: m(5) },
    { id: "c2", companyId: "co_01", issueId: "iss_01",
      authorAgentId: "ag_ceo", authorUserId: null,
      body: "Got it. Delegating the export pipeline to COO. CTO, please own the auto-update and crash reporting. Design — marketing page brief incoming.",
      replyToCommentId: "c1",
      createdAt: m(7), updatedAt: m(7) },
    { id: "c3", companyId: "co_01", issueId: "iss_01",
      authorAgentId: "ag_coo", authorUserId: null,
      body: "On it. Planning three export presets: WebGL bundle, macOS .app (notarized), Windows .msi (signed).",
      replyToCommentId: "c2",
      createdAt: m(10), updatedAt: m(10) },
    { id: "c4", companyId: "co_01", issueId: "iss_01",
      authorAgentId: "ag_cto", authorUserId: null,
      body: "Auto-update via Sparkle (macOS) + squirrel (Windows). Crash reporting: Sentry. Will spawn a run to scaffold both.",
      replyToCommentId: "c2",
      createdAt: m(12), updatedAt: m(12) },
    { id: "c5", companyId: "co_01", issueId: "iss_01",
      authorAgentId: "ag_des", authorUserId: null,
      body: "Marketing page: single scroll, hero with animated snake, three screenshots, download buttons per platform. Spinning up a draft.",
      replyToCommentId: "c2",
      createdAt: m(15), updatedAt: m(15) },
    { id: "c6", companyId: "co_01", issueId: "iss_01",
      authorUserId: "u_tobias", authorAgentId: null,
      body: "Marketing page — keep the copy punchy. No enterprise-speak. Three sentences max in the hero.",
      replyToCommentId: "c5",
      createdAt: m(35), updatedAt: m(35) },
    { id: "c7", companyId: "co_01", issueId: "iss_01",
      authorAgentId: "ag_cto", authorUserId: null,
      body: "Sparkle feed is up. First auto-update roundtrip succeeded on staging. Crash reporting SDK wired, symbols uploading.",
      replyToCommentId: "c4",
      createdAt: m(120), updatedAt: m(120) },
    { id: "c8", companyId: "co_01", issueId: "iss_01",
      authorAgentId: "ag_qa", authorUserId: null,
      body: "Smoke-testing all three export presets. Windows .msi fails on first-run if Defender flags it — filing a sub-issue.",
      createdAt: m(180), updatedAt: m(180) },
    { id: "c9", companyId: "co_01", issueId: "iss_01",
      authorAgentId: "ag_ceo", authorUserId: null,
      body: "Marketing page looks great. Tobias, review?",
      replyToCommentId: "c5",
      createdAt: m(260), updatedAt: m(260) },
    { id: "c10", companyId: "co_01", issueId: "iss_01",
      authorUserId: "u_tobias", authorAgentId: null,
      body: "Approved. Ship.",
      replyToCommentId: "c9",
      createdAt: m(320), updatedAt: m(320) },
  ];

  // ---------- Runs ----------
  const runs = [
    { runId: "run_01", status: "succeeded", agentId: "ag_coo",
      startedAt: m(15).toISOString(), finishedAt: m(62).toISOString(), createdAt: m(15).toISOString(),
      invocationSource: "on_demand",
      triggeredByCommentId: "c3", triggeredByActivityId: null },
    { runId: "run_02", status: "succeeded", agentId: "ag_cto",
      startedAt: m(18).toISOString(), finishedAt: m(115).toISOString(), createdAt: m(18).toISOString(),
      invocationSource: "on_demand",
      triggeredByCommentId: "c4", triggeredByActivityId: null },
    { runId: "run_03", status: "succeeded", agentId: "ag_des",
      startedAt: m(20).toISOString(), finishedAt: m(175).toISOString(), createdAt: m(20).toISOString(),
      invocationSource: "on_demand",
      triggeredByCommentId: "c5", triggeredByActivityId: null },
    { runId: "run_04", status: "running", agentId: "ag_qa",
      startedAt: m(185).toISOString(), finishedAt: null, createdAt: m(185).toISOString(),
      invocationSource: "on_demand",
      triggeredByCommentId: "c8", triggeredByActivityId: null },
    { runId: "run_05", status: "queued",  agentId: "ag_eng",
      startedAt: null, finishedAt: null, createdAt: m(340).toISOString(),
      invocationSource: "assignment",
      triggeredByCommentId: "c10", triggeredByActivityId: null },
    { runId: "run_06", status: "succeeded", agentId: "ag_des",
      startedAt: m(270).toISOString(), finishedAt: m(310).toISOString(), createdAt: m(270).toISOString(),
      invocationSource: "on_demand",
      triggeredByCommentId: "c6", triggeredByActivityId: null },
  ];

  // ---------- Activity ----------
  const activity = [
    { id: "act_01", companyId: "co_01", actorType: "agent", actorId: "ag_ceo",
      action: "issue.status_changed", entityType: "issue", entityId: "iss_01",
      agentId: "ag_ceo", runId: null,
      triggeredByCommentId: "c2",
      details: { from: "todo", to: "in_progress" },
      createdAt: m(8) },
    { id: "act_02", companyId: "co_01", actorType: "agent", actorId: "ag_coo",
      action: "subissue.created", entityType: "issue", entityId: "iss_02",
      agentId: "ag_coo", runId: "run_01",
      triggeredByCommentId: "c3",
      details: { title: "Export presets" },
      createdAt: m(11) },
    { id: "act_03", companyId: "co_01", actorType: "agent", actorId: "ag_cto",
      action: "subissue.created", entityType: "issue", entityId: "iss_03",
      agentId: "ag_cto", runId: "run_02",
      triggeredByCommentId: "c4",
      details: { title: "Auto-update + crash reporting" },
      createdAt: m(14) },
    { id: "act_04", companyId: "co_01", actorType: "agent", actorId: "ag_des",
      action: "subissue.created", entityType: "issue", entityId: "iss_04",
      agentId: "ag_des", runId: "run_03",
      triggeredByCommentId: "c5",
      details: { title: "Marketing page" },
      createdAt: m(22) },
    { id: "act_05", companyId: "co_01", actorType: "agent", actorId: "ag_coo",
      action: "run.succeeded", entityType: "run", entityId: "run_01",
      agentId: "ag_coo", runId: "run_01",
      details: {}, createdAt: m(62) },
    { id: "act_06", companyId: "co_01", actorType: "agent", actorId: "ag_cto",
      action: "run.succeeded", entityType: "run", entityId: "run_02",
      agentId: "ag_cto", runId: "run_02",
      details: {}, createdAt: m(115) },
    { id: "act_07", companyId: "co_01", actorType: "agent", actorId: "ag_qa",
      action: "subissue.created", entityType: "issue", entityId: "iss_05",
      agentId: "ag_qa", runId: null,
      triggeredByCommentId: "c8",
      details: { title: "Windows Defender flag" },
      createdAt: m(182) },
    { id: "act_08", companyId: "co_01", actorType: "agent", actorId: "ag_des",
      action: "run.succeeded", entityType: "run", entityId: "run_03",
      agentId: "ag_des", runId: "run_03",
      details: {}, createdAt: m(175) },
    { id: "act_09", companyId: "co_01", actorType: "agent", actorId: "ag_des",
      action: "run.succeeded", entityType: "run", entityId: "run_06",
      agentId: "ag_des", runId: "run_06",
      details: {}, createdAt: m(310) },
    { id: "act_10", companyId: "co_01", actorType: "user", actorId: "u_tobias",
      action: "issue.approved", entityType: "issue", entityId: "iss_01",
      agentId: null, runId: null,
      triggeredByCommentId: "c10",
      details: {}, createdAt: m(322) },
  ];

  // ---------- Sub-issues ----------
  const childIssues = [
    { id: "iss_02", companyId: "co_01", projectId: "prj_game", parentId: "iss_01",
      title: "Export presets (Web / macOS / Win)", description: null,
      status: "done", priority: "high",
      assigneeAgentId: "ag_coo", assigneeUserId: null,
      identifier: "AIL-235", kind: "issue",
      createdFromCommentId: "c3", createdFromRunId: "run_01",
      createdAt: m(11), updatedAt: m(62) },
    { id: "iss_03", companyId: "co_01", projectId: "prj_game", parentId: "iss_01",
      title: "Auto-update + crash reporting", description: null,
      status: "done", priority: "high",
      assigneeAgentId: "ag_cto", assigneeUserId: null,
      identifier: "AIL-236", kind: "issue",
      createdFromCommentId: "c4", createdFromRunId: "run_02",
      createdAt: m(14), updatedAt: m(115) },
    { id: "iss_04", companyId: "co_01", projectId: "prj_game", parentId: "iss_01",
      title: "Marketing page", description: null,
      status: "done", priority: "medium",
      assigneeAgentId: "ag_des", assigneeUserId: null,
      identifier: "AIL-237", kind: "issue",
      createdFromCommentId: "c5", createdFromRunId: "run_03",
      createdAt: m(22), updatedAt: m(310) },
    { id: "iss_05", companyId: "co_01", projectId: "prj_game", parentId: "iss_01",
      title: "Windows Defender false-flag", description: null,
      status: "in_progress", priority: "high",
      assigneeAgentId: "ag_qa", assigneeUserId: null,
      identifier: "AIL-238", kind: "issue",
      createdFromCommentId: "c8", createdFromRunId: null,
      createdAt: m(182), updatedAt: m(185) },
  ];

  // ---------- Normalize → Thought[] ----------
  const agentMap = new Map(agents.map(a => [a.id, a]));
  const userMap  = new Map(users.map(u => [u.id, u]));

  function authorInfo(authorAgentId, authorUserId, actorType, actorId) {
    if (authorAgentId) {
      const a = agentMap.get(authorAgentId);
      return { authorId: authorAgentId, authorName: a?.name || "Agent", isAgent: true, hue: a?.hue || 200 };
    }
    if (authorUserId) {
      const u = userMap.get(authorUserId);
      return { authorId: authorUserId, authorName: u?.name || "User", isAgent: false, hue: u?.hue || 20 };
    }
    if (actorType === "agent") {
      const a = agentMap.get(actorId);
      return { authorId: actorId, authorName: a?.name || "Agent", isAgent: true, hue: a?.hue || 200 };
    }
    if (actorType === "user") {
      const u = userMap.get(actorId);
      return { authorId: actorId, authorName: u?.name || "User", isAgent: false, hue: u?.hue || 20 };
    }
    return { authorId: "system", authorName: "System", isAgent: false, hue: 0 };
  }

  const thoughts = [];
  thoughts.push({
    id: `issue:${issue.id}`, kind: "issue",
    label: `${issue.identifier} · ${issue.title}`,
    body: issue.description,
    author: "system", authorName: "Root",
    hue: 42,
    ts: issue.createdAt.getTime(),
    isLive: false,
    ref: issue,
  });
  for (const c of comments) {
    const info = authorInfo(c.authorAgentId, c.authorUserId);
    thoughts.push({
      id: `comment:${c.id}`, kind: "comment",
      label: c.body.length > 90 ? c.body.slice(0, 88) + "…" : c.body,
      body: c.body,
      author: info.authorId, authorName: info.authorName,
      hue: info.hue, isAgent: info.isAgent,
      ts: c.createdAt.getTime(),
      isLive: false,
      payload: { id: c.id, replyToCommentId: c.replyToCommentId || null },
      ref: c,
    });
  }
  for (const r of runs) {
    const a = agentMap.get(r.agentId);
    thoughts.push({
      id: `run:${r.runId}`, kind: "run",
      label: `${a?.name || "Agent"} · run ${r.runId.slice(-3)}`,
      body: `Run ${r.runId} · status: ${r.status} · source: ${r.invocationSource}`,
      author: r.agentId, authorName: a?.name || "Agent",
      hue: a?.hue || 200, isAgent: true,
      ts: new Date(r.startedAt || r.createdAt).getTime(),
      isLive: r.status === "running" || r.status === "queued",
      status: r.status,
      payload: { triggeredByCommentId: r.triggeredByCommentId || null, triggeredByActivityId: r.triggeredByActivityId || null },
      ref: r,
    });
  }
  for (const s of childIssues) {
    const a = agentMap.get(s.assigneeAgentId);
    thoughts.push({
      id: `subissue:${s.id}`, kind: "subissue",
      label: `${s.identifier} · ${s.title}`,
      body: `${s.title} — ${s.status} · priority ${s.priority}`,
      author: s.assigneeAgentId || "system",
      authorName: a?.name || "Unassigned",
      hue: a?.hue || 42, isAgent: true,
      ts: s.createdAt.getTime(),
      isLive: s.status === "in_progress",
      status: s.status,
      payload: { createdFromCommentId: s.createdFromCommentId || null, createdFromRunId: s.createdFromRunId || null },
      ref: s,
    });
  }
  for (const a of activity) {
    const info = authorInfo(null, null, a.actorType, a.actorId);
    thoughts.push({
      id: `activity:${a.id}`, kind: "activity",
      label: a.action.replaceAll(".", " → "),
      body: `${info.authorName} · ${a.action} · ${a.entityType}:${a.entityId}`,
      author: info.authorId, authorName: info.authorName,
      hue: info.hue, isAgent: info.isAgent,
      ts: a.createdAt.getTime(),
      isLive: false,
      payload: { runId: a.runId || null, triggeredByCommentId: a.triggeredByCommentId || null },
      ref: a,
    });
  }

  thoughts.sort((a, b) => a.ts - b.ts);

  // ---------- Derive semantic kind (delegation / decision / block / retry / complete / thinking) ----------
  // The surface kind is issue/comment/run/subissue/activity — useful for filters.
  // The semantic kind describes what an agent is DOING in causal terms, and
  // drives the 3D visualization (wave shape, color, camera, chain-glow).
  const DELEGATION_WORDS = /\b(delegat|assign|take (point|the lead)|hand(ing)? off|pass(ing)? to|over to you|please (own|handle|pick up)|can you (own|take|handle)|you own this|own the|spawning|spinning up|i'?ll delegate)\b/i;
  const DECISION_WORDS = /\b(decision|approved|let'?s go with|we'?ll go with|final (call|answer)|chose|chosen|picking|i'?ll pick|selected|go with|ship it)\b/i;
  const BLOCK_WORDS = /\b(block(ed|ing)?|stuck|fail(ed|ure)|error|can'?t|cannot|stall|flag(ged)?|defender|rejected|denied|timeout)\b/i;
  const RETRY_WORDS = /\b(retry|re-?run|re-?try|another (pass|attempt)|trying again|let me try|take two|v2)\b/i;
  const COMPLETE_WORDS = /\b(done|complete[d]?|ship(p|)ed|shipped|resolve[d]?|merged|finish(ed)?|landed|delivered|deployed|live now|out the door)\b/i;

  for (const t of thoughts) {
    const body = (t.body || "") + " " + (t.label || "");
    let sem = "thinking"; // default

    if (t.kind === "issue") sem = "root";
    else if (t.kind === "activity") {
      const a = t.ref?.action || "";
      if (a.includes("approved") || a.includes("resolved") || a.includes("merged")) sem = "complete";
      else if (a.includes("assigned") || a.includes("delegated")) sem = "delegation";
      else if (a.includes("failed") || a.includes("blocked") || a.includes("rejected")) sem = "block";
      else if (a.includes("retry") || a.includes("rerun")) sem = "retry";
      else sem = "thinking";
    }
    else if (t.kind === "run") {
      if (t.status === "failed") sem = "block";
      else if (t.status === "succeeded") sem = "complete";
      else sem = "thinking"; // running / queued — working
    }
    else if (t.kind === "subissue") sem = "delegation"; // creating a sub-issue IS delegating
    else if (t.kind === "comment") {
      if (DECISION_WORDS.test(body))       sem = "decision";
      else if (BLOCK_WORDS.test(body))     sem = "block";
      else if (RETRY_WORDS.test(body))     sem = "retry";
      else if (DELEGATION_WORDS.test(body))sem = "delegation";
      else if (COMPLETE_WORDS.test(body))  sem = "complete";
      else                                  sem = "thinking";
    }
    t.semantic = sem;
  }

  // ---------- Build CausalGraph ----------
  const byId = new Map(thoughts.map(t => [t.id, t]));
  const parents = new Map(thoughts.map(t => [t.id, []]));

  const addParent = (childId, parentId) => {
    if (!byId.has(childId) || !byId.has(parentId) || childId === parentId) return;
    const arr = parents.get(childId);
    if (!arr.includes(parentId)) arr.push(parentId);
  };

  const ROOT = `issue:${issue.id}`;

  // Pass 1 — explicit edges.
  for (const t of thoughts) {
    if (t.kind === "comment") {
      if (t.payload.replyToCommentId) addParent(t.id, `comment:${t.payload.replyToCommentId}`);
    } else if (t.kind === "run") {
      if (t.payload.triggeredByCommentId) addParent(t.id, `comment:${t.payload.triggeredByCommentId}`);
      if (t.payload.triggeredByActivityId) addParent(t.id, `activity:${t.payload.triggeredByActivityId}`);
    } else if (t.kind === "subissue") {
      if (t.payload.createdFromCommentId) addParent(t.id, `comment:${t.payload.createdFromCommentId}`);
      if (t.payload.createdFromRunId)     addParent(t.id, `run:${t.payload.createdFromRunId}`);
    } else if (t.kind === "activity") {
      if (t.payload.runId)                addParent(t.id, `run:${t.payload.runId}`);
      if (t.payload.triggeredByCommentId) addParent(t.id, `comment:${t.payload.triggeredByCommentId}`);
    }
  }

  // Pass 2 — fallback attachment for floating nodes. Time-proximity (30 min).
  const THIRTY = 30 * 60_000;
  for (const t of thoughts) {
    if (t.id === ROOT) continue;
    if ((parents.get(t.id) || []).length) continue;
    // Look back 30 min for any non-activity thought authored by same agent, else root.
    let best = null, bestDT = THIRTY + 1;
    for (const other of thoughts) {
      if (other.id === t.id || other.ts >= t.ts) continue;
      const dt = t.ts - other.ts;
      if (dt > THIRTY) continue;
      if (other.author === t.author || other.kind === "comment" || other.kind === "issue") {
        if (dt < bestDT) { best = other; bestDT = dt; }
      }
    }
    addParent(t.id, best ? best.id : ROOT);
  }

  // children + depth
  const children = new Map(thoughts.map(t => [t.id, []]));
  for (const t of thoughts) for (const p of parents.get(t.id) || []) children.get(p).push(t.id);

  const depth = new Map();
  const queue = [ROOT];
  depth.set(ROOT, 0);
  while (queue.length) {
    const id = queue.shift();
    const d = depth.get(id);
    for (const ch of children.get(id) || []) {
      if (!depth.has(ch) || depth.get(ch) > d + 1) {
        depth.set(ch, d + 1);
        queue.push(ch);
      }
    }
  }
  for (const t of thoughts) if (!depth.has(t.id)) depth.set(t.id, 1);

  // Critical path: root → latest "done" descendant reached through subissues/runs.
  // We pick the latest terminal thought (activity.issue.approved) if exists.
  const approved = thoughts.find(t => t.kind === "activity" && t.ref?.action === "issue.approved");
  const critical = new Set();
  if (approved) {
    let cur = approved.id;
    critical.add(cur);
    while (cur !== ROOT) {
      const ps = parents.get(cur) || [];
      if (!ps.length) break;
      // choose earliest parent (closer to root) for most direct line
      ps.sort((a, b) => (byId.get(a)?.ts || 0) - (byId.get(b)?.ts || 0));
      cur = ps[0];
      critical.add(cur);
    }
  }

  return {
    caseId: issue.identifier,
    title: issue.title,
    subtitle: issue.description,
    rootId: ROOT,
    thoughts, parents, children, depth, critical,
    agents, users, agentMap, userMap,
    rawIssue: issue, comments, activity, runs, childIssues,
    // Palette (Boared scene).
    palette: { BG: "#1A1815", WARM: "#F2E6C4", WARM_DIM: "#7A6F50", ACID: "#FF6B4A" },
  };
})();
