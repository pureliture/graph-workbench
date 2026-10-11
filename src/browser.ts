import { createThreeForceGraphRenderer } from "./renderer.js";
import {
  createGraphWorkbench,
  type GraphWorkbench,
  type GraphWorkbenchOptions,
} from "./workbench.js";

export interface BrowserGraphWorkbenchOptions extends Omit<GraphWorkbenchOptions, "rendererFactory"> {}

export function createBrowserGraphWorkbench(options: BrowserGraphWorkbenchOptions): GraphWorkbench {
  const workbench = createGraphWorkbench({ ...options, rendererFactory: createThreeForceGraphRenderer });
  if (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    workbench.setReducedMotion(true);
  }
  return workbench;
}

export {
  createDefaultGraphLinkObject,
  createDefaultGraphNodeObject,
  createThreeForceGraphRenderer,
} from "./renderer.js";
export type {
  GraphActivityState,
  GraphLinkObjectFactory,
  GraphNodeObjectFactory,
  GraphDefaultNodeSilhouette,
  GraphAmbientMotionLinkEndpointBoundaryObservation,
  GraphAmbientMotionLinkEndpointObservation,
  GraphAmbientMotionLinkFlowObservation,
  GraphAmbientMotionNodePosition,
  GraphAmbientMotionObservation,
  GraphAmbientMotionParticleObservation,
  GraphAmbientMotionScreenPosition,
  GraphRenderLinkObservation,
  GraphRenderDefaultNodeBodyObservation,
  GraphRenderNodeLabelObservation,
  GraphRenderNodeObservation,
  GraphRenderObjectObservation,
  GraphRenderObservation,
  GraphRenderTransformObservation,
  GraphRecoveryCapsule,
  GraphScreenPosition,
  GraphTransitionCameraPoseObservation,
  GraphTransitionNodePosition,
  GraphTransitionObservation,
} from "./renderer-contract.js";
export type { GraphLabelVisibility, GraphLabelVisibilityPolicy } from "./presentation.js";
export type {
  GraphSelectionAcceptance,
  GraphSelectionCameraAcceptance,
  GraphSelectionIntent,
} from "./workbench.js";
