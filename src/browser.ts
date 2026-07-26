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
  GraphLinkObjectFactory,
  GraphNodeObjectFactory,
  GraphRenderLinkObservation,
  GraphRenderNodeLabelObservation,
  GraphRenderNodeObservation,
  GraphRenderObjectObservation,
  GraphRenderObservation,
  GraphRenderTransformObservation,
  GraphScreenPosition,
  GraphTransitionNodePosition,
  GraphTransitionObservation,
} from "./renderer-contract.js";
