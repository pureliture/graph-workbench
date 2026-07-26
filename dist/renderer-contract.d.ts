import type { Object3D } from "three";
import type { RenderGraphData, RenderLink, RenderNode } from "./layout.js";
import type { GraphLinkDescriptor, GraphNodeDescriptor, GraphPresentation } from "./presentation.js";
export interface GraphRendererCallbacks {
    readonly onBackgroundClick: () => void;
    readonly onNodeClick: (nodeId: string) => void;
    readonly onNodeHover: (nodeId: string | null) => void;
}
export interface GraphRenderer {
    destroy(): void;
    fit(durationMs?: number): void;
    focus(nodeId: string): void;
    resize(width?: number, height?: number): void;
    restoreCamera(): void;
    setData(data: RenderGraphData): void;
    setPresentation(presentation: GraphPresentation): void;
    zoom(scale: number): void;
}
export interface GraphRendererFactoryOptions {
    readonly callbacks: GraphRendererCallbacks;
    readonly container: HTMLElement;
    readonly linkObjectFactory?: GraphLinkObjectFactory;
    readonly nodeObjectFactory?: GraphNodeObjectFactory;
}
export type GraphRendererFactory = (options: GraphRendererFactoryOptions) => GraphRenderer;
export type GraphNodeObjectFactory = (node: RenderNode, descriptor: GraphNodeDescriptor | undefined) => Object3D;
export type GraphLinkObjectFactory = (link: RenderLink, descriptor: GraphLinkDescriptor | undefined) => Object3D;
//# sourceMappingURL=renderer-contract.d.ts.map