import type { Object3D } from "three";

import type { RenderGraphData, RenderLink, RenderNode } from "./layout.js";
import type { GraphLinkDescriptor, GraphNodeDescriptor, GraphPresentation } from "./presentation.js";

export interface GraphRendererCallbacks {
  readonly onBackgroundClick: () => void;
  readonly onNodeClick: (nodeId: string) => void;
  readonly onNodeHover: (nodeId: string | null) => void;
}

export interface GraphCameraTransitionOptions {
  readonly reducedMotion: boolean;
}

export interface GraphScreenPosition {
  readonly x: number;
  readonly y: number;
}

/** A three-axis position used by the ambient-motion observation seam. */
export interface GraphAmbientMotionPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface GraphAmbientMotionNodePosition extends GraphAmbientMotionPosition {
  readonly id: string;
}

export interface GraphAmbientMotionScreenPosition extends GraphScreenPosition {
  readonly id: string;
}

export interface GraphAmbientMotionLinkFlowObservation {
  readonly active: boolean;
  readonly id: string;
  readonly particleCount: number;
}

/**
 * World-space endpoints read from a default Line geometry after its local
 * positions have been transformed through the Line's current world matrix.
 */
export interface GraphAmbientMotionLinkEndpointObservation {
  readonly end: GraphAmbientMotionPosition;
  readonly id: string;
  readonly sourceId: string;
  readonly start: GraphAmbientMotionPosition;
  readonly targetId: string;
}

export interface GraphAmbientMotionParticleObservation {
  readonly id: string;
  readonly linkId: string;
  /** Normalized curve progress in the focus-to-neighbor direction. */
  readonly phase: number;
  readonly screenX: number | null;
  readonly screenY: number | null;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Read-only renderer evidence for visual motion. `anchorNodePositions` are
 * the selection/layout coordinates before micro motion; `renderedNodePositions`
 * are the live world-space positions of the rendered node objects. Default Line
 * endpoints remain available in reduced-motion mode while flow particles pause.
 */
export interface GraphAmbientMotionObservation {
  readonly active: boolean;
  readonly anchorNodePositions: readonly GraphAmbientMotionNodePosition[];
  /** Elapsed animated time, excluding visibility-hidden pauses. */
  readonly elapsedMs: number;
  readonly focusNodeId: string | null;
  readonly frame: number;
  readonly linkEndpoints: readonly GraphAmbientMotionLinkEndpointObservation[];
  readonly linkFlow: readonly GraphAmbientMotionLinkFlowObservation[];
  readonly particles: readonly GraphAmbientMotionParticleObservation[];
  readonly paused: boolean;
  readonly phase: number;
  readonly reducedMotion: boolean;
  readonly renderedNodePositions: readonly GraphAmbientMotionNodePosition[];
  readonly renderedScreenPositions: readonly GraphAmbientMotionScreenPosition[];
}

/** A renderer-local 3D coordinate sampled from the live graphData() nodes. */
export interface GraphTransitionNodePosition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Read-only evidence of the renderer-owned selection transaction. Positions are
 * live values, so callers can distinguish an actual intermediate frame from a
 * final layout snapshot.
 */
export interface GraphTransitionObservation {
  readonly active: boolean;
  readonly durationMs: number;
  readonly generation: number;
  readonly nodePositions: readonly GraphTransitionNodePosition[];
  readonly progress: number;
  readonly reducedMotion: boolean;
}

/**
 * A read-only snapshot of a factory-return Object3D. It reports scene attachment
 * and material state, not whether a node is visible in rendered pixels.
 */
export interface GraphRenderObjectObservation {
  readonly id: string;
  readonly minimumVisibleMaterialOpacity: number | null;
  readonly objectTracked: boolean;
  readonly objectVisible: boolean | null;
  readonly sceneAttached: boolean;
  /** Line widths from visible materials that expose a Three.js linewidth. */
  readonly visibleMaterialLineWidths: readonly number[];
  readonly visibleMaterialOpacities: readonly number[];
}

export interface GraphRenderTransformObservation {
  readonly position: GraphTransitionNodePosition | null;
  readonly scale: GraphTransitionNodePosition | null;
}

export interface GraphRenderNodeLabelObservation extends GraphRenderObjectObservation, GraphRenderTransformObservation {
  readonly alphaMasked: boolean | null;
  readonly transparent: boolean | null;
}

export interface GraphRenderNodeObservation extends GraphRenderObjectObservation {
  /** Default node body's current material color, or null for custom objects. */
  readonly bodyMaterialColor: string | null;
  /** Scene-level Sprite label, anchored above the node and camera-facing. */
  readonly label: GraphRenderNodeLabelObservation;
  /** Renderer-local position used for perspective and distance cues. */
  readonly worldPosition: GraphTransitionNodePosition;
  /** Default node object's live scale; custom objects retain their own scale. */
  readonly worldScale: GraphTransitionNodePosition | null;
  readonly visual: RenderNode["visual"];
}

export interface GraphRenderLinkObservation extends GraphRenderObjectObservation {
  /** The default edge uses a gentle three-point curve; custom factories may differ. */
  readonly curvePointCount: number | null;
  readonly depthWriteEnabled: boolean | null;
  readonly visual: RenderLink["visual"];
}

/**
 * Live renderer evidence based on public graphData()/scene() and tracked
 * factory-return objects. A null result means the renderer has no live scene.
 */
export interface GraphRenderObservation {
  readonly linkIds: readonly string[];
  readonly links: readonly GraphRenderLinkObservation[];
  readonly nodeIds: readonly string[];
  readonly nodes: readonly GraphRenderNodeObservation[];
}

export interface GraphRenderer {
  /** Optional enhanced seam. Legacy custom renderers only need the members below. */
  cancelCameraTransition?(): void;
  destroy(): void;
  fit(durationMs?: number): void;
  focus(nodeId: string): void;
  /** Optional projection seam for the renderer's current node and camera state. */
  getNodeScreenPosition?(nodeId: string): GraphScreenPosition | null;
  /** Optional renderer-owned micro-motion evidence. */
  getAmbientMotionObservation?(): GraphAmbientMotionObservation | null;
  /** Optional live Object3D observation seam. Legacy renderers return no observation. */
  getRenderObservation?(): GraphRenderObservation | null;
  /** Optional live selection-transition observation seam. */
  getTransitionObservation?(): GraphTransitionObservation | null;
  resize(width?: number, height?: number): void;
  restoreCamera(): void;
  setData(data: RenderGraphData): void;
  setPresentation(presentation: GraphPresentation): void;
  /** Optional enhanced seam for a cancellable selection camera transition. */
  transitionToNode?(nodeId: string, options: GraphCameraTransitionOptions): void;
  zoom(scale: number): void;
}

export interface GraphRendererFactoryOptions {
  readonly callbacks: GraphRendererCallbacks;
  readonly container: HTMLElement;
  readonly linkObjectFactory?: GraphLinkObjectFactory;
  readonly nodeObjectFactory?: GraphNodeObjectFactory;
}

export type GraphRendererFactory = (options: GraphRendererFactoryOptions) => GraphRenderer;

export type GraphNodeObjectFactory = (
  node: RenderNode,
  descriptor: GraphNodeDescriptor | undefined,
) => Object3D;

export type GraphLinkObjectFactory = (
  link: RenderLink,
  descriptor: GraphLinkDescriptor | undefined,
) => Object3D;
