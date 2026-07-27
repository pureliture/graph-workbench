import { type GraphWorkbench, type GraphWorkbenchOptions } from "./workbench.js";
export interface BrowserGraphWorkbenchOptions extends Omit<GraphWorkbenchOptions, "rendererFactory"> {
}
export declare function createBrowserGraphWorkbench(options: BrowserGraphWorkbenchOptions): GraphWorkbench;
export { createDefaultGraphLinkObject, createDefaultGraphNodeObject, createThreeForceGraphRenderer, } from "./renderer.js";
export type { GraphLinkObjectFactory, GraphNodeObjectFactory, GraphDefaultNodeSilhouette, GraphAmbientMotionLinkFlowObservation, GraphAmbientMotionNodePosition, GraphAmbientMotionObservation, GraphAmbientMotionParticleObservation, GraphAmbientMotionScreenPosition, GraphRenderLinkObservation, GraphRenderDefaultNodeBodyObservation, GraphRenderNodeLabelObservation, GraphRenderNodeObservation, GraphRenderObjectObservation, GraphRenderObservation, GraphRenderTransformObservation, GraphScreenPosition, GraphTransitionCameraPoseObservation, GraphTransitionNodePosition, GraphTransitionObservation, } from "./renderer-contract.js";
//# sourceMappingURL=browser.d.ts.map