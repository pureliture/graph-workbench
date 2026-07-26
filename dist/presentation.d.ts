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
    readonly selectedNodeIds?: readonly string[];
    readonly focusNodeId?: string | null;
    readonly theme?: "dark" | "light";
    readonly nodeDescriptors?: Readonly<Record<string, GraphNodeDescriptor>>;
    readonly linkDescriptors?: Readonly<Record<string, GraphLinkDescriptor>>;
}
export declare const EMPTY_GRAPH_PRESENTATION: GraphPresentation;
//# sourceMappingURL=presentation.d.ts.map