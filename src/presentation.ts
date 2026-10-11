export interface GraphNodeDescriptor {
  readonly color?: string;
  readonly label?: string;
  readonly opacity?: number;
}

export interface GraphLinkDescriptor {
  readonly color?: string;
  readonly opacity?: number;
  readonly width?: number;
}

export type GraphLabelVisibility = "auto" | "always" | "interaction" | "hidden";

/**
 * Host-provided label policy. Renderer adapters may use the most specific
 * matching entry for a node without changing graph topology or selection.
 */
export interface GraphLabelVisibilityPolicy {
  readonly byNodeId?: Readonly<Record<string, GraphLabelVisibility>>;
  readonly byType?: Readonly<Record<string, GraphLabelVisibility>>;
  readonly default?: GraphLabelVisibility;
}

export interface GraphPresentation {
  /**
   * Enables renderer-owned micro motion for default Three.js objects. Omitted
   * values normalize to true; custom renderers may ignore this optional hint.
   */
  readonly ambientMotion?: boolean;
  /** Optional host policy for renderer-owned node-label visibility. */
  readonly labelVisibility?: GraphLabelVisibilityPolicy;
  readonly selectedNodeIds?: readonly string[];
  /** Controls whether a selection may re-stage the deterministic graph layout. */
  readonly selectionLayout?: "constellation" | "preserve";
  readonly focusNodeId?: string | null;
  /** Immutable host projection/snapshot identity used by optional recovery seams. */
  readonly recoveryKey?: string;
  /** Keeps selection targets unchanged while requesting an immediate camera move. */
  readonly reducedMotion?: boolean;
  readonly theme?: "dark" | "light";
  readonly nodeDescriptors?: Readonly<Record<string, GraphNodeDescriptor>>;
  readonly linkDescriptors?: Readonly<Record<string, GraphLinkDescriptor>>;
}

export const EMPTY_GRAPH_PRESENTATION: GraphPresentation = Object.freeze({
  ambientMotion: true,
  labelVisibility: undefined,
  selectedNodeIds: Object.freeze([]),
  selectionLayout: "constellation",
  focusNodeId: null,
  recoveryKey: undefined,
  reducedMotion: false,
  theme: "dark",
  nodeDescriptors: Object.freeze({}),
  linkDescriptors: Object.freeze({}),
});
