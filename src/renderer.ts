import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import {
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from "three";

import type { GraphNode } from "./contract.js";
import type { RenderGraphData, RenderLink, RenderNode } from "./layout.js";
import type { GraphLinkDescriptor, GraphNodeDescriptor, GraphPresentation } from "./presentation.js";
import type {
  GraphCameraTransitionOptions,
  GraphLinkObjectFactory,
  GraphRenderLinkObservation,
  GraphRenderNodeObservation,
  GraphRenderObjectObservation,
  GraphRenderObservation,
  GraphNodeObjectFactory,
  GraphRenderer,
  GraphRendererFactoryOptions,
  GraphScreenPosition,
  GraphTransitionNodePosition,
  GraphTransitionObservation,
} from "./renderer-contract.js";

export type {
  GraphLinkObjectFactory,
  GraphRenderLinkObservation,
  GraphRenderNodeObservation,
  GraphRenderObjectObservation,
  GraphRenderObservation,
  GraphNodeObjectFactory,
  GraphRenderer,
  GraphRendererFactoryOptions,
  GraphScreenPosition,
  GraphTransitionNodePosition,
  GraphTransitionObservation,
} from "./renderer-contract.js";

function boundedOpacity(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value!));
}

interface GraphThemePalette {
  readonly background: string;
  readonly body: string;
  readonly edge: string;
  readonly outline: string;
  readonly rim: string;
}

// These are the semantic Three.js colors from routine-harness's Tauri graph.
// The interaction choreography is intentionally independent of the palette.
const THEME_PALETTES: Readonly<Record<"dark" | "light", GraphThemePalette>> = {
  dark: {
    background: "#19192b",
    body: "#475569",
    edge: "#aaa7c2",
    outline: "#cbd5e1",
    rim: "#f8fafc",
  },
  light: {
    background: "#f6f9fe",
    body: "#64748b",
    edge: "#4b5a70",
    outline: "#334155",
    rim: "#0f172a",
  },
};

function themePalette(theme: GraphPresentation["theme"]): GraphThemePalette {
  return theme === "light" ? THEME_PALETTES.light : THEME_PALETTES.dark;
}

function defaultNodeColor(_node: GraphNode, descriptor: GraphNodeDescriptor | undefined): string {
  return descriptor?.color ?? THEME_PALETTES.dark.body;
}

function defaultLinkColor(descriptor: GraphLinkDescriptor | undefined): string {
  return descriptor?.color ?? THEME_PALETTES.dark.edge;
}

function descriptorForNode(node: RenderNode, supplied: GraphNodeDescriptor | undefined): GraphNodeDescriptor {
  return {
    ...supplied,
    opacity: Math.max(node.visual.opacityFloor, supplied?.opacity ?? node.visual.opacity),
  };
}

function descriptorForLink(link: RenderLink, supplied: GraphLinkDescriptor | undefined): GraphLinkDescriptor {
  return {
    ...supplied,
    opacity: supplied?.opacity ?? link.visual.opacity,
    width: supplied?.width ?? link.visual.width,
  };
}

function nodeEmissiveIntensity(_node: RenderNode): number {
  // Tauri relies on material roughness/metalness and scene lighting for depth
  // rather than a flat emissive glow.
  return 0;
}

function materialOpacity(material: unknown): number | null {
  if (!material || typeof material !== "object" || !("opacity" in material)) return null;
  const opacity = material.opacity;
  return typeof opacity === "number" && Number.isFinite(opacity) ? opacity : null;
}

function materialLineWidth(material: unknown): number | null {
  if (!material || typeof material !== "object" || !("linewidth" in material)) return null;
  const lineWidth = material.linewidth;
  return typeof lineWidth === "number" && Number.isFinite(lineWidth) ? lineWidth : null;
}

function materialsForObject(object: Object3D): readonly unknown[] {
  const material = (object as Object3D & { readonly material?: unknown }).material;
  return Array.isArray(material) ? material : [material];
}

function materialOpacities(object: Object3D): readonly number[] {
  return materialsForObject(object).flatMap((candidate) => {
    const opacity = materialOpacity(candidate);
    return opacity === null ? [] : [opacity];
  });
}

function materialLineWidths(object: Object3D): readonly number[] {
  return materialsForObject(object).flatMap((candidate) => {
    const width = materialLineWidth(candidate);
    return width === null ? [] : [width];
  });
}

function isObjectAttachedToScene(object: Object3D, scene: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (current === scene) return true;
    current = current.parent;
  }
  return false;
}

function isObjectEffectivelyVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function visibleMaterialOpacities(object: Object3D): readonly number[] {
  const opacities: number[] = [];
  object.traverse((candidate) => {
    if (!isObjectEffectivelyVisible(candidate)) return;
    opacities.push(...materialOpacities(candidate));
  });
  return opacities;
}

function visibleMaterialLineWidths(object: Object3D): readonly number[] {
  const widths: number[] = [];
  object.traverse((candidate) => {
    if (!isObjectEffectivelyVisible(candidate)) return;
    widths.push(...materialLineWidths(candidate));
  });
  return widths;
}

interface MaterialVisualUpdate {
  readonly emissiveIntensity?: number;
  readonly opacity: number;
  readonly width?: number;
}

function updateObjectMaterials(object: Object3D, update: MaterialVisualUpdate): void {
  object.traverse((candidate) => {
    materialsForObject(candidate).forEach((material) => {
      if (!material || typeof material !== "object") return;
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

function observeGraphObject(
  id: string,
  object: Object3D | undefined,
  scene: Object3D,
): GraphRenderObjectObservation {
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

export function createDefaultGraphNodeObject(
  node: RenderNode,
  descriptor: GraphNodeDescriptor | undefined,
): Object3D {
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

  const outline = new Mesh(
    geometry,
    new MeshBasicMaterial({
      color: THEME_PALETTES.dark.outline,
      depthWrite: false,
      opacity,
      side: BackSide,
      transparent: opacity < 1,
    }),
  );
  outline.scale.setScalar(1.08);
  outline.userData.graphVisualRole = "outline";
  group.add(outline);

  const rim = new Mesh(
    geometry,
    new MeshBasicMaterial({
      color: THEME_PALETTES.dark.rim,
      depthWrite: false,
      opacity,
      side: BackSide,
      transparent: opacity < 1,
    }),
  );
  rim.renderOrder = 28;
  rim.scale.setScalar(1.16);
  rim.userData.graphVisualRole = "focus-rim";
  rim.visible = false;
  group.add(rim);
  group.userData.graphNodeId = node.id;
  group.userData.graphDefaultNodeObject = true;
  return group;
}

export function createDefaultGraphLinkObject(
  link: RenderLink,
  descriptor: GraphLinkDescriptor | undefined,
): Object3D {
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

function updateLinkObject(object: Object3D, start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }): boolean {
  if (!(object instanceof Line)) return false;
  const positions = object.geometry.getAttribute("position");
  if (!positions || positions.itemSize !== 3) return false;
  positions.setXYZ(0, start.x, start.y, start.z);
  positions.setXYZ(1, end.x, end.y, end.z);
  positions.needsUpdate = true;
  object.geometry.computeBoundingSphere();
  return true;
}

function dimensions(container: HTMLElement, width?: number, height?: number) {
  return {
    width: Math.max(1, Math.floor(width ?? container.clientWidth ?? 1)),
    height: Math.max(1, Math.floor(height ?? container.clientHeight ?? 1)),
  };
}

interface CameraCoordinates {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface CameraPose {
  readonly lookAt: CameraCoordinates;
  readonly position: CameraCoordinates;
}

interface CameraFramingPoint extends Coordinates {
  readonly radius: number;
}

interface CameraProjection {
  readonly aspect: number;
  readonly fovDegrees: number;
}

interface CameraFrameScheduler {
  cancel(frameId: number): void;
  request(callback: FrameRequestCallback): number;
}

type CameraInteractionEvent = "change" | "end" | "start";

interface CameraInteractionControls {
  addEventListener(event: CameraInteractionEvent, listener: () => void): void;
  removeEventListener(event: CameraInteractionEvent, listener: () => void): void;
}

function isCameraInteractionControls(controls: unknown): controls is CameraInteractionControls {
  return typeof controls === "object"
    && controls !== null
    && "addEventListener" in controls
    && typeof controls.addEventListener === "function"
    && "removeEventListener" in controls
    && typeof controls.removeEventListener === "function";
}

function cameraFrameScheduler(container: HTMLElement): CameraFrameScheduler {
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
      return setTimeout(() => callback(Date.now()), 16) as unknown as number;
    },
  };
}

function interpolate(start: number, end: number, progress: number): number {
  return start + ((end - start) * progress);
}

function easeInOutCubic(progress: number): number {
  const bounded = Math.min(1, Math.max(0, progress));
  return bounded < 0.5
    ? 4 * bounded * bounded * bounded
    : 1 - (((-2 * bounded) + 2) ** 3) / 2;
}

function interpolatePose(start: CameraPose, end: CameraPose, progress: number): CameraPose {
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

function boundedPerspectiveProjection(
  camera: unknown,
  viewport: { readonly height: number; readonly width: number },
): CameraProjection {
  const candidate = camera as { readonly aspect?: unknown; readonly fov?: unknown } | null;
  const suppliedAspect = typeof candidate?.aspect === "number" ? candidate.aspect : Number.NaN;
  const suppliedFov = typeof candidate?.fov === "number" ? candidate.fov : Number.NaN;
  return {
    aspect: Number.isFinite(suppliedAspect) && suppliedAspect > 0
      ? suppliedAspect
      : viewport.width / viewport.height,
    fovDegrees: Number.isFinite(suppliedFov)
      ? Math.max(20, Math.min(100, suppliedFov))
      : 50,
  };
}

function contextCameraPose(
  points: readonly CameraFramingPoint[],
  current: CameraPose,
  projection: CameraProjection,
  viewport: { readonly height: number; readonly width: number },
): CameraPose | null {
  if (points.length === 0) return null;
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
  const center = {
    x: (minimum.x + maximum.x) / 2,
    y: (minimum.y + maximum.y) / 2,
    z: (minimum.z + maximum.z) / 2,
  };
  const radius = Math.max(...points.map((point) => (
    Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z) + point.radius
  )));
  const verticalHalfFov = (projection.fovDegrees * Math.PI) / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * projection.aspect);
  const paddingPixels = Math.min(48, Math.max(24, Math.min(viewport.width, viewport.height) * 0.06));
  const usableWidth = Math.max(0.5, (viewport.width - (paddingPixels * 2)) / viewport.width);
  const usableHeight = Math.max(0.5, (viewport.height - (paddingPixels * 2)) / viewport.height);
  const paddedHorizontalHalfFov = Math.atan(Math.tan(horizontalHalfFov) * usableWidth);
  const paddedVerticalHalfFov = Math.atan(Math.tan(verticalHalfFov) * usableHeight);
  const limitingHalfFov = Math.max(0.12, Math.min(paddedHorizontalHalfFov, paddedVerticalHalfFov));
  const distance = Math.max(80, (radius * 1.12) / Math.sin(limitingHalfFov));
  const directionLength = Math.hypot(
    current.position.x - center.x,
    current.position.y - center.y,
    current.position.z - center.z,
  );
  const direction = directionLength > 0
    ? {
      x: (current.position.x - center.x) / directionLength,
      y: (current.position.y - center.y) / directionLength,
      z: (current.position.z - center.z) / directionLength,
    }
    : { x: 0, y: 0, z: 1 };
  return {
    position: {
      x: center.x + (direction.x * distance),
      y: center.y + (direction.y * distance),
      z: center.z + (direction.z * distance),
    },
    lookAt: center,
  };
}

interface Coordinates {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface MutableRenderNodeCoordinates {
  x: number;
  y: number;
  z: number;
  fx?: number;
  fy?: number;
  fz?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

interface SceneNodeTransition {
  readonly id: string;
  readonly start: Coordinates;
  readonly target: Coordinates;
  readonly startOpacity: number;
  readonly targetOpacity: number;
  readonly startRimOpacity: number;
  readonly startScale: number;
  readonly targetScale: number;
}

interface SceneLinkTransition {
  readonly id: string;
  readonly startOpacity: number;
  readonly startWidth: number;
  readonly targetOpacity: number;
  readonly targetWidth: number;
}

interface SceneTransition {
  readonly durationMs: number;
  readonly nodes: readonly SceneNodeTransition[];
  readonly links: readonly SceneLinkTransition[];
  readonly previousFocusNodeId: string | null;
  readonly targetFocusNodeId: string | null;
}

interface ActiveTransition {
  readonly durationMs: number;
  readonly generation: number;
  readonly reducedMotion: boolean;
  readonly scene: SceneTransition | null;
  readonly startCamera: CameraPose | null;
  readonly targetCamera: CameraPose | null;
  startedAt: number | null;
}

function isCoordinates(value: Partial<Coordinates> | undefined): value is Coordinates {
  if (!value) return false;
  return [value.x, value.y, value.z].every((axis) => Number.isFinite(axis));
}

function mutableCoordinates(node: RenderNode): MutableRenderNodeCoordinates {
  return node as unknown as MutableRenderNodeCoordinates;
}

function nodePosition(node: Partial<Coordinates> | undefined): Coordinates | null {
  return isCoordinates(node) ? { x: node.x, y: node.y, z: node.z } : null;
}

function renderDataRevision(data: RenderGraphData): string {
  return JSON.stringify({
    links: data.links.map(({ visual: _visual, ...link }) => link),
    nodes: data.nodes.map(({
      fx: _fx,
      fy: _fy,
      fz: _fz,
      visual: _visual,
      x: _x,
      y: _y,
      z: _z,
      ...node
    }) => node),
    presentation: data.presentation,
    selectionNodeId: data.selection.nodeId,
  });
}

function firstMaterialOpacity(object: Object3D | undefined, fallback: number): number {
  if (!object) return fallback;
  const opacities = visibleMaterialOpacities(object);
  return opacities.length > 0 ? opacities[0]! : fallback;
}

function firstMaterialLineWidth(object: Object3D | undefined, fallback: number): number {
  if (!object) return fallback;
  const widths = visibleMaterialLineWidths(object);
  return widths.length > 0 ? widths[0]! : fallback;
}

function graphChildWithRole(object: Object3D, role: string): Object3D | null {
  let found: Object3D | null = null;
  object.traverse((candidate) => {
    if (!found && candidate.userData.graphVisualRole === role) found = candidate;
  });
  return found;
}

function setObjectMaterialColor(object: Object3D | null, color: string): void {
  if (!object) return;
  materialsForObject(object).forEach((material) => {
    if (!material || typeof material !== "object" || !("color" in material)) return;
    const candidate = material.color;
    if (candidate instanceof Color) candidate.set(color);
  });
}

function setObjectMaterialOpacity(object: Object3D | null, opacity: number): void {
  if (!object) return;
  updateObjectMaterials(object, { opacity });
}

function isMalformedVendorDragRelease(event: PointerEvent, ownerDocument: Document): boolean {
  // 3d-force-graph 1.80.0 emits this coordinate-less event after node drag.
  return event.target === ownerDocument
    && event.isTrusted === false
    && event.pointerType === "touch"
    && event.pointerId === 0;
}

export function createThreeForceGraphRenderer({
  callbacks,
  container,
  nodeObjectFactory = createDefaultGraphNodeObject,
  linkObjectFactory = createDefaultGraphLinkObject,
}: GraphRendererFactoryOptions): GraphRenderer {
  const TypedForceGraph3D = ForceGraph3D as unknown as {
    new(element: HTMLElement, config?: { readonly controlType?: "orbit" }): ForceGraph3DInstance<RenderNode, RenderLink>;
  };
  const graph = new TypedForceGraph3D(container, {
    controlType: "orbit",
  });
  let currentData: RenderGraphData | null = null;
  let currentPresentation: GraphPresentation = {};
  let destroyed = false;
  const renderedLinkObjects = new Map<string, Object3D>();
  const renderedNodeObjects = new Map<string, Object3D>();
  const frameScheduler = cameraFrameScheduler(container);
  let transitionGeneration = 0;
  let transitionFrame: number | null = null;
  let activeTransition: ActiveTransition | null = null;
  let currentDataRevision: string | null = null;
  let deferredDataDuringTransition: RenderGraphData | null = null;
  let initialFitPending = true;
  let pendingSceneTransition: SceneTransition | null = null;
  let transitionObservation: GraphTransitionObservation = {
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
  const suppressMalformedVendorDragRelease = (event: PointerEvent) => {
    if (isMalformedVendorDragRelease(event, ownerDocument)) {
      event.stopImmediatePropagation();
    }
  };
  ownerDocument.addEventListener("pointerup", suppressMalformedVendorDragRelease, true);

  const nodeDescriptor = (node: RenderNode) => descriptorForNode(node, currentPresentation.nodeDescriptors?.[node.id]);
  const linkDescriptor = (link: RenderLink) => descriptorForLink(link, currentPresentation.linkDescriptors?.[link.id]);

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
    .linkPositionUpdate((object, coordinates) => updateLinkObject(
      object,
      coordinates.start,
      coordinates.end,
    ))
    .onNodeClick((node) => callbacks.onNodeClick(node.id))
    .onNodeHover((node) => callbacks.onNodeHover(node?.id ?? null))
    // 3d-force-graph uses separate DragControls for nodes, so OrbitControls'
    // events do not cover this path.
    .onNodeDrag(() => {
      pendingSceneTransition = null;
      cancelCameraTransition();
    })
    .onBackgroundClick(() => callbacks.onBackgroundClick());

  function setNodePosition(node: RenderNode, position: Coordinates, lock: boolean): void {
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

  function applyNodePalette(node: RenderNode): void {
    const object = renderedNodeObjects.get(node.id);
    if (!object || object.userData.graphDefaultNodeObject !== true) return;
    const palette = themePalette(currentPresentation.theme);
    const descriptor = nodeDescriptor(node);
    setObjectMaterialColor(graphChildWithRole(object, "body"), descriptor.color ?? palette.body);
    setObjectMaterialColor(graphChildWithRole(object, "outline"), palette.outline);
    setObjectMaterialColor(graphChildWithRole(object, "focus-rim"), palette.rim);
  }

  function applyLinkPalette(link: RenderLink): void {
    const object = renderedLinkObjects.get(link.id);
    if (!object || object.userData.graphLinkId !== link.id) return;
    setObjectMaterialColor(object, linkDescriptor(link).color ?? themePalette(currentPresentation.theme).edge);
  }

  function applyNodeVisual(node: RenderNode, opacity: number, scale: number, rimOpacity: number): void {
    const object = renderedNodeObjects.get(node.id);
    if (!object) return;
    updateObjectMaterials(object, {
      emissiveIntensity: nodeEmissiveIntensity(node),
      opacity,
    });
    if (object.userData.graphDefaultNodeObject === true) {
      object.scale.setScalar(scale);
    }
    const rim = graphChildWithRole(object, "focus-rim");
    if (!rim) return;
    rim.visible = rimOpacity > 0;
    setObjectMaterialOpacity(rim, rimOpacity);
  }

  function applyLinkVisual(link: RenderLink, opacity: number, width: number): void {
    const object = renderedLinkObjects.get(link.id);
    if (!object) return;
    updateObjectMaterials(object, { opacity, width });
  }

  function applyFinalVisuals(data: RenderGraphData): void {
    data.nodes.forEach((node) => {
      const descriptor = nodeDescriptor(node);
      applyNodePalette(node);
      applyNodeVisual(
        node,
        boundedOpacity(descriptor.opacity, node.visual.opacity),
        data.selection.nodeId === node.id ? 1.06 : 1,
        data.selection.nodeId === node.id ? boundedOpacity(descriptor.opacity, node.visual.opacity) : 0,
      );
    });
    data.links.forEach((link) => {
      const descriptor = linkDescriptor(link);
      applyLinkPalette(link);
      applyLinkVisual(
        link,
        boundedOpacity(descriptor.opacity, link.visual.opacity),
        descriptor.width ?? link.visual.width,
      );
    });
  }

  function liveNodePositions(): Map<string, Coordinates> {
    return new Map(graph.graphData().nodes.flatMap((node) => {
      const position = nodePosition(node);
      return position ? [[node.id, position] as const] : [];
    }));
  }

  function liveTransitionNodePositions(): readonly GraphTransitionNodePosition[] {
    return graph.graphData().nodes.flatMap((node) => {
      const position = nodePosition(node);
      return position ? [{ id: node.id, ...position }] : [];
    });
  }

  function makeLiveData(
    data: RenderGraphData,
    startPositions: ReadonlyMap<string, Coordinates> | null,
  ): { links: RenderLink[]; nodes: RenderNode[] } {
    return {
      links: data.links.map((link) => ({ ...link })),
      nodes: data.nodes.map((node) => {
        const live = { ...node } as RenderNode;
        const target = nodePosition(node)!;
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

  function createSceneTransition(
    data: RenderGraphData,
    previousData: RenderGraphData,
    startPositions: ReadonlyMap<string, Coordinates>,
  ): SceneTransition {
    const previousNodeById = new Map(previousData.nodes.map((node) => [node.id, node]));
    const previousLinkById = new Map(previousData.links.map((link) => [link.id, link]));
    const targetFocusNodeId = data.selection.nodeId;
    const previousFocusNodeId = previousData.selection.nodeId;
    const nodes = data.nodes.map((node) => {
      const descriptor = nodeDescriptor(node);
      const previousNode = previousNodeById.get(node.id);
      const previousObject = renderedNodeObjects.get(node.id);
      const previousOpacity = previousNode
        ? boundedOpacity(
          descriptorForNode(previousNode, previousData.presentation.nodeDescriptors?.[node.id]).opacity,
          previousNode.visual.opacity,
        )
        : boundedOpacity(descriptor.opacity, node.visual.opacity);
      const start = startPositions.get(node.id) ?? nodePosition(node)!;
      const rim = previousObject ? graphChildWithRole(previousObject, "focus-rim") : null;
      return {
        id: node.id,
        start,
        target: nodePosition(node)!,
        startOpacity: firstMaterialOpacity(previousObject, previousOpacity),
        startRimOpacity: rim?.visible === true
          ? firstMaterialOpacity(rim, previousOpacity)
          : 0,
        startScale: previousObject?.scale.x ?? 1,
        targetOpacity: boundedOpacity(descriptor.opacity, node.visual.opacity),
        targetScale: targetFocusNodeId === node.id ? 1.06 : 1,
      };
    });
    const links = data.links.map((link) => {
      const descriptor = linkDescriptor(link);
      const previousLink = previousLinkById.get(link.id);
      const previousObject = renderedLinkObjects.get(link.id);
      return {
        id: link.id,
        startOpacity: firstMaterialOpacity(
          previousObject,
          previousLink
            ? descriptorForLink(previousLink, previousData.presentation.linkDescriptors?.[link.id]).opacity ?? previousLink.visual.opacity
            : boundedOpacity(descriptor.opacity, link.visual.opacity),
        ),
        startWidth: firstMaterialLineWidth(
          previousObject,
          previousLink
            ? descriptorForLink(previousLink, previousData.presentation.linkDescriptors?.[link.id]).width ?? previousLink.visual.width
            : descriptor.width ?? link.visual.width,
        ),
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

  function applySceneFrame(scene: SceneTransition, progress: number, final = false): void {
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
      if (!live || !targetNode) return;
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
      } else if (retargetingFocus && transition.id === scene.targetFocusNodeId) {
        scale = interpolate(1, transition.targetScale, secondPhase);
        rimOpacity = transition.targetOpacity * secondPhase;
      } else if (scene.previousFocusNodeId === null && transition.id === scene.targetFocusNodeId) {
        scale = interpolate(1, transition.targetScale, secondPhase);
        rimOpacity = transition.targetOpacity * secondPhase;
      } else if (scene.targetFocusNodeId === null && transition.id === scene.previousFocusNodeId) {
        scale = interpolate(transition.startScale, 1, eased);
        rimOpacity = interpolate(transition.startRimOpacity, 0, eased);
      } else if (transition.id === scene.targetFocusNodeId) {
        rimOpacity = transition.targetOpacity;
      }
      applyNodeVisual(
        targetNode,
        final ? transition.targetOpacity : interpolate(transition.startOpacity, transition.targetOpacity, eased),
        final ? transition.targetScale : scale,
        final && transition.id === scene.targetFocusNodeId ? transition.targetOpacity : rimOpacity,
      );
    });

    scene.links.forEach((transition) => {
      const targetLink = targetLinkById.get(transition.id);
      if (!targetLink) return;
      applyLinkVisual(
        targetLink,
        final ? transition.targetOpacity : interpolate(transition.startOpacity, transition.targetOpacity, eased),
        final ? transition.targetWidth : interpolate(transition.startWidth, transition.targetWidth, eased),
      );
    });
  }

  function applyData(data: RenderGraphData): void {
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
      if (!nodeIds.has(id)) renderedNodeObjects.delete(id);
    });
    renderedLinkObjects.forEach((_object, id) => {
      if (!linkIds.has(id)) renderedLinkObjects.delete(id);
    });
    if (!previousData || !selectionChanged || !starts) {
      pendingSceneTransition = null;
      applyFinalVisuals(data);
      return;
    }

    const scene = createSceneTransition(data, previousData, starts);
    pendingSceneTransition = scene;
    data.nodes.forEach((node) => applyNodePalette(node));
    data.links.forEach((link) => applyLinkPalette(link));
    applySceneFrame(scene, 0);
    if (scene.targetFocusNodeId === null) {
      pendingSceneTransition = null;
      transitionToFit(scene.durationMs, scene);
    }
  }

  function flushDeferredData(): void {
    const deferredData = deferredDataDuringTransition;
    deferredDataDuringTransition = null;
    if (!deferredData || destroyed) return;
    applyData(deferredData);
  }

  function cancelCameraTransition(): void {
    const cancelledTransition = activeTransition;
    const cancelledProgress = cancelledTransition
      ? transitionObservation.progress
      : 1;
    transitionGeneration += 1;
    if (transitionFrame !== null) frameScheduler.cancel(transitionFrame);
    transitionFrame = null;
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
    if (cancelledTransition?.scene) flushDeferredData();
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
    if (cameraControlInteractionActive) cancelCameraTransition();
  };
  const endCameraControlInteraction = () => {
    cameraControlInteractionActive = false;
  };
  cameraInteractionControls?.addEventListener("start", beginCameraControlInteraction);
  cameraInteractionControls?.addEventListener("change", updateCameraControlInteraction);
  cameraInteractionControls?.addEventListener("end", endCameraControlInteraction);

  function cameraPose(): CameraPose {
    const current = graph.cameraPosition() as CameraCoordinates & { readonly lookAt?: CameraCoordinates };
    return {
      position: { x: current.x, y: current.y, z: current.z },
      lookAt: current.lookAt
        ? { x: current.lookAt.x, y: current.lookAt.y, z: current.lookAt.z }
        : { x: 0, y: 0, z: 0 },
    };
  }

  function setCameraPose(pose: CameraPose): void {
    graph.cameraPosition(pose.position, pose.lookAt, 0);
  }

  function startTransition({
    durationMs,
    reducedMotion = false,
    scene = null,
    targetCamera = null,
  }: {
    readonly durationMs: number;
    readonly reducedMotion?: boolean;
    readonly scene?: SceneTransition | null;
    readonly targetCamera?: CameraPose | null;
  }): void {
    cancelCameraTransition();
    const startCamera = targetCamera ? cameraPose() : null;
    const active: ActiveTransition = {
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
      if (targetCamera) setCameraPose(targetCamera);
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
    let startedAt: number | null = null;
    const update = (timestamp: number) => {
      if (active.generation !== transitionGeneration || activeTransition !== active) return;
      startedAt ??= timestamp;
      const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / durationMs));
      active.startedAt = startedAt;
      if (active.scene) applySceneFrame(active.scene, progress);
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
        transitionFrame = frameScheduler.request(update);
      } else {
        active.scene && applySceneFrame(active.scene, 1, true);
        transitionFrame = null;
        activeTransition = null;
        flushDeferredData();
      }
    };
    transitionFrame = frameScheduler.request(update);
  }

  function transitionToFit(durationMs: number, scene: SceneTransition | null = null): void {
    if (activeTransition) cancelCameraTransition();
    const start = cameraPose();
    if (scene) applySceneFrame(scene, 1, true);
    graph.zoomToFit(0, 28);
    const target = cameraPose();
    if (scene) applySceneFrame(scene, 0);
    setCameraPose(start);
    startTransition({
      durationMs,
      reducedMotion: scene?.durationMs === 0,
      scene,
      targetCamera: target,
    });
  }

  function nodeCameraTarget(nodeId: string): CameraPose | null {
    if (!currentData?.nodes.some((candidate) => candidate.id === nodeId)) return null;
    const contextNodeIds = new Set<string>([
      nodeId,
      ...(currentData.selection.nodeId === nodeId ? currentData.selection.neighborNodeIds : []),
      ...currentData.nodes
        .filter((node) => node.roles?.includes("master"))
        .map((node) => node.id),
    ]);
    const points = currentData.nodes.flatMap((node): CameraFramingPoint[] => {
      if (!contextNodeIds.has(node.id)) return [];
      const position = nodePosition(node);
      if (!position) return [];
      const bodyRadius = node.type === "relation" ? 7.5 : 3;
      const focusScale = node.id === nodeId ? 1.06 : 1;
      return [{ ...position, radius: bodyRadius * 1.16 * focusScale }];
    });
    const viewport = currentData.selection.viewport;
    return contextCameraPose(
      points,
      cameraPose(),
      boundedPerspectiveProjection(graph.camera(), viewport),
      viewport,
    );
  }

  function transitionToNode(nodeId: string, options: GraphCameraTransitionOptions): void {
    if (activeTransition) cancelCameraTransition();
    const targetCamera = nodeCameraTarget(nodeId);
    if (!targetCamera) return;
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

  function getRenderObservation(): GraphRenderObservation | null {
    if (destroyed || !currentData) return null;
    const data = graph.graphData();
    const scene = graph.scene();
    const nodesById = new Map(currentData.nodes.map((node) => [node.id, node]));
    const linksById = new Map(currentData.links.map((link) => [link.id, link]));
    const nodeIds = data.nodes.map((node) => node.id);
    const linkIds = data.links.map((link) => link.id);
    const nodes: GraphRenderNodeObservation[] = [];
    const links: GraphRenderLinkObservation[] = [];

    nodeIds.forEach((id) => {
      const node = nodesById.get(id);
      if (!node) return;
      nodes.push({
        ...observeGraphObject(id, renderedNodeObjects.get(id), scene),
        visual: node.visual,
      });
    });
    linkIds.forEach((id) => {
      const link = linksById.get(id);
      if (!link) return;
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
      if (destroyed) return;
      destroyed = true;
      deferredDataDuringTransition = null;
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
      pendingSceneTransition = null;
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
      if (!currentData) return;
      const nextData = { ...currentData, presentation };
      if (renderDataRevision(nextData) === currentDataRevision) {
        currentData = nextData;
        currentPresentation = presentation;
        graph.backgroundColor(themePalette(currentPresentation.theme).background);
        currentData.nodes.forEach((node) => applyNodePalette(node));
        currentData.links.forEach((link) => applyLinkPalette(link));
        if (!activeTransition && !pendingSceneTransition) applyFinalVisuals(currentData);
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
