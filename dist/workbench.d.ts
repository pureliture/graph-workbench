import { type GraphInput, type GraphNode } from "./contract.js";
import { type GraphSelectionState } from "./layout.js";
import { type GraphRendererFactory, type GraphActivityState, type GraphAmbientMotionObservation, type GraphRecoveryCapsule, type GraphRenderObservation, type GraphScreenPosition, type GraphTransitionObservation } from "./renderer-contract.js";
import { type GraphPresentation } from "./presentation.js";
import { type GraphSearchMatch, type GraphSearchOptions, type GraphSearchResult } from "./search.js";
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
/**
 * The complete, immutable selection candidate offered to a host before the
 * workbench changes its presentation, graph data, camera, or callbacks.
 */
export interface GraphSelectionIntent extends GraphEvent {
    /** The original GraphInput node object, never a renderer-local copy. */
    readonly node: GraphNode | null;
    readonly neighborNodeIds: readonly string[];
    readonly nodeId: string | null;
    readonly source: GraphSelectionSource;
}
export type GraphSelectionCameraAcceptance = {
    readonly kind: "none";
} | {
    readonly durationMs?: number;
    readonly kind: "contextual";
} | {
    readonly durationMs?: number;
    readonly kind: "restore";
};
export interface GraphSelectionAcceptance {
    readonly camera?: GraphSelectionCameraAcceptance;
    readonly layout?: "constellation" | "preserve";
}
export interface GraphRendererState {
    readonly reason?: string;
    readonly status: "failed" | "mounted" | "unmounted";
}
export interface GraphSearchState {
    /** True while a non-empty query is running. */
    readonly active: boolean;
    /** Matches ordered by descending relevance. */
    readonly matches: readonly GraphSearchMatch[];
    /** Matched node ids ordered by descending relevance. */
    readonly nodeIds: readonly string[];
    /** The trimmed query that produced this state. */
    readonly query: string;
}
export interface GraphWorkbenchOptions {
    readonly input: GraphInput;
    readonly onBackgroundClick?: () => void;
    readonly onFocusChange?: (event: GraphHoverEvent) => void;
    readonly onNodeClick?: (event: GraphNodeEvent) => void;
    readonly onNodeHover?: (event: GraphHoverEvent) => void;
    readonly onRendererStateChange?: (state: GraphRendererState) => void;
    readonly onSelectionChange?: (event: GraphSelectionEvent) => void;
    /** Synchronously accepts, customizes, or rejects a candidate selection. */
    readonly resolveSelection?: (intent: GraphSelectionIntent) => GraphSelectionAcceptance | false | void;
    readonly rendererFactory?: GraphRendererFactory;
    /** Field weights and document rules used by the built-in search index. */
    readonly searchOptions?: GraphSearchOptions;
}
export interface GraphWorkbench {
    /** Captures optional renderer-local recovery state, or null for legacy renderers. */
    captureRecoveryCapsule(): GraphRecoveryCapsule | null;
    clearSearch(): void;
    destroy(): void;
    fit(durationMs?: number): void;
    focusNode(nodeId: string | null): void;
    /** Renderer-owned ambient-motion evidence, or null for legacy renderers. */
    getAmbientMotionObservation(): GraphAmbientMotionObservation | null;
    getNodeScreenPosition(nodeId: string): GraphScreenPosition | null;
    /** Live Object3D evidence, or null when no enhanced renderer is mounted. */
    getRenderObservation(): GraphRenderObservation | null;
    /** Live renderer-owned selection transition evidence, when supported. */
    getTransitionObservation(): GraphTransitionObservation | null;
    getSearchState(): GraphSearchState;
    getSelectionState(): GraphSelectionState;
    mount(container: HTMLElement): void;
    resize(width?: number, height?: number): void;
    /** Attempts to restore an optional renderer-local recovery capsule. */
    restoreRecoveryCapsule(capsule: GraphRecoveryCapsule): boolean;
    restoreCamera(): void;
    /** Resumes optional renderer-owned activity without remounting. */
    resume(): void;
    /** Runs a query without changing the graph reading mode. */
    search(query: string, options?: GraphSearchOptions): GraphSearchResult;
    selectNode(nodeId: string | null, source?: GraphSelectionSource): void;
    setInput(input: GraphInput): void;
    /** Passes host visibility/activity hints to enhanced renderers. */
    setActivityState(state: GraphActivityState): void;
    setPresentation(presentation: GraphPresentation): void;
    setReducedMotion(reducedMotion: boolean): void;
    /** Suspends optional renderer-owned activity without disposing scene state. */
    suspend(): void;
    /**
     * Runs a query and applies it as the graph reading mode: matched nodes are
     * emphasized and clustered, and the camera frames the matched set.
     */
    setSearchQuery(query: string, options?: GraphSearchOptions): void;
    unmount(): void;
    zoom(scale: number): void;
}
export declare function createGraphWorkbench(options: GraphWorkbenchOptions): GraphWorkbench;
//# sourceMappingURL=workbench.d.ts.map