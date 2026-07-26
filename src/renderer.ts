import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  Sprite,
  SpriteMaterial,
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
  GraphRenderNodeLabelObservation,
  GraphRenderObjectObservation,
  GraphRenderObservation,
  GraphRenderTransformObservation,
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
  GraphRenderNodeLabelObservation,
  GraphRenderObjectObservation,
  GraphRenderObservation,
  GraphRenderTransformObservation,
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

function stableUnit(value: string): number {
  let state = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    state ^= value.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return (state >>> 0) / 0xffffffff;
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

// Static labels are the primary way to identify a node. Keep this independent
// from the quieter body/edge treatment of distant nodes so every name remains
// readable against the routine-harness background.
const STATIC_LABEL_OPACITY = Object.freeze({
  far: 0.72,
  neighbor: 0.82,
  selected: 1,
});

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

function materialDepthWrite(material: unknown): boolean | null {
  if (!material || typeof material !== "object" || !("depthWrite" in material)) return null;
  return typeof material.depthWrite === "boolean" ? material.depthWrite : null;
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

function objectTransformObservation(id: string, object: Object3D | undefined): GraphRenderTransformObservation {
  if (!object) return { position: null, scale: null };
  return {
    position: { id, x: object.position.x, y: object.position.y, z: object.position.z },
    scale: { id, x: object.scale.x, y: object.scale.y, z: object.scale.z },
  };
}

function nodeLabelObservation(
  id: string,
  label: Object3D | null,
  scene: Object3D,
): GraphRenderNodeLabelObservation {
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
        // Sprite labels carry their glyph mask in texture alpha. They must
        // remain transparent even at opacity 1 or WebGL treats the empty canvas
        // pixels as an opaque black rectangle.
        material.transparent = ("isSpriteMaterial" in material && material.isSpriteMaterial === true)
          || update.opacity < 1;
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

function createNodeLabelSprite(label: string, radius: number, opacity: number): Sprite {
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
        if (textureDisposed) return;
        textureDisposed = true;
        texture.dispose();
      });
      spriteMaterial.needsUpdate = true;
    }
  }
  const sprite = new Sprite(spriteMaterial);
  sprite.center.set(0.5, 0);
  sprite.position.set(0, radius + 3.8, 0);
  sprite.scale.set(
    Math.max(17, Math.min(58, text.length * 3.05)),
    radius >= 7 ? 10 : 8,
    1,
  );
  sprite.userData.graphBaseLabelScale = { x: sprite.scale.x, y: sprite.scale.y, z: sprite.scale.z };
  sprite.renderOrder = 42;
  sprite.userData.graphVisualRole = "node-label";
  return sprite;
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

  // Keep the reference's soft, filled node masses. Selection is carried by
  // scale, the label and edge hierarchy instead of a permanent outline shell
  // or a bright halo around the focused node.
  group.add(createNodeLabelSprite(descriptor?.label ?? node.label, radius, opacity));
  group.userData.graphNodeId = node.id;
  group.userData.graphDefaultNodeObject = true;
  return group;
}

export function createDefaultGraphLinkObject(
  link: RenderLink,
  descriptor: GraphLinkDescriptor | undefined,
): Object3D {
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
  return line;
}

function updateLinkObject(object: Object3D, start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }): boolean {
  if (!(object instanceof Line)) return false;
  const positions = object.geometry.getAttribute("position");
  if (!positions || positions.itemSize !== 3 || positions.count < 2) return false;
  positions.setXYZ(0, start.x, start.y, start.z);
  if (positions.count >= 3) {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const planarDistance = Math.hypot(deltaX, deltaY);
    const curve = Math.max(3, Math.min(18, planarDistance * 0.12));
    const direction = planarDistance > 0
      ? { x: deltaX / planarDistance, y: deltaY / planarDistance }
      : { x: 1, y: 0 };
    const bendDirection = stableUnit(`${String(object.userData.graphLinkId ?? "link")}:curve`) >= 0.5 ? 1 : -1;
    positions.setXYZ(
      1,
      ((start.x + end.x) / 2) + (-direction.y * curve * bendDirection),
      ((start.y + end.y) / 2) + (direction.x * curve * bendDirection),
      ((start.z + end.z) / 2) + (curve * 0.32 * bendDirection),
    );
    positions.setXYZ(2, end.x, end.y, end.z);
  } else {
    positions.setXYZ(1, end.x, end.y, end.z);
  }
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

function contextCameraPose(
  points: readonly CameraFramingPoint[],
  current: CameraPose,
  projection: CameraProjection,
  viewport: { readonly height: number; readonly width: number },
  focalPoint: Coordinates | null = null,
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
  const referenceUp = Math.abs(direction.y) > 0.94
    ? { x: 0, y: 0, z: 1 }
    : { x: 0, y: 1, z: 0 };
  const rightLength = Math.hypot(
    (referenceUp.y * direction.z) - (referenceUp.z * direction.y),
    (referenceUp.z * direction.x) - (referenceUp.x * direction.z),
    (referenceUp.x * direction.y) - (referenceUp.y * direction.x),
  );
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
  readonly startLabelOpacity: number;
  readonly startLabelScale: number;
  readonly targetLabelVisible: boolean;
  readonly targetLabelOpacity: number;
  readonly targetLabelScale: number;
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

interface NodeSceneVisual {
  readonly labelVisible: boolean;
  readonly labelOpacity: number;
  readonly labelScale: number;
  readonly opacity: number;
  readonly scale: number;
}

function sceneVisualForNode(
  node: RenderNode,
  data: RenderGraphData,
  descriptor: GraphNodeDescriptor,
): NodeSceneVisual {
  const baseOpacity = boundedOpacity(descriptor.opacity, node.visual.opacity);
  const isSelected = data.selection.nodeId === node.id;
  const isNeighbor = data.selection.neighborNodeIds.includes(node.id);
  // The initial camera faces the positive Z direction. A stable world-space
  // depth cue therefore gives receding nodes smaller, quieter silhouettes even
  // before the user starts orbiting; selection keeps the active node crisp.
  const depthProgress = Math.max(0, Math.min(1, (node.z + 132) / 264));
  const depthScale = 0.72 + (depthProgress * 0.28);
  const depthOpacity = 0.7 + (depthProgress * 0.3);
  const viewportScale = Math.max(
    1,
    Math.min(1.3, 480 / Math.max(1, Math.min(data.selection.viewport.width, data.selection.viewport.height))),
  );
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
    // Static Sprite labels are the scene's source of truth. Disabling the
    // vendor HTML tooltip avoids an opaque duplicate over the camera-facing
    // label while keeping the host callback seam unchanged.
    .nodeLabel(() => "")
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
    setObjectMaterialColor(graphChildWithRole(object, "node-label"), palette.outline);
  }

  function applyLinkPalette(link: RenderLink): void {
    const object = renderedLinkObjects.get(link.id);
    if (!object || object.userData.graphLinkId !== link.id) return;
    setObjectMaterialColor(object, linkDescriptor(link).color ?? themePalette(currentPresentation.theme).edge);
  }

  function staticLabelBaseScale(label: Object3D): Coordinates {
    const stored = label.userData.graphBaseLabelScale as Partial<Coordinates> | undefined;
    if (stored && [stored.x, stored.y, stored.z].every((value) => typeof value === "number" && Number.isFinite(value))) {
      return { x: stored.x!, y: stored.y!, z: stored.z! };
    }
    const base = { x: label.scale.x, y: label.scale.y, z: label.scale.z };
    label.userData.graphBaseLabelScale = base;
    return base;
  }

  function staticLabelScaleMultiplier(label: Object3D | null): number {
    if (!label) return 1;
    const base = staticLabelBaseScale(label);
    return base.x > 0 ? label.scale.x / base.x : 1;
  }

  function applyNodeVisual(
    node: RenderNode,
    opacity: number,
    scale: number,
    rimOpacity: number,
    labelVisible: boolean,
    labelOpacity: number,
    labelScale: number,
  ): void {
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
  }

  function applyLinkVisual(link: RenderLink, opacity: number, width: number): void {
    const object = renderedLinkObjects.get(link.id);
    if (!object) return;
    updateObjectMaterials(object, { opacity, width });
  }

  function applyFinalVisuals(data: RenderGraphData): void {
    data.nodes.forEach((node) => {
      const descriptor = nodeDescriptor(node);
      const visual = sceneVisualForNode(node, data, descriptor);
      applyNodePalette(node);
      applyNodeVisual(
        node,
        visual.opacity,
        visual.scale,
        data.selection.nodeId === node.id ? visual.opacity : 0,
        visual.labelVisible,
        visual.labelOpacity,
        visual.labelScale,
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
      const targetVisual = sceneVisualForNode(node, data, descriptor);
      const previousNode = previousNodeById.get(node.id);
      const previousObject = renderedNodeObjects.get(node.id);
      const previousVisual = previousNode
        ? sceneVisualForNode(
          previousNode,
          previousData,
          descriptorForNode(previousNode, previousData.presentation.nodeDescriptors?.[node.id]),
        )
        : targetVisual;
      const start = startPositions.get(node.id) ?? nodePosition(node)!;
      const rim = previousObject ? graphChildWithRole(previousObject, "focus-rim") : null;
      const label = previousObject ? graphChildWithRole(previousObject, "node-label") : null;
      return {
        id: node.id,
        start,
        target: nodePosition(node)!,
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
        transition.targetLabelVisible,
        final
          ? transition.targetLabelOpacity
          : interpolate(transition.startLabelOpacity, transition.targetLabelOpacity, eased),
        final
          ? transition.targetLabelScale
          : interpolate(transition.startLabelScale, transition.targetLabelScale, eased),
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
    const focused = currentData?.nodes.find((candidate) => candidate.id === nodeId);
    if (!currentData || !focused) return null;
    const focalPoint = nodePosition(focused);
    const points = currentData.nodes.flatMap((node): CameraFramingPoint[] => {
      const position = nodePosition(node);
      if (!position) return [];
      const bodyRadius = node.type === "relation" ? 7.5 : 3;
      const focusScale = node.id === nodeId ? 1.22 : 1;
      return [{ ...position, radius: bodyRadius * 1.16 * focusScale }];
    });
    const viewport = currentData.selection.viewport;
    return contextCameraPose(
      points,
      cameraPose(),
      boundedPerspectiveProjection(graph.camera(), viewport),
      viewport,
      focalPoint,
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
      const object = renderedNodeObjects.get(id);
      const liveNode = data.nodes.find((candidate) => candidate.id === id);
      const livePosition = nodePosition(liveNode) ?? nodePosition(node)!;
      nodes.push({
        ...observeGraphObject(id, object, scene),
        label: nodeLabelObservation(id, object ? graphChildWithRole(object, "node-label") : null, scene),
        worldPosition: { id, ...livePosition },
        worldScale: objectTransformObservation(id, object).scale,
        visual: node.visual,
      });
    });
    linkIds.forEach((id) => {
      const link = linksById.get(id);
      if (!link) return;
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
