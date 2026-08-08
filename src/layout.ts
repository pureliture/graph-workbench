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
  // nodes in the same semantic lane have a coherent anchor, while a stable
  // per-node offset keeps the composition organic and legible in perspective.
  const clusterCount = Math.max(2, Math.min(5, Math.ceil(Math.sqrt(Math.max(1, total)) / 1.35)));
  const clusterIndex = hash(`${seed}:${node.kind ?? node.type}:cluster`) % clusterCount;
  const clusterAngle = ((clusterIndex / clusterCount) * Math.PI * 2)
    + ((unit(`${seed}:${node.id}:cluster-angle`) - 0.5) * 0.54);
  const clusterRadius = 52 + (unit(`${seed}:${node.id}:cluster-radius`) * 34);
  const pocketX = Math.cos(clusterAngle) * clusterRadius;
  const pocketY = Math.sin(clusterAngle) * clusterRadius * 0.72;
  const verticalBand = (((index / Math.max(1, total - 1)) - 0.5) * 128)
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

function visualCue(node: GraphNode, selectedNodeId: string | null, neighborNodeIds: ReadonlySet<string>): GraphNodeVisualCue {
  const selected = node.id === selectedNodeId;
  const neighboring = neighborNodeIds.has(node.id);
  const initial = !selectedNodeId
    ? { contrast: 0.72, labelCue: "visible" as const, opacity: 0.76 }
    : selected
      ? { contrast: 1, labelCue: "primary" as const, opacity: 1 }
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

function linkVisualCue(link: GraphLink, selectedNodeId: string | null, neighborNodeIds: ReadonlySet<string>): GraphLinkVisualCue {
  // Edges establish a field, not a wireframe cage. The selected relationship
  // rises just enough to explain the focused node while the rest recedes.
  if (!selectedNodeId) return { opacity: 0.14, width: 0.8 };
  const selectedLink = link.source === selectedNodeId || link.target === selectedNodeId;
  const neighborhoodLink = neighborNodeIds.has(link.source) && neighborNodeIds.has(link.target);
  return selectedLink
    ? { opacity: 0.62, width: 1.25 }
    : neighborhoodLink
      ? { opacity: 0.32, width: 0.95 }
      : { opacity: 0.1, width: 0.6 };
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
  const selectedTarget = { x: 0, y: 6, z: 24 };
  // A drag/pin is an explicit user placement. Use it as the constellation
  // anchor rather than merely leaving the selected node behind while moving
  // every relationship around the default selection origin.
  const anchor = selected.layoutHint?.pinned ? selectedBase : selectedTarget;
  if (!selected.layoutHint?.pinned) positions.set(selected.id, anchor);

  // Selection re-centres the remaining deterministic cloud around the selected
  // node's original position. It stays behind the foreground constellation so
  // unrelated nodes remain useful depth context without competing with the
  // active relationship.
  const rotation = (unit(`${input.layout.seed}:${selected.id}:selection-rotation`) - 0.5) * 0.48;
  const shortestViewportAxis = Math.min(viewport.width, viewport.height);
  const contextScale = Math.max(0.76, Math.min(0.88, 0.76 + (shortestViewportAxis / 5000)));
  const contextDepth = Math.max(38, Math.min(64, shortestViewportAxis * 0.09));
  const neighborNodeIdSet = new Set(neighborNodeIds);
  input.nodes.forEach((node, index) => {
    if (node.id === selectedNodeId || neighborNodeIdSet.has(node.id) || node.layoutHint?.pinned) return;
    const base = basePositions.get(node.id)!;
    const delta = {
      x: base.x - selectedBase.x,
      y: base.y - selectedBase.y,
      z: base.z - selectedBase.z,
    };
    const rotated = {
      x: ((delta.x * Math.cos(rotation)) - (delta.y * Math.sin(rotation))) * contextScale,
      y: ((delta.x * Math.sin(rotation)) + (delta.y * Math.cos(rotation))) * contextScale,
      z: delta.z * (contextScale * 0.52),
    };
    const jitter = {
      x: (unit(`${input.layout.seed}:${selected.id}:${node.id}:selection-x`) - 0.5) * 13,
      y: (unit(`${input.layout.seed}:${selected.id}:${node.id}:selection-y`) - 0.5) * 12,
      z: (unit(`${input.layout.seed}:${selected.id}:${node.id}:selection-z`) - 0.5) * 8,
    };
    positions.set(node.id, {
      x: anchor.x + rotated.x + jitter.x,
      y: anchor.y + rotated.y + jitter.y
        + (((index / Math.max(1, input.nodes.length - 1)) - 0.5) * 8),
      z: anchor.z + rotated.z + jitter.z - contextDepth,
    });
  });

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
  const basePositions = new Map(input.nodes.map((node, index) => [
    node.id,
    organicPosition(node, input.layout.seed, index, input.nodes.length),
  ]));
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
  const preservesSelectionLayout = presentation.selectionLayout === "preserve";
  const positions = preservesSelectionLayout
    ? basePositions
    : selectedLayoutPositions(input, basePositions, nodesById, selectedNodeId, neighborNodeIds, viewport);
  const settledNodeIds = new Set(
    !preservesSelectionLayout && selectedNodeId ? [selectedNodeId, ...neighborNodeIds] : [],
  );
  const nodes = input.nodes.map((node) => {
    const position = positions.get(node.id)!;
    const settled = settledNodeIds.has(node.id);
    const pinned = node.layoutHint?.pinned === true;
    return {
      ...node,
      ...position,
      visual: visualCue(node, selectedNodeId, neighborNodeIdSet),
      ...((pinned || settled) ? { fx: position.x, fy: position.y, fz: position.z } : {}),
    };
  });
  const links = input.links.map((link) => ({
    ...link,
    visual: linkVisualCue(link, selectedNodeId, neighborNodeIdSet),
  }));
  const targetNodePositions = nodes
    .map(({ id, x, y, z }) => ({ id, x, y, z }))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
  return {
    nodes,
    links,
    presentation,
    selection: {
      nodeId: selectedNodeId,
      neighborNodeIds,
      settled: true,
      targetNodePositions,
      viewport,
    },
  };
}
