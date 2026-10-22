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
    /**
     * Node ids matched by an active search, ordered by descending relevance.
     *
     * `undefined` or `null` means no search is running and the graph keeps its
     * normal reading tiers. An empty array means a search is running but matched
     * nothing, so the whole graph reads as context. The renderer highlights the
     * listed ids and dims everything else.
     */
    readonly matchedNodeIds?: readonly string[] | null;
    /** Keeps selection targets unchanged while requesting an immediate camera move. */
    readonly reducedMotion?: boolean;
    readonly theme?: "dark" | "light";
    readonly nodeDescriptors?: Readonly<Record<string, GraphNodeDescriptor>>;
    readonly linkDescriptors?: Readonly<Record<string, GraphLinkDescriptor>>;
}
export declare const EMPTY_GRAPH_PRESENTATION: GraphPresentation;
//# sourceMappingURL=presentation.d.ts.map