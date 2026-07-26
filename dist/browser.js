import { createThreeForceGraphRenderer } from "./renderer.js";
import { createGraphWorkbench, } from "./workbench.js";
export function createBrowserGraphWorkbench(options) {
    const workbench = createGraphWorkbench({ ...options, rendererFactory: createThreeForceGraphRenderer });
    if (typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        workbench.setReducedMotion(true);
    }
    return workbench;
}
export { createDefaultGraphLinkObject, createDefaultGraphNodeObject, createThreeForceGraphRenderer, } from "./renderer.js";
