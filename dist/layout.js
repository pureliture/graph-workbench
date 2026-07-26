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
export function createRenderGraphData(input, presentation) {
    const nodes = input.nodes.map((node, index) => {
        const position = sphericalPosition(node, input.layout.seed, index, input.nodes.length);
        const pinned = node.layoutHint?.pinned === true;
        return {
            ...node,
            ...position,
            ...(pinned ? { fx: position.x, fy: position.y, fz: position.z } : {}),
        };
    });
    const links = input.links.map((link) => ({ ...link }));
    return { nodes, links, presentation };
}
