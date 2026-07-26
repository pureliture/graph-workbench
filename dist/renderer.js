import ForceGraph3D from "3d-force-graph";
import { BufferGeometry, Color, Float32BufferAttribute, Group, Line, LineBasicMaterial, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, } from "three";
function boundedOpacity(value, fallback) {
    if (!Number.isFinite(value))
        return fallback;
    return Math.max(0, Math.min(1, value));
}
function defaultNodeColor(node, descriptor) {
    if (descriptor?.color)
        return descriptor.color;
    if (node.roles?.includes("master"))
        return "#f6bd60";
    if (node.type === "relation")
        return "#82cfff";
    return "#a0e7e5";
}
function defaultLinkColor(descriptor) {
    return descriptor?.color ?? "#5b7088";
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
function nodeEmissiveIntensity(node) {
    return Math.max(node.roles?.includes("master") ? 0.26 : 0.1, 0.08 + (node.visual.contrast * 0.32));
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
function updateObjectMaterials(object, update) {
    object.traverse((candidate) => {
        materialsForObject(candidate).forEach((material) => {
            if (!material || typeof material !== "object")
                return;
            if ("opacity" in material && typeof material.opacity === "number") {
                material.opacity = update.opacity;
            }
            if ("transparent" in material && typeof material.transparent === "boolean") {
                material.transparent = update.opacity < 1;
            }
            if (update.emissiveIntensity !== undefined
                && "emissiveIntensity" in material
                && typeof material.emissiveIntensity === "number") {
                material.emissiveIntensity = update.emissiveIntensity;
            }
            if (update.width !== undefined && "linewidth" in material && typeof material.linewidth === "number") {
                material.linewidth = update.width;
            }
            if ("needsUpdate" in material && typeof material.needsUpdate === "boolean") {
                material.needsUpdate = true;
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
export function createDefaultGraphNodeObject(node, descriptor) {
    const color = new Color(defaultNodeColor(node, descriptor));
    const opacity = boundedOpacity(descriptor?.opacity, 1);
    const group = new Group();
    const radius = node.type === "relation" ? 5.25 : 4.5;
    const material = new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: nodeEmissiveIntensity(node),
        opacity,
        transparent: opacity < 1,
    });
    const body = new Mesh(new SphereGeometry(radius, 20, 14), material);
    group.add(body);
    if (node.roles?.includes("master")) {
        const ring = new Mesh(new TorusGeometry(radius + 1.45, 0.42, 10, 24), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.34 }));
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
    }
    group.userData.graphNodeId = node.id;
    return group;
}
export function createDefaultGraphLinkObject(link, descriptor) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const opacity = boundedOpacity(descriptor?.opacity, 0.68);
    const material = new LineBasicMaterial({
        color: defaultLinkColor(descriptor),
        linewidth: descriptor?.width,
        opacity,
        transparent: opacity < 1,
    });
    const line = new Line(geometry, material);
    line.userData.graphLinkId = link.id;
    return line;
}
function updateLinkObject(object, start, end) {
    if (!(object instanceof Line))
        return false;
    const positions = object.geometry.getAttribute("position");
    if (!positions || positions.itemSize !== 3)
        return false;
    positions.setXYZ(0, start.x, start.y, start.z);
    positions.setXYZ(1, end.x, end.y, end.z);
    positions.needsUpdate = true;
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
function interpolatePose(start, end, progress) {
    const eased = 1 - ((1 - progress) ** 2);
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
    let cameraTransitionGeneration = 0;
    let cameraTransitionFrame = null;
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
        .nodeLabel((node) => node.visual.labelCue === "muted" ? "" : nodeDescriptor(node).label ?? node.label)
        .nodeThreeObject((node) => {
        const object = nodeObjectFactory(node, nodeDescriptor(node));
        renderedNodeObjects.set(node.id, object);
        return object;
    })
        .linkThreeObject((link) => {
        const object = linkObjectFactory(link, linkDescriptor(link));
        renderedLinkObjects.set(link.id, object);
        return object;
    })
        .linkPositionUpdate((object, coordinates) => updateLinkObject(object, coordinates.start, coordinates.end))
        .onNodeClick((node) => callbacks.onNodeClick(node.id))
        .onNodeHover((node) => callbacks.onNodeHover(node?.id ?? null))
        // 3d-force-graph uses separate DragControls for nodes, so OrbitControls'
        // events do not cover this path.
        .onNodeDrag(() => cancelCameraTransition())
        .onBackgroundClick(() => callbacks.onBackgroundClick());
    function applyData(data) {
        currentData = data;
        currentPresentation = data.presentation;
        graph.backgroundColor(currentPresentation.theme === "light" ? "#edf5ff" : "#08111f");
        graph.graphData({ nodes: [...data.nodes], links: [...data.links] });
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
        data.nodes.forEach((node) => {
            const object = renderedNodeObjects.get(node.id);
            if (!object)
                return;
            const descriptor = nodeDescriptor(node);
            updateObjectMaterials(object, {
                emissiveIntensity: nodeEmissiveIntensity(node),
                opacity: boundedOpacity(descriptor.opacity, node.visual.opacity),
            });
        });
        data.links.forEach((link) => {
            const object = renderedLinkObjects.get(link.id);
            if (!object)
                return;
            const descriptor = linkDescriptor(link);
            updateObjectMaterials(object, {
                opacity: boundedOpacity(descriptor.opacity, link.visual.opacity),
                width: descriptor.width ?? link.visual.width,
            });
        });
    }
    function cancelCameraTransition() {
        cameraTransitionGeneration += 1;
        if (cameraTransitionFrame !== null)
            frameScheduler.cancel(cameraTransitionFrame);
        cameraTransitionFrame = null;
    }
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
    function transitionCamera(target, durationMs) {
        cancelCameraTransition();
        if (durationMs <= 0) {
            setCameraPose(target);
            return;
        }
        const start = cameraPose();
        const generation = cameraTransitionGeneration;
        let startedAt = null;
        const update = (timestamp) => {
            if (generation !== cameraTransitionGeneration)
                return;
            startedAt ??= timestamp;
            const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / durationMs));
            setCameraPose(interpolatePose(start, target, progress));
            if (progress < 1) {
                cameraTransitionFrame = frameScheduler.request(update);
            }
            else {
                cameraTransitionFrame = null;
            }
        };
        cameraTransitionFrame = frameScheduler.request(update);
    }
    function transitionToFit(durationMs) {
        const start = cameraPose();
        graph.zoomToFit(0, 28);
        const target = cameraPose();
        setCameraPose(start);
        transitionCamera(target, durationMs);
    }
    function transitionToNode(nodeId, options) {
        const node = currentData?.nodes.find((candidate) => candidate.id === nodeId);
        if (!node)
            return;
        const target = { x: node.x, y: node.y, z: node.z };
        const current = cameraPose();
        const directionLength = Math.hypot(current.position.x - target.x, current.position.y - target.y, current.position.z - target.z);
        const direction = directionLength > 0
            ? {
                x: (current.position.x - target.x) / directionLength,
                y: (current.position.y - target.y) / directionLength,
                z: (current.position.z - target.z) / directionLength,
            }
            : { x: 0, y: 0, z: 1 };
        const distance = 160;
        transitionCamera({
            position: {
                x: target.x + (direction.x * distance),
                y: target.y + (direction.y * distance),
                z: target.z + (direction.z * distance),
            },
            lookAt: target,
        }, options.reducedMotion ? 0 : 280);
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
            nodes.push({
                ...observeGraphObject(id, renderedNodeObjects.get(id), scene),
                visual: node.visual,
            });
        });
        linkIds.forEach((id) => {
            const link = linksById.get(id);
            if (!link)
                return;
            links.push({
                ...observeGraphObject(id, renderedLinkObjects.get(id), scene),
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
            destroyed = true;
            cancelCameraTransition();
            ownerDocument.removeEventListener("pointerup", suppressMalformedVendorDragRelease, true);
            cameraInteractionControls?.removeEventListener("start", beginCameraControlInteraction);
            cameraInteractionControls?.removeEventListener("change", updateCameraControlInteraction);
            cameraInteractionControls?.removeEventListener("end", endCameraControlInteraction);
            renderedNodeObjects.clear();
            renderedLinkObjects.clear();
            graph._destructor();
        },
        fit(durationMs = 250) {
            transitionToFit(durationMs);
        },
        focus(nodeId) {
            transitionToNode(nodeId, { reducedMotion: false });
        },
        getNodeScreenPosition(nodeId) {
            const node = graph.graphData().nodes.find((candidate) => candidate.id === nodeId);
            if (!node || ![node.x, node.y, node.z].every((coordinate) => Number.isFinite(coordinate))) {
                return null;
            }
            const projected = graph.graph2ScreenCoords(node.x, node.y, node.z);
            if (![projected.x, projected.y].every((coordinate) => Number.isFinite(coordinate))) {
                return null;
            }
            return { x: projected.x, y: projected.y };
        },
        getRenderObservation,
        resize(width, height) {
            const next = dimensions(container, width, height);
            graph.width(next.width).height(next.height);
        },
        restoreCamera() {
            transitionToFit(250);
        },
        setData(data) {
            applyData(data);
        },
        setPresentation(presentation) {
            currentPresentation = presentation;
            if (currentData)
                applyData({ ...currentData, presentation });
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
            transitionCamera({
                position: {
                    x: current.lookAt.x + (direction.x * factor),
                    y: current.lookAt.y + (direction.y * factor),
                    z: current.lookAt.z + (direction.z * factor),
                },
                lookAt: current.lookAt,
            }, 180);
        },
    };
}
