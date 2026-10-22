import MiniSearch from "minisearch";
/**
 * Search mirrors the reference dictionary's search profile: a term title
 * outranks an alias, an alias outranks a usage note, and the long body text
 * only contributes when nothing more specific matched. `identity` covers the
 * graph-native coordinates (id, kind, type, section) that the reference keeps
 * in the term slug instead of a searchable field.
 */
export const GRAPH_SEARCH_FIELD_BOOSTS = Object.freeze({
    title: 3,
    aliases: 2.6,
    usage: 2,
    identity: 1.8,
    description: 1.5,
    body: 1,
    avoid: 1,
});
export const GRAPH_SEARCH_FIELDS = Object.freeze([
    "title",
    "aliases",
    "usage",
    "identity",
    "description",
    "body",
    "avoid",
]);
const DEFAULT_LIMIT = 15;
const DEFAULT_RELATIVE_SCORE_THRESHOLD = 0.3;
const DEFAULT_FUZZY = 0.2;
const ALIAS_METADATA_KEYS = ["aliases", "alias", "alsoKnownAs", "synonyms", "keywords"];
const USAGE_METADATA_KEYS = ["usage", "usageNotes", "surfaces", "surfacesAs", "example"];
const DESCRIPTION_METADATA_KEYS = ["summary", "description", "subtitle", "tagline"];
const BODY_METADATA_KEYS = ["definition", "body", "longDefinition", "bullets", "heard", "content"];
const AVOID_METADATA_KEYS = ["avoid", "warning", "caution"];
const SECTION_METADATA_KEYS = ["section", "category", "group"];
/**
 * Flattens markdown into the plain text the reference indexes: link targets are
 * dropped, emphasis markers become spaces, and runs of whitespace collapse.
 */
export function toGraphSearchText(value) {
    return value
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[#>*_`~]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function metadataValue(metadata, key) {
    if (!metadata)
        return "";
    const value = metadata[key];
    if (typeof value === "string")
        return toGraphSearchText(value);
    if (Array.isArray(value)) {
        return value
            .filter((entry) => typeof entry === "string")
            .map((entry) => toGraphSearchText(entry))
            .filter((entry) => entry.length > 0)
            .join(" ");
    }
    return "";
}
function firstMetadataText(metadata, keys) {
    for (const key of keys) {
        const text = metadataValue(metadata, key);
        if (text.length > 0)
            return text;
    }
    return "";
}
function allMetadataText(metadata, keys) {
    return keys
        .map((key) => metadataValue(metadata, key))
        .filter((text) => text.length > 0)
        .join(" ");
}
function identityText(node) {
    const section = firstMetadataText(node.metadata, SECTION_METADATA_KEYS);
    return [node.id, node.kind, node.type, section]
        .map((value) => toGraphSearchText(String(value ?? "")))
        .filter((value) => value.length > 0)
        .join(" ");
}
function defaultDocument(node) {
    return {
        aliases: allMetadataText(node.metadata, ALIAS_METADATA_KEYS),
        avoid: firstMetadataText(node.metadata, AVOID_METADATA_KEYS),
        body: allMetadataText(node.metadata, BODY_METADATA_KEYS),
        description: firstMetadataText(node.metadata, DESCRIPTION_METADATA_KEYS),
        identity: identityText(node),
        title: toGraphSearchText(node.label),
        usage: allMetadataText(node.metadata, USAGE_METADATA_KEYS),
    };
}
function resolveDocument(node, options) {
    const base = defaultDocument(node);
    const override = options.resolveDocument?.(node);
    if (!override)
        return base;
    return {
        aliases: override.aliases ?? base.aliases,
        avoid: override.avoid ?? base.avoid,
        body: override.body ?? base.body,
        description: override.description ?? base.description,
        identity: override.identity ?? base.identity,
        title: override.title ?? base.title,
        usage: override.usage ?? base.usage,
    };
}
function boundedLimit(limit) {
    if (limit === undefined)
        return DEFAULT_LIMIT;
    if (!Number.isFinite(limit))
        return DEFAULT_LIMIT;
    return Math.max(1, Math.floor(limit));
}
function boundedThreshold(threshold) {
    if (threshold === undefined)
        return DEFAULT_RELATIVE_SCORE_THRESHOLD;
    if (!Number.isFinite(threshold))
        return DEFAULT_RELATIVE_SCORE_THRESHOLD;
    return Math.max(0, Math.min(1, threshold));
}
/**
 * Builds a reusable search index over a graph input.
 *
 * The index is deterministic for a given input: the same nodes always produce
 * the same document text, the same field weights, and therefore the same
 * relevance order.
 */
export function createGraphSearchIndex(input, options = {}) {
    const documents = input.nodes.map((node) => ({ id: node.id, ...resolveDocument(node, options) }));
    const miniSearch = new MiniSearch({
        idField: "id",
        fields: [...GRAPH_SEARCH_FIELDS],
        storeFields: [],
        searchOptions: {
            boost: { ...GRAPH_SEARCH_FIELD_BOOSTS },
            combineWith: options.combineWith ?? "OR",
            fuzzy: options.fuzzy ?? DEFAULT_FUZZY,
            prefix: options.prefix ?? true,
        },
    });
    miniSearch.addAll(documents);
    const search = (query, searchOptions = {}) => {
        const trimmed = query.trim();
        const scores = new Map();
        if (trimmed.length === 0) {
            return { matches: [], nodeIds: [], query: trimmed, scores };
        }
        const raw = miniSearch.search(trimmed, {
            boost: { ...GRAPH_SEARCH_FIELD_BOOSTS },
            combineWith: searchOptions.combineWith ?? options.combineWith ?? "OR",
            fuzzy: searchOptions.fuzzy ?? options.fuzzy ?? DEFAULT_FUZZY,
            prefix: searchOptions.prefix ?? options.prefix ?? true,
        });
        const limit = boundedLimit(searchOptions.limit ?? options.limit);
        const threshold = boundedThreshold(searchOptions.relativeScoreThreshold ?? options.relativeScoreThreshold);
        const best = raw[0]?.score ?? 0;
        const floor = best * threshold;
        const matches = [];
        for (const result of raw) {
            if (matches.length >= limit)
                break;
            if (result.score < floor)
                break;
            matches.push({ nodeId: result.id, score: result.score });
            scores.set(result.id, result.score);
        }
        return {
            matches,
            nodeIds: matches.map((match) => match.nodeId),
            query: trimmed,
            scores,
        };
    };
    return {
        nodeIds: input.nodes.map((node) => node.id),
        search,
    };
}
/**
 * Runs a query against an existing index.
 */
export function searchGraph(index, query, options = {}) {
    return index.search(query, options);
}
