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
export declare function createRenderGraphData(input: GraphInput, presentation: GraphPresentation): RenderGraphData;
//# sourceMappingURL=layout.d.ts.map