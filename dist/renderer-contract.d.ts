import type { Object3D } from "three";
import type { RenderGraphData, RenderLink, RenderNode } from "./layout.js";
import type { GraphLinkDescriptor, GraphNodeDescriptor, GraphPresentation } from "./presentation.js";
export interface GraphRendererCallbacks {
    readonly onBackgroundClick: () => void;
    readonly onNodeClick: (nodeId: string) => void;
    readonly onNodeHover: (nodeId: string | null) => void;
}
export interface GraphCameraTransitionOptions {
    readonly reducedMotion: boolean;
}
export interface GraphScreenPosition {
    readonly x: number;
    readonly y: number;
}
/**
 * A read-only snapshot of a factory-return Object3D. It reports scene attachment
 * and material state, not whether a node is visible in rendered pixels.
 */
export interface GraphRenderObjectObservation {
    readonly id: string;
    readonly minimumVisibleMaterialOpacity: number | null;
    readonly objectTracked: boolean;
    readonly objectVisible: boolean | null;
    readonly sceneAttached: boolean;
    /** Line widths from visible materials that expose a Three.js linewidth. */
    readonly visibleMaterialLineWidths: readonly number[];
    readonly visibleMaterialOpacities: readonly number[];
}
export interface GraphRenderNodeObservation extends GraphRenderObjectObservation {
    readonly visual: RenderNode["visual"];
}
export interface GraphRenderLinkObservation extends GraphRenderObjectObservation {
    readonly visual: RenderLink["visual"];
}
/**
 * Live renderer evidence based on public graphData()/scene() and tracked
 * factory-return objects. A null result means the renderer has no live scene.
 */
export interface GraphRenderObservation {
    readonly linkIds: readonly string[];
    readonly links: readonly GraphRenderLinkObservation[];
    readonly nodeIds: readonly string[];
    readonly nodes: readonly GraphRenderNodeObservation[];
}
export interface GraphRenderer {
    /** Optional enhanced seam. Legacy custom renderers only need the members below. */
    cancelCameraTransition?(): void;
    destroy(): void;
    fit(durationMs?: number): void;
    focus(nodeId: string): void;
    /** Optional projection seam for the renderer's current node and camera state. */
    getNodeScreenPosition?(nodeId: string): GraphScreenPosition | null;
    /** Optional live Object3D observation seam. Legacy renderers return no observation. */
    getRenderObservation?(): GraphRenderObservation | null;
    resize(width?: number, height?: number): void;
    restoreCamera(): void;
    setData(data: RenderGraphData): void;
    setPresentation(presentation: GraphPresentation): void;
    /** Optional enhanced seam for a cancellable selection camera transition. */
    transitionToNode?(nodeId: string, options: GraphCameraTransitionOptions): void;
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