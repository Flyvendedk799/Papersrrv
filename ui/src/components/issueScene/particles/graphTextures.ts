/**
 * IssueGraph → GPU DataTextures.
 *
 * Rebuilt only when graph topology changes (cheap — not per-frame). Feeds
 * the particle sim shaders via uniforms: Role A particles use `nodeTex`
 * to find their home position; Role B particles use `edgeTex` to follow
 * bezier curves; Role A's group-cohesion term uses `groupTex`.
 *
 * See plan: /Users/tobiasmastek/.claude/plans/gleaming-cooking-blanket.md §3
 */
import * as THREE from "three";

import type {
  AncestorNode,
  ApprovalNode,
  CommentNode,
  DescendantNode,
  EventNode,
  IssueGraph,
  RunNode,
  SynapseEdge,
  Vec3,
} from "../data/types";

/** Domain kind tag stored inside nodeTex.w packed with groupId. */
export enum NodeKind {
  Root = 0,
  Ancestor = 1,
  Descendant = 2,
  Run = 3,
  Comment = 4,
  Event = 5,
  Approval = 6,
}

/**
 * Flattened node index used as the particle's `homeNodeId`. Maps 1:1 into
 * the nodeTex rows in render order: root, ancestors…, descendants…, runs…,
 * comments…, events…, approvals…
 */
export interface IndexedNode {
  /** Row index in nodeTex (0-based). */
  index: number;
  kind: NodeKind;
  /** Stable domain id for picking / SceneTarget lookup. */
  domainId: string;
  /** World position. */
  pos: Vec3;
  /** Tint color (hex string). */
  color: string;
  /** Group id — same for all nodes sharing an agent / status cluster. */
  groupId: number;
  /** Mass weight — more-important nodes hold more particles (0..1). */
  weight: number;
}

export interface GraphTextureBundle {
  /** Nx1 RGBA32F — (x, y, z, packedKindAndGroup) per node. */
  nodeTex: THREE.DataTexture;
  /** Nx1 RGBA32F — (r, g, b, 1) per node. */
  nodeColorTex: THREE.DataTexture;
  /** Ex3 RGBA32F — bezier (from|ctrl|to) per edge, plus src/dst/strength. */
  edgeTex: THREE.DataTexture;
  /** Gx1 RGBA32F — per-group (centroid.x, centroid.y, centroid.z, memberCount)
   *  for agent/status cohesion forces. */
  groupTex: THREE.DataTexture;
  /** The indexed flattened node list (CPU-side mirror for picking + labels). */
  nodes: IndexedNode[];
  /** CPU-side mirror of edge source/target domain ids + livePulse flag.
   *  Used by ParticleField to bias wave particles toward recently-active
   *  edges when useSceneEvents reports new events. */
  edges: Array<{
    sourceDomainId: string;
    targetDomainId: string;
    livePulse: boolean;
    strength: number;
  }>;
  /** Count of live edges in edgeTex (rows 0..edgeCount-1 are meaningful). */
  edgeCount: number;
  /** Total node count. */
  nodeCount: number;
}

/** Default fill color for nodes without explicit color. */
const DEFAULT_COLOR = "#f6e4c5";

/** Max nodes supported — graph is capped at ~150 so 256 is comfortable. */
const MAX_NODES = 256;
/** Max edges supported — capped graph has <200 edges. */
const MAX_EDGES = 512;
/** Max groups — agent groups (up to 8) + status groups (up to ~6) + root. */
const MAX_GROUPS = 64;

/**
 * Build the three GPU textures from the current graph.
 *
 * Caller is responsible for disposing the returned textures when graph
 * changes — pass the previous bundle through `disposeBundle()` before
 * replacing.
 */
export function buildGraphTextures(graph: IssueGraph): GraphTextureBundle {
  const nodes = flattenGraph(graph);
  const nodeCount = Math.min(nodes.length, MAX_NODES);

  // nodeTex — position + packed kind/group
  const nodeData = new Float32Array(MAX_NODES * 4);
  const colorData = new Float32Array(MAX_NODES * 4);
  const tmpColor = new THREE.Color();
  for (let i = 0; i < nodeCount; i += 1) {
    const n = nodes[i];
    const o = i * 4;
    nodeData[o] = n.pos[0];
    nodeData[o + 1] = n.pos[1];
    nodeData[o + 2] = n.pos[2];
    // Pack kind and groupId: kind * 256 + groupId (groupId must be < 256).
    nodeData[o + 3] = n.kind * 256 + Math.min(255, Math.max(0, n.groupId));

    tmpColor.set(n.color || DEFAULT_COLOR);
    colorData[o] = tmpColor.r;
    colorData[o + 1] = tmpColor.g;
    colorData[o + 2] = tmpColor.b;
    colorData[o + 3] = n.weight; // alpha carries weight for now
  }
  const nodeTex = newDataTex(nodeData, MAX_NODES, 1);
  const nodeColorTex = newDataTex(colorData, MAX_NODES, 1);

  // edgeTex — 3 rows of endpoints + metadata
  const edges = graph.edges ?? [];
  const edgeCount = Math.min(edges.length, MAX_EDGES);
  const edgeData = new Float32Array(MAX_EDGES * 3 * 4);
  const idByDomainId = new Map(nodes.map((n, i) => [n.domainId, i] as const));
  // Row layout:
  //   rowY=0: (from.x, from.y, from.z, srcIdx)
  //   rowY=1: (ctrl.x, ctrl.y, ctrl.z, strength)
  //   rowY=2: (to.x, to.y, to.z, dstIdx)
  for (let e = 0; e < edgeCount; e += 1) {
    const edge = edges[e];
    const srcIdx = idByDomainId.get(edge.sourceId) ?? 0;
    const dstIdx = idByDomainId.get(edge.targetId) ?? 0;
    const ctrl = midpointWithSag(edge.from, edge.to, 0.18);
    // row 0 — from + srcIdx
    writeTexel(edgeData, e, MAX_EDGES, 0, edge.from[0], edge.from[1], edge.from[2], srcIdx);
    // row 1 — ctrl + strength
    writeTexel(edgeData, e, MAX_EDGES, 1, ctrl[0], ctrl[1], ctrl[2], edge.strength);
    // row 2 — to + dstIdx (+livePulse packed in sign)
    const dstCode = dstIdx + (edge.livePulse ? 0.5 : 0);
    writeTexel(edgeData, e, MAX_EDGES, 2, edge.to[0], edge.to[1], edge.to[2], dstCode);
  }
  const edgeTex = newDataTex(edgeData, MAX_EDGES, 3);

  const edgeMirror = edges.slice(0, edgeCount).map((e) => ({
    sourceDomainId: e.sourceId,
    targetDomainId: e.targetId,
    livePulse: !!e.livePulse,
    strength: e.strength,
  }));

  // groupTex — per-group (centroid, memberCount). Centroid is the weighted
  // average of member node positions; gives the "clustering by agent/status"
  // pull force for Role A particles.
  const groupData = new Float32Array(MAX_GROUPS * 4);
  const centroids = new Map<number, { x: number; y: number; z: number; w: number }>();
  for (const n of nodes) {
    const g = centroids.get(n.groupId) ?? { x: 0, y: 0, z: 0, w: 0 };
    g.x += n.pos[0] * n.weight;
    g.y += n.pos[1] * n.weight;
    g.z += n.pos[2] * n.weight;
    g.w += n.weight;
    centroids.set(n.groupId, g);
  }
  for (const [groupId, g] of centroids) {
    if (groupId >= MAX_GROUPS) continue;
    const o = groupId * 4;
    const inv = g.w > 0 ? 1 / g.w : 0;
    groupData[o] = g.x * inv;
    groupData[o + 1] = g.y * inv;
    groupData[o + 2] = g.z * inv;
    groupData[o + 3] = g.w; // total weight → proxy for member count
  }
  const groupTex = newDataTex(groupData, MAX_GROUPS, 1);

  return {
    nodeTex,
    nodeColorTex,
    edgeTex,
    groupTex,
    nodes,
    edges: edgeMirror,
    edgeCount,
    nodeCount,
  };
}

export function disposeBundle(bundle: GraphTextureBundle | null): void {
  if (!bundle) return;
  bundle.nodeTex.dispose();
  bundle.nodeColorTex.dispose();
  bundle.edgeTex.dispose();
  bundle.groupTex.dispose();
}

// ---------------------------------------------------------------------------
// Flattening
// ---------------------------------------------------------------------------

function flattenGraph(graph: IssueGraph): IndexedNode[] {
  const out: IndexedNode[] = [];
  let index = 0;

  // Group assignment: agents become groups for runs + comments; status
  // becomes the group for ancestors + descendants; approvals + events go
  // to group 0 ("misc"). Root is group 0.
  const agentGroupId = new Map<string, number>();
  const statusGroupId = new Map<string, number>();
  let nextAgentGroup = 1;
  let nextStatusGroup = 128; // separate range from agent groups
  const getAgentGroup = (agentId: string) => {
    let g = agentGroupId.get(agentId);
    if (g == null) {
      g = nextAgentGroup++;
      agentGroupId.set(agentId, g);
    }
    return g;
  };
  const getStatusGroup = (status: string) => {
    let g = statusGroupId.get(status);
    if (g == null) {
      g = nextStatusGroup++;
      statusGroupId.set(status, g);
    }
    return g;
  };

  // Root — always index 0
  out.push({
    index: index++,
    kind: NodeKind.Root,
    domainId: graph.root.id,
    pos: [0, 0, 0],
    color: DEFAULT_COLOR,
    groupId: 0,
    weight: 1.0,
  });

  for (const a of graph.ancestors as AncestorNode[]) {
    out.push({
      index: index++,
      kind: NodeKind.Ancestor,
      domainId: a.id,
      pos: a.spherePos ?? [0, 0, 0],
      color: DEFAULT_COLOR,
      groupId: getStatusGroup(a.status),
      weight: 0.4,
    });
  }
  for (const d of graph.descendants as DescendantNode[]) {
    out.push({
      index: index++,
      kind: NodeKind.Descendant,
      domainId: d.id,
      pos: d.spherePos ?? [0, 0, 0],
      color: DEFAULT_COLOR,
      groupId: getStatusGroup(d.status),
      weight: 0.4,
    });
  }
  for (const r of graph.runs as RunNode[]) {
    out.push({
      index: index++,
      kind: NodeKind.Run,
      domainId: r.runId,
      pos: r.spherePos ?? [0, 0, 0],
      color: r.color,
      groupId: getAgentGroup(r.agentId),
      weight: r.isLive ? 0.7 : 0.35 + r.sizeRatio * 0.3,
    });
  }
  for (const c of graph.comments as CommentNode[]) {
    out.push({
      index: index++,
      kind: NodeKind.Comment,
      domainId: c.id,
      pos: c.spherePos ?? [0, 0, 0],
      color: c.color,
      groupId: getAgentGroup(c.author),
      weight: 0.3,
    });
  }
  for (const e of graph.events as EventNode[]) {
    out.push({
      index: index++,
      kind: NodeKind.Event,
      domainId: e.id,
      pos: e.spherePos ?? [0, 0, 0],
      color: e.color,
      groupId: 0,
      weight: 0.15,
    });
  }
  for (const a of graph.approvals as ApprovalNode[]) {
    out.push({
      index: index++,
      kind: NodeKind.Approval,
      domainId: a.id,
      pos: a.spherePos ?? [0, 0, 0],
      color: DEFAULT_COLOR,
      groupId: 0,
      weight: 0.5,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Particle → node assignment
// ---------------------------------------------------------------------------

/**
 * Produce a particle index → node index mapping such that each node gets
 * a share of particles proportional to its weight. Returns an array of
 * length `fieldCount` where each slot holds a node index in [0, nodeCount).
 *
 * Falls back gracefully when nodeCount is 0 (assigns all to node 0, but
 * since there's no node, particles will orbit origin — the M0 behavior).
 */
export function assignHomeNodeIds(
  fieldCount: number,
  nodes: IndexedNode[],
): Uint16Array {
  const ids = new Uint16Array(fieldCount);
  if (nodes.length === 0) return ids;
  const totalWeight = nodes.reduce((s, n) => s + n.weight, 0) || 1;
  // Precompute cumulative slot counts per node.
  let consumed = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    const share = Math.round((nodes[i].weight / totalWeight) * fieldCount);
    const end = Math.min(fieldCount, consumed + share);
    for (let k = consumed; k < end; k += 1) ids[k] = i;
    consumed = end;
    if (consumed >= fieldCount) break;
  }
  // Fill any remainder by round-robin.
  let rr = 0;
  while (consumed < fieldCount) {
    ids[consumed++] = rr++ % nodes.length;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newDataTex(data: Float32Array, width: number, height: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    data,
    width,
    height,
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

function writeTexel(
  data: Float32Array,
  x: number,
  width: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const i = (y * width + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function midpointWithSag(a: Vec3, b: Vec3, sag: number): Vec3 {
  const mx = (a[0] + b[0]) * 0.5;
  const my = (a[1] + b[1]) * 0.5;
  const mz = (a[2] + b[2]) * 0.5;
  // Sag toward origin — produces a gentle bow so edges read as axons, not
  // straight lines. Matches existing Synapses.tsx bezier feel.
  return [mx * (1 - sag), my * (1 - sag), mz * (1 - sag)];
}

/**
 * Returns the world position of a node by its flat index. Cheap — doesn't
 * hit the GPU. Used by NodeHitboxes.tsx for picking.
 */
export function nodePos(nodes: IndexedNode[], index: number): Vec3 {
  if (index < 0 || index >= nodes.length) return [0, 0, 0];
  return nodes[index].pos;
}

/** Avoids unused-import lint while keeping the ref around for debugging. */
export type _SynapseEdgeRef = SynapseEdge;
