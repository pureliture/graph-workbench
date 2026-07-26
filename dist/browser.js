import { createThreeForceGraphRenderer } from "./renderer.js";
import { createGraphWorkbench, } from "./workbench.js";
export function createBrowserGraphWorkbench(options) {
    return createGraphWorkbench({ ...options, rendererFactory: createThreeForceGraphRenderer });
}
export { createDefaultGraphLinkObject, createDefaultGraphNodeObject, createThreeForceGraphRenderer, } from "./renderer.js";
