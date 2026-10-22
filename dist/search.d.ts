import type { GraphInput, GraphNode } from "./contract.js";
/**
 * Search mirrors the reference dictionary's search profile: a term title
 * outranks an alias, an alias outranks a usage note, and the long body text
 * only contributes when nothing more specific matched. `identity` covers the
 * graph-native coordinates (id, kind, type, section) that the reference keeps
 * in the term slug instead of a searchable field.
 */
export declare const GRAPH_SEARCH_FIELD_BOOSTS: Readonly<{
    title: 3;
    aliases: 2.6;
    usage: 2;
    identity: 1.8;
    description: 1.5;
    body: 1;
    avoid: 1;
}>;
export declare const GRAPH_SEARCH_FIELDS: readonly ["title", "aliases", "usage", "identity", "description", "body", "avoid"];
export type GraphSearchField = (typeof GRAPH_SEARCH_FIELDS)[number];
export type GraphSearchCombineWith = "AND" | "OR";
export interface GraphSearchDocument {
    /** Alternative names and synonyms for the node. */
    readonly aliases: string;
    /** Guidance the node explicitly warns against. */
    readonly avoid: string;
    /** Long-form prose: definition, bullets, examples. */
    readonly body: string;
    /** One-line summary shown next to the title. */
    readonly description: string;
    /** Graph-native coordinates: id, kind, type, section. */
    readonly identity: string;
    /** Display title. */
    readonly title: string;
    /** Where the term shows up in practice. */
    readonly usage: string;
}
export interface GraphSearchOptions {
    /** How multiple query terms combine. Defaults to "OR", matching the reference. */
    readonly combineWith?: GraphSearchCombineWith;
    /** Typo tolerance. Defaults to 0.2, matching the reference. */
    readonly fuzzy?: number | boolean;
    /** Maximum number of returned matches. Defaults to 15, matching the reference. */
    readonly limit?: number;
    /** Prefix matching. Defaults to true, matching the reference. */
    readonly prefix?: boolean;
    /**
     * Fraction of the best score a match must reach to survive. Defaults to 0.3,
     * matching the reference.
     */
    readonly relativeScoreThreshold?: number;
    /** Merges host-owned searchable text into a node document. */
    readonly resolveDocument?: (node: GraphNode) => Partial<GraphSearchDocument>;
}
export interface GraphSearchMatch {
    readonly nodeId: string;
    readonly score: number;
}
export interface GraphSearchResult {
    /** Matches ordered by descending relevance. */
    readonly matches: readonly GraphSearchMatch[];
    /** Matched node ids in relevance order. */
    readonly nodeIds: readonly string[];
    /** The trimmed query that produced this result. */
    readonly query: string;
    /** Relevance score per matched node id. */
    readonly scores: ReadonlyMap<string, number>;
}
export interface GraphSearchIndex {
    /** Every node id covered by this index. */
    readonly nodeIds: readonly string[];
    search(query: string, options?: GraphSearchOptions): GraphSearchResult;
}
/**
 * Flattens markdown into the plain text the reference indexes: link targets are
 * dropped, emphasis markers become spaces, and runs of whitespace collapse.
 */
export declare function toGraphSearchText(value: string): string;
/**
 * Builds a reusable search index over a graph input.
 *
 * The index is deterministic for a given input: the same nodes always produce
 * the same document text, the same field weights, and therefore the same
 * relevance order.
 */
export declare function createGraphSearchIndex(input: GraphInput, options?: GraphSearchOptions): GraphSearchIndex;
/**
 * Runs a query against an existing index.
 */
export declare function searchGraph(index: GraphSearchIndex, query: string, options?: GraphSearchOptions): GraphSearchResult;
//# sourceMappingURL=search.d.ts.map