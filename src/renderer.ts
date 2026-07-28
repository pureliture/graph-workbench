import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  NoColorSpace,
  Object3D,
  Quaternion,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";

import type { GraphNode } from "./contract.js";
import type { RenderGraphData, RenderLink, RenderNode } from "./layout.js";
import type { GraphLinkDescriptor, GraphNodeDescriptor, GraphPresentation } from "./presentation.js";
import type {
  GraphCameraTransitionOptions,
  GraphAmbientMotionLinkEndpointObservation,
  GraphAmbientMotionLinkEndpointBoundaryObservation,
  GraphAmbientMotionLinkFlowObservation,
  GraphAmbientMotionNodePosition,
  GraphAmbientMotionPosition,
  GraphAmbientMotionObservation,
  GraphAmbientMotionParticleObservation,
  GraphAmbientMotionScreenPosition,
  GraphDefaultNodeSilhouette,
  GraphLinkObjectFactory,
  GraphRenderDefaultNodeBodyObservation,
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
  GraphAmbientMotionLinkEndpointObservation,
  GraphAmbientMotionLinkEndpointBoundaryObservation,
  GraphAmbientMotionLinkFlowObservation,
  GraphAmbientMotionNodePosition,
  GraphAmbientMotionPosition,
  GraphAmbientMotionObservation,
  GraphAmbientMotionParticleObservation,
  GraphAmbientMotionScreenPosition,
  GraphDefaultNodeSilhouette,
  GraphRenderLinkObservation,
  GraphRenderDefaultNodeBodyObservation,
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
  readonly edge: string;
  readonly node: Readonly<Record<GraphNodeVisualKind, string>>;
  readonly outline: string;
  readonly rim: string;
}

type GraphNodeVisualKind =
  | "agent"
  | "command"
  | "composite"
  | "fallback"
  | "hook"
  | "leaf"
  | "profile"
  | "rule"
  | "skill"
  | "workflow";

interface LinkEndpoints {
  readonly source: string;
  readonly target: string;
}

interface DefaultNodeVisualInput {
  readonly degree: number;
  readonly silhouette: DefaultNodeSilhouetteSpec;
  readonly visualKind: GraphNodeVisualKind;
}

const ROUTINE_COMPONENT_KINDS = new Set<GraphNodeVisualKind>([
  "agent",
  "command",
  "composite",
  "hook",
  "rule",
  "skill",
]);

// These are the semantic Three.js colors from routine-harness's Tauri graph.
// The interaction choreography is intentionally independent of the palette.
const THEME_PALETTES: Readonly<Record<"dark" | "light", GraphThemePalette>> = {
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
// intentionally hide unrelated far labels below this former static floor.
const STATIC_LABEL_OPACITY = Object.freeze({
  far: 0.18,
  neighbor: 0.72,
  selected: 1,
});
// `near` is normalized along the live camera axis: 0 is the deepest node and
// 1 is the nearest. Unrelated labels fade through the middle band, then leave
// the scene entirely so a dense graph does not turn into a wall of names.
const DISTANT_LABEL_VISIBILITY = Object.freeze({
  fullyVisibleAt: 0.7,
  hiddenUntil: 0.46,
});

const AMBIENT_COMMON_FLOAT = Object.freeze({ x: 4.8, y: 3.6, z: 1.25 });
const AMBIENT_NODE_BREATHING = Object.freeze({ x: 1.55, y: 1.85, z: 0.72 });
const AMBIENT_CAMERA_DRIFT = Object.freeze({ x: 1.1, y: 0.82, z: 0.34 });
// Covers the largest common-plus-individual planar displacement (6.35).
const AMBIENT_MAX_OFFSET = 7;
const AMBIENT_RADIANS_PER_SECOND = 0.24;
const FLOW_SPEED_CYCLES_PER_SECOND = 0.11;
// Idle flow is deliberately much slower and smaller than an interaction flow.
// It lets a settled graph read as a living system without turning every edge
// into a competing animation.
const IDLE_FLOW_SPEED_CYCLES_PER_SECOND = 0.018;
const MAX_IDLE_FLOW_PARTICLES = 3;
const IDLE_FLOW_PARTICLE_SCALE = 0.22;
const INTERACTION_FLOW_PARTICLE_SCALE = 0.72;
const MAX_FLOW_PARTICLES = 12;
const DEFAULT_LINK_CURVE_SEGMENTS = 28;
const DEFAULT_LINK_BOUNDARY_SCAN_STEPS = 28;
const DEFAULT_LINK_BOUNDARY_BISECTION_STEPS = 12;
const DEFAULT_LINK_BOUNDARY_PROBE_PROGRESS = 2 / (
  DEFAULT_LINK_BOUNDARY_SCAN_STEPS * (2 ** DEFAULT_LINK_BOUNDARY_BISECTION_STEPS)
);
const AMBIENT_VISUAL_EPSILON = 0.0001;
const AMBIENT_MASTER_BODY_OPACITY_FLOOR = 0.5;
const AMBIENT_MASTER_LABEL_OPACITY_FLOOR = 0.5;
// The previous far tier disappears against a white canvas. Keep light-mode
// context readable without approaching selected or incident emphasis.
const LIGHT_SELECTED_CONTEXT_FLOOR = Object.freeze({
  bodyOpacity: 0.2,
  labelOpacity: 0.36,
  linkOpacity: 0.16,
  linkWidth: 0.68,
});
// The initial field needs enough mass to establish the graph before a user
// selects anything. These values retain a visibly softer far tier without
// making routine-harness's type palette disappear into the dark canvas.
const IDLE_BODY_OPACITY = Object.freeze({ far: 0.46, nearRange: 0.3 });
const IDLE_LABEL_OPACITY = Object.freeze({ far: 0.28, nearRange: 0.46 });
// The quiet field needs to remain independently legible before focus, while
// still leaving a clear gap to the selected relationship tier (0.58+).
const IDLE_LINK_OPACITY = Object.freeze({ maximum: 0.28, minimum: 0.22 });
const IDLE_NODE_SCALE = Object.freeze({ far: 0.86, nearRange: 0.28 });
const IDLE_LABEL_SCALE = Object.freeze({ far: 0.8, nearRange: 0.2 });

function distantLabelVisibility(near: number): number {
  const progress = Math.max(0, Math.min(
    1,
    (near - DISTANT_LABEL_VISIBILITY.hiddenUntil)
      / (DISTANT_LABEL_VISIBILITY.fullyVisibleAt - DISTANT_LABEL_VISIBILITY.hiddenUntil),
  ));
  return progress * progress * (3 - (2 * progress));
}

function themePalette(theme: GraphPresentation["theme"]): GraphThemePalette {
  return theme === "light" ? THEME_PALETTES.light : THEME_PALETTES.dark;
}

function nodeDegrees(links: readonly LinkEndpoints[]): ReadonlyMap<string, number> {
  const degrees = new Map<string, number>();
  links.forEach((link) => {
    degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1);
    degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1);
  });
  return degrees;
}

function routineComponentKind(node: GraphNode): GraphNodeVisualKind | null {
  const candidate = node.kind.toLowerCase();
  return ROUTINE_COMPONENT_KINDS.has(candidate as GraphNodeVisualKind)
    ? candidate as GraphNodeVisualKind
    : null;
}

function resolvedNodeVisualKind(node: GraphNode, degree = 0): GraphNodeVisualKind {
  // These identities must remain visible even where a profile or workflow is
  // incident to exactly one relationship.
  if (node.type === "profile") return "profile";
  if (node.type === "workflow" || node.kind === "workflow") return "workflow";
  if (degree === 1) return "leaf";
  return routineComponentKind(node) ?? "fallback";
}

function defaultNodeColor(
  node: GraphNode,
  descriptor: GraphNodeDescriptor | undefined,
  theme: GraphPresentation["theme"] = "dark",
  visualKind = resolvedNodeVisualKind(node),
): string {
  return descriptor?.color ?? themePalette(theme).node[visualKind];
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

function nodeEmissiveIntensity(node: RenderNode): number {
  // This remains part of the long-standing custom-object visual update path.
  // Renderer-owned defaults use MeshBasicMaterial and therefore ignore it.
  return node.type === "relation" ? 0.1 : 0.08;
}

interface DefaultNodeSilhouetteSpec {
  readonly cameraRadius: number;
  readonly height: number;
  readonly kind: GraphDefaultNodeSilhouette;
  readonly labelAnchorY: number;
  readonly width: number;
}

function defaultNodeSilhouette(
  node: RenderNode,
  visualKind = resolvedNodeVisualKind(node),
): DefaultNodeSilhouetteSpec {
  if (visualKind === "profile") {
    return { cameraRadius: 3.8, height: 7.6, kind: "circle", labelAnchorY: 7.6, width: 7.6 };
  }
  if (visualKind === "workflow") {
    return { cameraRadius: 7, height: 5.8, kind: "capsule", labelAnchorY: 6.8, width: 14 };
  }
  if (visualKind === "leaf") {
    return { cameraRadius: 1.6, height: 3.2, kind: "dot", labelAnchorY: 4.8, width: 3.2 };
  }
  if (node.type === "relation") {
    return { cameraRadius: 6.8, height: 13.6, kind: "disk", labelAnchorY: 10.6, width: 13.6 };
  }
  return { cameraRadius: 2.8, height: 5.6, kind: "circle", labelAnchorY: 6.6, width: 5.6 };
}

function defaultNodeSilhouetteSignature(silhouette: DefaultNodeSilhouetteSpec): string {
  return [
    silhouette.kind,
    silhouette.width,
    silhouette.height,
    silhouette.labelAnchorY,
    silhouette.cameraRadius,
  ].join(":");
}

function defaultNodeVisualInputs(data: RenderGraphData): ReadonlyMap<string, DefaultNodeVisualInput> {
  const degrees = nodeDegrees(data.links);
  return new Map(data.nodes.map((node) => {
    const degree = degrees.get(node.id) ?? 0;
    const visualKind = resolvedNodeVisualKind(node, degree);
    return [node.id, { degree, silhouette: defaultNodeSilhouette(node, visualKind), visualKind }];
  }));
}

function defaultNodeVisualInputsRevision(data: RenderGraphData): string {
  return JSON.stringify({
    links: data.links.map((link) => ({ source: link.source, target: link.target })),
    nodes: data.nodes.map((node) => ({ id: node.id, kind: node.kind, type: node.type })),
  });
}

function createCapsuleGeometry(width: number, height: number): ShapeGeometry {
  const radius = height / 2;
  const halfStraight = Math.max(0, (width / 2) - radius);
  const shape = new Shape();
  shape.moveTo(-halfStraight, -radius);
  shape.lineTo(halfStraight, -radius);
  shape.absarc(halfStraight, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-halfStraight, radius);
  shape.absarc(-halfStraight, 0, radius, Math.PI / 2, (Math.PI * 3) / 2, false);
  return new ShapeGeometry(shape, 20);
}

function createDefaultNodeGeometry(silhouette: DefaultNodeSilhouetteSpec): BufferGeometry {
  if (silhouette.kind === "capsule") {
    return createCapsuleGeometry(silhouette.width, silhouette.height);
  }
  return new CircleGeometry(silhouette.width / 2, silhouette.kind === "dot" ? 16 : 28);
}

function makeCameraFacingFlatMesh(mesh: Mesh): void {
  const cameraWorldQuaternion = new Quaternion();
  const parentWorldQuaternion = new Quaternion();
  const fallbackCamera = new Object3D();
  const updateFacing = (camera: unknown, fallbackPose?: CameraPose): void => {
    if (camera && typeof camera === "object" && "getWorldQuaternion" in camera
      && typeof camera.getWorldQuaternion === "function") {
      camera.getWorldQuaternion(cameraWorldQuaternion);
    } else if (fallbackPose && [
      fallbackPose.position.x,
      fallbackPose.position.y,
      fallbackPose.position.z,
      fallbackPose.lookAt.x,
      fallbackPose.lookAt.y,
      fallbackPose.lookAt.z,
    ].every(Number.isFinite)) {
      fallbackCamera.position.set(
        fallbackPose.position.x,
        fallbackPose.position.y,
        fallbackPose.position.z,
      );
      fallbackCamera.lookAt(
        fallbackPose.lookAt.x,
        fallbackPose.lookAt.y,
        fallbackPose.lookAt.z,
      );
      cameraWorldQuaternion.copy(fallbackCamera.quaternion);
    } else {
      return;
    }
    if (!mesh.parent) {
      mesh.quaternion.copy(cameraWorldQuaternion);
    } else {
      // The default body can be nested under a host or ambient transform. Use
      // its parent's inverse world rotation so the local flat geometry still
      // faces the active camera instead of becoming edge-on during orbit/drift.
      mesh.parent.getWorldQuaternion(parentWorldQuaternion);
      mesh.quaternion.copy(parentWorldQuaternion.invert().multiply(cameraWorldQuaternion));
    }
    // WebGLRenderer reaches this callback after the scene traversal has built
    // `matrixWorld`. The new local quaternion must therefore be propagated in
    // this same callback before the renderer derives modelViewMatrix.
    mesh.updateWorldMatrix(true, false);
  };
  mesh.userData.graphCameraFacingUpdate = updateFacing;
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    updateFacing(camera);
  };
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

function materialColor(material: unknown): string | null {
  if (!material || typeof material !== "object" || !("color" in material)) return null;
  return material.color instanceof Color ? `#${material.color.getHexString()}` : null;
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
          if ("needsUpdate" in material) material.needsUpdate = true;
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

function createNodeLabelSprite(
  label: string,
  silhouette: DefaultNodeSilhouetteSpec,
  opacity: number,
): Sprite {
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
  sprite.position.set(0, silhouette.labelAnchorY, 0);
  sprite.scale.set(
    Math.max(17, Math.min(58, text.length * 3.05)),
    silhouette.kind === "disk" ? 10 : 8,
    1,
  );
  sprite.userData.graphBaseLabelAnchorY = silhouette.labelAnchorY;
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
  const silhouette = defaultNodeSilhouette(node);
  const bodyMaterial = new MeshBasicMaterial({
    color,
    opacity,
    side: DoubleSide,
    transparent: opacity < 1,
  });
  const geometry = createDefaultNodeGeometry(silhouette);
  const body = new Mesh(geometry, bodyMaterial);
  body.userData.graphVisualRole = "body";
  body.userData.graphDefaultNodeSilhouette = silhouette.kind;
  body.userData.graphDefaultNodeSilhouetteSignature = defaultNodeSilhouetteSignature(silhouette);
  makeCameraFacingFlatMesh(body);
  group.add(body);

  // Default bodies stay deliberately flat. Depth is expressed through the
  // renderer's scale and opacity hierarchy rather than scene lighting, gloss,
  // or a permanent outline/halo around the focused node.
  group.add(createNodeLabelSprite(descriptor?.label ?? node.label, silhouette, opacity));
  group.userData.graphNodeId = node.id;
  group.userData.graphDefaultNodeObject = true;
  return group;
}

export function createDefaultGraphLinkObject(
  link: RenderLink,
  descriptor: GraphLinkDescriptor | undefined,
): Object3D {
  const geometry = new BufferGeometry();
  // A tessellated quadratic keeps the visible line and flow sampler on the
  // same polyline, instead of rendering a three-point path while tokens use a
  // different, analytic Bézier interpolation.
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute((DEFAULT_LINK_CURVE_SEGMENTS + 1) * 3, 3),
  );
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

function writeQuadraticCurve(
  positions: { count: number; itemSize: number; needsUpdate: boolean; setXYZ(index: number, x: number, y: number, z: number): void },
  bendDirection: number,
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  startProgress = 0,
  endProgress = 1,
): void {
  const lastIndex = Math.max(1, positions.count - 1);
  const point = new Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    const progress = startProgress + ((endProgress - startProgress) * (index / lastIndex));
    pointOnQuadraticCurve(start, end, bendDirection, progress, point);
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
}

function pointOnQuadraticCurve(
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  bendDirection: number,
  progress: number,
  output: { x: number; y: number; z: number },
): void {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const planarDistance = Math.hypot(deltaX, deltaY);
  const curve = Math.max(3, Math.min(18, planarDistance * 0.12));
  const directionX = planarDistance > 0 ? deltaX / planarDistance : 1;
  const directionY = planarDistance > 0 ? deltaY / planarDistance : 0;
  const controlX = ((start.x + end.x) / 2) + (-directionY * curve * bendDirection);
  const controlY = ((start.y + end.y) / 2) + (directionX * curve * bendDirection);
  const controlZ = ((start.z + end.z) / 2) + (curve * 0.32 * bendDirection);
  const t = Math.max(0, Math.min(1, progress));
  const inverse = 1 - t;
  output.x = (inverse * inverse * start.x) + (2 * inverse * t * controlX) + (t * t * end.x);
  output.y = (inverse * inverse * start.y) + (2 * inverse * t * controlY) + (t * t * end.y);
  output.z = (inverse * inverse * start.z) + (2 * inverse * t * controlZ) + (t * t * end.z);
}

function pointOnRenderedCurve(
  positions: { count: number; getX(index: number): number; getY(index: number): number; getZ(index: number): number },
  progress: number,
  output: { x: number; y: number; z: number },
): void {
  const lastIndex = Math.max(1, positions.count - 1);
  const scaledProgress = Math.max(0, Math.min(1, progress)) * lastIndex;
  const startIndex = Math.min(lastIndex - 1, Math.floor(scaledProgress));
  const segmentProgress = scaledProgress - startIndex;
  const endIndex = startIndex + 1;
  output.x = positions.getX(startIndex) + ((positions.getX(endIndex) - positions.getX(startIndex)) * segmentProgress);
  output.y = positions.getY(startIndex) + ((positions.getY(endIndex) - positions.getY(startIndex)) * segmentProgress);
  output.z = positions.getZ(startIndex) + ((positions.getZ(endIndex) - positions.getZ(startIndex)) * segmentProgress);
}

function updateLinkObject(object: Object3D, start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }): boolean {
  if (!(object instanceof Line)) return false;
  if (object.userData.graphDefaultLinkObject !== true) return false;
  const positions = object.geometry.getAttribute("position");
  if (!positions || positions.itemSize !== 3 || positions.count < 2) return false;
  const bendDirection = typeof object.userData.graphCurveBendDirection === "number"
    ? object.userData.graphCurveBendDirection
    : 1;
  writeQuadraticCurve(positions, bendDirection, start, end);
  object.visible = true;
  object.userData.graphDefaultLinkHasVisibleCurve = true;
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
  focalBias = 0.18,
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
      x: focalPoint.x + ((boundsCenter.x - focalPoint.x) * focalBias),
      y: focalPoint.y + ((boundsCenter.y - focalPoint.y) * focalBias),
      z: focalPoint.z + ((boundsCenter.z - focalPoint.z) * focalBias),
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

interface AmbientNodeState {
  readonly id: string;
  readonly node: RenderNode;
  readonly baseOpacity: number;
  readonly isMaster: boolean;
  object: Object3D | null;
  defaultVisual: AmbientDefaultNodeVisual | null;
  readonly breathingPhase: number;
  readonly breathingRate: number;
  anchorX: number;
  anchorY: number;
  anchorZ: number;
  renderedX: number;
  renderedY: number;
  renderedZ: number;
}

interface AmbientLinkState {
  ambientFlow: boolean;
  readonly baseOpacity: number;
  readonly baseWidth: number;
  readonly flowParticleCount: number;
  readonly flowPhase: number;
  readonly id: string;
  readonly link: RenderLink;
  object: Line | null;
  material: LineBasicMaterial | null;
  lastOpacity: number;
  lastWidth: number;
  particleCount: number;
  active: boolean;
}

interface CachedDefaultLinkBoundaryEndpoint {
  available: boolean;
  endpointAtSilhouetteBoundary: boolean;
  exteriorProbeInside: boolean;
  interiorProbeInside: boolean;
  silhouette: GraphDefaultNodeSilhouette | null;
}

interface CachedDefaultLinkBoundaryEvidence {
  readonly source: CachedDefaultLinkBoundaryEndpoint;
  readonly target: CachedDefaultLinkBoundaryEndpoint;
}

interface AmbientDefaultNodeVisual {
  readonly baseLabelScale: Coordinates;
  readonly body: Mesh;
  readonly bodyMaterial: MeshBasicMaterial;
  readonly label: Sprite;
  readonly labelMaterial: SpriteMaterial;
  lastBodyOpacity: number;
  lastLabelOpacity: number;
  lastLabelScale: number;
  lastLabelVisible: boolean | null;
  lastScale: number;
}

interface FlowParticle {
  readonly id: string;
  readonly object: Mesh;
  linkId: string | null;
  phase: number;
  x: number;
  y: number;
  z: number;
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

function objectMaterialColor(object: Object3D | null): string | null {
  if (!object) return null;
  return materialsForObject(object)
    .map((material) => materialColor(material))
    .find((color): color is string => color !== null)
    ?? null;
}

function defaultNodeBodyObservation(object: Object3D | undefined): GraphRenderDefaultNodeBodyObservation | null {
  if (object?.userData.graphDefaultNodeObject !== true) return null;
  const body = graphChildWithRole(object, "body");
  const silhouette = body?.userData.graphDefaultNodeSilhouette;
  if (silhouette !== "capsule" && silhouette !== "circle" && silhouette !== "disk" && silhouette !== "dot") {
    return null;
  }
  return { kind: "flat-2.5d", silhouette };
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
  let currentDefaultNodeVisualInputs: ReadonlyMap<string, DefaultNodeVisualInput> = new Map();
  let currentDefaultNodeVisualInputsRevision: string | null = null;
  let currentPresentation: GraphPresentation = {};
  let destroyed = false;
  const renderedLinkObjects = new Map<string, Object3D>();
  const renderedNodeObjects = new Map<string, Object3D>();
  const frameScheduler = cameraFrameScheduler(container);
  let transitionGeneration = 0;
  let motionFrame: number | null = null;
  let activeTransition: ActiveTransition | null = null;
  let currentDataRevision: string | null = null;
  let deferredDataDuringTransition: RenderGraphData | null = null;
  let initialFitPending = true;
  let pendingSceneTransition: SceneTransition | null = null;
  let transitionTick: ((timestamp: number) => void) | null = null;
  let hoverNodeId: string | null = null;
  let ambientElapsedMs = 0;
  let ambientFrameCount = 0;
  let ambientLastTimestamp: number | null = null;
  let ambientPaused = false;
  let ambientVisualsDirty = false;
  let ambientCameraAnchor: CameraPose | null = null;
  let ambientCameraAnchorElapsedMs = 0;
  let ambientCameraLastPose: CameraPose | null = null;
  const ambientNodes = new Map<string, AmbientNodeState>();
  const ambientLinks = new Map<string, AmbientLinkState>();
  const defaultLinkBoundaryEvidenceByObject = new WeakMap<Line, CachedDefaultLinkBoundaryEvidence>();
  const particleGroup = new Group();
  particleGroup.name = "graph-workbench-flow-particles";
  const particleGeometry = new CircleGeometry(0.65, 12);
  const particleMaterial = new MeshBasicMaterial({
    color: THEME_PALETTES.dark.edge,
    depthTest: true,
    depthWrite: false,
    opacity: 0.5,
    transparent: true,
  });
  const projectedWorldPosition = new Vector3();
  const linkStartLocalPosition = new Vector3();
  const linkEndLocalPosition = new Vector3();
  const curvePointLocalPosition = new Vector3();
  const curvePointWorldPosition = new Vector3();
  const linkBoundaryPlaneOrigin = new Vector3();
  const linkBoundaryPlaneXAxis = new Vector3();
  const linkBoundaryPlaneYAxis = new Vector3();
  const linkBoundaryPlaneNormal = new Vector3();
  const linkBoundaryRayDirection = new Vector3();
  const linkBoundaryIntersection = new Vector3();
  const linkBoundaryBodyLocalPosition = new Vector3();
  const particleLocalPosition = new Vector3();
  const lineEndpointWorldPosition = new Vector3();
  const flowParticles: FlowParticle[] = Array.from({ length: MAX_FLOW_PARTICLES }, (_unused, index) => {
    const object = new Mesh(particleGeometry, particleMaterial);
    makeCameraFacingFlatMesh(object);
    object.visible = false;
    object.renderOrder = 8;
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
  let transitionObservation: Omit<GraphTransitionObservation, "camera"> = {
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
  const defaultVisualInputForNode = (node: RenderNode): DefaultNodeVisualInput => (
    currentDefaultNodeVisualInputs.get(node.id)
    ?? {
      degree: 0,
      silhouette: defaultNodeSilhouette(node),
      visualKind: resolvedNodeVisualKind(node),
    }
  );

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
      if (object.userData.graphDefaultNodeObject !== true) return false;
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
      if (ambientState) refreshAmbientNodeObject(ambientState, object);
      return object;
    })
    .linkThreeObject((link) => {
      const object = linkObjectFactory(link, linkDescriptor(link));
      renderedLinkObjects.set(link.id, object);
      const ambientState = ambientLinks.get(link.id);
      if (ambientState) refreshAmbientLinkObject(ambientState, object);
      return object;
    })
    .linkPositionUpdate((object, coordinates, link) => updateLinkObjectForRenderedNodes(
      object,
      link,
      coordinates.start,
      coordinates.end,
    ))
    .onNodeClick((node) => callbacks.onNodeClick(node.id))
    .onNodeHover((node) => {
      hoverNodeId = node?.id ?? null;
      if (currentData) applyFinalVisuals(currentData);
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

  function syncDefaultNodeSilhouette(
    node: RenderNode,
    object: Object3D,
  ): void {
    if (object.userData.graphDefaultNodeObject !== true) return;
    const body = graphChildWithRole(object, "body");
    if (!(body instanceof Mesh)) return;
    const silhouette = defaultVisualInputForNode(node).silhouette;
    if (body.userData.graphDefaultNodeSilhouetteSignature !== defaultNodeSilhouetteSignature(silhouette)) {
      const previousGeometry = body.geometry;
      body.geometry = createDefaultNodeGeometry(silhouette);
      body.userData.graphDefaultNodeSilhouette = silhouette.kind;
      body.userData.graphDefaultNodeSilhouetteSignature = defaultNodeSilhouetteSignature(silhouette);
      // The renderer owns this body and its generated geometry. Dispose only
      // the replaced body geometry; factory-return custom objects are never
      // reshaped or disposed here.
      previousGeometry.dispose();
    }
    const label = graphChildWithRole(object, "node-label");
    if (label) {
      const labelScaleMultiplier = staticLabelScaleMultiplier(label);
      const previousBaseScale = staticLabelBaseScale(label);
      const baseLabelScale = {
        x: previousBaseScale.x,
        y: silhouette.kind === "disk" ? 10 : 8,
        z: previousBaseScale.z,
      };
      label.position.y = silhouette.labelAnchorY;
      label.scale.set(
        baseLabelScale.x * labelScaleMultiplier,
        baseLabelScale.y * labelScaleMultiplier,
        baseLabelScale.z * labelScaleMultiplier,
      );
      label.userData.graphBaseLabelAnchorY = silhouette.labelAnchorY;
      label.userData.graphBaseLabelScale = baseLabelScale;
      const ambientState = ambientNodes.get(node.id);
      if (ambientState) ambientState.defaultVisual = null;
    }
  }

  function applyNodePalette(node: RenderNode): void {
    const object = renderedNodeObjects.get(node.id);
    if (!object || object.userData.graphDefaultNodeObject !== true) return;
    syncDefaultNodeSilhouette(node, object);
    const palette = themePalette(currentPresentation.theme);
    const descriptor = nodeDescriptor(node);
    const bodyColor = defaultNodeColor(
      node,
      descriptor,
      currentPresentation.theme,
      defaultVisualInputForNode(node).visualKind,
    );
    setObjectMaterialColor(
      graphChildWithRole(object, "body"),
      bodyColor,
    );
    setObjectMaterialColor(graphChildWithRole(object, "outline"), palette.outline);
    setObjectMaterialColor(graphChildWithRole(object, "focus-rim"), palette.rim);
    setObjectMaterialColor(graphChildWithRole(object, "node-label"), palette.outline);
  }

  function applyLinkPalette(link: RenderLink): void {
    const object = renderedLinkObjects.get(link.id);
    if (!object || object.userData.graphLinkId !== link.id) return;
    setObjectMaterialColor(object, linkDescriptor(link).color ?? themePalette(currentPresentation.theme).edge);
  }

  function applyParticlePalette(): void {
    // Tokens share the restrained edge tone, rather than a white highlight,
    // so they read as directional detail without covering nodes or labels.
    particleMaterial.color.set(themePalette(currentPresentation.theme).edge);
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

  function cacheAmbientDefaultNodeVisual(state: AmbientNodeState): void {
    const object = state.object;
    if (state.defaultVisual || object?.userData.graphDefaultNodeObject !== true) return;
    const body = graphChildWithRole(object, "body");
    const label = graphChildWithRole(object, "node-label");
    if (!(body instanceof Mesh) || !(body.material instanceof MeshBasicMaterial)) return;
    if (!(label instanceof Sprite) || !(label.material instanceof SpriteMaterial)) return;
    state.defaultVisual = {
      baseLabelScale: staticLabelBaseScale(label),
      body,
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

  function cacheAmbientDefaultLinkMaterial(state: AmbientLinkState): void {
    if (state.material || !state.object || !(state.object.material instanceof LineBasicMaterial)) return;
    state.material = state.object.material;
    state.lastOpacity = Number.NaN;
    state.lastWidth = Number.NaN;
  }

  function refreshAmbientNodeObject(state: AmbientNodeState, object: Object3D | null): void {
    if (state.object === object) return;
    state.object = object;
    state.defaultVisual = null;
    cacheAmbientDefaultNodeVisual(state);
  }

  function refreshAmbientLinkObject(state: AmbientLinkState, object: Object3D | null): void {
    const nextObject = object instanceof Line && object.userData.graphDefaultLinkObject === true
      ? object
      : null;
    if (state.object === nextObject) return;
    state.object = nextObject;
    state.material = null;
    state.lastOpacity = Number.NaN;
    state.lastWidth = Number.NaN;
    cacheAmbientDefaultLinkMaterial(state);
  }

  function invalidateAmbientDefaultNodeVisual(id: string): void {
    const visual = ambientNodes.get(id)?.defaultVisual;
    if (!visual) return;
    visual.lastBodyOpacity = Number.NaN;
    visual.lastLabelOpacity = Number.NaN;
    visual.lastLabelScale = Number.NaN;
    visual.lastLabelVisible = null;
    visual.lastScale = Number.NaN;
  }

  function invalidateAmbientDefaultLinkVisual(id: string): void {
    const state = ambientLinks.get(id);
    if (!state) return;
    state.lastOpacity = Number.NaN;
    state.lastWidth = Number.NaN;
  }

  function changedAmbientVisualValue(previous: number, next: number): boolean {
    return !Number.isFinite(previous) || Math.abs(previous - next) > AMBIENT_VISUAL_EPSILON;
  }

  function ensureAmbientTransparency(material: MeshBasicMaterial | LineBasicMaterial, transparent: boolean): void {
    if (material.transparent === transparent) return;
    material.transparent = transparent;
    // This is a shader flag transition, never part of the stable RAF path.
    material.needsUpdate = true;
  }

  function applyAmbientDefaultNodeVisual(
    state: AmbientNodeState,
    opacity: number,
    scale: number,
    labelVisible: boolean,
    labelOpacity: number,
    labelScale: number,
  ): void {
    cacheAmbientDefaultNodeVisual(state);
    const visual = state.defaultVisual;
    const object = state.object;
    if (!visual || !object) return;
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
      visual.label.scale.set(
        visual.baseLabelScale.x * labelScale,
        visual.baseLabelScale.y * labelScale,
        visual.baseLabelScale.z * labelScale,
      );
      visual.lastLabelScale = labelScale;
    }
  }

  function applyAmbientDefaultLinkVisual(state: AmbientLinkState, opacity: number, width: number): void {
    cacheAmbientDefaultLinkMaterial(state);
    const material = state.material;
    if (!material) return;
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
    updateObjectMaterials(
      object,
      object.userData.graphDefaultNodeObject === true
        ? { opacity }
        : { emissiveIntensity: nodeEmissiveIntensity(node), opacity },
    );
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

  function applyLinkVisual(link: RenderLink, opacity: number, width: number): void {
    const object = renderedLinkObjects.get(link.id);
    if (!object) return;
    updateObjectMaterials(object, { opacity, width });
    invalidateAmbientDefaultLinkVisual(link.id);
  }

  function ambientFocusNodeId(): string | null {
    return currentData?.selection.nodeId ?? hoverNodeId ?? currentPresentation.focusNodeId ?? null;
  }

  function ambientMotionEnabled(): boolean {
    return currentData?.presentation.ambientMotion !== false
      && currentData?.presentation.reducedMotion !== true
      && !ambientPaused
      && ambientNodes.size > 0;
  }

  function rebuildAmbientState(): void {
    ambientNodes.clear();
    ambientLinks.clear();
    if (!currentData) return;
    const liveById = new Map(graph.graphData().nodes.map((node) => [node.id, node]));
    for (const node of currentData.nodes) {
      const live = liveById.get(node.id) ?? node;
      const position = nodePosition(live) ?? nodePosition(node)!;
      const object = renderedNodeObjects.get(node.id) ?? null;
      const descriptor = nodeDescriptor(node);
      const state: AmbientNodeState = {
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
        ambientFlow: false,
        baseOpacity: boundedOpacity(descriptor.opacity, link.visual.opacity),
        baseWidth: descriptor.width ?? link.visual.width,
        flowParticleCount: 2,
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
      const state = ambientLinks.get(link.id)!;
      cacheAmbientDefaultLinkMaterial(state);
    }
    // Pick a stable, bounded subset rather than animating every idle edge.
    // The id-derived rank keeps the same quiet relationships alive across
    // frames, data reapplication, and object replacement without adding a
    // renderer-owned public state surface.
    [...ambientLinks.values()]
      .sort((left, right) => {
        const rankDifference = stableUnit(`${left.id}:ambient-flow`) - stableUnit(`${right.id}:ambient-flow`);
        return rankDifference || left.id.localeCompare(right.id);
      })
      .slice(0, MAX_IDLE_FLOW_PARTICLES)
      .forEach((state) => {
        state.ambientFlow = true;
      });
    if (particleGroup.parent !== graph.scene()) graph.scene().add(particleGroup);
  }

  function updateAmbientNodePositions(): void {
    const motionEnabled = ambientMotionEnabled();
    const phase = (ambientElapsedMs / 1000) * AMBIENT_RADIANS_PER_SECOND;
    const commonX = motionEnabled ? Math.sin(phase) * AMBIENT_COMMON_FLOAT.x : 0;
    const commonY = motionEnabled ? Math.cos(phase * 0.91) * AMBIENT_COMMON_FLOAT.y : 0;
    const commonZ = motionEnabled ? Math.sin(phase * 0.57) * AMBIENT_COMMON_FLOAT.z : 0;
    for (const state of ambientNodes.values()) {
      const anchor = state.node;
      if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(anchor.z)) continue;
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
      } else {
        // Factories own their transforms. Reporting an offset that was never
        // applied would make host-side picking disagree with rendered pixels.
        state.renderedX = state.anchorX;
        state.renderedY = state.anchorY;
        state.renderedZ = state.anchorZ;
      }
    }
  }

  function hasDefaultAmbientNodes(): boolean {
    for (const state of ambientNodes.values()) {
      if (state.object?.userData.graphDefaultNodeObject === true) return true;
    }
    return false;
  }

  function sameCameraPose(left: CameraPose, right: CameraPose): boolean {
    return [
      left.position.x - right.position.x,
      left.position.y - right.position.y,
      left.position.z - right.position.z,
      left.lookAt.x - right.lookAt.x,
      left.lookAt.y - right.lookAt.y,
      left.lookAt.z - right.lookAt.z,
    ].every((difference) => Math.abs(difference) <= AMBIENT_VISUAL_EPSILON);
  }

  function applyAmbientCameraDrift(): void {
    if (
      !ambientMotionEnabled()
      || activeTransition !== null
      || cameraControlInteractionActive
      || !hasDefaultAmbientNodes()
    ) {
      ambientCameraAnchor = null;
      ambientCameraLastPose = null;
      return;
    }
    const current = cameraPose();
    if (!ambientCameraAnchor || (ambientCameraLastPose && !sameCameraPose(current, ambientCameraLastPose))) {
      ambientCameraAnchor = current;
      ambientCameraAnchorElapsedMs = ambientElapsedMs;
      ambientCameraLastPose = current;
      return;
    }
    const phase = ((ambientElapsedMs - ambientCameraAnchorElapsedMs) / 1000) * AMBIENT_RADIANS_PER_SECOND;
    const offset = {
      x: Math.sin(phase) * AMBIENT_CAMERA_DRIFT.x,
      y: (Math.cos(phase * 0.91) - 1) * AMBIENT_CAMERA_DRIFT.y,
      z: Math.sin(phase * 0.67) * AMBIENT_CAMERA_DRIFT.z,
    };
    const next: CameraPose = {
      position: {
        x: ambientCameraAnchor.position.x + offset.x,
        y: ambientCameraAnchor.position.y + offset.y,
        z: ambientCameraAnchor.position.z + offset.z,
      },
      lookAt: {
        x: ambientCameraAnchor.lookAt.x + (offset.x * 0.34),
        y: ambientCameraAnchor.lookAt.y + (offset.y * 0.34),
        z: ambientCameraAnchor.lookAt.z + (offset.z * 0.34),
      },
    };
    if (ambientCameraLastPose && sameCameraPose(next, ambientCameraLastPose)) return;
    graph.cameraPosition(next.position, next.lookAt, 0);
    ambientCameraLastPose = next;
  }

  function applyCameraRelativeDepth(): void {
    const data = currentData;
    if (!data) return;
    const camera = cameraPose();
    const directionLength = Math.hypot(
      camera.position.x - camera.lookAt.x,
      camera.position.y - camera.lookAt.y,
      camera.position.z - camera.lookAt.z,
    ) || 1;
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
    const depthSpan = maximumDepth - minimumDepth;
    const depthRange = Math.max(1, depthSpan);
    const hasMeaningfulDepthRange = Number.isFinite(depthSpan) && depthSpan > 1;
    const selectedNodeId = data.selection.nodeId;
    const focusNodeId = ambientFocusNodeId();
    const lightSelectedContext = data.presentation.theme === "light" && selectedNodeId !== null;
    for (const state of ambientNodes.values()) {
      if (state.object?.userData.graphDefaultNodeObject !== true) continue;
      const node = state.node;
      const depth = ((state.renderedX - camera.lookAt.x) * directionX)
        + ((state.renderedY - camera.lookAt.y) * directionY)
        + ((state.renderedZ - camera.lookAt.z) * directionZ);
      const near = Math.max(0, Math.min(1, (depth - minimumDepth) / depthRange));
      const selected = node.id === selectedNodeId;
      const neighbor = data.selection.neighborNodeIds.includes(node.id);
      const focused = node.id === focusNodeId;
      const hovered = node.id === hoverNodeId;
      // Keep semantic readability floors in the renderer-owned state built
      // from the canonical visual contract, not a vendor live node's fields.
      const master = state.isMaster;
      const bodyFactor = selected
        ? 1
        : neighbor || focused
          ? 0.64 + (near * 0.3)
          : selectedNodeId
            ? 0.14 + (near * 0.31)
            : IDLE_BODY_OPACITY.far + (near * IDLE_BODY_OPACITY.nearRange);
      const opacity = Math.max(
        node.visual.opacityFloor,
        master ? AMBIENT_MASTER_BODY_OPACITY_FLOOR : 0,
        lightSelectedContext && !selected && !neighbor && !focused
          ? LIGHT_SELECTED_CONTEXT_FLOOR.bodyOpacity
          : 0,
        state.baseOpacity * bodyFactor,
      );
      const labelAlwaysVisible = selected || neighbor || focused || hovered || master;
      const labelDistanceVisibility = labelAlwaysVisible || !hasMeaningfulDepthRange
        ? 1
        : distantLabelVisibility(near);
      const baseLabelOpacity = selected
        ? 1
        : neighbor || focused || hovered
          ? 0.68 + (near * 0.2)
          : master
            ? Math.max(AMBIENT_MASTER_LABEL_OPACITY_FLOOR, 0.32 + (near * 0.26))
            : selectedNodeId
              ? 0.02 + (near * 0.24)
              : IDLE_LABEL_OPACITY.far + (near * IDLE_LABEL_OPACITY.nearRange);
      const contextLabelOpacity = lightSelectedContext && !selected && !neighbor && !focused && !hovered
        ? Math.max(baseLabelOpacity, LIGHT_SELECTED_CONTEXT_FLOOR.labelOpacity)
        : baseLabelOpacity;
      const readableLabelOpacity = contextLabelOpacity * labelDistanceVisibility;
      const labelVisible = labelAlwaysVisible || labelDistanceVisibility > 0;
      const viewportScale = Math.max(
        0.82,
        Math.min(1.15, 480 / Math.max(1, Math.min(data.selection.viewport.width, data.selection.viewport.height))),
      );
      let scale = selectedNodeId
        ? 0.64 + (near * 0.33)
        : IDLE_NODE_SCALE.far + (near * IDLE_NODE_SCALE.nearRange);
      if (selected) {
        scale = 1.22;
      } else if (neighbor || focused) {
        scale = 0.82 + (near * 0.24);
      }
      applyAmbientDefaultNodeVisual(
        state,
        opacity,
        scale,
        labelVisible,
        readableLabelOpacity,
        viewportScale * (selectedNodeId
          ? 0.62 + (near * 0.38)
          : IDLE_LABEL_SCALE.far + (near * IDLE_LABEL_SCALE.nearRange)),
      );
    }
  }

  function renderedState(id: string): AmbientNodeState | null {
    return ambientNodes.get(id) ?? null;
  }

  function actualNodeWorldPosition(state: AmbientNodeState): Coordinates {
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

  function objectLocalPositionForWorld(
    object: Object3D,
    worldPosition: Coordinates,
    output: Vector3,
  ): Vector3 {
    object.updateWorldMatrix(true, false);
    output.set(worldPosition.x, worldPosition.y, worldPosition.z);
    return object.worldToLocal(output);
  }

  function defaultNodeBody(state: AmbientNodeState | null): Mesh | null {
    if (!state) return null;
    const object = renderedNodeObjects.get(state.id) ?? state.object;
    if (object?.userData.graphDefaultNodeObject !== true) return null;
    cacheAmbientDefaultNodeVisual(state);
    const body = state.defaultVisual?.body;
    if (!body) return null;
    const updateFacing = body.userData.graphCameraFacingUpdate;
    if (typeof updateFacing === "function") updateFacing(graph.camera(), cameraPose());
    body.updateWorldMatrix(true, false);
    return body;
  }

  function defaultNodeSilhouetteContainsLocalPoint(
    silhouette: DefaultNodeSilhouetteSpec,
    point: Vector3,
  ): boolean {
    const radius = silhouette.height / 2;
    if (silhouette.kind !== "capsule") {
      return point.x * point.x + point.y * point.y <= radius * radius;
    }
    const halfStraight = Math.max(0, (silhouette.width / 2) - radius);
    if (Math.abs(point.x) <= halfStraight) return Math.abs(point.y) <= radius;
    const capCenterX = point.x < 0 ? -halfStraight : halfStraight;
    const capOffsetX = point.x - capCenterX;
    return (capOffsetX * capOffsetX) + (point.y * point.y) <= radius * radius;
  }

  function curvePointProjectsInsideDefaultNode(
    body: Mesh,
    silhouette: DefaultNodeSilhouetteSpec,
    camera: CameraPose,
    point: Vector3,
  ): boolean | null {
    if (![point.x, point.y, point.z].every(Number.isFinite)) return null;
    linkBoundaryPlaneOrigin.set(0, 0, 0);
    body.localToWorld(linkBoundaryPlaneOrigin);
    linkBoundaryPlaneXAxis.set(1, 0, 0);
    body.localToWorld(linkBoundaryPlaneXAxis).sub(linkBoundaryPlaneOrigin);
    linkBoundaryPlaneYAxis.set(0, 1, 0);
    body.localToWorld(linkBoundaryPlaneYAxis).sub(linkBoundaryPlaneOrigin);
    linkBoundaryPlaneNormal.crossVectors(linkBoundaryPlaneXAxis, linkBoundaryPlaneYAxis);
    if (linkBoundaryPlaneNormal.lengthSq() <= AMBIENT_VISUAL_EPSILON) return null;
    linkBoundaryPlaneNormal.normalize();
    linkBoundaryRayDirection.set(
      point.x - camera.position.x,
      point.y - camera.position.y,
      point.z - camera.position.z,
    );
    const denominator = linkBoundaryRayDirection.dot(linkBoundaryPlaneNormal);
    if (Math.abs(denominator) <= AMBIENT_VISUAL_EPSILON) return null;
    const planeProgress = (
      ((linkBoundaryPlaneOrigin.x - camera.position.x) * linkBoundaryPlaneNormal.x)
      + ((linkBoundaryPlaneOrigin.y - camera.position.y) * linkBoundaryPlaneNormal.y)
      + ((linkBoundaryPlaneOrigin.z - camera.position.z) * linkBoundaryPlaneNormal.z)
    ) / denominator;
    if (!Number.isFinite(planeProgress) || planeProgress <= 0) return null;
    linkBoundaryIntersection.set(
      camera.position.x + (linkBoundaryRayDirection.x * planeProgress),
      camera.position.y + (linkBoundaryRayDirection.y * planeProgress),
      camera.position.z + (linkBoundaryRayDirection.z * planeProgress),
    );
    linkBoundaryBodyLocalPosition.copy(linkBoundaryIntersection);
    body.worldToLocal(linkBoundaryBodyLocalPosition);
    return defaultNodeSilhouetteContainsLocalPoint(silhouette, linkBoundaryBodyLocalPosition);
  }

  function curvePointInsideDefaultNode(
    object: Line,
    start: Coordinates,
    end: Coordinates,
    bendDirection: number,
    progress: number,
    body: Mesh,
    silhouette: DefaultNodeSilhouetteSpec,
    camera: CameraPose,
  ): boolean | null {
    pointOnQuadraticCurve(start, end, bendDirection, progress, curvePointLocalPosition);
    curvePointWorldPosition.copy(curvePointLocalPosition);
    object.localToWorld(curvePointWorldPosition);
    return curvePointProjectsInsideDefaultNode(body, silhouette, camera, curvePointWorldPosition);
  }

  function firstCurveProgressOutsideDefaultNode(
    object: Line,
    start: Coordinates,
    end: Coordinates,
    bendDirection: number,
    body: Mesh,
    silhouette: DefaultNodeSilhouetteSpec,
    camera: CameraPose,
  ): number | null {
    const initial = curvePointInsideDefaultNode(object, start, end, bendDirection, 0, body, silhouette, camera);
    if (initial === null) return null;
    if (!initial) return 0;
    let previous = 0;
    for (let index = 1; index <= DEFAULT_LINK_BOUNDARY_SCAN_STEPS; index += 1) {
      const current = index / DEFAULT_LINK_BOUNDARY_SCAN_STEPS;
      const inside = curvePointInsideDefaultNode(object, start, end, bendDirection, current, body, silhouette, camera);
      if (inside === null) return null;
      if (inside) {
        previous = current;
        continue;
      }
      let lower = previous;
      let upper = current;
      for (let iteration = 0; iteration < DEFAULT_LINK_BOUNDARY_BISECTION_STEPS; iteration += 1) {
        const midpoint = (lower + upper) / 2;
        const midpointInside = curvePointInsideDefaultNode(
          object, start, end, bendDirection, midpoint, body, silhouette, camera,
        );
        if (midpointInside === null) return null;
        if (midpointInside) lower = midpoint;
        else upper = midpoint;
      }
      return upper;
    }
    return 1;
  }

  function firstCurveProgressInsideDefaultNodeFromEnd(
    object: Line,
    start: Coordinates,
    end: Coordinates,
    bendDirection: number,
    body: Mesh,
    silhouette: DefaultNodeSilhouetteSpec,
    camera: CameraPose,
  ): number | null {
    const terminal = curvePointInsideDefaultNode(object, start, end, bendDirection, 1, body, silhouette, camera);
    if (terminal === null) return null;
    if (!terminal) return 1;
    let previous = 1;
    for (let index = DEFAULT_LINK_BOUNDARY_SCAN_STEPS - 1; index >= 0; index -= 1) {
      const current = index / DEFAULT_LINK_BOUNDARY_SCAN_STEPS;
      const inside = curvePointInsideDefaultNode(object, start, end, bendDirection, current, body, silhouette, camera);
      if (inside === null) return null;
      if (inside) {
        previous = current;
        continue;
      }
      let lower = current;
      let upper = previous;
      for (let iteration = 0; iteration < DEFAULT_LINK_BOUNDARY_BISECTION_STEPS; iteration += 1) {
        const midpoint = (lower + upper) / 2;
        const midpointInside = curvePointInsideDefaultNode(
          object, start, end, bendDirection, midpoint, body, silhouette, camera,
        );
        if (midpointInside === null) return null;
        if (midpointInside) upper = midpoint;
        else lower = midpoint;
      }
      return upper;
    }
    return 0;
  }

  function renderedCurveEndpointMatchesProgress(
    positions: { getX(index: number): number; getY(index: number): number; getZ(index: number): number },
    endpointIndex: number,
    start: Coordinates,
    end: Coordinates,
    bendDirection: number,
    progress: number,
  ): boolean {
    pointOnQuadraticCurve(start, end, bendDirection, progress, curvePointLocalPosition);
    const endpointX = positions.getX(endpointIndex);
    const endpointY = positions.getY(endpointIndex);
    const endpointZ = positions.getZ(endpointIndex);
    return Math.hypot(
      curvePointLocalPosition.x - endpointX,
      curvePointLocalPosition.y - endpointY,
      curvePointLocalPosition.z - endpointZ,
    ) <= 0.001;
  }

  function cachedDefaultLinkBoundaryEndpoint(): CachedDefaultLinkBoundaryEndpoint {
    return {
      available: false,
      endpointAtSilhouetteBoundary: false,
      exteriorProbeInside: false,
      interiorProbeInside: false,
      silhouette: null,
    };
  }

  function cachedDefaultLinkBoundaryEvidence(object: Line): CachedDefaultLinkBoundaryEvidence {
    let evidence = defaultLinkBoundaryEvidenceByObject.get(object);
    if (!evidence) {
      evidence = {
        source: cachedDefaultLinkBoundaryEndpoint(),
        target: cachedDefaultLinkBoundaryEndpoint(),
      };
      defaultLinkBoundaryEvidenceByObject.set(object, evidence);
    }
    return evidence;
  }

  function clearCachedDefaultLinkBoundaryEndpoint(endpoint: CachedDefaultLinkBoundaryEndpoint): void {
    endpoint.available = false;
    endpoint.endpointAtSilhouetteBoundary = false;
    endpoint.exteriorProbeInside = false;
    endpoint.interiorProbeInside = false;
    endpoint.silhouette = null;
  }

  function updateCachedDefaultLinkBoundaryEndpoint(
    cached: CachedDefaultLinkBoundaryEndpoint,
    object: Line,
    positions: { count: number; getX(index: number): number; getY(index: number): number; getZ(index: number): number },
    start: Coordinates,
    end: Coordinates,
    bendDirection: number,
    body: Mesh,
    silhouette: DefaultNodeSilhouetteSpec,
    camera: CameraPose,
    boundaryProgress: number,
    direction: "source" | "target",
  ): void {
    const interiorProgress = direction === "source"
      ? Math.max(0, boundaryProgress - DEFAULT_LINK_BOUNDARY_PROBE_PROGRESS)
      : Math.min(1, boundaryProgress + DEFAULT_LINK_BOUNDARY_PROBE_PROGRESS);
    const exteriorProgress = direction === "source"
      ? Math.min(1, boundaryProgress + DEFAULT_LINK_BOUNDARY_PROBE_PROGRESS)
      : Math.max(0, boundaryProgress - DEFAULT_LINK_BOUNDARY_PROBE_PROGRESS);
    const interiorProbeInside = curvePointInsideDefaultNode(
      object, start, end, bendDirection, interiorProgress, body, silhouette, camera,
    ) === true;
    const exteriorProbeInside = curvePointInsideDefaultNode(
      object, start, end, bendDirection, exteriorProgress, body, silhouette, camera,
    ) === true;
    const endpointIndex = direction === "source" ? 0 : positions.count - 1;
    cached.available = true;
    cached.endpointAtSilhouetteBoundary = interiorProbeInside
      && !exteriorProbeInside
      && renderedCurveEndpointMatchesProgress(
        positions,
        endpointIndex,
        start,
        end,
        bendDirection,
        boundaryProgress,
      );
    cached.exteriorProbeInside = exteriorProbeInside;
    cached.interiorProbeInside = interiorProbeInside;
    cached.silhouette = silhouette.kind;
  }

  function defaultLinkBoundaryObservation(
    cached: CachedDefaultLinkBoundaryEndpoint | undefined,
  ): GraphAmbientMotionLinkEndpointBoundaryObservation | null {
    if (!cached?.available || cached.silhouette === null) return null;
    return {
      endpointAtSilhouetteBoundary: cached.endpointAtSilhouetteBoundary,
      exteriorProbeInside: cached.exteriorProbeInside,
      interiorProbeInside: cached.interiorProbeInside,
      silhouette: cached.silhouette,
    };
  }

  function updateDefaultLinkObjectWithBoundaryTrim(
    object: Object3D,
    start: Coordinates,
    end: Coordinates,
    source: AmbientNodeState | null,
    target: AmbientNodeState | null,
  ): boolean {
    if (!(object instanceof Line) || object.userData.graphDefaultLinkObject !== true) {
      return updateLinkObject(object, start, end);
    }
    const positions = object.geometry.getAttribute("position");
    if (!positions || positions.itemSize !== 3 || positions.count < 2) return false;
    const bendDirection = typeof object.userData.graphCurveBendDirection === "number"
      ? object.userData.graphCurveBendDirection
      : 1;
    const boundaryEvidence = cachedDefaultLinkBoundaryEvidence(object);
    const sourceBody = defaultNodeBody(source);
    const targetBody = defaultNodeBody(target);
    if (!sourceBody && !targetBody) {
      clearCachedDefaultLinkBoundaryEndpoint(boundaryEvidence.source);
      clearCachedDefaultLinkBoundaryEndpoint(boundaryEvidence.target);
      return updateLinkObject(object, start, end);
    }
    object.updateWorldMatrix(true, false);
    const camera = cameraPose();
    const sourceSilhouette = source ? defaultVisualInputForNode(source.node).silhouette : null;
    const targetSilhouette = target ? defaultVisualInputForNode(target.node).silhouette : null;
    const startProgress = sourceBody && sourceSilhouette
      ? firstCurveProgressOutsideDefaultNode(
        object, start, end, bendDirection, sourceBody, sourceSilhouette, camera,
      )
      : 0;
    const endProgress = targetBody && targetSilhouette
      ? firstCurveProgressInsideDefaultNodeFromEnd(
        object, start, end, bendDirection, targetBody, targetSilhouette, camera,
      )
      : 1;
    if (startProgress === null || endProgress === null) {
      clearCachedDefaultLinkBoundaryEndpoint(boundaryEvidence.source);
      clearCachedDefaultLinkBoundaryEndpoint(boundaryEvidence.target);
      return updateLinkObject(object, start, end);
    }
    if (startProgress >= endProgress) {
      object.visible = false;
      object.userData.graphDefaultLinkHasVisibleCurve = false;
      clearCachedDefaultLinkBoundaryEndpoint(boundaryEvidence.source);
      clearCachedDefaultLinkBoundaryEndpoint(boundaryEvidence.target);
      return true;
    }
    writeQuadraticCurve(positions, bendDirection, start, end, startProgress, endProgress);
    object.visible = true;
    object.userData.graphDefaultLinkHasVisibleCurve = true;
    object.geometry.computeBoundingSphere();
    if (sourceBody && sourceSilhouette) {
      updateCachedDefaultLinkBoundaryEndpoint(
        boundaryEvidence.source,
        object,
        positions,
        start,
        end,
        bendDirection,
        sourceBody,
        sourceSilhouette,
        camera,
        startProgress,
        "source",
      );
    } else {
      clearCachedDefaultLinkBoundaryEndpoint(boundaryEvidence.source);
    }
    if (targetBody && targetSilhouette) {
      updateCachedDefaultLinkBoundaryEndpoint(
        boundaryEvidence.target,
        object,
        positions,
        start,
        end,
        bendDirection,
        targetBody,
        targetSilhouette,
        camera,
        endProgress,
        "target",
      );
    } else {
      clearCachedDefaultLinkBoundaryEndpoint(boundaryEvidence.target);
    }
    return true;
  }

  function updateLinkObjectFromWorldEndpoints(
    object: Object3D,
    startWorldPosition: Coordinates,
    endWorldPosition: Coordinates,
    source: AmbientNodeState | null = null,
    target: AmbientNodeState | null = null,
  ): boolean {
    objectLocalPositionForWorld(object, startWorldPosition, linkStartLocalPosition);
    objectLocalPositionForWorld(object, endWorldPosition, linkEndLocalPosition);
    return updateDefaultLinkObjectWithBoundaryTrim(
      object,
      linkStartLocalPosition,
      linkEndLocalPosition,
      source,
      target,
    );
  }

  function updateLinkObjectForRenderedNodes(
    object: Object3D,
    link: RenderLink,
    fallbackStart: Coordinates,
    fallbackEnd: Coordinates,
  ): boolean {
    const linkId = typeof object.userData.graphLinkId === "string" ? object.userData.graphLinkId : link.id;
    const canonicalLink = ambientLinks.get(linkId)?.link;
    const source = canonicalLink ? renderedState(canonicalLink.source) : null;
    const target = canonicalLink ? renderedState(canonicalLink.target) : null;
    if (!source || !target) return updateLinkObject(object, fallbackStart, fallbackEnd);
    return updateLinkObjectFromWorldEndpoints(
      object,
      actualNodeWorldPosition(source),
      actualNodeWorldPosition(target),
      source,
      target,
    );
  }

  function defaultLinkEndpointObservation(state: AmbientLinkState): GraphAmbientMotionLinkEndpointObservation | null {
    const object = state.object;
    const positions = object?.geometry.getAttribute("position");
    if (!object || !positions || positions.itemSize !== 3 || positions.count < 2) return null;
    const boundaryEvidence = defaultLinkBoundaryEvidenceByObject.get(object);
    object.updateWorldMatrix(true, false);
    const positionAt = (index: number): GraphAmbientMotionPosition => {
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
      sourceBoundary: defaultLinkBoundaryObservation(boundaryEvidence?.source),
      start: positionAt(0),
      targetId: state.link.target,
      targetBoundary: defaultLinkBoundaryObservation(boundaryEvidence?.target),
    };
  }

  function applyFocusedLinkFlow(): void {
    const focusNodeId = ambientFocusNodeId();
    const hasFocus = focusNodeId !== null;
    let nextParticle = 0;
    for (const particle of flowParticles) {
      particle.linkId = null;
      particle.object.visible = false;
    }
    for (const state of ambientLinks.values()) {
      const source = renderedState(state.link.source);
      const target = renderedState(state.link.target);
      const incident = hasFocus && (state.link.source === focusNodeId || state.link.target === focusNodeId);
      const idleFlow = !hasFocus && state.ambientFlow;
      const selectedFocus = focusNodeId !== null && currentData?.selection.nodeId === focusNodeId;
      const liveObject = renderedLinkObjects.get(state.id);
      refreshAmbientLinkObject(state, liveObject ?? null);
      state.active = Boolean((incident || idleFlow) && state.object && ambientMotionEnabled());
      state.particleCount = 0;
      if (!source || !target || !state.object) continue;
      updateLinkObjectFromWorldEndpoints(
        state.object,
        actualNodeWorldPosition(source),
        actualNodeWorldPosition(target),
        source,
        target,
      );
      if (state.object.userData.graphDefaultLinkHasVisibleCurve !== true) {
        state.active = false;
        continue;
      }
      let opacity: number;
      let width: number;
      if (incident) {
        opacity = Math.max(selectedFocus ? 0.58 : 0.46, state.baseOpacity);
        width = Math.max(selectedFocus ? 1.18 : 1.02, state.baseWidth);
      } else if (idleFlow) {
        opacity = Math.min(
          IDLE_LINK_OPACITY.maximum,
          Math.max(IDLE_LINK_OPACITY.minimum, state.baseOpacity * 1.15),
        );
        width = Math.max(0.85, Math.min(0.92, state.baseWidth * 1.05));
      } else if (hasFocus) {
        // A selected or hovered constellation keeps distant edges quiet so
        // its incident relationships retain the primary reading tier. Light
        // mode receives a context floor against the white canvas; dark mode
        // retains its intentionally receding background treatment.
        const lightContext = currentPresentation.theme === "light";
        opacity = lightContext
          ? Math.max(LIGHT_SELECTED_CONTEXT_FLOOR.linkOpacity, state.baseOpacity * 0.22)
          : Math.min(0.055, state.baseOpacity * 0.22);
        width = lightContext ? LIGHT_SELECTED_CONTEXT_FLOOR.linkWidth : 0.5;
      } else {
        // Keep the settled relationship field readable. It remains well below
        // the hover/selection incident tier, while depth testing preserves the
        // receding hierarchy of edges behind nearer nodes.
        opacity = Math.max(
          IDLE_LINK_OPACITY.minimum,
          Math.min(IDLE_LINK_OPACITY.maximum, state.baseOpacity * 1.4),
        );
        width = Math.max(0.7, Math.min(0.82, state.baseWidth));
      }
      applyAmbientDefaultLinkVisual(
        state,
        opacity,
        width,
      );
      if (!state.active) continue;
      const count = incident ? state.flowParticleCount : 1;
      const positions = state.object.geometry.getAttribute("position");
      if (!positions || positions.count < 3) continue;
      const outwardFromSource = state.link.source === focusNodeId;
      for (let index = 0; index < count && nextParticle < flowParticles.length; index += 1) {
        const particle = flowParticles[nextParticle]!;
        nextParticle += 1;
        const basePhase = ((ambientElapsedMs / 1000) * (incident
          ? FLOW_SPEED_CYCLES_PER_SECOND
          : IDLE_FLOW_SPEED_CYCLES_PER_SECOND))
          + (index / count)
          + state.flowPhase;
        const outwardPhase = basePhase - Math.floor(basePhase);
        const curveProgress = incident && !outwardFromSource ? 1 - outwardPhase : outwardPhase;
        pointOnRenderedCurve(positions, curveProgress, curvePointLocalPosition);
        state.object.updateWorldMatrix(true, false);
        state.object.localToWorld(curvePointWorldPosition.copy(curvePointLocalPosition));
        particleGroup.updateWorldMatrix(true, false);
        particle.object.position.copy(particleGroup.worldToLocal(particleLocalPosition.copy(curvePointWorldPosition)));
        particle.object.visible = true;
        const particleScale = incident
          ? INTERACTION_FLOW_PARTICLE_SCALE * (0.94 + (Math.sin(outwardPhase * Math.PI * 2) * 0.06))
          : IDLE_FLOW_PARTICLE_SCALE;
        particle.object.scale.setScalar(particleScale);
        particle.linkId = state.id;
        particle.phase = outwardPhase;
        particle.x = curvePointWorldPosition.x;
        particle.y = curvePointWorldPosition.y;
        particle.z = curvePointWorldPosition.z;
        state.particleCount += 1;
      }
    }
  }

  function applyAmbientVisuals(): void {
    updateAmbientNodePositions();
    applyAmbientCameraDrift();
    applyCameraRelativeDepth();
    applyFocusedLinkFlow();
  }

  function applyFinalVisuals(data: RenderGraphData): void {
    data.nodes.forEach((node) => {
      const descriptor = nodeDescriptor(node);
      const visual = sceneVisualForNode(node, data, descriptor);
      const object = renderedNodeObjects.get(node.id);
      const lightQuietContext = data.presentation.theme === "light"
        && data.selection.nodeId !== null
        && data.selection.nodeId !== node.id
        && !data.selection.neighborNodeIds.includes(node.id)
        && object?.userData.graphDefaultNodeObject === true;
      applyNodePalette(node);
      applyNodeVisual(
        node,
        lightQuietContext ? Math.max(visual.opacity, LIGHT_SELECTED_CONTEXT_FLOOR.bodyOpacity) : visual.opacity,
        visual.scale,
        data.selection.nodeId === node.id ? visual.opacity : 0,
        visual.labelVisible,
        lightQuietContext ? Math.max(visual.labelOpacity, LIGHT_SELECTED_CONTEXT_FLOOR.labelOpacity) : visual.labelOpacity,
        visual.labelScale,
      );
    });
    data.links.forEach((link) => {
      const descriptor = linkDescriptor(link);
      applyLinkPalette(link);
      const baseOpacity = boundedOpacity(descriptor.opacity, link.visual.opacity);
      const object = renderedLinkObjects.get(link.id);
      const defaultLink = object?.userData.graphDefaultLinkObject === true;
      const lightQuietContext = data.presentation.theme === "light"
        && data.selection.nodeId !== null
        && link.source !== data.selection.nodeId
        && link.target !== data.selection.nodeId
        && defaultLink;
      const opacity = lightQuietContext
        ? Math.max(LIGHT_SELECTED_CONTEXT_FLOOR.linkOpacity, baseOpacity)
        : data.selection.nodeId === null && defaultLink
          ? Math.max(
            IDLE_LINK_OPACITY.minimum,
            Math.min(IDLE_LINK_OPACITY.maximum, baseOpacity * 1.4),
          )
          : baseOpacity;
      const width = lightQuietContext
        ? Math.max(LIGHT_SELECTED_CONTEXT_FLOOR.linkWidth, descriptor.width ?? link.visual.width)
        : descriptor.width ?? link.visual.width;
      applyLinkVisual(
        link,
        opacity,
        width,
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
    const nextDefaultNodeVisualInputsRevision = defaultNodeVisualInputsRevision(data);
    if (nextDefaultNodeVisualInputsRevision !== currentDefaultNodeVisualInputsRevision) {
      currentDefaultNodeVisualInputs = defaultNodeVisualInputs(data);
      currentDefaultNodeVisualInputsRevision = nextDefaultNodeVisualInputsRevision;
    }
    currentDataRevision = nextDataRevision;
    currentPresentation = data.presentation;
    graph.backgroundColor(themePalette(currentPresentation.theme).background);
    applyParticlePalette();
    graph.graphData(makeLiveData(data, starts));
    const nodeIds = new Set(data.nodes.map((node) => node.id));
    const linkIds = new Set(data.links.map((link) => link.id));
    renderedNodeObjects.forEach((_object, id) => {
      if (!nodeIds.has(id)) renderedNodeObjects.delete(id);
    });
    renderedLinkObjects.forEach((_object, id) => {
      if (!linkIds.has(id)) renderedLinkObjects.delete(id);
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

  function flushDeferredData(): void {
    const deferredData = deferredDataDuringTransition;
    deferredDataDuringTransition = null;
    if (!deferredData || destroyed) return;
    applyData(deferredData);
  }

  function cancelCameraTransition(): void {
    const cancelledTransition = activeTransition;
    if (!cancelledTransition) return;
    const cancelledProgress = transitionObservation.progress;
    transitionGeneration += 1;
    // A scheduled idle ambient tick is already the shared renderer loop; it
    // can immediately pick up a newly-started camera transition. Cancel only
    // a frame that belongs to a real active transaction.
    if (motionFrame !== null) frameScheduler.cancel(motionFrame);
    motionFrame = null;
    transitionTick = null;
    activeTransition = null;
    if (cancelledTransition.scene) {
      applySceneFrame(cancelledTransition.scene, 1, true);
    }
    transitionObservation = {
      active: false,
      durationMs: cancelledTransition.durationMs,
      generation: transitionGeneration,
      nodePositions: liveTransitionNodePositions(),
      progress: cancelledTransition.scene ? 1 : cancelledProgress,
      reducedMotion: cancelledTransition.reducedMotion,
    };
    if (cancelledTransition.scene) flushDeferredData();
    if (!destroyed) {
      applyAmbientVisuals();
      ensureMotionFrame();
    }
  }

  function ensureMotionFrame(): void {
    if (destroyed || motionFrame !== null || (!transitionTick && !ambientMotionEnabled())) return;
    let frameId = 0;
    frameId = frameScheduler.request((timestamp) => {
      if (motionFrame !== frameId) return;
      motionFrame = null;
      const hadTransitionTick = transitionTick !== null;
      transitionTick?.(timestamp);
      const motionEnabled = ambientMotionEnabled();
      if (motionEnabled) {
        if (ambientLastTimestamp !== null) {
          ambientElapsedMs += Math.max(0, timestamp - ambientLastTimestamp);
        }
        ambientLastTimestamp = timestamp;
        ambientFrameCount += 1;
      } else {
        ambientLastTimestamp = null;
      }
      // OrbitControls `change` only marks this shared renderer frame dirty.
      // Ambient motion already needs the same work every tick; static camera
      // transitions still retain their one final visual refresh.
      if (motionEnabled || ambientVisualsDirty || hadTransitionTick) {
        applyAmbientVisuals();
      }
      ambientVisualsDirty = false;
      ensureMotionFrame();
    });
    motionFrame = frameId;
  }

  const onVisibilityChange = () => {
    const hidden = ownerDocument.visibilityState === "hidden";
    ambientPaused = hidden;
    ambientLastTimestamp = null;
    if (hidden) {
      if (activeTransition) activeTransition.startedAt = null;
      if (motionFrame !== null) frameScheduler.cancel(motionFrame);
      motionFrame = null;
      ambientVisualsDirty = false;
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
    applyAmbientVisuals();
  };
  const updateCameraControlInteraction = () => {
    if (cameraControlInteractionActive) cancelCameraTransition();
    // Ambient motion and a non-reduced camera transition each own a shared
    // renderer frame that recomputes default Line silhouette trims. Coalesce
    // OrbitControls changes into either frame rather than doing an immediate
    // second all-link pass. Reduced/static/hidden modes have no such frame and
    // retain the synchronous update needed for immediate rendering.
    if (ambientMotionEnabled() || (transitionTick !== null && !ambientPaused)) {
      ambientVisualsDirty = true;
      ensureMotionFrame();
      return;
    }
    ambientVisualsDirty = false;
    applyAmbientVisuals();
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
    if (activeTransition) cancelCameraTransition();
    // A generation names one real transition. Stale OrbitControls `change`
    // events can arrive after that transition settles; they must not rewrite
    // its settled observation with a different generation.
    transitionGeneration += 1;
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
    transitionTick = (timestamp: number) => {
      if (active.generation !== transitionGeneration || activeTransition !== active) return;
      active.startedAt ??= timestamp;
      const progress = Math.min(1, Math.max(0, (timestamp - active.startedAt) / durationMs));
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
      } else {
        active.scene && applySceneFrame(active.scene, 1, true);
        activeTransition = null;
        transitionTick = null;
        flushDeferredData();
      }
    };
    ensureMotionFrame();
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
    const data = currentData;
    const focalPoint = nodePosition(focused);
    const constellationNodeIds = new Set([nodeId, ...data.selection.neighborNodeIds]);
    const peripheralContextCount = data.nodes.reduce(
      (count, node) => count + Number(!constellationNodeIds.has(node.id)),
      0,
    );
    const points = data.nodes.flatMap((node): CameraFramingPoint[] => {
      const position = nodePosition(node);
      if (!position) return [];
      // Shape metrics are shared with the default body's label anchor, so a
      // flat capsule or disk never gets framed as if it were the old sphere.
      const bodyRadius = defaultVisualInputForNode(node).silhouette.cameraRadius;
      const focusScale = node.id === nodeId ? 1.22 : 1;
      // Reserve the renderer-owned micro-motion envelope inside the existing
      // camera padding, including compact portrait framing.
      return [{ ...position, radius: (bodyRadius * 1.16 * focusScale) + AMBIENT_MAX_OFFSET }];
    });
    const viewport = data.selection.viewport;
    // A small graph already reads as one constellation. With several
    // peripheral nodes, pull the look target closer to the selected subject
    // while the fit calculation still keeps every context point in frame.
    const focalBias = peripheralContextCount >= 3 ? 0.32 : 0.18;
    return contextCameraPose(
      points,
      cameraPose(),
      boundedPerspectiveProjection(graph.camera(), viewport),
      viewport,
      focalPoint,
      focalBias,
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
        bodyMaterialColor: object?.userData.graphDefaultNodeObject === true
          ? objectMaterialColor(graphChildWithRole(object, "body"))
          : null,
        defaultBody: defaultNodeBodyObservation(object),
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
      if (motionFrame !== null) frameScheduler.cancel(motionFrame);
      motionFrame = null;
      ambientVisualsDirty = false;
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
      if (destroyed || !currentData) return null;
      const anchorNodePositions: GraphAmbientMotionNodePosition[] = [];
      const renderedNodePositions: GraphAmbientMotionNodePosition[] = [];
      const renderedScreenPositions: GraphAmbientMotionScreenPosition[] = [];
      ambientNodes.forEach((state) => {
        const rendered = actualNodeWorldPosition(state);
        anchorNodePositions.push({ id: state.id, x: state.anchorX, y: state.anchorY, z: state.anchorZ });
        renderedNodePositions.push({ id: state.id, x: rendered.x, y: rendered.y, z: rendered.z });
        const screen = graph.graph2ScreenCoords(rendered.x, rendered.y, rendered.z);
        if (Number.isFinite(screen.x) && Number.isFinite(screen.y)) {
          renderedScreenPositions.push({ id: state.id, x: screen.x, y: screen.y });
        }
      });
      const linkFlow: GraphAmbientMotionLinkFlowObservation[] = [];
      ambientLinks.forEach((state) => linkFlow.push({
        active: state.active,
        id: state.id,
        particleCount: state.particleCount,
      }));
      const linkEndpoints = [...ambientLinks.values()].flatMap((state) => {
        const endpoint = defaultLinkEndpointObservation(state);
        return endpoint ? [endpoint] : [];
      });
      const particles: GraphAmbientMotionParticleObservation[] = [];
      flowParticles.forEach((particle) => {
        if (!particle.object.visible || !particle.linkId) return;
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
      if (destroyed) return null;
      const camera = cameraPose();
      return {
        ...transitionObservation,
        camera: {
          lookAt: { ...camera.lookAt },
          position: { ...camera.position },
        },
        nodePositions: liveTransitionNodePositions(),
      };
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
        applyParticlePalette();
        currentData.nodes.forEach((node) => applyNodePalette(node));
        currentData.links.forEach((link) => applyLinkPalette(link));
        if (!activeTransition && !pendingSceneTransition) applyFinalVisuals(currentData);
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
