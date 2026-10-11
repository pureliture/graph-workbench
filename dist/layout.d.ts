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
/**
 * Creates renderer-local, deterministic positions and visual cues without mutating GraphInput.
 * A selection locks only the selected node and its one-hop neighborhood to settled targets
 * unless the host asks to preserve the existing deterministic layout.
 */
export declare function createRenderGraphData(input: GraphInput, presentation: GraphPresentation, options?: GraphLayoutOptions): RenderGraphData;
//# sourceMappingURL=layout.d.ts.map