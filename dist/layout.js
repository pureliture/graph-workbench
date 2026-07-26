const DEFAULT_VIEWPORT = Object.freeze({ width: 960, height: 640 });
const MASTER_READABILITY_FLOOR = Object.freeze({ contrast: 0.72, opacity: 0.62 });
function hash(value) {
    let state = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        state ^= value.charCodeAt(index);
        state = Math.imul(state, 16777619);
    }
    return state >>> 0;
}
function unit(value) {
    return hash(value) / 0xffffffff;
}
function normalizeViewport(viewport) {
    const width = viewport?.width;
    const height = viewport?.height;
    return {
        width: Number.isFinite(width) ? Math.max(1, Math.floor(width)) : DEFAULT_VIEWPORT.width,
        height: Number.isFinite(height) ? Math.max(1, Math.floor(height)) : DEFAULT_VIEWPORT.height,
    };
}
function sphericalPosition(node, seed, index, total) {
    const hint = node.layoutHint;
    if ([hint?.x, hint?.y, hint?.z].every((axis) => Number.isFinite(axis))) {
        return { x: hint.x, y: hint.y, z: hint.z };
    }
    const radius = 90 + (unit(`${seed}:${node.id}:radius`) * 35);
    const theta = 2 * Math.PI * ((index + unit(`${seed}:${node.id}:theta`)) / Math.max(1, total));
    const phi = Math.acos(1 - (2 * ((index + 0.5) / Math.max(1, total))));
    return {
        x: radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.cos(phi),
        z: radius * Math.sin(phi) * Math.sin(theta),
    };
}
function primarySelectedNodeId(input, presentation) {
    const known = new Set(input.nodes.map((node) => node.id));
    const selected = presentation.selectedNodeIds?.find((nodeId) => known.has(nodeId));
    return selected ?? null;
}
function relationOrder(link) {
    if (link.ordinal !== undefined)
        return link.ordinal;
    return link.occurrences?.reduce((minimum, occurrence) => Math.min(minimum, occurrence.ordinal), Number.POSITIVE_INFINITY)
        ?? Number.POSITIVE_INFINITY;
}
function compareCodeUnits(left, right) {
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const difference = left.charCodeAt(index) - right.charCodeAt(index);
        if (difference !== 0)
            return difference;
    }
    return left.length - right.length;
}
function oneHopNodeIds(input, selectedNodeId) {
    const orderByNodeId = new Map();
    for (const link of input.links) {
        const neighborId = link.source === selectedNodeId
            ? link.target
            : link.target === selectedNodeId
                ? link.source
                : null;
        if (!neighborId)
            continue;
        const current = orderByNodeId.get(neighborId) ?? Number.POSITIVE_INFINITY;
        orderByNodeId.set(neighborId, Math.min(current, relationOrder(link)));
    }
    return [...orderByNodeId]
        .sort(([leftId, leftOrder], [rightId, rightOrder]) => leftOrder - rightOrder || compareCodeUnits(leftId, rightId))
        .map(([nodeId]) => nodeId);
}
function visualCue(node, selectedNodeId, neighborNodeIds) {
    const selected = node.id === selectedNodeId;
    const neighboring = neighborNodeIds.has(node.id);
    const initial = selected
        ? { contrast: 1, labelCue: "primary", opacity: 1 }
        : neighboring
            ? { contrast: 0.82, labelCue: "visible", opacity: 0.86 }
            : { contrast: 0.3, labelCue: "muted", opacity: 0.3 };
    const isMaster = node.roles?.includes("master") === true;
    return {
        contrast: isMaster ? Math.max(initial.contrast, MASTER_READABILITY_FLOOR.contrast) : initial.contrast,
        labelCue: isMaster && initial.labelCue === "muted" ? "visible" : initial.labelCue,
        opacity: isMaster ? Math.max(initial.opacity, MASTER_READABILITY_FLOOR.opacity) : initial.opacity,
        opacityFloor: isMaster ? MASTER_READABILITY_FLOOR.opacity : 0,
    };
}
function linkVisualCue(link, selectedNodeId, neighborNodeIds) {
    if (!selectedNodeId)
        return { opacity: 0.68, width: 1 };
    const selectedLink = link.source === selectedNodeId || link.target === selectedNodeId;
    const neighborhoodLink = neighborNodeIds.has(link.source) && neighborNodeIds.has(link.target);
    return selectedLink
        ? { opacity: 0.9, width: 1.65 }
        : neighborhoodLink
            ? { opacity: 0.62, width: 1.2 }
            : { opacity: 0.22, width: 0.7 };
}
function selectedLayoutPositions(input, basePositions, selectedNodeId, neighborNodeIds, viewport) {
    const positions = new Map(basePositions);
    if (!selectedNodeId)
        return positions;
    const selected = input.nodes.find((node) => node.id === selectedNodeId);
    if (!selected)
        return positions;
    if (!selected.layoutHint?.pinned)
        positions.set(selected.id, { x: 0, y: 0, z: 0 });
    const radius = Math.max(36, Math.min(96, Math.min(viewport.width, viewport.height) * 0.14));
    const offset = unit(`${input.layout.seed}:${selected.id}:neighbors`) * Math.PI * 2;
    neighborNodeIds.forEach((neighborId, index) => {
        const neighbor = input.nodes.find((node) => node.id === neighborId);
        if (!neighbor || neighbor.layoutHint?.pinned)
            return;
        const theta = offset + ((index / Math.max(1, neighborNodeIds.length)) * Math.PI * 2);
        const vertical = Math.sin(theta) * radius * 0.56;
        positions.set(neighborId, {
            x: Math.cos(theta) * radius,
            y: vertical,
            z: Math.sin(theta * 0.7 + offset) * radius * 0.4,
        });
    });
    return positions;
}
/**
 * Creates renderer-local, deterministic positions and visual cues without mutating GraphInput.
 * A selection locks only the selected node and its one-hop neighborhood to settled targets.
 */
export function createRenderGraphData(input, presentation, options = {}) {
    const viewport = normalizeViewport(options.viewport);
    const selectedNodeId = primarySelectedNodeId(input, presentation);
    const neighborNodeIds = selectedNodeId ? oneHopNodeIds(input, selectedNodeId) : [];
    const neighborNodeIdSet = new Set(neighborNodeIds);
    const basePositions = new Map(input.nodes.map((node, index) => [
        node.id,
        sphericalPosition(node, input.layout.seed, index, input.nodes.length),
    ]));
    const positions = selectedLayoutPositions(input, basePositions, selectedNodeId, neighborNodeIds, viewport);
    const settledNodeIds = new Set(selectedNodeId ? [selectedNodeId, ...neighborNodeIds] : []);
    const nodes = input.nodes.map((node) => {
        const position = positions.get(node.id);
        const settled = settledNodeIds.has(node.id);
        const pinned = node.layoutHint?.pinned === true;
        return {
            ...node,
            ...position,
            visual: visualCue(node, selectedNodeId, neighborNodeIdSet),
            ...((pinned || settled) ? { fx: position.x, fy: position.y, fz: position.z } : {}),
        };
    });
    const links = input.links.map((link) => ({
        ...link,
        visual: linkVisualCue(link, selectedNodeId, neighborNodeIdSet),
    }));
    const targetNodePositions = nodes
        .map(({ id, x, y, z }) => ({ id, x, y, z }))
        .sort((left, right) => compareCodeUnits(left.id, right.id));
    return {
        nodes,
        links,
        presentation,
        selection: {
            nodeId: selectedNodeId,
            neighborNodeIds,
            settled: true,
            targetNodePositions,
            viewport,
        },
    };
}
