import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from "three";

import type { GraphNode } from "./contract.js";
import type { RenderGraphData, RenderLink, RenderNode } from "./layout.js";
import type { GraphLinkDescriptor, GraphNodeDescriptor, GraphPresentation } from "./presentation.js";
import type {
  GraphLinkObjectFactory,
  GraphNodeObjectFactory,
  GraphRenderer,
  GraphRendererFactoryOptions,
} from "./renderer-contract.js";

export type {
  GraphLinkObjectFactory,
  GraphNodeObjectFactory,
  GraphRenderer,
  GraphRendererFactoryOptions,
} from "./renderer-contract.js";

function boundedOpacity(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value!));
}

function defaultNodeColor(node: GraphNode, descriptor: GraphNodeDescriptor | undefined): string {
  if (descriptor?.color) return descriptor.color;
  if (node.roles?.includes("master")) return "#f6bd60";
  if (node.type === "relation") return "#82cfff";
  return "#a0e7e5";
}

function defaultLinkColor(descriptor: GraphLinkDescriptor | undefined): string {
  return descriptor?.color ?? "#5b7088";
}

export function createDefaultGraphNodeObject(
  node: RenderNode,
  descriptor: GraphNodeDescriptor | undefined,
): Object3D {
  const color = new Color(defaultNodeColor(node, descriptor));
  const opacity = boundedOpacity(descriptor?.opacity, 1);
  const group = new Group();
  const radius = node.type === "relation" ? 5.25 : 4.5;
  const material = new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: node.roles?.includes("master") ? 0.26 : 0.1,
    opacity,
    transparent: opacity < 1,
  });
  const body = new Mesh(new SphereGeometry(radius, 20, 14), material);
  group.add(body);
  if (node.roles?.includes("master")) {
    const ring = new Mesh(
      new TorusGeometry(radius + 1.45, 0.42, 10, 24),
      new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.34 }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }
  group.userData.graphNodeId = node.id;
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

  const descriptorForNode = (node: RenderNode) => currentPresentation.nodeDescriptors?.[node.id];
  const descriptorForLink = (link: RenderLink) => currentPresentation.linkDescriptors?.[link.id];

  graph
    .backgroundColor("#08111f")
    .showNavInfo(false)
    .nodeId("id")
    .linkSource("source")
    .linkTarget("target")
    .nodeLabel((node) => descriptorForNode(node)?.label ?? node.label)
    .nodeThreeObject((node) => nodeObjectFactory(node, descriptorForNode(node)))
    .linkThreeObject((link) => linkObjectFactory(link, descriptorForLink(link)))
    .linkPositionUpdate((object, coordinates) => updateLinkObject(
      object,
      coordinates.start,
      coordinates.end,
    ))
    .onNodeClick((node) => callbacks.onNodeClick(node.id))
    .onNodeHover((node) => callbacks.onNodeHover(node?.id ?? null))
    .onBackgroundClick(() => callbacks.onBackgroundClick());

  function applyData(data: RenderGraphData): void {
    currentData = data;
    currentPresentation = data.presentation;
    graph.graphData({ nodes: [...data.nodes], links: [...data.links] });
  }

  return {
    destroy() {
      graph._destructor();
    },
    fit(durationMs = 250) {
      graph.zoomToFit(durationMs, 28);
    },
    focus(nodeId) {
      const node = currentData?.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return;
      const target = { x: node.x, y: node.y, z: node.z };
      graph.cameraPosition({ x: node.x, y: node.y, z: node.z + 160 }, target, 280);
    },
    resize(width, height) {
      const next = dimensions(container, width, height);
      graph.width(next.width).height(next.height);
    },
    restoreCamera() {
      graph.zoomToFit(250, 28);
    },
    setData(data) {
      applyData(data);
    },
    setPresentation(presentation) {
      currentPresentation = presentation;
      if (currentData) applyData({ ...currentData, presentation });
    },
    zoom(scale) {
      const boundedScale = Math.max(0.25, Math.min(8, scale));
      const current = graph.cameraPosition();
      const distance = Math.max(80, Math.hypot(current.x, current.y, current.z));
      const factor = distance / boundedScale;
      const direction = distance > 0
        ? { x: current.x / distance, y: current.y / distance, z: current.z / distance }
        : { x: 0, y: 0, z: 1 };
      graph.cameraPosition({
        x: direction.x * factor,
        y: direction.y * factor,
        z: direction.z * factor,
      }, undefined, 180);
    },
  };
}
