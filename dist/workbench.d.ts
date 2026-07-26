import { type GraphInput, type GraphNode } from "./contract.js";
import { type GraphSelectionState } from "./layout.js";
import { type GraphRendererFactory, type GraphRenderObservation, type GraphScreenPosition, type GraphTransitionObservation } from "./renderer-contract.js";
import { type GraphPresentation } from "./presentation.js";
export interface GraphEvent {
    readonly input: GraphInput;
}
export interface GraphNodeEvent extends GraphEvent {
    readonly nodeId: string;
}
export interface GraphHoverEvent extends GraphEvent {
    readonly nodeId: string | null;
}
export type GraphSelectionSource = "background" | "keyboard" | "mouse" | "programmatic" | (string & {});
export interface GraphSelectionEvent extends GraphEvent {
    /** The original GraphInput node object, never a renderer-local copy. */
    readonly node: GraphNode | null;
    readonly neighborNodeIds: readonly string[];
    readonly nodeId: string | null;
    readonly settled: true;
    readonly source: GraphSelectionSource;
}
export interface GraphRendererState {
    readonly reason?: string;
    readonly status: "failed" | "mounted" | "unmounted";
}
export interface GraphWorkbenchOptions {
    readonly input: GraphInput;
    readonly onBackgroundClick?: () => void;
    readonly onFocusChange?: (event: GraphHoverEvent) => void;
    readonly onNodeClick?: (event: GraphNodeEvent) => void;
    readonly onNodeHover?: (event: GraphHoverEvent) => void;
    readonly onRendererStateChange?: (state: GraphRendererState) => void;
    readonly onSelectionChange?: (event: GraphSelectionEvent) => void;
    readonly rendererFactory?: GraphRendererFactory;
}
export interface GraphWorkbench {
    destroy(): void;
    fit(durationMs?: number): void;
    focusNode(nodeId: string | null): void;
    getNodeScreenPosition(nodeId: string): GraphScreenPosition | null;
    /** Live Object3D evidence, or null when no enhanced renderer is mounted. */
    getRenderObservation(): GraphRenderObservation | null;
    /** Live renderer-owned selection transition evidence, when supported. */
    getTransitionObservation(): GraphTransitionObservation | null;
    getSelectionState(): GraphSelectionState;
    mount(container: HTMLElement): void;
    resize(width?: number, height?: number): void;
    restoreCamera(): void;
    selectNode(nodeId: string | null, source?: GraphSelectionSource): void;
    setInput(input: GraphInput): void;
    setPresentation(presentation: GraphPresentation): void;
    setReducedMotion(reducedMotion: boolean): void;
    unmount(): void;
    zoom(scale: number): void;
}
export declare function createGraphWorkbench(options: GraphWorkbenchOptions): GraphWorkbench;
//# sourceMappingURL=workbench.d.ts.map