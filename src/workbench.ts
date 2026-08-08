import { type GraphInput, type GraphNode, validateGraphInput } from "./contract.js";
import {
  createRenderGraphData,
  type GraphSelectionState,
  type GraphViewport,
} from "./layout.js";
import {
  type GraphRenderer,
  type GraphRendererFactory,
  type GraphRendererFactoryOptions,
  type GraphActivityState,
  type GraphAmbientMotionObservation,
  type GraphRecoveryCapsule,
  type GraphRenderObservation,
  type GraphScreenPosition,
  type GraphTransitionObservation,
} from "./renderer-contract.js";
import { EMPTY_GRAPH_PRESENTATION, type GraphPresentation } from "./presentation.js";

export interface GraphEvent {
  readonly input: GraphInput;
}

export interface GraphNodeEvent extends GraphEvent {
  readonly nodeId: string;
}

export interface GraphHoverEvent extends GraphEvent {
  readonly nodeId: string | null;
}

export type GraphSelectionSource =
  | "background"
  | "keyboard"
  | "mouse"
  | "programmatic"
  | (string & {});

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

export type GraphSelectionCameraAcceptance =
  | { readonly kind: "none" }
  | { readonly durationMs?: number; readonly kind: "contextual" }
  | { readonly durationMs?: number; readonly kind: "restore" };

export interface GraphSelectionAcceptance {
  readonly camera?: GraphSelectionCameraAcceptance;
  readonly layout?: "constellation" | "preserve";
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
  readonly onSelectionChange?: (event: GraphSelectionEvent) => void;
  /** Synchronously accepts, customizes, or rejects a candidate selection. */
  readonly resolveSelection?: (intent: GraphSelectionIntent) => GraphSelectionAcceptance | false | void;
  readonly rendererFactory?: GraphRendererFactory;
}

export interface GraphWorkbench {
  /** Captures optional renderer-local recovery state, or null for legacy renderers. */
  captureRecoveryCapsule(): GraphRecoveryCapsule | null;
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
  getSelectionState(): GraphSelectionState;
  mount(container: HTMLElement): void;
  resize(width?: number, height?: number): void;
  /** Attempts to restore an optional renderer-local recovery capsule. */
  restoreRecoveryCapsule(capsule: GraphRecoveryCapsule): boolean;
  restoreCamera(): void;
  /** Resumes optional renderer-owned activity without remounting. */
  resume(): void;
  selectNode(nodeId: string | null, source?: GraphSelectionSource): void;
  setInput(input: GraphInput): void;
  /** Passes host visibility/activity hints to enhanced renderers. */
  setActivityState(state: GraphActivityState): void;
  setPresentation(presentation: GraphPresentation): void;
  setReducedMotion(reducedMotion: boolean): void;
  /** Suspends optional renderer-owned activity without disposing scene state. */
  suspend(): void;
  unmount(): void;
  zoom(scale: number): void;
}

function knownNodeIds(input: GraphInput): Set<string> {
  return new Set(input.nodes.map((node) => node.id));
}

function selectedNodeId(presentation: GraphPresentation): string | null {
  return presentation.selectedNodeIds?.[0] ?? null;
}

function normalizedPresentation(input: GraphInput, supplied: GraphPresentation): GraphPresentation {
  const known = knownNodeIds(input);
  const selectedNodeIds = [...new Set(supplied.selectedNodeIds ?? [])].filter((id) => known.has(id));
  const focusNodeId = supplied.focusNodeId && known.has(supplied.focusNodeId)
    ? supplied.focusNodeId
    : null;
  return {
    ambientMotion: supplied.ambientMotion !== false,
    selectedNodeIds,
    focusNodeId,
    reducedMotion: supplied.reducedMotion === true,
    theme: supplied.theme === "light" ? "light" : "dark",
    labelVisibility: supplied.labelVisibility,
    nodeDescriptors: supplied.nodeDescriptors ?? {},
    linkDescriptors: supplied.linkDescriptors ?? {},
    recoveryKey: supplied.recoveryKey || undefined,
    selectionLayout: supplied.selectionLayout === "preserve" ? "preserve" : "constellation",
  };
}

function keyboardTarget(input: GraphInput, current: string | null, direction: 1 | -1): string | null {
  if (input.nodes.length === 0) return null;
  const nodeIds = input.nodes.map((node) => node.id);
  const currentIndex = current ? nodeIds.indexOf(current) : -1;
  const nextIndex = currentIndex < 0
    ? direction === 1 ? 0 : nodeIds.length - 1
    : (currentIndex + direction + nodeIds.length) % nodeIds.length;
  return nodeIds[nextIndex] ?? null;
}

function viewportFor(container: HTMLElement | null, width?: number, height?: number): GraphViewport | undefined {
  if (width !== undefined || height !== undefined) {
    return {
      width: Math.max(1, Math.floor(width ?? container?.clientWidth ?? 1)),
      height: Math.max(1, Math.floor(height ?? container?.clientHeight ?? 1)),
    };
  }
  if (!container) return undefined;
  return {
    width: Math.max(1, Math.floor(container.clientWidth ?? 1)),
    height: Math.max(1, Math.floor(container.clientHeight ?? 1)),
  };
}

function sameTargetNodePositions(
  left: GraphSelectionState["targetNodePositions"],
  right: GraphSelectionState["targetNodePositions"],
): boolean {
  return left.length === right.length && left.every((position, index) => {
    const other = right[index];
    return other?.id === position.id
      && other.x === position.x
      && other.y === position.y
      && other.z === position.z;
  });
}

export function createGraphWorkbench(options: GraphWorkbenchOptions): GraphWorkbench {
  let input = validateGraphInput(options.input);
  let presentation = normalizedPresentation(input, EMPTY_GRAPH_PRESENTATION);
  let renderer: GraphRenderer | null = null;
  let container: HTMLElement | null = null;
  let viewport: GraphViewport | undefined;
  let selectionState = createRenderGraphData(input, presentation, { viewport }).selection;
  let destroyed = false;
  const rendererFactory = options.rendererFactory;

  const sync = () => {
    const data = createRenderGraphData(input, presentation, { viewport });
    selectionState = data.selection;
    if (!renderer) return;
    renderer.setData(data);
    renderer.setPresentation(presentation);
  };

  const transitionToSelection = (nodeId: string | null, durationMs?: number) => {
    if (!renderer || !nodeId) return;
    renderer.cancelCameraTransition?.();
    if (renderer.transitionToNode) {
      const transitionOptions = {
        reducedMotion: presentation.reducedMotion === true,
        ...(durationMs === undefined ? {} : { durationMs }),
      };
      renderer.transitionToNode(nodeId, transitionOptions);
      return;
    }
    renderer.focus(nodeId);
  };

  const cameraTransitionOptions = (durationMs?: number) => ({
    reducedMotion: presentation.reducedMotion === true,
    ...(durationMs === undefined ? {} : { durationMs }),
  });

  const emitSelection = (source: GraphSelectionSource) => {
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

  const selectNode = (nodeId: string | null, source: GraphSelectionSource): boolean => {
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
    if (acceptance === false) return false;
    const camera = acceptance?.camera;
    presentation = normalizedPresentation(input, {
      ...candidatePresentation,
      selectionLayout: acceptance?.layout ?? "constellation",
    });
    // Clearing a selection has historically settled any active camera before
    // renderer data changes. Keep that order unless the host explicitly asks
    // to leave the camera alone or restore it after the accepted data update.
    const cancelBeforeSync = !nextNodeId && camera?.kind !== "none" && camera?.kind !== "restore";
    if (cancelBeforeSync) renderer?.cancelCameraTransition?.();
    sync();
    if (camera?.kind === "restore") {
      if (renderer?.restoreFocusCamera) renderer.restoreFocusCamera(cameraTransitionOptions(camera.durationMs));
      else renderer?.restoreCamera();
    } else if (camera?.kind === "contextual") {
      transitionToSelection(nextNodeId, camera.durationMs);
    } else if (camera?.kind !== "none") {
      if (nextNodeId) transitionToSelection(nextNodeId);
    }
    emitSelection(source);
    return true;
  };

  const callbacks: GraphRendererFactoryOptions["callbacks"] = {
    onBackgroundClick() {
      if (selectNode(null, "background")) options.onBackgroundClick?.();
    },
    onNodeClick(nodeId) {
      if (!knownNodeIds(input).has(nodeId)) return;
      if (selectNode(nodeId, "mouse")) options.onNodeClick?.({ input, nodeId });
    },
    onNodeHover(nodeId) {
      options.onNodeHover?.({ input, nodeId });
    },
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = keyboardTarget(input, selectionState.nodeId ?? presentation.focusNodeId ?? null, 1);
      if (next) selectNode(next, "keyboard");
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const previous = keyboardTarget(input, selectionState.nodeId ?? presentation.focusNodeId ?? null, -1);
      if (previous) selectNode(previous, "keyboard");
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
    destroy() {
      if (destroyed) return;
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
      if (nextNodeId) transitionToSelection(nextNodeId);
      options.onFocusChange?.({ input, nodeId: nextNodeId });
    },
    getAmbientMotionObservation() {
      return renderer?.getAmbientMotionObservation?.() ?? null;
    },
    getNodeScreenPosition(nodeId) {
      if (!knownNodeIds(input).has(nodeId)) return null;
      return renderer?.getNodeScreenPosition?.(nodeId) ?? null;
    },
    getRenderObservation() {
      return renderer?.getRenderObservation?.() ?? null;
    },
    getTransitionObservation() {
      return renderer?.getTransitionObservation?.() ?? null;
    },
    getSelectionState() {
      return selectionState;
    },
    mount(nextContainer) {
      if (destroyed) throw new Error("graph workbench is destroyed");
      if (container === nextContainer && renderer) return;
      this.unmount();
      container = nextContainer;
      viewport = viewportFor(container);
      if (container.tabIndex < 0) container.tabIndex = 0;
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
        options.onRendererStateChange?.({ status: "mounted" });
      } catch (error) {
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
    selectNode(nodeId, source = "programmatic") {
      selectNode(nodeId, source);
    },
    setInput(nextInput) {
      const validatedInput = validateGraphInput(nextInput);
      const nextPresentation = normalizedPresentation(validatedInput, presentation);
      const previousSelection = selectionState;
      const previousNodeId = previousSelection.nodeId;
      const nextNodeId = selectedNodeId(nextPresentation);
      if (previousNodeId && !nextNodeId) renderer?.cancelCameraTransition?.();
      input = validatedInput;
      presentation = nextPresentation;
      sync();
      const selectionChanged = selectionState.nodeId !== previousNodeId;
      const relationshipLayoutChanged = selectionState.nodeId !== null
        && !sameTargetNodePositions(previousSelection.targetNodePositions, selectionState.targetNodePositions);
      // A host can update links or layout hints without changing the selected
      // identity. Reframe only when those actual targets changed, so the
      // camera follows the new relationship constellation while metadata-only
      // updates, collapse state, and a user's current camera remain untouched.
      if (selectionChanged || relationshipLayoutChanged) {
        if (selectionState.nodeId) transitionToSelection(selectionState.nodeId);
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
      if (previousNodeId && !nextNodeId) renderer?.cancelCameraTransition?.();
      presentation = normalized;
      sync();
      if (selectionState.nodeId !== previousNodeId) {
        if (selectionState.nodeId) transitionToSelection(selectionState.nodeId);
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
    unmount() {
      if (!container && !renderer) return;
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
