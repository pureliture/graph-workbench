import ForceGraph3D from "3d-force-graph";
import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, NoColorSpace, Sprite, SpriteMaterial, SphereGeometry, Vector3, } from "three";
function boundedOpacity(value, fallback) {
    if (!Number.isFinite(value))
        return fallback;
    return Math.max(0, Math.min(1, value));
}
function stableUnit(value) {
    let state = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        state ^= value.charCodeAt(index);
        state = Math.imul(state, 16777619);
    }
    return (state >>> 0) / 0xffffffff;
}
const ROUTINE_COMPONENT_KINDS = new Set([
    "agent",
    "command",
    "composite",
    "hook",
    "rule",
    "skill",
]);
// These are the semantic Three.js colors from routine-harness's Tauri graph.
// The interaction choreography is intentionally independent of the palette.
const THEME_PALETTES = {
    dark: {
        background: "#19192b",
        edge: "#aaa7c2",
        node: {
            agent: "#c4b5fd",
            command: "#22d3ee",
            composite: "#facc15",
            fallback: "#cbd5e1",
            hook: "#fb923c",
            // Keep leaves distinct from the routine-harness composite yellow.
            leaf: "#f59e0b",
            profile: "#a5b4fc",
            rule: "#4ade80",
            skill: "#60a5fa",
            workflow: "#fb7185",
        },
        outline: "#cbd5e1",
        rim: "#f8fafc",
    },
    light: {
        background: "#f6f9fe",
        edge: "#4b5a70",
        node: {
            agent: "#6d28d9",
            command: "#0e7490",
            composite: "#a16207",
            fallback: "#334155",
            hook: "#c2410c",
            // This darker amber stays separate from the composite brown.
            leaf: "#92400e",
            profile: "#4338ca",
            rule: "#15803d",
            skill: "#1d4ed8",
            workflow: "#be123c",
        },
        outline: "#334155",
        rim: "#0f172a",
    },
};
// Selection still carries the strongest readability tier. Ambient depth may
// intentionally take unrelated far labels below this former static floor.
const STATIC_LABEL_OPACITY = Object.freeze({
    far: 0.18,
    neighbor: 0.72,
    selected: 1,
});
const AMBIENT_COMMON_FLOAT = Object.freeze({ x: 7.2, y: 5.6, z: 1.8 });
const AMBIENT_NODE_BREATHING = Object.freeze({ x: 2.8, y: 3.4, z: 1.2 });
const AMBIENT_MAX_OFFSET = 12;
const AMBIENT_RADIANS_PER_SECOND = 0.42;
const FLOW_SPEED_CYCLES_PER_SECOND = 0.22;
const MAX_FLOW_PARTICLES = 24;
const AMBIENT_VISUAL_EPSILON = 0.0001;
const AMBIENT_MASTER_BODY_OPACITY_FLOOR = 0.5;
const AMBIENT_MASTER_LABEL_OPACITY_FLOOR = 0.48;
function themePalette(theme) {
    return theme === "light" ? THEME_PALETTES.light : THEME_PALETTES.dark;
}
function nodeDegree(nodeId, links) {
    return links.reduce((degree, link) => (degree + Number(link.source === nodeId) + Number(link.target === nodeId)), 0);
}
function routineComponentKind(node) {
    const candidate = node.kind.toLowerCase();
    return ROUTINE_COMPONENT_KINDS.has(candidate)
        ? candidate
        : null;
}
function resolvedNodeVisualKind(node, links) {
    // These identities must remain visible even where a profile or workflow is
    // incident to exactly one relationship.
    if (node.type === "profile")
        return "profile";
    if (node.type === "workflow" || node.kind === "workflow")
        return "workflow";
    if (nodeDegree(node.id, links) === 1)
        return "leaf";
    return routineComponentKind(node) ?? "fallback";
}
function defaultNodeColor(node, descriptor, theme = "dark", links = []) {
    return descriptor?.color ?? themePalette(theme).node[resolvedNodeVisualKind(node, links)];
}
function defaultLinkColor(descriptor) {
    return descriptor?.color ?? THEME_PALETTES.dark.edge;
}
function descriptorForNode(node, supplied) {
    return {
        ...supplied,
        opacity: Math.max(node.visual.opacityFloor, supplied?.opacity ?? node.visual.opacity),
    };
}
function descriptorForLink(link, supplied) {
    return {
        ...supplied,
        opacity: supplied?.opacity ?? link.visual.opacity,
        width: supplied?.width ?? link.visual.width,
    };
}
function nodeEmissiveIntensity(_node) {
    // Tauri relies on material roughness/metalness and scene lighting for depth
    // rather than a flat emissive glow.
    return 0;
}
function materialOpacity(material) {
    if (!material || typeof material !== "object" || !("opacity" in material))
        return null;
    const opacity = material.opacity;
    return typeof opacity === "number" && Number.isFinite(opacity) ? opacity : null;
}
function materialLineWidth(material) {
    if (!material || typeof material !== "object" || !("linewidth" in material))
        return null;
    const lineWidth = material.linewidth;
    return typeof lineWidth === "number" && Number.isFinite(lineWidth) ? lineWidth : null;
}
function materialColor(material) {
    if (!material || typeof material !== "object" || !("color" in material))
        return null;
    return material.color instanceof Color ? `#${material.color.getHexString()}` : null;
}
function materialDepthWrite(material) {
    if (!material || typeof material !== "object" || !("depthWrite" in material))
        return null;
    return typeof material.depthWrite === "boolean" ? material.depthWrite : null;
}
function materialsForObject(object) {
    const material = object.material;
    return Array.isArray(material) ? material : [material];
}
function materialOpacities(object) {
    return materialsForObject(object).flatMap((candidate) => {
        const opacity = materialOpacity(candidate);
        return opacity === null ? [] : [opacity];
    });
}
function materialLineWidths(object) {
    return materialsForObject(object).flatMap((candidate) => {
        const width = materialLineWidth(candidate);
        return width === null ? [] : [width];
    });
}
function isObjectAttachedToScene(object, scene) {
    let current = object;
    while (current) {
        if (current === scene)
            return true;
        current = current.parent;
    }
    return false;
}
function isObjectEffectivelyVisible(object) {
    let current = object;
    while (current) {
        if (!current.visible)
            return false;
        current = current.parent;
    }
    return true;
}
function visibleMaterialOpacities(object) {
    const opacities = [];
    object.traverse((candidate) => {
        if (!isObjectEffectivelyVisible(candidate))
            return;
        opacities.push(...materialOpacities(candidate));
    });
    return opacities;
}
function visibleMaterialLineWidths(object) {
    const widths = [];
    object.traverse((candidate) => {
        if (!isObjectEffectivelyVisible(candidate))
            return;
        widths.push(...materialLineWidths(candidate));
    });
    return widths;
}
function objectTransformObservation(id, object) {
    if (!object)
        return { position: null, scale: null };
    return {
        position: { id, x: object.position.x, y: object.position.y, z: object.position.z },
        scale: { id, x: object.scale.x, y: object.scale.y, z: object.scale.z },
    };
}
function nodeLabelObservation(id, label, scene) {
    const material = label ? materialsForObject(label)[0] : undefined;
    const alphaMasked = material && typeof material === "object" && "alphaMap" in material
        ? material.alphaMap !== null
        : null;
    const transparent = material && typeof material === "object" && "transparent" in material
        && typeof material.transparent === "boolean"
        ? material.transparent
        : null;
    return {
        ...observeGraphObject(id, label ?? undefined, scene),
        ...objectTransformObservation(id, label ?? undefined),
        alphaMasked,
        transparent,
    };
}
function updateObjectMaterials(object, update) {
    object.traverse((candidate) => {
        materialsForObject(candidate).forEach((material) => {
            if (!material || typeof material !== "object")
                return;
            if ("opacity" in material && typeof material.opacity === "number") {
                if (Math.abs(material.opacity - update.opacity) > AMBIENT_VISUAL_EPSILON) {
                    material.opacity = update.opacity;
                }
            }
            if ("transparent" in material && typeof material.transparent === "boolean") {
                // Sprite labels carry their glyph mask in texture alpha. They must
                // remain transparent even at opacity 1 or WebGL treats the empty canvas
                // pixels as an opaque black rectangle.
                const needsTransparency = ("isSpriteMaterial" in material && material.isSpriteMaterial === true)
                    || update.opacity < 1;
                // Ambient depth can make a previously opaque default material fade on
                // the next RAF. Keep blending enabled once it has been selected rather
                // than repeatedly recompiling shader variants when a transaction later
                // returns it to opacity 1.
                if (needsTransparency && !material.transparent) {
                    material.transparent = true;
                    if ("needsUpdate" in material)
                        material.needsUpdate = true;
                }
            }
            if (update.emissiveIntensity !== undefined
                && "emissiveIntensity" in material
                && typeof material.emissiveIntensity === "number") {
                if (Math.abs(material.emissiveIntensity - update.emissiveIntensity) > AMBIENT_VISUAL_EPSILON) {
                    material.emissiveIntensity = update.emissiveIntensity;
                }
            }
            if (update.width !== undefined && "linewidth" in material && typeof material.linewidth === "number") {
                if (Math.abs(material.linewidth - update.width) > AMBIENT_VISUAL_EPSILON) {
                    material.linewidth = update.width;
                }
            }
        });
    });
}
function observeGraphObject(id, object, scene) {
    if (!object) {
        return {
            id,
            minimumVisibleMaterialOpacity: null,
            objectTracked: false,
            objectVisible: null,
            sceneAttached: false,
            visibleMaterialLineWidths: [],
            visibleMaterialOpacities: [],
        };
    }
    const sceneAttached = isObjectAttachedToScene(object, scene);
    const objectVisible = sceneAttached && isObjectEffectivelyVisible(object);
    const opacities = objectVisible ? visibleMaterialOpacities(object) : [];
    const widths = objectVisible ? visibleMaterialLineWidths(object) : [];
    return {
        id,
        minimumVisibleMaterialOpacity: opacities.length > 0 ? Math.min(...opacities) : null,
        objectTracked: true,
        objectVisible,
        sceneAttached,
        visibleMaterialLineWidths: widths,
        visibleMaterialOpacities: opacities,
    };
}
function createNodeLabelSprite(label, radius, opacity) {
    const text = label.trim() || "Untitled";
    const spriteMaterial = new SpriteMaterial({
        color: THEME_PALETTES.dark.outline,
        depthTest: true,
        depthWrite: false,
        alphaTest: 0.001,
        opacity,
        sizeAttenuation: true,
        // Canvas glyph alpha is independent from the node's semantic opacity.
        // Keep blending on at opacity 1 so transparent canvas pixels never become
        // a dark rectangular backing behind selected labels.
        transparent: true,
    });
    if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (context) {
            const fontSize = 56;
            context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
            const horizontalPadding = 34;
            canvas.width = Math.ceil(context.measureText(text).width + (horizontalPadding * 2));
            canvas.height = 96;
            context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
            context.fillStyle = "#ffffff";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
            const texture = new CanvasTexture(canvas);
            // Treat the canvas as a glyph mask. Using alphaMap, rather than a color
            // map with transparent pixels, prevents opaque dark canvas rectangles
            // when a selected label reaches material opacity 1.
            texture.colorSpace = NoColorSpace;
            spriteMaterial.alphaMap = texture;
            // Three.js materials do not dispose maps they reference. The label is
            // recreated when graphData changes, so retain this exact texture in the
            // material lifecycle and release it once when the SpriteMaterial goes
            // away. The guard matters because Material.dispose() dispatches on every
            // call rather than making disposal idempotent itself.
            let textureDisposed = false;
            spriteMaterial.addEventListener("dispose", () => {
                if (textureDisposed)
                    return;
                textureDisposed = true;
                texture.dispose();
            });
            spriteMaterial.needsUpdate = true;
        }
    }
    const sprite = new Sprite(spriteMaterial);
    sprite.center.set(0.5, 0);
    sprite.position.set(0, radius + 3.8, 0);
    sprite.scale.set(Math.max(17, Math.min(58, text.length * 3.05)), radius >= 7 ? 10 : 8, 1);
    sprite.userData.graphBaseLabelScale = { x: sprite.scale.x, y: sprite.scale.y, z: sprite.scale.z };
    sprite.renderOrder = 42;
    sprite.userData.graphVisualRole = "node-label";
    return sprite;
}
export function createDefaultGraphNodeObject(node, descriptor) {
    const color = new Color(defaultNodeColor(node, descriptor));
    const opacity = boundedOpacity(descriptor?.opacity, 1);
    const group = new Group();
    const relation = node.type === "relation";
    const radius = relation ? 7.5 : 3;
    const bodyMaterial = new MeshStandardMaterial({
        color,
        emissive: "#000000",
        emissiveIntensity: nodeEmissiveIntensity(node),
        metalness: relation ? 0.36 : 0.22,
        opacity,
        roughness: relation ? 0.4 : 0.58,
        transparent: opacity < 1,
    });
    const geometry = new SphereGeometry(radius, relation ? 32 : 24, relation ? 20 : 16);
    const body = new Mesh(geometry, bodyMaterial);
    body.userData.graphVisualRole = "body";
    group.add(body);
    // Keep the reference's soft, filled node masses. Selection is carried by
    // scale, the label and edge hierarchy instead of a permanent outline shell
    // or a bright halo around the focused node.
    group.add(createNodeLabelSprite(descriptor?.label ?? node.label, radius, opacity));
    group.userData.graphNodeId = node.id;
    group.userData.graphDefaultNodeObject = true;
    return group;
}
export function createDefaultGraphLinkObject(link, descriptor) {
    const geometry = new BufferGeometry();
    // A restrained three-point path is enough to make overlapping relationships
    // readable in depth without turning the graph into a decorative spline map.
    geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    const opacity = boundedOpacity(descriptor?.opacity, 0.68);
    const material = new LineBasicMaterial({
        color: defaultLinkColor(descriptor),
        depthWrite: false,
        linewidth: descriptor?.width,
        opacity,
        transparent: opacity < 1,
    });
    const line = new Line(geometry, material);
    line.userData.graphLinkId = link.id;
    line.userData.graphDefaultLinkObject = true;
    line.userData.graphCurveBendDirection = stableUnit(`${link.id}:curve`) >= 0.5 ? 1 : -1;
    return line;
}
function writeThreePointCurve(positions, bendDirection, start, end) {
    positions.setXYZ(0, start.x, start.y, start.z);
    if (positions.count < 3) {
        positions.setXYZ(1, end.x, end.y, end.z);
        positions.needsUpdate = true;
        return;
    }
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const planarDistance = Math.hypot(deltaX, deltaY);
    const curve = Math.max(3, Math.min(18, planarDistance * 0.12));
    const directionX = planarDistance > 0 ? deltaX / planarDistance : 1;
    const directionY = planarDistance > 0 ? deltaY / planarDistance : 0;
    positions.setXYZ(1, ((start.x + end.x) / 2) + (-directionY * curve * bendDirection), ((start.y + end.y) / 2) + (directionX * curve * bendDirection), ((start.z + end.z) / 2) + (curve * 0.32 * bendDirection));
    positions.setXYZ(2, end.x, end.y, end.z);
    positions.needsUpdate = true;
}
function pointOnThreePointCurve(positions, progress, output) {
    const t = Math.max(0, Math.min(1, progress));
    const inverse = 1 - t;
    output.x = (inverse * inverse * positions.getX(0)) + (2 * inverse * t * positions.getX(1)) + (t * t * positions.getX(2));
    output.y = (inverse * inverse * positions.getY(0)) + (2 * inverse * t * positions.getY(1)) + (t * t * positions.getY(2));
    output.z = (inverse * inverse * positions.getZ(0)) + (2 * inverse * t * positions.getZ(1)) + (t * t * positions.getZ(2));
}
function updateLinkObject(object, start, end) {
    if (!(object instanceof Line))
        return false;
    if (object.userData.graphDefaultLinkObject !== true)
        return false;
    const positions = object.geometry.getAttribute("position");
    if (!positions || positions.itemSize !== 3 || positions.count < 2)
        return false;
    const bendDirection = typeof object.userData.graphCurveBendDirection === "number"
        ? object.userData.graphCurveBendDirection
        : 1;
    writeThreePointCurve(positions, bendDirection, start, end);
    object.geometry.computeBoundingSphere();
    return true;
}
function dimensions(container, width, height) {
    return {
        width: Math.max(1, Math.floor(width ?? container.clientWidth ?? 1)),
        height: Math.max(1, Math.floor(height ?? container.clientHeight ?? 1)),
    };
}
function isCameraInteractionControls(controls) {
    return typeof controls === "object"
        && controls !== null
        && "addEventListener" in controls
        && typeof controls.addEventListener === "function"
        && "removeEventListener" in controls
        && typeof controls.removeEventListener === "function";
}
function cameraFrameScheduler(container) {
    const view = container.ownerDocument?.defaultView;
    const requestAnimationFrame = view?.requestAnimationFrame ?? globalThis.requestAnimationFrame;
    const cancelAnimationFrame = view?.cancelAnimationFrame ?? globalThis.cancelAnimationFrame;
    if (typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function") {
        return {
            cancel: cancelAnimationFrame.bind(view ?? globalThis),
            request: requestAnimationFrame.bind(view ?? globalThis),
        };
    }
    return {
        cancel(frameId) {
            clearTimeout(frameId);
        },
        request(callback) {
            return setTimeout(() => callback(Date.now()), 16);
        },
    };
}
function interpolate(start, end, progress) {
    return start + ((end - start) * progress);
}
function easeInOutCubic(progress) {
    const bounded = Math.min(1, Math.max(0, progress));
    return bounded < 0.5
        ? 4 * bounded * bounded * bounded
        : 1 - (((-2 * bounded) + 2) ** 3) / 2;
}
function interpolatePose(start, end, progress) {
    const eased = easeInOutCubic(progress);
    return {
        position: {
            x: interpolate(start.position.x, end.position.x, eased),
            y: interpolate(start.position.y, end.position.y, eased),
            z: interpolate(start.position.z, end.position.z, eased),
        },
        lookAt: {
            x: interpolate(start.lookAt.x, end.lookAt.x, eased),
            y: interpolate(start.lookAt.y, end.lookAt.y, eased),
            z: interpolate(start.lookAt.z, end.lookAt.z, eased),
        },
    };
}
function boundedPerspectiveProjection(camera, viewport) {
    const candidate = camera;
    const suppliedFov = typeof candidate?.fov === "number" ? candidate.fov : Number.NaN;
    return {
        // ResizeObserver updates the workbench viewport before ThreeForceGraph
        // necessarily updates `camera.aspect` on its next render tick. Framing
        // must use that authoritative viewport now, otherwise a stale desktop
        // aspect produces a too-wide FOV and crops the selected mobile cloud.
        aspect: Number.isFinite(viewport.width / viewport.height) && viewport.width > 0 && viewport.height > 0
            ? viewport.width / viewport.height
            : 1,
        fovDegrees: Number.isFinite(suppliedFov)
            ? Math.max(20, Math.min(100, suppliedFov))
            : 50,
    };
}
function contextCameraPose(points, current, projection, viewport, focalPoint = null) {
    if (points.length === 0)
        return null;
    const minimum = { x: Infinity, y: Infinity, z: Infinity };
    const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
    points.forEach((point) => {
        minimum.x = Math.min(minimum.x, point.x - point.radius);
        minimum.y = Math.min(minimum.y, point.y - point.radius);
        minimum.z = Math.min(minimum.z, point.z - point.radius);
        maximum.x = Math.max(maximum.x, point.x + point.radius);
        maximum.y = Math.max(maximum.y, point.y + point.radius);
        maximum.z = Math.max(maximum.z, point.z + point.radius);
    });
    const boundsCenter = {
        x: (minimum.x + maximum.x) / 2,
        y: (minimum.y + maximum.y) / 2,
        z: (minimum.z + maximum.z) / 2,
    };
    // Keep the focus close to the visual centre while sizing from the whole
    // cloud. A small pull toward the bounds centre prevents cropped far nodes.
    const center = focalPoint
        ? {
            x: focalPoint.x + ((boundsCenter.x - focalPoint.x) * 0.18),
            y: focalPoint.y + ((boundsCenter.y - focalPoint.y) * 0.18),
            z: focalPoint.z + ((boundsCenter.z - focalPoint.z) * 0.18),
        }
        : boundsCenter;
    const directionLength = Math.hypot(current.position.x - center.x, current.position.y - center.y, current.position.z - center.z);
    const direction = directionLength > 0
        ? {
            x: (current.position.x - center.x) / directionLength,
            y: (current.position.y - center.y) / directionLength,
            z: (current.position.z - center.z) / directionLength,
        }
        : { x: 0, y: 0, z: 1 };
    const referenceUp = Math.abs(direction.y) > 0.94
        ? { x: 0, y: 0, z: 1 }
        : { x: 0, y: 1, z: 0 };
    const rightLength = Math.hypot((referenceUp.y * direction.z) - (referenceUp.z * direction.y), (referenceUp.z * direction.x) - (referenceUp.x * direction.z), (referenceUp.x * direction.y) - (referenceUp.y * direction.x));
    const right = {
        x: ((referenceUp.y * direction.z) - (referenceUp.z * direction.y)) / rightLength,
        y: ((referenceUp.z * direction.x) - (referenceUp.x * direction.z)) / rightLength,
        z: ((referenceUp.x * direction.y) - (referenceUp.y * direction.x)) / rightLength,
    };
    const up = {
        x: (direction.y * right.z) - (direction.z * right.y),
        y: (direction.z * right.x) - (direction.x * right.z),
        z: (direction.x * right.y) - (direction.y * right.x),
    };
    const verticalHalfFov = (projection.fovDegrees * Math.PI) / 360;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * projection.aspect);
    const paddingPixels = Math.min(36, Math.max(16, Math.min(viewport.width, viewport.height) * 0.035));
    const usableWidth = Math.max(0.5, (viewport.width - (paddingPixels * 2)) / viewport.width);
    const usableHeight = Math.max(0.5, (viewport.height - (paddingPixels * 2)) / viewport.height);
    const paddedHorizontalHalfFov = Math.atan(Math.tan(horizontalHalfFov) * usableWidth);
    const paddedVerticalHalfFov = Math.atan(Math.tan(verticalHalfFov) * usableHeight);
    // A point's projected bounds widen as it approaches the camera. Sizing only
    // from its view-plane radius (and then tightening it with a presentation
    // multiplier) can crop nearer, off-axis nodes. Fit every node sphere against
    // its nearest possible depth instead: `d - depth - radius`. This keeps the
    // entire cloud within the padded desktop and mobile viewports while retaining
    // the focal-point bias above.
    const distance = Math.max(80, ...points.map((point) => {
        const delta = { x: point.x - center.x, y: point.y - center.y, z: point.z - center.z };
        const depth = (delta.x * direction.x) + (delta.y * direction.y) + (delta.z * direction.z);
        const horizontal = Math.abs((delta.x * right.x) + (delta.y * right.y) + (delta.z * right.z));
        const vertical = Math.abs((delta.x * up.x) + (delta.y * up.y) + (delta.z * up.z));
        const horizontalDistance = (horizontal + point.radius) / Math.tan(paddedHorizontalHalfFov);
        const verticalDistance = (vertical + point.radius) / Math.tan(paddedVerticalHalfFov);
        return depth + point.radius + Math.max(horizontalDistance, verticalDistance);
    }));
    return {
        position: {
            x: center.x + (direction.x * distance),
            y: center.y + (direction.y * distance),
            z: center.z + (direction.z * distance),
        },
        lookAt: center,
    };
}
function isCoordinates(value) {
    if (!value)
        return false;
    return [value.x, value.y, value.z].every((axis) => Number.isFinite(axis));
}
function mutableCoordinates(node) {
    return node;
}
function nodePosition(node) {
    return isCoordinates(node) ? { x: node.x, y: node.y, z: node.z } : null;
}
function renderDataRevision(data) {
    return JSON.stringify({
        links: data.links.map(({ visual: _visual, ...link }) => link),
        nodes: data.nodes.map(({ fx: _fx, fy: _fy, fz: _fz, visual: _visual, x: _x, y: _y, z: _z, ...node }) => node),
        presentation: data.presentation,
        selectionNodeId: data.selection.nodeId,
    });
}
function firstMaterialOpacity(object, fallback) {
    if (!object)
        return fallback;
    const opacities = visibleMaterialOpacities(object);
    return opacities.length > 0 ? opacities[0] : fallback;
}
function firstMaterialLineWidth(object, fallback) {
    if (!object)
        return fallback;
    const widths = visibleMaterialLineWidths(object);
    return widths.length > 0 ? widths[0] : fallback;
}
function graphChildWithRole(object, role) {
    let found = null;
    object.traverse((candidate) => {
        if (!found && candidate.userData.graphVisualRole === role)
            found = candidate;
    });
    return found;
}
function sceneVisualForNode(node, data, descriptor) {
    const baseOpacity = boundedOpacity(descriptor.opacity, node.visual.opacity);
    const isSelected = data.selection.nodeId === node.id;
    const isNeighbor = data.selection.neighborNodeIds.includes(node.id);
    // The initial camera faces the positive Z direction. A stable world-space
    // depth cue therefore gives receding nodes smaller, quieter silhouettes even
    // before the user starts orbiting; selection keeps the active node crisp.
    const depthProgress = Math.max(0, Math.min(1, (node.z + 132) / 264));
    const depthScale = 0.72 + (depthProgress * 0.28);
    const depthOpacity = 0.7 + (depthProgress * 0.3);
    const viewportScale = Math.max(1, Math.min(1.3, 480 / Math.max(1, Math.min(data.selection.viewport.width, data.selection.viewport.height))));
    const labelOpacity = data.selection.nodeId === null
        ? Math.max(STATIC_LABEL_OPACITY.far, baseOpacity * depthOpacity)
        : isSelected
            ? STATIC_LABEL_OPACITY.selected
            : isNeighbor
                // Preserve some near-depth distinction without letting a neighbor
                // equal the selected label or fall into the far-label readability tier.
                ? Math.max(STATIC_LABEL_OPACITY.neighbor, Math.min(0.9, baseOpacity * depthOpacity))
                : STATIC_LABEL_OPACITY.far;
    return {
        // Bodies can recede with depth, while node names retain a high-contrast
        // floor. Counteracting the group depth scale and boosting narrow viewports
        // makes distant labels readable without reviving outlines or focus rings.
        labelVisible: true,
        labelOpacity,
        labelScale: (isSelected ? 1 : 1 / depthScale) * viewportScale,
        opacity: Math.max(node.visual.opacityFloor, isSelected ? baseOpacity : baseOpacity * depthOpacity),
        scale: isSelected ? 1.22 : depthScale,
    };
}
function setObjectMaterialColor(object, color) {
    if (!object)
        return;
    materialsForObject(object).forEach((material) => {
        if (!material || typeof material !== "object" || !("color" in material))
            return;
        const candidate = material.color;
        if (candidate instanceof Color)
            candidate.set(color);
    });
}
function objectMaterialColor(object) {
    if (!object)
        return null;
    return materialsForObject(object)
        .map((material) => materialColor(material))
        .find((color) => color !== null)
        ?? null;
}
function setObjectMaterialOpacity(object, opacity) {
    if (!object)
        return;
    updateObjectMaterials(object, { opacity });
}
function isMalformedVendorDragRelease(event, ownerDocument) {
    // 3d-force-graph 1.80.0 emits this coordinate-less event after node drag.
    return event.target === ownerDocument
        && event.isTrusted === false
        && event.pointerType === "touch"
        && event.pointerId === 0;
}
export function createThreeForceGraphRenderer({ callbacks, container, nodeObjectFactory = createDefaultGraphNodeObject, linkObjectFactory = createDefaultGraphLinkObject, }) {
    const TypedForceGraph3D = ForceGraph3D;
    const graph = new TypedForceGraph3D(container, {
        controlType: "orbit",
    });
    let currentData = null;
    let currentPresentation = {};
    let destroyed = false;
    const renderedLinkObjects = new Map();
    const renderedNodeObjects = new Map();
    const frameScheduler = cameraFrameScheduler(container);
    let transitionGeneration = 0;
    let motionFrame = null;
    let activeTransition = null;
    let currentDataRevision = null;
    let deferredDataDuringTransition = null;
    let initialFitPending = true;
    let pendingSceneTransition = null;
    let transitionTick = null;
    let hoverNodeId = null;
    let ambientElapsedMs = 0;
    let ambientFrameCount = 0;
    let ambientLastTimestamp = null;
    let ambientPaused = false;
    const ambientNodes = new Map();
    const ambientLinks = new Map();
    const particleGroup = new Group();
    particleGroup.name = "graph-workbench-flow-particles";
    const particleGeometry = new SphereGeometry(0.95, 10, 8);
    const particleMaterial = new MeshBasicMaterial({
        color: THEME_PALETTES.dark.rim,
        depthWrite: false,
        opacity: 0.86,
        transparent: true,
    });
    const projectedWorldPosition = new Vector3();
    const linkStartLocalPosition = new Vector3();
    const linkEndLocalPosition = new Vector3();
    const curvePointLocalPosition = new Vector3();
    const curvePointWorldPosition = new Vector3();
    const particleLocalPosition = new Vector3();
    const lineEndpointWorldPosition = new Vector3();
    const flowParticles = Array.from({ length: MAX_FLOW_PARTICLES }, (_unused, index) => {
        const object = new Mesh(particleGeometry, particleMaterial);
        object.visible = false;
        object.renderOrder = 44;
        particleGroup.add(object);
        return {
            id: `flow:${index}`,
            linkId: null,
            object,
            phase: 0,
            x: 0,
            y: 0,
            z: 0,
        };
    });
    let particleResourcesDisposed = false;
    let transitionObservation = {
        active: false,
        durationMs: 0,
        generation: 0,
        nodePositions: [],
        progress: 1,
        reducedMotion: false,
    };
    const ownerDocument = graph.renderer().domElement.ownerDocument;
    const controls = graph.controls();
    const cameraInteractionControls = isCameraInteractionControls(controls) ? controls : null;
    let cameraControlInteractionActive = false;
    const suppressMalformedVendorDragRelease = (event) => {
        if (isMalformedVendorDragRelease(event, ownerDocument)) {
            event.stopImmediatePropagation();
        }
    };
    ownerDocument.addEventListener("pointerup", suppressMalformedVendorDragRelease, true);
    const nodeDescriptor = (node) => descriptorForNode(node, currentPresentation.nodeDescriptors?.[node.id]);
    const linkDescriptor = (link) => descriptorForLink(link, currentPresentation.linkDescriptors?.[link.id]);
    graph
        .backgroundColor("#08111f")
        .showNavInfo(false)
        .nodeId("id")
        .linkSource("source")
        .linkTarget("target")
        // Static Sprite labels are the scene's source of truth. Disabling the
        // vendor HTML tooltip avoids an opaque duplicate over the camera-facing
        // label while keeping the host callback seam unchanged.
        .nodeLabel(() => "")
        .nodePositionUpdate((object, coordinates, node) => {
        if (object.userData.graphDefaultNodeObject !== true)
            return false;
        const state = ambientNodes.get(node.id);
        if (!state) {
            object.position.set(coordinates.x, coordinates.y, coordinates.z);
            return true;
        }
        // ThreeForceGraph rewrites node Object3D positions on every render tick.
        // Own that narrow hook for defaults so the visible raycast object and
        // graph2ScreenCoords use the same ambient transform.
        object.position.set(state.renderedX, state.renderedY, state.renderedZ);
        return true;
    })
        .nodeThreeObject((node) => {
        const object = nodeObjectFactory(node, nodeDescriptor(node));
        renderedNodeObjects.set(node.id, object);
        // ThreeForceGraph may instantiate this object after the synchronous
        // setData palette pass. Resolve degree-based colors once it is attached
        // so a default leaf never remains at the factory's fallback color.
        applyNodePalette(node);
        const ambientState = ambientNodes.get(node.id);
        if (ambientState)
            refreshAmbientNodeObject(ambientState, object);
        return object;
    })
        .linkThreeObject((link) => {
        const object = linkObjectFactory(link, linkDescriptor(link));
        renderedLinkObjects.set(link.id, object);
        const ambientState = ambientLinks.get(link.id);
        if (ambientState)
            refreshAmbientLinkObject(ambientState, object);
        return object;
    })
        .linkPositionUpdate((object, coordinates, link) => updateLinkObjectForRenderedNodes(object, link, coordinates.start, coordinates.end))
        .onNodeClick((node) => callbacks.onNodeClick(node.id))
        .onNodeHover((node) => {
        hoverNodeId = node?.id ?? null;
        if (currentData)
            applyFinalVisuals(currentData);
        applyAmbientVisuals();
        ensureMotionFrame();
        callbacks.onNodeHover(hoverNodeId);
    })
        // 3d-force-graph uses separate DragControls for nodes, so OrbitControls'
        // events do not cover this path.
        .onNodeDrag(() => {
        pendingSceneTransition = null;
        cancelCameraTransition();
    })
        .onBackgroundClick(() => callbacks.onBackgroundClick());
    function setNodePosition(node, position, lock) {
        const mutable = mutableCoordinates(node);
        mutable.x = position.x;
        mutable.y = position.y;
        mutable.z = position.z;
        mutable.vx = 0;
        mutable.vy = 0;
        mutable.vz = 0;
        if (lock) {
            mutable.fx = position.x;
            mutable.fy = position.y;
            mutable.fz = position.z;
            return;
        }
        delete mutable.fx;
        delete mutable.fy;
        delete mutable.fz;
    }
    function applyNodePalette(node) {
        const object = renderedNodeObjects.get(node.id);
        if (!object || object.userData.graphDefaultNodeObject !== true)
            return;
        const palette = themePalette(currentPresentation.theme);
        const descriptor = nodeDescriptor(node);
        setObjectMaterialColor(graphChildWithRole(object, "body"), defaultNodeColor(node, descriptor, currentPresentation.theme, currentData?.links ?? []));
        setObjectMaterialColor(graphChildWithRole(object, "outline"), palette.outline);
        setObjectMaterialColor(graphChildWithRole(object, "focus-rim"), palette.rim);
        setObjectMaterialColor(graphChildWithRole(object, "node-label"), palette.outline);
    }
    function applyLinkPalette(link) {
        const object = renderedLinkObjects.get(link.id);
        if (!object || object.userData.graphLinkId !== link.id)
            return;
        setObjectMaterialColor(object, linkDescriptor(link).color ?? themePalette(currentPresentation.theme).edge);
    }
    function staticLabelBaseScale(label) {
        const stored = label.userData.graphBaseLabelScale;
        if (stored && [stored.x, stored.y, stored.z].every((value) => typeof value === "number" && Number.isFinite(value))) {
            return { x: stored.x, y: stored.y, z: stored.z };
        }
        const base = { x: label.scale.x, y: label.scale.y, z: label.scale.z };
        label.userData.graphBaseLabelScale = base;
        return base;
    }
    function staticLabelScaleMultiplier(label) {
        if (!label)
            return 1;
        const base = staticLabelBaseScale(label);
        return base.x > 0 ? label.scale.x / base.x : 1;
    }
    function cacheAmbientDefaultNodeVisual(state) {
        const object = state.object;
        if (state.defaultVisual || object?.userData.graphDefaultNodeObject !== true)
            return;
        const body = graphChildWithRole(object, "body");
        const label = graphChildWithRole(object, "node-label");
        if (!(body instanceof Mesh) || !(body.material instanceof MeshStandardMaterial))
            return;
        if (!(label instanceof Sprite) || !(label.material instanceof SpriteMaterial))
            return;
        state.defaultVisual = {
            baseLabelScale: staticLabelBaseScale(label),
            bodyMaterial: body.material,
            label,
            labelMaterial: label.material,
            lastBodyOpacity: Number.NaN,
            lastLabelOpacity: Number.NaN,
            lastLabelScale: Number.NaN,
            lastLabelVisible: null,
            lastScale: Number.NaN,
        };
    }
    function cacheAmbientDefaultLinkMaterial(state) {
        if (state.material || !state.object || !(state.object.material instanceof LineBasicMaterial))
            return;
        state.material = state.object.material;
        state.lastOpacity = Number.NaN;
        state.lastWidth = Number.NaN;
    }
    function refreshAmbientNodeObject(state, object) {
        if (state.object === object)
            return;
        state.object = object;
        state.defaultVisual = null;
        cacheAmbientDefaultNodeVisual(state);
    }
    function refreshAmbientLinkObject(state, object) {
        const nextObject = object instanceof Line && object.userData.graphDefaultLinkObject === true
            ? object
            : null;
        if (state.object === nextObject)
            return;
        state.object = nextObject;
        state.material = null;
        state.lastOpacity = Number.NaN;
        state.lastWidth = Number.NaN;
        cacheAmbientDefaultLinkMaterial(state);
    }
    function invalidateAmbientDefaultNodeVisual(id) {
        const visual = ambientNodes.get(id)?.defaultVisual;
        if (!visual)
            return;
        visual.lastBodyOpacity = Number.NaN;
        visual.lastLabelOpacity = Number.NaN;
        visual.lastLabelScale = Number.NaN;
        visual.lastLabelVisible = null;
        visual.lastScale = Number.NaN;
    }
    function invalidateAmbientDefaultLinkVisual(id) {
        const state = ambientLinks.get(id);
        if (!state)
            return;
        state.lastOpacity = Number.NaN;
        state.lastWidth = Number.NaN;
    }
    function changedAmbientVisualValue(previous, next) {
        return !Number.isFinite(previous) || Math.abs(previous - next) > AMBIENT_VISUAL_EPSILON;
    }
    function ensureAmbientTransparency(material, transparent) {
        if (material.transparent === transparent)
            return;
        material.transparent = transparent;
        // This is a shader flag transition, never part of the stable RAF path.
        material.needsUpdate = true;
    }
    function applyAmbientDefaultNodeVisual(state, opacity, scale, labelVisible, labelOpacity, labelScale) {
        cacheAmbientDefaultNodeVisual(state);
        const visual = state.defaultVisual;
        const object = state.object;
        if (!visual || !object)
            return;
        if (changedAmbientVisualValue(visual.lastBodyOpacity, opacity)) {
            visual.bodyMaterial.opacity = opacity;
            visual.lastBodyOpacity = opacity;
        }
        ensureAmbientTransparency(visual.bodyMaterial, true);
        if (changedAmbientVisualValue(visual.lastScale, scale)) {
            object.scale.setScalar(scale);
            visual.lastScale = scale;
        }
        if (visual.lastLabelVisible !== labelVisible) {
            visual.label.visible = labelVisible;
            visual.lastLabelVisible = labelVisible;
        }
        if (changedAmbientVisualValue(visual.lastLabelOpacity, labelOpacity)) {
            visual.labelMaterial.opacity = labelOpacity;
            visual.lastLabelOpacity = labelOpacity;
        }
        if (changedAmbientVisualValue(visual.lastLabelScale, labelScale)) {
            visual.label.scale.set(visual.baseLabelScale.x * labelScale, visual.baseLabelScale.y * labelScale, visual.baseLabelScale.z * labelScale);
            visual.lastLabelScale = labelScale;
        }
    }
    function applyAmbientDefaultLinkVisual(state, opacity, width) {
        cacheAmbientDefaultLinkMaterial(state);
        const material = state.material;
        if (!material)
            return;
        if (changedAmbientVisualValue(state.lastOpacity, opacity)) {
            material.opacity = opacity;
            state.lastOpacity = opacity;
        }
        ensureAmbientTransparency(material, true);
        if (changedAmbientVisualValue(state.lastWidth, width)) {
            material.linewidth = width;
            state.lastWidth = width;
        }
    }
    function applyNodeVisual(node, opacity, scale, rimOpacity, labelVisible, labelOpacity, labelScale) {
        const object = renderedNodeObjects.get(node.id);
        if (!object)
            return;
        updateObjectMaterials(object, {
            emissiveIntensity: nodeEmissiveIntensity(node),
            opacity,
        });
        if (object.userData.graphDefaultNodeObject === true) {
            object.scale.setScalar(scale);
        }
        const rim = graphChildWithRole(object, "focus-rim");
        if (rim) {
            rim.visible = rimOpacity > 0;
            setObjectMaterialOpacity(rim, rimOpacity);
        }
        const label = graphChildWithRole(object, "node-label");
        if (label) {
            label.visible = labelVisible;
            setObjectMaterialOpacity(label, labelOpacity);
            const base = staticLabelBaseScale(label);
            label.scale.set(base.x * labelScale, base.y * labelScale, base.z * labelScale);
        }
        invalidateAmbientDefaultNodeVisual(node.id);
    }
    function applyLinkVisual(link, opacity, width) {
        const object = renderedLinkObjects.get(link.id);
        if (!object)
            return;
        updateObjectMaterials(object, { opacity, width });
        invalidateAmbientDefaultLinkVisual(link.id);
    }
    function ambientFocusNodeId() {
        return currentData?.selection.nodeId ?? hoverNodeId ?? currentPresentation.focusNodeId ?? null;
    }
    function ambientMotionEnabled() {
        return currentData?.presentation.ambientMotion !== false
            && currentData?.presentation.reducedMotion !== true
            && !ambientPaused
            && ambientNodes.size > 0;
    }
    function rebuildAmbientState() {
        ambientNodes.clear();
        ambientLinks.clear();
        if (!currentData)
            return;
        const liveById = new Map(graph.graphData().nodes.map((node) => [node.id, node]));
        for (const node of currentData.nodes) {
            const live = liveById.get(node.id) ?? node;
            const position = nodePosition(live) ?? nodePosition(node);
            const object = renderedNodeObjects.get(node.id) ?? null;
            const descriptor = nodeDescriptor(node);
            const state = {
                baseOpacity: boundedOpacity(descriptor.opacity, node.visual.opacity),
                id: node.id,
                // RenderGraphData's visual floor is the renderer contract. It stays
                // available even when a host serializes or projects away GraphNode
                // source roles before calling setData.
                isMaster: node.visual.opacityFloor > 0,
                node: live,
                object,
                defaultVisual: null,
                breathingPhase: stableUnit(`${node.id}:phase`) * Math.PI * 2,
                breathingRate: 1.58 + (stableUnit(`${node.id}:rate`) * 0.34),
                anchorX: position.x,
                anchorY: position.y,
                anchorZ: position.z,
                renderedX: position.x,
                renderedY: position.y,
                renderedZ: position.z,
            };
            cacheAmbientDefaultNodeVisual(state);
            ambientNodes.set(node.id, state);
        }
        for (const link of currentData.links) {
            const object = renderedLinkObjects.get(link.id);
            const descriptor = linkDescriptor(link);
            ambientLinks.set(link.id, {
                baseOpacity: boundedOpacity(descriptor.opacity, link.visual.opacity),
                baseWidth: descriptor.width ?? link.visual.width,
                flowParticleCount: stableUnit(`${link.id}:flow`) >= 0.45 ? 3 : 2,
                flowPhase: stableUnit(`${link.id}:flow-phase`),
                id: link.id,
                link,
                object: object instanceof Line && object.userData.graphDefaultLinkObject === true ? object : null,
                material: null,
                lastOpacity: Number.NaN,
                lastWidth: Number.NaN,
                particleCount: 0,
                active: false,
            });
            const state = ambientLinks.get(link.id);
            cacheAmbientDefaultLinkMaterial(state);
        }
        if (particleGroup.parent !== graph.scene())
            graph.scene().add(particleGroup);
    }
    function updateAmbientNodePositions() {
        const motionEnabled = ambientMotionEnabled();
        const phase = (ambientElapsedMs / 1000) * AMBIENT_RADIANS_PER_SECOND;
        const commonX = motionEnabled ? Math.sin(phase) * AMBIENT_COMMON_FLOAT.x : 0;
        const commonY = motionEnabled ? Math.cos(phase * 0.91) * AMBIENT_COMMON_FLOAT.y : 0;
        const commonZ = motionEnabled ? Math.sin(phase * 0.57) * AMBIENT_COMMON_FLOAT.z : 0;
        for (const state of ambientNodes.values()) {
            const anchor = state.node;
            if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(anchor.z))
                continue;
            state.anchorX = anchor.x;
            state.anchorY = anchor.y;
            state.anchorZ = anchor.z;
            refreshAmbientNodeObject(state, renderedNodeObjects.get(state.id) ?? null);
            const breathingPhase = (phase * state.breathingRate) + state.breathingPhase;
            const breathingX = motionEnabled ? Math.sin(breathingPhase) * AMBIENT_NODE_BREATHING.x : 0;
            const breathingY = motionEnabled ? Math.cos(breathingPhase * 1.13) * AMBIENT_NODE_BREATHING.y : 0;
            const breathingZ = motionEnabled ? Math.sin(breathingPhase * 0.67) * AMBIENT_NODE_BREATHING.z : 0;
            if (state.object?.userData.graphDefaultNodeObject === true) {
                state.renderedX = state.anchorX + commonX + breathingX;
                state.renderedY = state.anchorY + commonY + breathingY;
                state.renderedZ = state.anchorZ + commonZ + breathingZ;
                state.object.position.set(state.renderedX, state.renderedY, state.renderedZ);
            }
            else {
                // Factories own their transforms. Reporting an offset that was never
                // applied would make host-side picking disagree with rendered pixels.
                state.renderedX = state.anchorX;
                state.renderedY = state.anchorY;
                state.renderedZ = state.anchorZ;
            }
        }
    }
    function applyCameraRelativeDepth() {
        const data = currentData;
        if (!data)
            return;
        const camera = cameraPose();
        const directionLength = Math.hypot(camera.position.x - camera.lookAt.x, camera.position.y - camera.lookAt.y, camera.position.z - camera.lookAt.z) || 1;
        const directionX = (camera.position.x - camera.lookAt.x) / directionLength;
        const directionY = (camera.position.y - camera.lookAt.y) / directionLength;
        const directionZ = (camera.position.z - camera.lookAt.z) / directionLength;
        let minimumDepth = Infinity;
        let maximumDepth = -Infinity;
        for (const state of ambientNodes.values()) {
            const depth = ((state.renderedX - camera.lookAt.x) * directionX)
                + ((state.renderedY - camera.lookAt.y) * directionY)
                + ((state.renderedZ - camera.lookAt.z) * directionZ);
            minimumDepth = Math.min(minimumDepth, depth);
            maximumDepth = Math.max(maximumDepth, depth);
        }
        const depthRange = Math.max(1, maximumDepth - minimumDepth);
        const selectedNodeId = data.selection.nodeId;
        const focusNodeId = ambientFocusNodeId();
        for (const state of ambientNodes.values()) {
            if (state.object?.userData.graphDefaultNodeObject !== true)
                continue;
            const node = state.node;
            const depth = ((state.renderedX - camera.lookAt.x) * directionX)
                + ((state.renderedY - camera.lookAt.y) * directionY)
                + ((state.renderedZ - camera.lookAt.z) * directionZ);
            const near = Math.max(0, Math.min(1, (depth - minimumDepth) / depthRange));
            const selected = node.id === selectedNodeId;
            const neighbor = data.selection.neighborNodeIds.includes(node.id);
            const focused = node.id === focusNodeId;
            // Keep semantic readability floors in the renderer-owned state built
            // from the canonical visual contract, not a vendor live node's fields.
            const master = state.isMaster;
            const bodyFactor = selected
                ? 1
                : neighbor || focused
                    ? 0.66 + (near * 0.24)
                    : selectedNodeId
                        ? 0.18 + (near * 0.27)
                        : 0.34 + (near * 0.35);
            const opacity = Math.max(node.visual.opacityFloor, master ? AMBIENT_MASTER_BODY_OPACITY_FLOOR : 0, state.baseOpacity * bodyFactor);
            const labelOpacity = selected
                ? 1
                : neighbor || focused
                    ? 0.68 + (near * 0.2)
                    : master
                        ? Math.max(AMBIENT_MASTER_LABEL_OPACITY_FLOOR, 0.32 + (near * 0.26))
                        : selectedNodeId
                            ? 0.025 + (near * 0.26)
                            : 0.12 + (near * 0.44);
            const labelVisible = selected || neighbor || focused || master || labelOpacity >= 0.04;
            const viewportScale = Math.max(0.82, Math.min(1.15, 480 / Math.max(1, Math.min(data.selection.viewport.width, data.selection.viewport.height))));
            const scale = selected ? 1.22 : (0.68 + (near * 0.28));
            applyAmbientDefaultNodeVisual(state, opacity, scale, labelVisible, labelOpacity, viewportScale * (0.68 + (near * 0.32)));
        }
    }
    function renderedState(id) {
        return ambientNodes.get(id) ?? null;
    }
    function actualNodeWorldPosition(state) {
        const object = renderedNodeObjects.get(state.id) ?? state.object;
        if (object) {
            object.getWorldPosition(projectedWorldPosition);
            return {
                x: projectedWorldPosition.x,
                y: projectedWorldPosition.y,
                z: projectedWorldPosition.z,
            };
        }
        return { x: state.renderedX, y: state.renderedY, z: state.renderedZ };
    }
    function objectLocalPositionForWorld(object, worldPosition, output) {
        object.updateWorldMatrix(true, false);
        output.set(worldPosition.x, worldPosition.y, worldPosition.z);
        return object.worldToLocal(output);
    }
    function updateLinkObjectFromWorldEndpoints(object, startWorldPosition, endWorldPosition) {
        objectLocalPositionForWorld(object, startWorldPosition, linkStartLocalPosition);
        objectLocalPositionForWorld(object, endWorldPosition, linkEndLocalPosition);
        return updateLinkObject(object, linkStartLocalPosition, linkEndLocalPosition);
    }
    function updateLinkObjectForRenderedNodes(object, link, fallbackStart, fallbackEnd) {
        const linkId = typeof object.userData.graphLinkId === "string" ? object.userData.graphLinkId : link.id;
        const canonicalLink = ambientLinks.get(linkId)?.link;
        const source = canonicalLink ? renderedState(canonicalLink.source) : null;
        const target = canonicalLink ? renderedState(canonicalLink.target) : null;
        if (!source || !target)
            return updateLinkObject(object, fallbackStart, fallbackEnd);
        return updateLinkObjectFromWorldEndpoints(object, actualNodeWorldPosition(source), actualNodeWorldPosition(target));
    }
    function defaultLinkEndpointObservation(state) {
        const object = state.object;
        const positions = object?.geometry.getAttribute("position");
        if (!object || !positions || positions.itemSize !== 3 || positions.count < 2)
            return null;
        object.updateWorldMatrix(true, false);
        const positionAt = (index) => {
            lineEndpointWorldPosition.set(positions.getX(index), positions.getY(index), positions.getZ(index));
            object.localToWorld(lineEndpointWorldPosition);
            return {
                x: lineEndpointWorldPosition.x,
                y: lineEndpointWorldPosition.y,
                z: lineEndpointWorldPosition.z,
            };
        };
        return {
            end: positionAt(positions.count - 1),
            id: state.id,
            sourceId: state.link.source,
            start: positionAt(0),
            targetId: state.link.target,
        };
    }
    function applyFocusedLinkFlow() {
        const focusNodeId = ambientFocusNodeId();
        let nextParticle = 0;
        for (const particle of flowParticles) {
            particle.linkId = null;
            particle.object.visible = false;
        }
        for (const state of ambientLinks.values()) {
            const source = renderedState(state.link.source);
            const target = renderedState(state.link.target);
            const incident = focusNodeId !== null && (state.link.source === focusNodeId || state.link.target === focusNodeId);
            const selectedFocus = focusNodeId !== null && currentData?.selection.nodeId === focusNodeId;
            const liveObject = renderedLinkObjects.get(state.id);
            refreshAmbientLinkObject(state, liveObject ?? null);
            state.active = Boolean(incident && state.object && ambientMotionEnabled());
            state.particleCount = 0;
            if (!source || !target || !state.object)
                continue;
            updateLinkObjectFromWorldEndpoints(state.object, actualNodeWorldPosition(source), actualNodeWorldPosition(target));
            applyAmbientDefaultLinkVisual(state, incident ? Math.max(selectedFocus ? 0.52 : 0.38, state.baseOpacity) : Math.min(0.055, state.baseOpacity * 0.22), incident ? Math.max(selectedFocus ? 1.1 : 0.9, state.baseWidth) : 0.5);
            if (!state.active)
                continue;
            const count = state.flowParticleCount;
            const positions = state.object.geometry.getAttribute("position");
            if (!positions || positions.count < 3)
                continue;
            const outwardFromSource = state.link.source === focusNodeId;
            for (let index = 0; index < count && nextParticle < flowParticles.length; index += 1) {
                const particle = flowParticles[nextParticle];
                nextParticle += 1;
                const basePhase = ((ambientElapsedMs / 1000) * FLOW_SPEED_CYCLES_PER_SECOND)
                    + (index / count)
                    + state.flowPhase;
                const outwardPhase = basePhase - Math.floor(basePhase);
                const curveProgress = outwardFromSource ? outwardPhase : 1 - outwardPhase;
                pointOnThreePointCurve(positions, curveProgress, curvePointLocalPosition);
                state.object.updateWorldMatrix(true, false);
                state.object.localToWorld(curvePointWorldPosition.copy(curvePointLocalPosition));
                particleGroup.updateWorldMatrix(true, false);
                particle.object.position.copy(particleGroup.worldToLocal(particleLocalPosition.copy(curvePointWorldPosition)));
                particle.object.visible = true;
                particle.linkId = state.id;
                particle.phase = outwardPhase;
                particle.x = curvePointWorldPosition.x;
                particle.y = curvePointWorldPosition.y;
                particle.z = curvePointWorldPosition.z;
                state.particleCount += 1;
            }
        }
    }
    function applyAmbientVisuals() {
        updateAmbientNodePositions();
        applyCameraRelativeDepth();
        applyFocusedLinkFlow();
    }
    function applyFinalVisuals(data) {
        data.nodes.forEach((node) => {
            const descriptor = nodeDescriptor(node);
            const visual = sceneVisualForNode(node, data, descriptor);
            applyNodePalette(node);
            applyNodeVisual(node, visual.opacity, visual.scale, data.selection.nodeId === node.id ? visual.opacity : 0, visual.labelVisible, visual.labelOpacity, visual.labelScale);
        });
        data.links.forEach((link) => {
            const descriptor = linkDescriptor(link);
            applyLinkPalette(link);
            applyLinkVisual(link, boundedOpacity(descriptor.opacity, link.visual.opacity), descriptor.width ?? link.visual.width);
        });
    }
    function liveNodePositions() {
        return new Map(graph.graphData().nodes.flatMap((node) => {
            const position = nodePosition(node);
            return position ? [[node.id, position]] : [];
        }));
    }
    function liveTransitionNodePositions() {
        return graph.graphData().nodes.flatMap((node) => {
            const position = nodePosition(node);
            return position ? [{ id: node.id, ...position }] : [];
        });
    }
    function makeLiveData(data, startPositions) {
        return {
            links: data.links.map((link) => ({ ...link })),
            nodes: data.nodes.map((node) => {
                const live = { ...node };
                const target = nodePosition(node);
                const start = startPositions?.get(node.id) ?? target;
                // Keep deterministic renderer-local anchors fixed. The public
                // RenderGraphData contract still marks only selected + one-hop nodes as
                // settled; this prevents 3d-force-graph from collapsing the visible base
                // composition between selection transactions.
                setNodePosition(live, start, true);
                return live;
            }),
        };
    }
    function createSceneTransition(data, previousData, startPositions) {
        const previousNodeById = new Map(previousData.nodes.map((node) => [node.id, node]));
        const previousLinkById = new Map(previousData.links.map((link) => [link.id, link]));
        const targetFocusNodeId = data.selection.nodeId;
        const previousFocusNodeId = previousData.selection.nodeId;
        const nodes = data.nodes.map((node) => {
            const descriptor = nodeDescriptor(node);
            const targetVisual = sceneVisualForNode(node, data, descriptor);
            const previousNode = previousNodeById.get(node.id);
            const previousObject = renderedNodeObjects.get(node.id);
            const previousVisual = previousNode
                ? sceneVisualForNode(previousNode, previousData, descriptorForNode(previousNode, previousData.presentation.nodeDescriptors?.[node.id]))
                : targetVisual;
            const start = startPositions.get(node.id) ?? nodePosition(node);
            const rim = previousObject ? graphChildWithRole(previousObject, "focus-rim") : null;
            const label = previousObject ? graphChildWithRole(previousObject, "node-label") : null;
            return {
                id: node.id,
                start,
                target: nodePosition(node),
                startLabelOpacity: firstMaterialOpacity(label ?? undefined, previousVisual.labelOpacity),
                startLabelScale: staticLabelScaleMultiplier(label),
                targetLabelVisible: targetVisual.labelVisible,
                targetLabelOpacity: targetVisual.labelOpacity,
                targetLabelScale: targetVisual.labelScale,
                startOpacity: firstMaterialOpacity(previousObject, previousVisual.opacity),
                startRimOpacity: rim?.visible === true
                    ? firstMaterialOpacity(rim, previousVisual.opacity)
                    : 0,
                startScale: previousObject?.scale.x ?? 1,
                targetOpacity: targetVisual.opacity,
                targetScale: targetVisual.scale,
            };
        });
        const links = data.links.map((link) => {
            const descriptor = linkDescriptor(link);
            const previousLink = previousLinkById.get(link.id);
            const previousObject = renderedLinkObjects.get(link.id);
            return {
                id: link.id,
                startOpacity: firstMaterialOpacity(previousObject, previousLink
                    ? descriptorForLink(previousLink, previousData.presentation.linkDescriptors?.[link.id]).opacity ?? previousLink.visual.opacity
                    : boundedOpacity(descriptor.opacity, link.visual.opacity)),
                startWidth: firstMaterialLineWidth(previousObject, previousLink
                    ? descriptorForLink(previousLink, previousData.presentation.linkDescriptors?.[link.id]).width ?? previousLink.visual.width
                    : descriptor.width ?? link.visual.width),
                targetOpacity: boundedOpacity(descriptor.opacity, link.visual.opacity),
                targetWidth: descriptor.width ?? link.visual.width,
            };
        });
        return {
            durationMs: data.presentation.reducedMotion === true ? 0 : targetFocusNodeId ? 420 : 250,
            links,
            nodes,
            previousFocusNodeId,
            targetFocusNodeId,
        };
    }
    function applySceneFrame(scene, progress, final = false) {
        const eased = easeInOutCubic(progress);
        const data = graph.graphData();
        const liveNodeById = new Map(data.nodes.map((node) => [node.id, node]));
        const targetNodeById = new Map(currentData?.nodes.map((node) => [node.id, node]) ?? []);
        const targetLinkById = new Map(currentData?.links.map((link) => [link.id, link]) ?? []);
        const retargetingFocus = scene.previousFocusNodeId !== null
            && scene.targetFocusNodeId !== null
            && scene.previousFocusNodeId !== scene.targetFocusNodeId;
        const firstPhase = Math.min(1, progress * 2);
        const secondPhase = Math.max(0, (progress - 0.5) * 2);
        scene.nodes.forEach((transition) => {
            const live = liveNodeById.get(transition.id);
            const targetNode = targetNodeById.get(transition.id);
            if (!live || !targetNode)
                return;
            const position = final
                ? transition.target
                : {
                    x: interpolate(transition.start.x, transition.target.x, eased),
                    y: interpolate(transition.start.y, transition.target.y, eased),
                    z: interpolate(transition.start.z, transition.target.z, eased),
                };
            setNodePosition(live, position, true);
            let scale = interpolate(transition.startScale, transition.targetScale, eased);
            let rimOpacity = 0;
            if (retargetingFocus && transition.id === scene.previousFocusNodeId) {
                scale = interpolate(transition.startScale, 1, firstPhase);
                rimOpacity = interpolate(transition.startRimOpacity, 0, firstPhase);
            }
            else if (retargetingFocus && transition.id === scene.targetFocusNodeId) {
                scale = interpolate(1, transition.targetScale, secondPhase);
                rimOpacity = transition.targetOpacity * secondPhase;
            }
            else if (scene.previousFocusNodeId === null && transition.id === scene.targetFocusNodeId) {
                scale = interpolate(1, transition.targetScale, secondPhase);
                rimOpacity = transition.targetOpacity * secondPhase;
            }
            else if (scene.targetFocusNodeId === null && transition.id === scene.previousFocusNodeId) {
                scale = interpolate(transition.startScale, 1, eased);
                rimOpacity = interpolate(transition.startRimOpacity, 0, eased);
            }
            else if (transition.id === scene.targetFocusNodeId) {
                rimOpacity = transition.targetOpacity;
            }
            applyNodeVisual(targetNode, final ? transition.targetOpacity : interpolate(transition.startOpacity, transition.targetOpacity, eased), final ? transition.targetScale : scale, final && transition.id === scene.targetFocusNodeId ? transition.targetOpacity : rimOpacity, transition.targetLabelVisible, final
                ? transition.targetLabelOpacity
                : interpolate(transition.startLabelOpacity, transition.targetLabelOpacity, eased), final
                ? transition.targetLabelScale
                : interpolate(transition.startLabelScale, transition.targetLabelScale, eased));
        });
        scene.links.forEach((transition) => {
            const targetLink = targetLinkById.get(transition.id);
            if (!targetLink)
                return;
            applyLinkVisual(targetLink, final ? transition.targetOpacity : interpolate(transition.startOpacity, transition.targetOpacity, eased), final ? transition.targetWidth : interpolate(transition.startWidth, transition.targetWidth, eased));
        });
    }
    function applyData(data) {
        const previousData = currentData;
        const selectionChanged = previousData?.selection.nodeId !== data.selection.nodeId;
        const nextDataRevision = renderDataRevision(data);
        // ResizeObserver-driven syncs can arrive immediately after a selection. The
        // active transaction owns its immutable target generation; replacing it here
        // would snap the graph to the final layout before its first animation frame.
        // Preserve that transaction only for layout-only updates, and retain the
        // latest one so its viewport-derived targets are not lost.
        if (!selectionChanged && activeTransition?.scene) {
            if (currentDataRevision === nextDataRevision) {
                deferredDataDuringTransition = data;
                return;
            }
            // A semantic node, link, or presentation update must not be mistaken for
            // resize churn. Settle the in-flight scene before applying the new truth.
            deferredDataDuringTransition = null;
            cancelCameraTransition();
        }
        const starts = previousData && selectionChanged ? liveNodePositions() : null;
        if (selectionChanged) {
            deferredDataDuringTransition = null;
            cancelCameraTransition();
        }
        currentData = data;
        currentDataRevision = nextDataRevision;
        currentPresentation = data.presentation;
        graph.backgroundColor(themePalette(currentPresentation.theme).background);
        graph.graphData(makeLiveData(data, starts));
        const nodeIds = new Set(data.nodes.map((node) => node.id));
        const linkIds = new Set(data.links.map((link) => link.id));
        renderedNodeObjects.forEach((_object, id) => {
            if (!nodeIds.has(id))
                renderedNodeObjects.delete(id);
        });
        renderedLinkObjects.forEach((_object, id) => {
            if (!linkIds.has(id))
                renderedLinkObjects.delete(id);
        });
        rebuildAmbientState();
        if (!previousData || !selectionChanged || !starts) {
            pendingSceneTransition = null;
            applyFinalVisuals(data);
            applyAmbientVisuals();
            ensureMotionFrame();
            return;
        }
        const scene = createSceneTransition(data, previousData, starts);
        pendingSceneTransition = scene;
        data.nodes.forEach((node) => applyNodePalette(node));
        data.links.forEach((link) => applyLinkPalette(link));
        applySceneFrame(scene, 0);
        applyAmbientVisuals();
        ensureMotionFrame();
        if (scene.targetFocusNodeId === null) {
            pendingSceneTransition = null;
            transitionToFit(scene.durationMs, scene);
        }
    }
    function flushDeferredData() {
        const deferredData = deferredDataDuringTransition;
        deferredDataDuringTransition = null;
        if (!deferredData || destroyed)
            return;
        applyData(deferredData);
    }
    function cancelCameraTransition() {
        const cancelledTransition = activeTransition;
        const cancelledProgress = cancelledTransition
            ? transitionObservation.progress
            : 1;
        transitionGeneration += 1;
        // A scheduled idle ambient tick is already the shared renderer loop; it
        // can immediately pick up a newly-started camera transition. Cancel only
        // a frame that belongs to a real active transaction.
        if (cancelledTransition && motionFrame !== null)
            frameScheduler.cancel(motionFrame);
        if (cancelledTransition)
            motionFrame = null;
        if (cancelledTransition)
            transitionTick = null;
        activeTransition = null;
        if (cancelledTransition?.scene) {
            applySceneFrame(cancelledTransition.scene, 1, true);
        }
        transitionObservation = {
            active: false,
            durationMs: cancelledTransition?.durationMs ?? 0,
            generation: transitionGeneration,
            nodePositions: liveTransitionNodePositions(),
            progress: cancelledTransition?.scene ? 1 : cancelledProgress,
            reducedMotion: cancelledTransition?.reducedMotion ?? false,
        };
        if (cancelledTransition?.scene)
            flushDeferredData();
        if (!destroyed) {
            applyAmbientVisuals();
            ensureMotionFrame();
        }
    }
    function ensureMotionFrame() {
        if (destroyed || motionFrame !== null || (!transitionTick && !ambientMotionEnabled()))
            return;
        let frameId = 0;
        frameId = frameScheduler.request((timestamp) => {
            if (motionFrame !== frameId)
                return;
            motionFrame = null;
            transitionTick?.(timestamp);
            if (ambientMotionEnabled()) {
                if (ambientLastTimestamp !== null) {
                    ambientElapsedMs += Math.max(0, timestamp - ambientLastTimestamp);
                }
                ambientLastTimestamp = timestamp;
                ambientFrameCount += 1;
                applyAmbientVisuals();
            }
            else {
                ambientLastTimestamp = null;
                applyAmbientVisuals();
            }
            ensureMotionFrame();
        });
        motionFrame = frameId;
    }
    const onVisibilityChange = () => {
        const hidden = ownerDocument.visibilityState === "hidden";
        ambientPaused = hidden;
        ambientLastTimestamp = null;
        if (hidden) {
            if (activeTransition)
                activeTransition.startedAt = null;
            if (motionFrame !== null)
                frameScheduler.cancel(motionFrame);
            motionFrame = null;
            applyAmbientVisuals();
            return;
        }
        applyAmbientVisuals();
        ensureMotionFrame();
    };
    ownerDocument.addEventListener("visibilitychange", onVisibilityChange);
    // `graph.controls()` exposes the live OrbitControls instance for the configured
    // `controlType: "orbit"`. Its `start` event is user-originated; `change` is a
    // useful follow-up signal only while that interaction is active, because a
    // programmatic cameraPosition() update can also cause OrbitControls to emit it.
    const beginCameraControlInteraction = () => {
        cameraControlInteractionActive = true;
        cancelCameraTransition();
    };
    const updateCameraControlInteraction = () => {
        if (cameraControlInteractionActive)
            cancelCameraTransition();
    };
    const endCameraControlInteraction = () => {
        cameraControlInteractionActive = false;
    };
    cameraInteractionControls?.addEventListener("start", beginCameraControlInteraction);
    cameraInteractionControls?.addEventListener("change", updateCameraControlInteraction);
    cameraInteractionControls?.addEventListener("end", endCameraControlInteraction);
    function cameraPose() {
        const current = graph.cameraPosition();
        return {
            position: { x: current.x, y: current.y, z: current.z },
            lookAt: current.lookAt
                ? { x: current.lookAt.x, y: current.lookAt.y, z: current.lookAt.z }
                : { x: 0, y: 0, z: 0 },
        };
    }
    function setCameraPose(pose) {
        graph.cameraPosition(pose.position, pose.lookAt, 0);
    }
    function startTransition({ durationMs, reducedMotion = false, scene = null, targetCamera = null, }) {
        cancelCameraTransition();
        const startCamera = targetCamera ? cameraPose() : null;
        const active = {
            durationMs,
            generation: transitionGeneration,
            reducedMotion,
            scene,
            startCamera,
            startedAt: null,
            targetCamera,
        };
        if (durationMs <= 0) {
            scene && applySceneFrame(scene, 1, true);
            if (targetCamera)
                setCameraPose(targetCamera);
            // The zero-duration selection path still advances the deterministic
            // anchor transaction. Refresh the ambient snapshot synchronously so
            // reduced motion reports those new anchors, with zero visual offset.
            applyAmbientVisuals();
            transitionObservation = {
                active: false,
                durationMs,
                generation: active.generation,
                nodePositions: liveTransitionNodePositions(),
                progress: 1,
                reducedMotion,
            };
            flushDeferredData();
            return;
        }
        activeTransition = active;
        transitionObservation = {
            active: true,
            durationMs,
            generation: active.generation,
            nodePositions: liveTransitionNodePositions(),
            progress: 0,
            reducedMotion,
        };
        transitionTick = (timestamp) => {
            if (active.generation !== transitionGeneration || activeTransition !== active)
                return;
            active.startedAt ??= timestamp;
            const progress = Math.min(1, Math.max(0, (timestamp - active.startedAt) / durationMs));
            if (active.scene)
                applySceneFrame(active.scene, progress);
            if (active.startCamera && active.targetCamera) {
                setCameraPose(interpolatePose(active.startCamera, active.targetCamera, progress));
            }
            transitionObservation = {
                active: progress < 1,
                durationMs,
                generation: active.generation,
                nodePositions: liveTransitionNodePositions(),
                progress,
                reducedMotion: active.reducedMotion,
            };
            if (progress < 1) {
            }
            else {
                active.scene && applySceneFrame(active.scene, 1, true);
                activeTransition = null;
                transitionTick = null;
                flushDeferredData();
            }
        };
        ensureMotionFrame();
    }
    function transitionToFit(durationMs, scene = null) {
        if (activeTransition)
            cancelCameraTransition();
        const start = cameraPose();
        if (scene)
            applySceneFrame(scene, 1, true);
        graph.zoomToFit(0, 28);
        const target = cameraPose();
        if (scene)
            applySceneFrame(scene, 0);
        setCameraPose(start);
        startTransition({
            durationMs,
            reducedMotion: scene?.durationMs === 0,
            scene,
            targetCamera: target,
        });
    }
    function nodeCameraTarget(nodeId) {
        const focused = currentData?.nodes.find((candidate) => candidate.id === nodeId);
        if (!currentData || !focused)
            return null;
        const focalPoint = nodePosition(focused);
        const points = currentData.nodes.flatMap((node) => {
            const position = nodePosition(node);
            if (!position)
                return [];
            const bodyRadius = node.type === "relation" ? 7.5 : 3;
            const focusScale = node.id === nodeId ? 1.22 : 1;
            // Reserve the renderer-owned micro-motion envelope inside the existing
            // camera padding, including compact portrait framing.
            return [{ ...position, radius: (bodyRadius * 1.16 * focusScale) + AMBIENT_MAX_OFFSET }];
        });
        const viewport = currentData.selection.viewport;
        return contextCameraPose(points, cameraPose(), boundedPerspectiveProjection(graph.camera(), viewport), viewport, focalPoint);
    }
    function transitionToNode(nodeId, options) {
        if (activeTransition)
            cancelCameraTransition();
        const targetCamera = nodeCameraTarget(nodeId);
        if (!targetCamera)
            return;
        const scene = pendingSceneTransition?.targetFocusNodeId === nodeId
            ? pendingSceneTransition
            : null;
        pendingSceneTransition = null;
        startTransition({
            durationMs: options.reducedMotion ? 0 : scene?.durationMs ?? 420,
            reducedMotion: options.reducedMotion,
            scene,
            targetCamera,
        });
    }
    function getRenderObservation() {
        if (destroyed || !currentData)
            return null;
        const data = graph.graphData();
        const scene = graph.scene();
        const nodesById = new Map(currentData.nodes.map((node) => [node.id, node]));
        const linksById = new Map(currentData.links.map((link) => [link.id, link]));
        const nodeIds = data.nodes.map((node) => node.id);
        const linkIds = data.links.map((link) => link.id);
        const nodes = [];
        const links = [];
        nodeIds.forEach((id) => {
            const node = nodesById.get(id);
            if (!node)
                return;
            const object = renderedNodeObjects.get(id);
            const liveNode = data.nodes.find((candidate) => candidate.id === id);
            const livePosition = nodePosition(liveNode) ?? nodePosition(node);
            nodes.push({
                ...observeGraphObject(id, object, scene),
                bodyMaterialColor: object?.userData.graphDefaultNodeObject === true
                    ? objectMaterialColor(graphChildWithRole(object, "body"))
                    : null,
                label: nodeLabelObservation(id, object ? graphChildWithRole(object, "node-label") : null, scene),
                worldPosition: { id, ...livePosition },
                worldScale: objectTransformObservation(id, object).scale,
                visual: node.visual,
            });
        });
        linkIds.forEach((id) => {
            const link = linksById.get(id);
            if (!link)
                return;
            const object = renderedLinkObjects.get(id);
            const line = object instanceof Line ? object : null;
            const material = line ? materialsForObject(line)[0] : undefined;
            links.push({
                ...observeGraphObject(id, object, scene),
                curvePointCount: line?.geometry.getAttribute("position")?.count ?? null,
                depthWriteEnabled: materialDepthWrite(material),
                visual: link.visual,
            });
        });
        return { linkIds, links, nodeIds, nodes };
    }
    return {
        cancelCameraTransition,
        destroy() {
            if (destroyed)
                return;
            if (motionFrame !== null)
                frameScheduler.cancel(motionFrame);
            motionFrame = null;
            transitionTick = null;
            destroyed = true;
            deferredDataDuringTransition = null;
            cancelCameraTransition();
            ownerDocument.removeEventListener("pointerup", suppressMalformedVendorDragRelease, true);
            ownerDocument.removeEventListener("visibilitychange", onVisibilityChange);
            cameraInteractionControls?.removeEventListener("start", beginCameraControlInteraction);
            cameraInteractionControls?.removeEventListener("change", updateCameraControlInteraction);
            cameraInteractionControls?.removeEventListener("end", endCameraControlInteraction);
            renderedNodeObjects.clear();
            renderedLinkObjects.clear();
            ambientNodes.clear();
            ambientLinks.clear();
            particleGroup.removeFromParent();
            if (!particleResourcesDisposed) {
                particleResourcesDisposed = true;
                particleGeometry.dispose();
                particleMaterial.dispose();
            }
            graph._destructor();
        },
        fit(durationMs = 250) {
            pendingSceneTransition = null;
            transitionToFit(durationMs);
        },
        focus(nodeId) {
            transitionToNode(nodeId, { reducedMotion: false });
        },
        getNodeScreenPosition(nodeId) {
            const rendered = ambientNodes.get(nodeId);
            const node = rendered
                ? actualNodeWorldPosition(rendered)
                : graph.graphData().nodes.find((candidate) => candidate.id === nodeId);
            if (!node || ![node.x, node.y, node.z].every((coordinate) => Number.isFinite(coordinate))) {
                return null;
            }
            const projected = graph.graph2ScreenCoords(node.x, node.y, node.z);
            if (![projected.x, projected.y].every((coordinate) => Number.isFinite(coordinate))) {
                return null;
            }
            return { x: projected.x, y: projected.y };
        },
        getAmbientMotionObservation() {
            if (destroyed || !currentData)
                return null;
            const anchorNodePositions = [];
            const renderedNodePositions = [];
            const renderedScreenPositions = [];
            ambientNodes.forEach((state) => {
                const rendered = actualNodeWorldPosition(state);
                anchorNodePositions.push({ id: state.id, x: state.anchorX, y: state.anchorY, z: state.anchorZ });
                renderedNodePositions.push({ id: state.id, x: rendered.x, y: rendered.y, z: rendered.z });
                const screen = graph.graph2ScreenCoords(rendered.x, rendered.y, rendered.z);
                if (Number.isFinite(screen.x) && Number.isFinite(screen.y)) {
                    renderedScreenPositions.push({ id: state.id, x: screen.x, y: screen.y });
                }
            });
            const linkFlow = [];
            ambientLinks.forEach((state) => linkFlow.push({
                active: state.active,
                id: state.id,
                particleCount: state.particleCount,
            }));
            const linkEndpoints = [...ambientLinks.values()].flatMap((state) => {
                const endpoint = defaultLinkEndpointObservation(state);
                return endpoint ? [endpoint] : [];
            });
            const particles = [];
            flowParticles.forEach((particle) => {
                if (!particle.object.visible || !particle.linkId)
                    return;
                const screen = graph.graph2ScreenCoords(particle.x, particle.y, particle.z);
                particles.push({
                    id: particle.id,
                    linkId: particle.linkId,
                    phase: particle.phase,
                    screenX: Number.isFinite(screen.x) ? screen.x : null,
                    screenY: Number.isFinite(screen.y) ? screen.y : null,
                    x: particle.x,
                    y: particle.y,
                    z: particle.z,
                });
            });
            return {
                active: ambientMotionEnabled(),
                anchorNodePositions,
                elapsedMs: ambientElapsedMs,
                focusNodeId: ambientFocusNodeId(),
                frame: ambientFrameCount,
                linkEndpoints,
                linkFlow,
                particles,
                paused: ambientPaused,
                phase: (ambientElapsedMs / 1000) * AMBIENT_RADIANS_PER_SECOND,
                reducedMotion: currentData.presentation.reducedMotion === true,
                renderedNodePositions,
                renderedScreenPositions,
            };
        },
        getRenderObservation,
        getTransitionObservation() {
            return destroyed
                ? null
                : { ...transitionObservation, nodePositions: liveTransitionNodePositions() };
        },
        resize(width, height) {
            const next = dimensions(container, width, height);
            graph.width(next.width).height(next.height);
            if (initialFitPending && currentData) {
                graph.zoomToFit(0, 28);
                initialFitPending = false;
            }
        },
        restoreCamera() {
            pendingSceneTransition = null;
            transitionToFit(250);
        },
        setData(data) {
            applyData(data);
        },
        setPresentation(presentation) {
            if (!currentData)
                return;
            const nextData = { ...currentData, presentation };
            if (renderDataRevision(nextData) === currentDataRevision) {
                currentData = nextData;
                currentPresentation = presentation;
                graph.backgroundColor(themePalette(currentPresentation.theme).background);
                currentData.nodes.forEach((node) => applyNodePalette(node));
                currentData.links.forEach((link) => applyLinkPalette(link));
                if (!activeTransition && !pendingSceneTransition)
                    applyFinalVisuals(currentData);
                rebuildAmbientState();
                applyAmbientVisuals();
                ensureMotionFrame();
                return;
            }
            applyData(nextData);
        },
        transitionToNode,
        zoom(scale) {
            const boundedScale = Math.max(0.25, Math.min(8, scale));
            const current = cameraPose();
            const offset = {
                x: current.position.x - current.lookAt.x,
                y: current.position.y - current.lookAt.y,
                z: current.position.z - current.lookAt.z,
            };
            const distance = Math.max(80, Math.hypot(offset.x, offset.y, offset.z));
            const factor = distance / boundedScale;
            const direction = distance > 0
                ? { x: offset.x / distance, y: offset.y / distance, z: offset.z / distance }
                : { x: 0, y: 0, z: 1 };
            pendingSceneTransition = null;
            startTransition({
                durationMs: 180,
                targetCamera: {
                    position: {
                        x: current.lookAt.x + (direction.x * factor),
                        y: current.lookAt.y + (direction.y * factor),
                        z: current.lookAt.z + (direction.z * factor),
                    },
                    lookAt: current.lookAt,
                },
            });
        },
    };
}
