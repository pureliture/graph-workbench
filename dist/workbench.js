import { validateGraphInput } from "./contract.js";
import { createRenderGraphData } from "./layout.js";
import { EMPTY_GRAPH_PRESENTATION } from "./presentation.js";
function knownNodeIds(input) {
    return new Set(input.nodes.map((node) => node.id));
}
function normalizedPresentation(input, supplied) {
    const known = knownNodeIds(input);
    const selectedNodeIds = [...new Set(supplied.selectedNodeIds ?? [])].filter((id) => known.has(id));
    const focusNodeId = supplied.focusNodeId && known.has(supplied.focusNodeId)
        ? supplied.focusNodeId
        : null;
    return {
        selectedNodeIds,
        focusNodeId,
        nodeDescriptors: supplied.nodeDescriptors ?? {},
        linkDescriptors: supplied.linkDescriptors ?? {},
    };
}
function keyboardTarget(input, current, direction) {
    if (input.nodes.length === 0)
        return null;
    const nodeIds = input.nodes.map((node) => node.id);
    const currentIndex = current ? nodeIds.indexOf(current) : -1;
    const nextIndex = currentIndex < 0
        ? direction === 1 ? 0 : nodeIds.length - 1
        : (currentIndex + direction + nodeIds.length) % nodeIds.length;
    return nodeIds[nextIndex] ?? null;
}
export function createGraphWorkbench(options) {
    let input = validateGraphInput(options.input);
    let presentation = normalizedPresentation(input, EMPTY_GRAPH_PRESENTATION);
    let renderer = null;
    let container = null;
    let destroyed = false;
    const rendererFactory = options.rendererFactory;
    const sync = () => {
        if (!renderer)
            return;
        renderer.setData(createRenderGraphData(input, presentation));
        renderer.setPresentation(presentation);
    };
    const emitFocus = (nodeId) => {
        presentation = normalizedPresentation(input, { ...presentation, focusNodeId: nodeId });
        renderer?.setPresentation(presentation);
        options.onFocusChange?.({ input, nodeId: presentation.focusNodeId ?? null });
    };
    const callbacks = {
        onBackgroundClick() {
            presentation = normalizedPresentation(input, { ...presentation, focusNodeId: null, selectedNodeIds: [] });
            renderer?.setPresentation(presentation);
            options.onBackgroundClick?.();
        },
        onNodeClick(nodeId) {
            if (!knownNodeIds(input).has(nodeId))
                return;
            presentation = normalizedPresentation(input, {
                ...presentation,
                focusNodeId: nodeId,
                selectedNodeIds: [nodeId],
            });
            renderer?.setPresentation(presentation);
            options.onFocusChange?.({ input, nodeId });
            options.onNodeClick?.({ input, nodeId });
        },
        onNodeHover(nodeId) {
            options.onNodeHover?.({ input, nodeId });
        },
    };
    const onKeyDown = (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            const next = keyboardTarget(input, presentation.focusNodeId ?? null, 1);
            if (next) {
                emitFocus(next);
                renderer?.focus(next);
            }
            return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            const previous = keyboardTarget(input, presentation.focusNodeId ?? null, -1);
            if (previous) {
                emitFocus(previous);
                renderer?.focus(previous);
            }
            return;
        }
        if (event.key === "Enter" && presentation.focusNodeId) {
            event.preventDefault();
            callbacks.onNodeClick(presentation.focusNodeId);
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            callbacks.onBackgroundClick();
        }
    };
    return {
        destroy() {
            if (destroyed)
                return;
            this.unmount();
            destroyed = true;
        },
        fit(durationMs) {
            renderer?.fit(durationMs);
        },
        focusNode(nodeId) {
            const next = nodeId && knownNodeIds(input).has(nodeId) ? nodeId : null;
            emitFocus(next);
            if (next)
                renderer?.focus(next);
        },
        mount(nextContainer) {
            if (destroyed)
                throw new Error("graph workbench is destroyed");
            if (container === nextContainer && renderer)
                return;
            this.unmount();
            container = nextContainer;
            if (container.tabIndex < 0)
                container.tabIndex = 0;
            container.setAttribute("role", "application");
            container.setAttribute("aria-label", "3D graph workbench");
            container.addEventListener("keydown", onKeyDown);
            try {
                if (!rendererFactory) {
                    throw new Error("a rendererFactory is required; import @pureliture/graph-workbench/browser for Three.js support");
                }
                renderer = rendererFactory({ callbacks, container });
                sync();
                renderer.resize();
                options.onRendererStateChange?.({ status: "mounted" });
            }
            catch (error) {
                container.removeEventListener("keydown", onKeyDown);
                container = null;
                renderer = null;
                const reason = error instanceof Error ? error.message : String(error);
                options.onRendererStateChange?.({ status: "failed", reason });
                throw error;
            }
        },
        resize(width, height) {
            renderer?.resize(width, height);
        },
        restoreCamera() {
            renderer?.restoreCamera();
        },
        setInput(nextInput) {
            input = validateGraphInput(nextInput);
            presentation = normalizedPresentation(input, presentation);
            sync();
        },
        setPresentation(nextPresentation) {
            presentation = normalizedPresentation(input, nextPresentation);
            renderer?.setPresentation(presentation);
        },
        unmount() {
            if (!container && !renderer)
                return;
            container?.removeEventListener("keydown", onKeyDown);
            renderer?.destroy();
            renderer = null;
            container = null;
            options.onRendererStateChange?.({ status: "unmounted" });
        },
        zoom(scale) {
            renderer?.zoom(scale);
        },
    };
}
