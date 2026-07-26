import type { GraphInput, GraphLink, GraphNode } from "./contract.js";
import type { GraphPresentation } from "./presentation.js";

export interface RenderNode extends GraphNode {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly fx?: number;
  readonly fy?: number;
  readonly fz?: number;
}

export interface RenderLink extends Omit<GraphLink, "source" | "target"> {
  readonly source: string;
  readonly target: string;
}

export interface RenderGraphData {
  readonly nodes: readonly RenderNode[];
  readonly links: readonly RenderLink[];
  readonly presentation: GraphPresentation;
}

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

export function createRenderGraphData(
  input: GraphInput,
  presentation: GraphPresentation,
): RenderGraphData {
  const nodes = input.nodes.map((node, index) => {
    const position = sphericalPosition(node, input.layout.seed, index, input.nodes.length);
    const pinned = node.layoutHint?.pinned === true;
    return {
      ...node,
      ...position,
      ...(pinned ? { fx: position.x, fy: position.y, fz: position.z } : {}),
    };
  });
  const links = input.links.map((link) => ({ ...link }));
  return { nodes, links, presentation };
}
