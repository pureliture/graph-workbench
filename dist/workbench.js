import { validateGraphInput } from "./contract.js";
import { createRenderGraphData, } from "./layout.js";
import { EMPTY_GRAPH_PRESENTATION } from "./presentation.js";
import { createGraphSearchIndex, } from "./search.js";
function knownNodeIds(input) {
    return new Set(input.nodes.map((node) => node.id));
}
function selectedNodeId(presentation) {
    return presentation.selectedNodeIds?.[0] ?? null;
}
function normalizedPresentation(input, supplied) {
    const known = knownNodeIds(input);
    const selectedNodeIds = [...new Set(supplied.selectedNodeIds ?? [])].filter((id) => known.has(id));
    const focusNodeId = supplied.focusNodeId && known.has(supplied.focusNodeId)
        ? supplied.focusNodeId
        : null;
    const matchedNodeIds = supplied.matchedNodeIds === undefined || supplied.matchedNodeIds === null
        ? null
        : [...new Set(supplied.matchedNodeIds)].filter((id) => known.has(id));
    return {
        ambientMotion: supplied.ambientMotion !== false,
        selectedNodeIds,
        focusNodeId,
        matchedNodeIds,
        reducedMotion: supplied.reducedMotion === true,
        theme: supplied.theme === "light" ? "light" : "dark",
        labelVisibility: supplied.labelVisibility,
        nodeDescriptors: supplied.nodeDescriptors ?? {},
        linkDescriptors: supplied.linkDescriptors ?? {},
        recoveryKey: supplied.recoveryKey || undefined,
        selectionLayout: supplied.selectionLayout === "preserve" ? "preserve" : "constellation",
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
function viewportFor(container, width, height) {
    if (width !== undefined || height !== undefined) {
        return {
            width: Math.max(1, Math.floor(width ?? container?.clientWidth ?? 1)),
            height: Math.max(1, Math.floor(height ?? container?.clientHeight ?? 1)),
        };
    }
    if (!container)
        return undefined;
    return {
        width: Math.max(1, Math.floor(container.clientWidth ?? 1)),
        height: Math.max(1, Math.floor(container.clientHeight ?? 1)),
    };
}
function sameTargetNodePositions(left, right) {
    return left.length === right.length && left.every((position, index) => {
        const other = right[index];
        return other?.id === position.id
            && other.x === position.x
            && other.y === position.y
            && other.z === position.z;
    });
}
export function createGraphWorkbench(options) {
    let input = validateGraphInput(options.input);
    let presentation = normalizedPresentation(input, EMPTY_GRAPH_PRESENTATION);
    let renderer = null;
    let container = null;
    let viewport;
    let selectionState = createRenderGraphData(input, presentation, { viewport }).selection;
    let destroyed = false;
    const rendererFactory = options.rendererFactory;
    // The search index is rebuilt only when the graph itself changes, so a host
    // can run a query on every keystroke without paying for a re-index.
    let searchIndex = createGraphSearchIndex(input, options.searchOptions);
    let searchQuery = "";
    let searchMatches = [];
    let searchNodeIds = [];
    let searchFramedCamera = false;
    const searchActive = () => searchQuery.trim().length > 0;
    const sync = () => {
        const data = createRenderGraphData(input, presentation, { viewport });
        selectionState = data.selection;
        if (!renderer)
            return;
        renderer.setData(data);
        renderer.setPresentation(presentation);
    };
    const applySearchReadingMode = () => {
        presentation = normalizedPresentation(input, {
            ...presentation,
            matchedNodeIds: searchActive() ? searchNodeIds : null,
        });
        sync();
    };
    const frameSearchMatches = () => {
        if (!renderer)
            return;
        if (!searchActive() || searchNodeIds.length === 0) {
            if (searchFramedCamera) {
                // The matched cluster returns to the canonical layout, so the camera
                // returns to the whole graph instead of hovering over an empty area.
                searchFramedCamera = false;
                if (!selectionState.nodeId)
                    renderer.restoreCamera();
            }
            return;
        }
        if (selectionState.nodeId)
            return;
        if (!renderer.focusNodeSet)
            return;
        searchFramedCamera = true;
        renderer.focusNodeSet(searchNodeIds, { reducedMotion: presentation.reducedMotion === true });
    };
    const transitionToSelection = (nodeId, durationMs) => {
        if (!renderer || !nodeId)
            return;
        if (renderer.transitionToNode) {
            const transitionOptions = {
                reducedMotion: presentation.reducedMotion === true,
                ...(durationMs === undefined ? {} : { durationMs }),
            };
            renderer.transitionToNode(nodeId, transitionOptions);
            return;
        }
        renderer.cancelCameraTransition?.();
        renderer.focus(nodeId);
    };
    const cameraTransitionOptions = (durationMs) => ({
        reducedMotion: presentation.reducedMotion === true,
        ...(durationMs === undefined ? {} : { durationMs }),
    });
    const emitSelection = (source) => {
        const nodeId = selectionState.nodeId;
        const node = nodeId ? input.nodes.find((candidate) => candidate.id === nodeId) ?? null : null;
        options.onFocusChange?.({ input, nodeId });
        options.onSelectionChange?.({
            input,
            node,
            nodeId,
            neighborNodeIds: selectionState.neighborNodeIds,
            settled: selectionState.settled,
            source,
        });
    };
    const selectNode = (nodeId, source) => {
        const nextNodeId = nodeId && knownNodeIds(input).has(nodeId) ? nodeId : null;
        const candidatePresentation = normalizedPresentation(input, {
            ...presentation,
            focusNodeId: nextNodeId,
            selectedNodeIds: nextNodeId ? [nextNodeId] : [],
        });
        const candidateSelection = createRenderGraphData(input, candidatePresentation, { viewport }).selection;
        const acceptance = options.resolveSelection?.({
            input,
            node: nextNodeId ? input.nodes.find((candidate) => candidate.id === nextNodeId) ?? null : null,
            neighborNodeIds: candidateSelection.neighborNodeIds,
            nodeId: nextNodeId,
            source,
        });
        if (acceptance === false)
            return false;
        // A selection owns the reading layout, so the camera leaves the matched
        // cluster framing and follows the selected node instead.
        if (nextNodeId)
            searchFramedCamera = false;
        const camera = acceptance?.camera;
        presentation = normalizedPresentation(input, {
            ...candidatePresentation,
            selectionLayout: acceptance?.layout ?? "constellation",
        });
        // Clearing a selection has historically settled any active camera before
        // renderer data changes. Keep that order unless the host explicitly asks
        // to leave the camera alone or restore it after the accepted data update.
        const cancelBeforeSync = !nextNodeId && camera?.kind !== "none" && camera?.kind !== "restore";
        if (cancelBeforeSync)
            renderer?.cancelCameraTransition?.();
        sync();
        if (camera?.kind === "restore") {
            if (renderer?.restoreFocusCamera)
                renderer.restoreFocusCamera(cameraTransitionOptions(camera.durationMs));
            else
                renderer?.restoreCamera();
        }
        else if (camera?.kind === "contextual") {
            transitionToSelection(nextNodeId, camera.durationMs);
        }
        else if (camera?.kind !== "none") {
            if (nextNodeId)
                transitionToSelection(nextNodeId);
        }
        emitSelection(source);
        return true;
    };
    const callbacks = {
        onBackgroundClick() {
            if (selectNode(null, "background"))
                options.onBackgroundClick?.();
        },
        onNodeClick(nodeId) {
            if (!knownNodeIds(input).has(nodeId))
                return;
            if (selectNode(nodeId, "mouse"))
                options.onNodeClick?.({ input, nodeId });
        },
        onNodeHover(nodeId) {
            options.onNodeHover?.({ input, nodeId });
        },
    };
    const onKeyDown = (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            const next = keyboardTarget(input, selectionState.nodeId ?? presentation.focusNodeId ?? null, 1);
            if (next)
                selectNode(next, "keyboard");
            return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            const previous = keyboardTarget(input, selectionState.nodeId ?? presentation.focusNodeId ?? null, -1);
            if (previous)
                selectNode(previous, "keyboard");
            return;
        }
        if (event.key === "Enter" && selectionState.nodeId) {
            event.preventDefault();
            callbacks.onNodeClick(selectionState.nodeId);
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            callbacks.onBackgroundClick();
        }
    };
    return {
        captureRecoveryCapsule() {
            return renderer?.captureRecoveryCapsule?.() ?? null;
        },
        clearSearch() {
            searchQuery = "";
            searchMatches = [];
            searchNodeIds = [];
            applySearchReadingMode();
            frameSearchMatches();
        },
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
            const nextNodeId = nodeId && knownNodeIds(input).has(nodeId) ? nodeId : null;
            presentation = normalizedPresentation(input, { ...presentation, focusNodeId: nextNodeId });
            renderer?.setPresentation(presentation);
            if (nextNodeId)
                transitionToSelection(nextNodeId);
            options.onFocusChange?.({ input, nodeId: nextNodeId });
        },
        getAmbientMotionObservation() {
            return renderer?.getAmbientMotionObservation?.() ?? null;
        },
        getNodeScreenPosition(nodeId) {
            if (!knownNodeIds(input).has(nodeId))
                return null;
            return renderer?.getNodeScreenPosition?.(nodeId) ?? null;
        },
        getRenderObservation() {
            return renderer?.getRenderObservation?.() ?? null;
        },
        getTransitionObservation() {
            return renderer?.getTransitionObservation?.() ?? null;
        },
        getSearchState() {
            return {
                active: searchActive(),
                matches: searchMatches,
                nodeIds: searchNodeIds,
                query: searchQuery,
            };
        },
        getSelectionState() {
            return selectionState;
        },
        mount(nextContainer) {
            if (destroyed)
                throw new Error("graph workbench is destroyed");
            if (container === nextContainer && renderer)
                return;
            this.unmount();
            container = nextContainer;
            viewport = viewportFor(container);
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
                transitionToSelection(selectionState.nodeId);
                frameSearchMatches();
                // An idle load plays the reference sweep home; selections, shared
                // search links, and reduced motion skip straight to their own frame.
                if (!selectionState.nodeId && !searchFramedCamera && presentation.reducedMotion !== true) {
                    renderer.playIntroSweep?.();
                }
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
            viewport = viewportFor(container, width, height);
            renderer?.resize(width, height);
            sync();
            // ResizeObserver preserves the selected identity, so `sync()` alone
            // updates graphData without re-running the renderer's selection camera
            // target. Reframe after the viewport-derived data is current; this uses
            // the same reduced-motion and cancellation policy as an initial select.
            transitionToSelection(selectionState.nodeId);
        },
        restoreRecoveryCapsule(capsule) {
            return renderer?.restoreRecoveryCapsule?.(capsule) ?? false;
        },
        restoreCamera() {
            renderer?.restoreCamera();
        },
        resume() {
            renderer?.resume?.();
        },
        search(query, searchOptions) {
            return searchIndex.search(query, searchOptions);
        },
        selectNode(nodeId, source = "programmatic") {
            selectNode(nodeId, source);
        },
        setInput(nextInput) {
            const validatedInput = validateGraphInput(nextInput);
            const nextPresentation = normalizedPresentation(validatedInput, presentation);
            const previousSelection = selectionState;
            const previousNodeId = previousSelection.nodeId;
            const nextNodeId = selectedNodeId(nextPresentation);
            if (previousNodeId && !nextNodeId)
                renderer?.cancelCameraTransition?.();
            input = validatedInput;
            searchIndex = createGraphSearchIndex(input, options.searchOptions);
            presentation = nextPresentation;
            // Keep the running query meaningful after a host update instead of
            // leaving stale match ids behind.
            if (searchActive()) {
                const result = searchIndex.search(searchQuery);
                searchMatches = result.matches;
                searchNodeIds = result.nodeIds;
                presentation = normalizedPresentation(input, {
                    ...presentation,
                    matchedNodeIds: searchNodeIds,
                });
            }
            sync();
            const selectionChanged = selectionState.nodeId !== previousNodeId;
            const relationshipLayoutChanged = selectionState.nodeId !== null
                && !sameTargetNodePositions(previousSelection.targetNodePositions, selectionState.targetNodePositions);
            // A host can update links or layout hints without changing the selected
            // identity. Reframe only when those actual targets changed, so the
            // camera follows the new relationship constellation while metadata-only
            // updates, collapse state, and a user's current camera remain untouched.
            if (selectionChanged || relationshipLayoutChanged) {
                if (selectionState.nodeId)
                    transitionToSelection(selectionState.nodeId);
            }
            if (selectionChanged) {
                emitSelection("programmatic");
            }
        },
        setActivityState(state) {
            renderer?.setActivityState?.(state);
        },
        setPresentation(nextPresentation) {
            const previousNodeId = selectionState.nodeId;
            const normalized = normalizedPresentation(input, nextPresentation);
            const nextNodeId = selectedNodeId(normalized);
            if (previousNodeId && !nextNodeId)
                renderer?.cancelCameraTransition?.();
            // The workbench owns the search reading mode, so a host presentation
            // update cannot silently drop the matched nodes.
            presentation = normalizedPresentation(input, {
                ...normalized,
                matchedNodeIds: searchActive() ? searchNodeIds : null,
            });
            sync();
            if (selectionState.nodeId !== previousNodeId) {
                if (selectionState.nodeId)
                    transitionToSelection(selectionState.nodeId);
                emitSelection("programmatic");
            }
        },
        setReducedMotion(reducedMotion) {
            presentation = normalizedPresentation(input, { ...presentation, reducedMotion });
            sync();
            transitionToSelection(selectionState.nodeId);
        },
        suspend() {
            renderer?.suspend?.();
        },
        setSearchQuery(query, searchOptions) {
            const result = searchIndex.search(query, searchOptions);
            searchQuery = result.query;
            searchMatches = result.matches;
            searchNodeIds = result.nodeIds;
            applySearchReadingMode();
            frameSearchMatches();
        },
        unmount() {
            if (!container && !renderer)
                return;
            container?.removeEventListener("keydown", onKeyDown);
            renderer?.destroy();
            renderer = null;
            container = null;
            viewport = undefined;
            options.onRendererStateChange?.({ status: "unmounted" });
        },
        zoom(scale) {
            renderer?.zoom(scale);
        },
    };
}
