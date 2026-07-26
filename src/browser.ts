import { createThreeForceGraphRenderer } from "./renderer.js";
import {
  createGraphWorkbench,
  type GraphWorkbench,
  type GraphWorkbenchOptions,
} from "./workbench.js";

export interface BrowserGraphWorkbenchOptions extends Omit<GraphWorkbenchOptions, "rendererFactory"> {}

export function createBrowserGraphWorkbench(options: BrowserGraphWorkbenchOptions): GraphWorkbench {
  return createGraphWorkbench({ ...options, rendererFactory: createThreeForceGraphRenderer });
}

export {
  createDefaultGraphLinkObject,
  createDefaultGraphNodeObject,
  createThreeForceGraphRenderer,
} from "./renderer.js";
export type {
  GraphLinkObjectFactory,
  GraphNodeObjectFactory,
} from "./renderer-contract.js";
