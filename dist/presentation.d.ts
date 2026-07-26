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
export interface GraphPresentation {
    /**
     * Enables renderer-owned micro motion for default Three.js objects. Omitted
     * values normalize to true; custom renderers may ignore this optional hint.
     */
    readonly ambientMotion?: boolean;
    readonly selectedNodeIds?: readonly string[];
    readonly focusNodeId?: string | null;
    /** Keeps selection targets unchanged while requesting an immediate camera move. */
    readonly reducedMotion?: boolean;
    readonly theme?: "dark" | "light";
    readonly nodeDescriptors?: Readonly<Record<string, GraphNodeDescriptor>>;
    readonly linkDescriptors?: Readonly<Record<string, GraphLinkDescriptor>>;
}
export declare const EMPTY_GRAPH_PRESENTATION: GraphPresentation;
//# sourceMappingURL=presentation.d.ts.map