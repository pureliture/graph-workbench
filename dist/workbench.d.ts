import { type GraphInput } from "./contract.js";
import { type GraphRendererFactory } from "./renderer-contract.js";
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
    readonly rendererFactory?: GraphRendererFactory;
}
export interface GraphWorkbench {
    destroy(): void;
    fit(durationMs?: number): void;
    focusNode(nodeId: string | null): void;
    mount(container: HTMLElement): void;
    resize(width?: number, height?: number): void;
    restoreCamera(): void;
    setInput(input: GraphInput): void;
    setPresentation(presentation: GraphPresentation): void;
    unmount(): void;
    zoom(scale: number): void;
}
export declare function createGraphWorkbench(options: GraphWorkbenchOptions): GraphWorkbench;
//# sourceMappingURL=workbench.d.ts.map