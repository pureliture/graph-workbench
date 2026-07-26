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

function sphericalPosition(node: GraphNode, seed: string, index: number, total: number) {
  const hint = node.layoutHint;
  if ([hint?.x, hint?.y, hint?.z].every((axis) => Number.isFinite(axis))) {
    return { x: hint!.x!, y: hint!.y!, z: hint!.z! };
  }
  const radius = 90 + (unit(`${seed}:${node.id}:radius`) * 35);
  const theta = 2 * Math.PI * ((index + unit(`${seed}:${node.id}:theta`)) / Math.max(1, total));
  const phi = Math.acos(1 - (2 * ((index + 0.5) / Math.max(1, total))));
  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
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

function visualCue(node: GraphNode, selectedNodeId: string | null, neighborNodeIds: ReadonlySet<string>): GraphNodeVisualCue {
  const selected = node.id === selectedNodeId;
  const neighboring = neighborNodeIds.has(node.id);
  const initial = selected
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
  if (!selectedNodeId) return { opacity: 0.68, width: 1 };
  const selectedLink = link.source === selectedNodeId || link.target === selectedNodeId;
  const neighborhoodLink = neighborNodeIds.has(link.source) && neighborNodeIds.has(link.target);
  return selectedLink
    ? { opacity: 0.9, width: 1.65 }
    : neighborhoodLink
      ? { opacity: 0.62, width: 1.2 }
      : { opacity: 0.22, width: 0.7 };
}

function selectedLayoutPositions(
  input: GraphInput,
  basePositions: ReadonlyMap<string, { readonly x: number; readonly y: number; readonly z: number }>,
  selectedNodeId: string | null,
  neighborNodeIds: readonly string[],
  viewport: GraphViewport,
): ReadonlyMap<string, { readonly x: number; readonly y: number; readonly z: number }> {
  const positions = new Map(basePositions);
  if (!selectedNodeId) return positions;

  const selected = input.nodes.find((node) => node.id === selectedNodeId);
  if (!selected) return positions;
  if (!selected.layoutHint?.pinned) positions.set(selected.id, { x: 0, y: 0, z: 0 });

  const radius = Math.max(36, Math.min(96, Math.min(viewport.width, viewport.height) * 0.14));
  const offset = unit(`${input.layout.seed}:${selected.id}:neighbors`) * Math.PI * 2;
  neighborNodeIds.forEach((neighborId, index) => {
    const neighbor = input.nodes.find((node) => node.id === neighborId);
    if (!neighbor || neighbor.layoutHint?.pinned) return;
    const theta = offset + ((index / Math.max(1, neighborNodeIds.length)) * Math.PI * 2);
    const vertical = Math.sin(theta) * radius * 0.56;
    positions.set(neighborId, {
      x: Math.cos(theta) * radius,
      y: vertical,
      z: Math.sin(theta * 0.7 + offset) * radius * 0.4,
    });
  });
  return positions;
}

/**
 * Creates renderer-local, deterministic positions and visual cues without mutating GraphInput.
 * A selection locks only the selected node and its one-hop neighborhood to settled targets.
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
    sphericalPosition(node, input.layout.seed, index, input.nodes.length),
  ]));
  const positions = selectedLayoutPositions(input, basePositions, selectedNodeId, neighborNodeIds, viewport);
  const settledNodeIds = new Set(selectedNodeId ? [selectedNodeId, ...neighborNodeIds] : []);
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
