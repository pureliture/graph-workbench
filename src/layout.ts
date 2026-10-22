import type { GraphInput, GraphLink, GraphNode } from "./contract.js";
import type { GraphPresentation } from "./presentation.js";

export interface GraphViewport {
  readonly height: number;
  readonly width: number;
}

export interface GraphNodeVisualCue {
  readonly contrast: number;
  readonly labelCue: "muted" | "primary" | "visible";
  readonly opacity: number;
  readonly opacityFloor: number;
}

export interface GraphLinkVisualCue {
  readonly opacity: number;
  readonly visible: boolean;
  readonly width: number;
}

export interface GraphTargetNodePosition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface GraphSelectionState {
  readonly neighborNodeIds: readonly string[];
  readonly nodeId: string | null;
  readonly settled: true;
  readonly targetNodePositions: readonly GraphTargetNodePosition[];
  readonly viewport: GraphViewport;
}

export interface GraphLayoutOptions {
  readonly viewport?: GraphViewport;
}

/**
 * Describes the active search reading mode so the renderer can frame the
 * matched cluster and keep the rest of the graph as quiet context.
 */
export interface GraphSearchLayoutState {
  /** True when a search is running, even when it matched nothing. */
  readonly active: boolean;
  /** Radius of the matched cluster in world units. */
  readonly fitRadius: number;
  /** Matched node ids ordered by descending relevance. */
  readonly matchedNodeIds: readonly string[];
}

export interface RenderNode extends GraphNode {
  readonly fx?: number;
  readonly fy?: number;
  readonly fz?: number;
  readonly visual: GraphNodeVisualCue;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface RenderLink extends Omit<GraphLink, "source" | "target"> {
  readonly source: string;
  readonly target: string;
  readonly visual: GraphLinkVisualCue;
}

export interface RenderGraphData {
  readonly links: readonly RenderLink[];
  readonly nodes: readonly RenderNode[];
  readonly presentation: GraphPresentation;
  readonly search: GraphSearchLayoutState;
  readonly selection: GraphSelectionState;
}

const DEFAULT_VIEWPORT: GraphViewport = Object.freeze({ width: 960, height: 640 });
const MASTER_READABILITY_FLOOR = Object.freeze({ contrast: 0.72, opacity: 0.62 });

function hash(value: string): number {
  let state = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    state ^= value.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
}

function unit(value: string): number {
  return hash(value) / 0xffffffff;
}

function normalizeViewport(viewport: GraphViewport | undefined): GraphViewport {
  const width = viewport?.width;
  const height = viewport?.height;
  return {
    width: Number.isFinite(width) ? Math.max(1, Math.floor(width!)) : DEFAULT_VIEWPORT.width,
    height: Number.isFinite(height) ? Math.max(1, Math.floor(height!)) : DEFAULT_VIEWPORT.height,
  };
}

interface Coordinates {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

type RelationshipDirection = "bidirectional" | "incoming" | "outgoing";

interface NeighborRelationship {
  readonly direction: RelationshipDirection;
  readonly nodeId: string;
}

function organicPosition(node: GraphNode, seed: string, index: number, total: number): Coordinates {
  const hint = node.layoutHint;
  if ([hint?.x, hint?.y, hint?.z].every((axis) => Number.isFinite(axis))) {
    return { x: hint!.x!, y: hint!.y!, z: hint!.z! };
  }

  // A uniform sphere makes a small graph read as a diagram projected onto a
  // balloon. The workbench instead starts as a few vertically biased pockets:
  // nodes in the same semantic lane have related anchors, while a stable
  // per-node cluster bucket and offset keep the composition organic and
  // legible in perspective without collapsing a large kind into one pocket.
  const clusterCount = Math.max(2, Math.min(12, Math.ceil(Math.sqrt(Math.max(1, total)) / 1.1)));
  const clusterIndex = hash(`${seed}:${node.kind ?? node.type}:${node.id}:cluster`) % clusterCount;
  const clusterAngle = ((clusterIndex / clusterCount) * Math.PI * 2)
    + ((unit(`${seed}:${node.id}:cluster-angle`) - 0.5) * 0.54);
  const clusterRadius = 52 + (unit(`${seed}:${node.id}:cluster-radius`) * 34);
  const pocketX = Math.cos(clusterAngle) * clusterRadius;
  const pocketY = Math.sin(clusterAngle) * clusterRadius * 0.72;
  const verticalBand = (((index / Math.max(1, total - 1)) - 0.5) * 144)
    + ((unit(`${seed}:${node.id}:vertical`) - 0.5) * 28);
  const localRadius = 12 + (unit(`${seed}:${node.id}:local-radius`) * 32);
  const localAngle = unit(`${seed}:${node.id}:local-angle`) * Math.PI * 2;
  return {
    x: pocketX + (Math.cos(localAngle) * localRadius),
    y: pocketY + verticalBand + (Math.sin(localAngle) * localRadius * 0.42),
    // Keep enough Z variance for small distant nodes and receding edges, but
    // avoid a symmetric shell that flattens once the camera starts moving.
    z: ((unit(`${seed}:${node.id}:depth`) - 0.5) * 136)
      + (Math.sin(clusterAngle) * 18)
      + ((node.type === "relation" ? 1 : -1) * 8),
  };
}

function primarySelectedNodeId(input: GraphInput, presentation: GraphPresentation): string | null {
  const known = new Set(input.nodes.map((node) => node.id));
  const selected = presentation.selectedNodeIds?.find((nodeId) => known.has(nodeId));
  return selected ?? null;
}

function relationOrder(link: GraphLink): number {
  if (link.ordinal !== undefined) return link.ordinal;
  return link.occurrences?.reduce((minimum, occurrence) => Math.min(minimum, occurrence.ordinal), Number.POSITIVE_INFINITY)
    ?? Number.POSITIVE_INFINITY;
}

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function oneHopNodeIds(input: GraphInput, selectedNodeId: string): string[] {
  const orderByNodeId = new Map<string, number>();
  for (const link of input.links) {
    const neighborId = link.source === selectedNodeId
      ? link.target
      : link.target === selectedNodeId
        ? link.source
        : null;
    if (!neighborId) continue;
    const current = orderByNodeId.get(neighborId) ?? Number.POSITIVE_INFINITY;
    orderByNodeId.set(neighborId, Math.min(current, relationOrder(link)));
  }
  return [...orderByNodeId]
    .sort(([leftId, leftOrder], [rightId, rightOrder]) => leftOrder - rightOrder || compareCodeUnits(leftId, rightId))
    .map(([nodeId]) => nodeId);
}

function neighborRelationships(
  input: GraphInput,
  selectedNodeId: string,
  neighborNodeIds: readonly string[],
): readonly NeighborRelationship[] {
  const directions = new Map<string, { incoming: boolean; outgoing: boolean }>();
  for (const neighborNodeId of neighborNodeIds) {
    directions.set(neighborNodeId, { incoming: false, outgoing: false });
  }
  for (const link of input.links) {
    const neighborId = link.source === selectedNodeId
      ? link.target
      : link.target === selectedNodeId
        ? link.source
        : null;
    if (!neighborId) continue;
    const direction = directions.get(neighborId);
    if (!direction) continue;
    if (link.source === selectedNodeId) direction.outgoing = true;
    else direction.incoming = true;
  }
  return neighborNodeIds.map((nodeId) => {
    const direction = directions.get(nodeId)!;
    return {
      nodeId,
      direction: direction.incoming && direction.outgoing
        ? "bidirectional"
        : direction.incoming
          ? "incoming"
          : "outgoing",
    };
  });
}

function centeredOffset(index: number, total: number): number {
  return index - ((total - 1) / 2);
}

function directionalConstellationPosition(
  node: GraphNode,
  relationship: NeighborRelationship,
  laneIndex: number,
  laneSize: number,
  anchor: Coordinates,
  radius: number,
  seed: string,
  selectedNodeId: string,
): Coordinates {
  // A selected graph is a relationship diagram before it is a cloud. The
  // directional lanes are deliberately biased into opposing arcs instead of
  // lying on the horizontal axis: even a small one-in/two-out selection reads
  // as a constellation, while the left/right semantic remains unambiguous.
  const laneAngle = relationship.direction === "incoming"
    ? Math.PI + 0.62
    : relationship.direction === "outgoing"
      ? 0.62
      : -(Math.PI / 2);
  const arcStep = laneSize <= 1 ? 0 : Math.min(0.58, 1.44 / Math.max(1, laneSize - 1));
  const offset = centeredOffset(laneIndex, laneSize);
  const angle = laneAngle + (offset * arcStep);
  const radial = radius + 7 + (Math.abs(offset) * 5) + (unit(`${seed}:${selectedNodeId}:${node.id}:radius`) * 3);
  const semanticLift = node.type === "relation"
    ? radius * 0.28
    : node.type === "profile"
      ? radius * 0.14
      : 0;
  const depthTier = node.type === "relation"
    ? 15
    : node.type === "profile"
      ? 9
      : 4;
  return {
    x: anchor.x + (Math.cos(angle) * radial),
    y: anchor.y + (Math.sin(angle) * radial * 0.84) + semanticLift,
    // Fan depth follows the same arc instead of leaving endpoints in a flat
    // plane. Stable per-node variation preserves label separation without
    // weakening the directional shape.
    z: anchor.z + depthTier + (Math.cos(angle) * 10) + (Math.sin(angle) * 12)
      + ((unit(`${seed}:${selectedNodeId}:${node.id}:depth`) - 0.5) * 7),
  };
}

function visualCue(
  node: GraphNode,
  selectedNodeId: string | null,
  neighborNodeIds: ReadonlySet<string>,
  matchedNodeIds: ReadonlySet<string>,
  searchActive: boolean,
): GraphNodeVisualCue {
  const selected = node.id === selectedNodeId;
  const neighboring = neighborNodeIds.has(node.id);
  const matched = matchedNodeIds.has(node.id);
  const initial = selected
    ? { contrast: 1, labelCue: "primary" as const, opacity: 1 }
    : searchActive
      ? matched
        ? { contrast: 0.94, labelCue: "primary" as const, opacity: 0.96 }
        : { contrast: 0.22, labelCue: "muted" as const, opacity: 0.2 }
      : !selectedNodeId
        ? { contrast: 0.72, labelCue: "visible" as const, opacity: 0.76 }
        : neighboring
          ? { contrast: 0.82, labelCue: "visible" as const, opacity: 0.86 }
          : { contrast: 0.3, labelCue: "muted" as const, opacity: 0.3 };
  const isMaster = node.roles?.includes("master") === true;
  return {
    contrast: isMaster ? Math.max(initial.contrast, MASTER_READABILITY_FLOOR.contrast) : initial.contrast,
    labelCue: isMaster && initial.labelCue === "muted" ? "visible" : initial.labelCue,
    opacity: isMaster ? Math.max(initial.opacity, MASTER_READABILITY_FLOOR.opacity) : initial.opacity,
    opacityFloor: isMaster ? MASTER_READABILITY_FLOOR.opacity : 0,
  };
}

function linkVisualCue(
  link: GraphLink,
  selectedNodeId: string | null,
  matchedNodeIds: ReadonlySet<string>,
  searchActive: boolean,
): GraphLinkVisualCue {
  // The idle graph keeps its topology in the data model, but hides the full
  // relationship field so a dense graph reads as a quiet set of nodes. The
  // renderer may temporarily reveal incident edges for hover/focus; a real
  // selection still owns the durable visible-link cue below.
  if (selectedNodeId) {
    const selectedLink = link.source === selectedNodeId || link.target === selectedNodeId;
    return selectedLink
      ? { opacity: 0.62, visible: true, width: 1.25 }
      : { opacity: 0.1, visible: false, width: 0.6 };
  }
  // A search turns the graph into a filtered diagram. Only the edges that
  // connect two matched nodes survive, so the cluster reads as one object
  // instead of a set of unrelated points.
  if (searchActive) {
    const matchedLink = matchedNodeIds.has(link.source) && matchedNodeIds.has(link.target);
    return matchedLink
      ? { opacity: 0.5, visible: true, width: 1.1 }
      : { opacity: 0.05, visible: false, width: 0.6 };
  }
  return { opacity: 0, visible: false, width: 0.8 };
}

function selectedLayoutPositions(
  input: GraphInput,
  basePositions: ReadonlyMap<string, Coordinates>,
  nodesById: ReadonlyMap<string, GraphNode>,
  selectedNodeId: string | null,
  neighborNodeIds: readonly string[],
  viewport: GraphViewport,
): ReadonlyMap<string, Coordinates> {
  const positions = new Map(basePositions);
  if (!selectedNodeId) return positions;

  const selected = nodesById.get(selectedNodeId);
  if (!selected) return positions;
  const selectedBase = basePositions.get(selected.id)!;
  // Keep the canonical scene position as the selection anchor. Selection is a
  // visual reading mode, not a second layout: unrelated nodes must retain their
  // global context while the direct relationship lane is brought forward.
  const anchor = selectedBase;
  const shortestViewportAxis = Math.min(viewport.width, viewport.height);

  const relationships = neighborRelationships(input, selectedNodeId, neighborNodeIds);
  const relationshipsByDirection = new Map<RelationshipDirection, NeighborRelationship[]>();
  for (const relationship of relationships) {
    const lane = relationshipsByDirection.get(relationship.direction) ?? [];
    lane.push(relationship);
    relationshipsByDirection.set(relationship.direction, lane);
  }
  const laneIndexByNodeId = new Map<string, { readonly index: number; readonly size: number }>();
  for (const lane of relationshipsByDirection.values()) {
    lane.forEach((relationship, index) => {
      laneIndexByNodeId.set(relationship.nodeId, { index, size: lane.length });
    });
  }
  const constellationRadius = Math.max(36, Math.min(72, shortestViewportAxis * 0.08));
  for (const relationship of relationships) {
    const neighbor = nodesById.get(relationship.nodeId);
    if (!neighbor || neighbor.layoutHint?.pinned) continue;
    const lanePosition = laneIndexByNodeId.get(relationship.nodeId)!;
    positions.set(neighbor.id, directionalConstellationPosition(
      neighbor,
      relationship,
      lanePosition.index,
      lanePosition.size,
      anchor,
      constellationRadius,
      input.layout.seed,
      selectedNodeId,
    ));
  }
  return positions;
}

/**
 * Search clusters the matched nodes into one tight group so a query reads as a
 * single object in the graph instead of a scattered set of hits.
 *
 * The reference re-packs the matched subset with a physics simulation. The
 * workbench keeps its deterministic layout contract, so the same effect is
 * produced analytically: a Vogel spiral seeds the group, then a fixed number of
 * relaxation passes pull linked matches together, push unrelated matches
 * apart, and hold the group around the scene origin. The same input always
 * produces the same cluster.
 */
const SEARCH_CLUSTER_RADIUS = 54;
const SEARCH_CLUSTER_ITERATIONS = 72;
const SEARCH_CLUSTER_REPEL_STRENGTH = 340;
const SEARCH_CLUSTER_REPEL_CAP = 18;
const SEARCH_CLUSTER_LINK_STRENGTH = 0.09;
const SEARCH_CLUSTER_LINK_REST = 34;
const SEARCH_CLUSTER_CENTER_PULL = 0.05;
const SEARCH_CLUSTER_MIN_SEPARATION = 30;
const SEARCH_CLUSTER_DAMPING = 0.62;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function searchClusterSeed(index: number, total: number): Coordinates {
  if (index <= 0) return { x: 0, y: 0, z: 0 };
  const progress = (index - 1) / Math.max(1, total - 1);
  const radius = SEARCH_CLUSTER_RADIUS * Math.sqrt(progress);
  const angle = (index - 1) * GOLDEN_ANGLE;
  return {
    x: Math.cos(angle) * radius,
    // A shallow vertical fan keeps the group readable in perspective without
    // flattening it into a single disc.
    y: (progress - 0.5) * 46 + (Math.sin(angle * 0.5) * 6),
    z: Math.sin(angle) * radius,
  };
}

function searchClusterPositions(
  input: GraphInput,
  matchedNodeIds: readonly string[],
): { readonly positions: readonly Coordinates[]; readonly fitRadius: number } {
  const count = matchedNodeIds.length;
  if (count === 0) return { positions: [], fitRadius: 0 };

  const positions = matchedNodeIds.map((_, index) => searchClusterSeed(index, count));
  if (count === 1) return { positions, fitRadius: SEARCH_CLUSTER_RADIUS * 0.4 };

  const indexByNodeId = new Map<string, number>();
  matchedNodeIds.forEach((nodeId, index) => indexByNodeId.set(nodeId, index));
  const clusterLinks = input.links.flatMap((link) => {
    const source = indexByNodeId.get(link.source);
    const target = indexByNodeId.get(link.target);
    if (source === undefined || target === undefined) return [];
    return [{ source, target }];
  });

  for (let iteration = 0; iteration < SEARCH_CLUSTER_ITERATIONS; iteration += 1) {
    const forces = positions.map(() => ({ x: 0, y: 0, z: 0 }));

    for (let left = 0; left < count; left += 1) {
      for (let right = left + 1; right < count; right += 1) {
        const deltaX = positions[left].x - positions[right].x;
        const deltaY = positions[left].y - positions[right].y;
        const deltaZ = positions[left].z - positions[right].z;
        const distance = Math.max(1, Math.hypot(deltaX, deltaY, deltaZ));
        const magnitude = Math.min(
          SEARCH_CLUSTER_REPEL_CAP,
          SEARCH_CLUSTER_REPEL_STRENGTH / (distance * distance),
        );
        const scale = magnitude / distance;
        const pushX = deltaX * scale;
        const pushY = deltaY * scale;
        const pushZ = deltaZ * scale;
        forces[left].x += pushX;
        forces[left].y += pushY;
        forces[left].z += pushZ;
        forces[right].x -= pushX;
        forces[right].y -= pushY;
        forces[right].z -= pushZ;
      }
    }

    for (const link of clusterLinks) {
      const deltaX = positions[link.target].x - positions[link.source].x;
      const deltaY = positions[link.target].y - positions[link.source].y;
      const deltaZ = positions[link.target].z - positions[link.source].z;
      const distance = Math.max(0.001, Math.hypot(deltaX, deltaY, deltaZ));
      const stretch = (distance - SEARCH_CLUSTER_LINK_REST) * SEARCH_CLUSTER_LINK_STRENGTH;
      const scale = stretch / distance;
      const pullX = deltaX * scale;
      const pullY = deltaY * scale;
      const pullZ = deltaZ * scale;
      forces[link.source].x += pullX;
      forces[link.source].y += pullY;
      forces[link.source].z += pullZ;
      forces[link.target].x -= pullX;
      forces[link.target].y -= pullY;
      forces[link.target].z -= pullZ;
    }

    for (let index = 0; index < count; index += 1) {
      const position = positions[index];
      const force = forces[index];
      let nextX = position.x + (force.x * SEARCH_CLUSTER_DAMPING) - (position.x * SEARCH_CLUSTER_CENTER_PULL);
      let nextY = position.y + (force.y * SEARCH_CLUSTER_DAMPING) - (position.y * SEARCH_CLUSTER_CENTER_PULL);
      let nextZ = position.z + (force.z * SEARCH_CLUSTER_DAMPING) - (position.z * SEARCH_CLUSTER_CENTER_PULL);

      for (let other = 0; other < count; other += 1) {
        if (other === index) continue;
        const deltaX = nextX - positions[other].x;
        const deltaY = nextY - positions[other].y;
        const deltaZ = nextZ - positions[other].z;
        const distance = Math.hypot(deltaX, deltaY, deltaZ);
        if (distance >= SEARCH_CLUSTER_MIN_SEPARATION || distance === 0) continue;
        const push = (SEARCH_CLUSTER_MIN_SEPARATION - distance) * 0.5;
        nextX += (deltaX / distance) * push;
        nextY += (deltaY / distance) * push;
        nextZ += (deltaZ / distance) * push;
      }

      positions[index] = { x: nextX, y: nextY, z: nextZ };
    }
  }

  let centerX = 0;
  let centerY = 0;
  let centerZ = 0;
  for (const position of positions) {
    centerX += position.x;
    centerY += position.y;
    centerZ += position.z;
  }
  centerX /= count;
  centerY /= count;
  centerZ /= count;

  let fitRadius = 0;
  const centered = positions.map((position) => {
    const centeredPosition = {
      x: position.x - centerX,
      y: position.y - centerY,
      z: position.z - centerZ,
    };
    fitRadius = Math.max(fitRadius, Math.hypot(centeredPosition.x, centeredPosition.y, centeredPosition.z));
    return centeredPosition;
  });

  return { positions: centered, fitRadius: fitRadius + 18 };
}

/**
 * Creates renderer-local, deterministic positions and visual cues without mutating GraphInput.
 * A selection locks only the selected node and its one-hop neighborhood to settled targets
 * unless the host asks to preserve the existing deterministic layout.
 */
export function createRenderGraphData(
  input: GraphInput,
  presentation: GraphPresentation,
  options: GraphLayoutOptions = {},
): RenderGraphData {
  const viewport = normalizeViewport(options.viewport);
  const selectedNodeId = primarySelectedNodeId(input, presentation);
  const neighborNodeIds = selectedNodeId ? oneHopNodeIds(input, selectedNodeId) : [];
  const neighborNodeIdSet = new Set(neighborNodeIds);
  const knownNodeIds = new Set(input.nodes.map((node) => node.id));
  const searchActive = presentation.matchedNodeIds !== undefined && presentation.matchedNodeIds !== null;
  const matchedNodeIds = (presentation.matchedNodeIds ?? []).filter((nodeId) => knownNodeIds.has(nodeId));
  const matchedNodeIdSet = new Set(matchedNodeIds);
  const basePositions = new Map(input.nodes.map((node, index) => [
    node.id,
    organicPosition(node, input.layout.seed, index, input.nodes.length),
  ]));
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
  const preservesSelectionLayout = presentation.selectionLayout === "preserve";
  const positions = preservesSelectionLayout
    ? basePositions
    : selectedLayoutPositions(input, basePositions, nodesById, selectedNodeId, neighborNodeIds, viewport);
  // The search cluster overrides the canonical positions, so it needs a
  // mutable copy of the settled map.
  const mutablePositions = new Map(positions);

  // A live selection already owns the reading layout: its one-hop constellation
  // is the subject. The search cluster would fight that contract, so an active
  // selection keeps its positions and the search only changes the visual tiers.
  let fitRadius = 0;
  if (searchActive && matchedNodeIds.length > 0 && !selectedNodeId) {
    const cluster = searchClusterPositions(input, matchedNodeIds);
    fitRadius = cluster.fitRadius;
    matchedNodeIds.forEach((nodeId, index) => {
      const node = nodesById.get(nodeId);
      if (!node || node.layoutHint?.pinned) return;
      const clusterPosition = cluster.positions[index];
      if (!clusterPosition) return;
      mutablePositions.set(nodeId, clusterPosition);
    });
  }

  const settledNodeIds = new Set(
    !preservesSelectionLayout && selectedNodeId ? [selectedNodeId, ...neighborNodeIds] : [],
  );
  const nodes = input.nodes.map((node) => {
    const position = mutablePositions.get(node.id)!;
    const settled = settledNodeIds.has(node.id);
    const pinned = node.layoutHint?.pinned === true;
    return {
      ...node,
      ...position,
      visual: visualCue(node, selectedNodeId, neighborNodeIdSet, matchedNodeIdSet, searchActive),
      ...((pinned || settled) ? { fx: position.x, fy: position.y, fz: position.z } : {}),
    };
  });
  const links = input.links.map((link) => ({
    ...link,
    visual: linkVisualCue(link, selectedNodeId, matchedNodeIdSet, searchActive),
  }));
  const targetNodePositions = nodes
    .map(({ id, x, y, z }) => ({ id, x, y, z }))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
  return {
    nodes,
    links,
    presentation,
    search: {
      active: searchActive,
      fitRadius,
      matchedNodeIds,
    },
    selection: {
      nodeId: selectedNodeId,
      neighborNodeIds,
      settled: true,
      targetNodePositions,
      viewport,
    },
  };
}
