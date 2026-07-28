import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Object3D,
} from "three";

const forceGraphFactory = vi.hoisted(() => ({
  create: undefined as unknown as () => FakeForceGraph,
}));

vi.mock("3d-force-graph", () => ({
  default: function ForceGraph3D() {
    return forceGraphFactory.create();
  },
}));

import { createRenderGraphData } from "../src/layout.js";
import { createDefaultGraphNodeObject, createThreeForceGraphRenderer } from "../src/renderer.js";
import type { GraphInput } from "../src/contract.js";
import { graphFixture } from "./fixtures.js";

interface Coordinates {
  x: number;
  y: number;
  z: number;
}

interface PointerUpRegistration {
  readonly capture: boolean;
  readonly listener: (event: PointerEvent) => void;
}

type CameraControlEvent = "change" | "end" | "start";

class FakeCameraControls {
  readonly listeners = new Map<CameraControlEvent, Set<() => void>>();

  addEventListener(event: CameraControlEvent, listener: () => void): void {
    const eventListeners = this.listeners.get(event) ?? new Set<() => void>();
    eventListeners.add(listener);
    this.listeners.set(event, eventListeners);
  }

  dispatch(event: CameraControlEvent): void {
    this.listeners.get(event)?.forEach((listener) => listener());
  }

  listenerCount(event: CameraControlEvent): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  removeEventListener(event: CameraControlEvent, listener: () => void): void {
    this.listeners.get(event)?.delete(listener);
  }
}

class FakeOwnerDocument {
  readonly pointerUpListeners: PointerUpRegistration[] = [];
  readonly visibilityListeners = new Set<() => void>();
  visibilityState: DocumentVisibilityState = "visible";

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type === "visibilitychange" && typeof listener === "function") {
      this.visibilityListeners.add(listener as () => void);
      return;
    }
    if (type !== "pointerup" || typeof listener !== "function") return;
    this.pointerUpListeners.push({
      capture: typeof options === "boolean" ? options : options?.capture ?? false,
      listener: listener as (event: PointerEvent) => void,
    });
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (type === "visibilitychange" && typeof listener === "function") {
      this.visibilityListeners.delete(listener as () => void);
      return;
    }
    if (type !== "pointerup" || typeof listener !== "function") return;
    const capture = typeof options === "boolean" ? options : options?.capture ?? false;
    const index = this.pointerUpListeners.findIndex((registration) => (
      registration.listener === listener && registration.capture === capture
    ));
    if (index >= 0) this.pointerUpListeners.splice(index, 1);
  }

  setVisibility(next: DocumentVisibilityState): void {
    this.visibilityState = next;
    this.visibilityListeners.forEach((listener) => listener());
  }
}

class FakeForceGraph {
  cameraSetters: Array<{ duration: number | undefined; lookAt: Coordinates | undefined; position: Coordinates }> = [];
  cameraControls = new FakeCameraControls();
  cameraProjection = { aspect: 4 / 3, fov: 50 };
  data: { links: Array<{ id: string }>; nodes: Array<Coordinates & { id: string }> } = { links: [], nodes: [] };
  graphDataSetCalls = 0;
  linkObjectFactory: ((link: { id: string }) => Object3D) | undefined;
  linkObjects = new Map<string, Object3D>();
  linkPositionUpdater: ((
    object: Object3D,
    coordinates: { end: Coordinates; start: Coordinates },
    link: { id: string; source: unknown; target: unknown },
  ) => boolean) | undefined;
  nodeDragCallback: (() => void) | undefined;
  nodeHoverCallback: ((node: (Coordinates & { id: string }) | null) => void) | undefined;
  nodeObjectFactory: ((node: Coordinates & { id: string }) => Object3D) | undefined;
  nodePositionUpdater: ((object: Object3D, coordinates: Coordinates, node: Coordinates & { id: string }) => boolean) | undefined;
  nodeObjects = new Map<string, Object3D>();
  ownerDocument = new FakeOwnerDocument();
  pose = {
    position: { x: 0, y: 0, z: 300 },
    lookAt: { x: 0, y: 0, z: 0 },
  };
  projectionCalls: Coordinates[] = [];
  sceneRoot = new Group();
  zoomToFitDurations: Array<number | undefined> = [];

  _destructor(): void {}
  backgroundColor(): this { return this; }
  camera(): typeof this.cameraProjection { return this.cameraProjection; }
  controls(): FakeCameraControls { return this.cameraControls; }
  graph2ScreenCoords(x: number, y: number, z: number): Coordinates {
    this.projectionCalls.push({ x, y, z });
    return { x: x + 100, y: y + 200, z };
  }
  graphData(data?: typeof this.data): this | typeof this.data {
    if (!data) return this.data;
    this.graphDataSetCalls += 1;
    this.data = data;
    this.sceneRoot.clear();
    data.nodes.forEach((node) => {
      const object = this.nodeObjects.get(node.id) ?? this.nodeObjectFactory?.(node);
      if (object) this.nodeObjects.set(node.id, object);
      if (object) object.position.set(node.x, node.y, node.z);
      if (object) this.sceneRoot.add(object);
    });
    data.links.forEach((link) => {
      const object = this.linkObjects.get(link.id) ?? this.linkObjectFactory?.(link);
      if (object) this.linkObjects.set(link.id, object);
      if (object) this.sceneRoot.add(object);
    });
    return this;
  }
  height(): this { return this; }
  linkPositionUpdate(callback: (
    object: Object3D,
    coordinates: { end: Coordinates; start: Coordinates },
    link: { id: string; source: unknown; target: unknown },
  ) => boolean): this {
    this.linkPositionUpdater = callback;
    return this;
  }
  linkSource(): this { return this; }
  linkTarget(): this { return this; }
  linkThreeObject(factory: (link: { id: string }) => Object3D): this {
    this.linkObjectFactory = factory;
    return this;
  }
  nodeId(): this { return this; }
  nodeLabel(): this { return this; }
  nodePositionUpdate(callback: (object: Object3D, coordinates: Coordinates, node: Coordinates & { id: string }) => boolean): this {
    this.nodePositionUpdater = callback;
    return this;
  }
  onNodeDrag(callback: () => void): this {
    this.nodeDragCallback = callback;
    return this;
  }
  nodeThreeObject(factory: (node: Coordinates & { id: string }) => Object3D): this {
    this.nodeObjectFactory = factory;
    return this;
  }
  onBackgroundClick(): this { return this; }
  onNodeClick(): this { return this; }
  onNodeHover(callback: (node: (Coordinates & { id: string }) | null) => void): this {
    this.nodeHoverCallback = callback;
    return this;
  }
  renderer(): { domElement: { ownerDocument: FakeOwnerDocument } } {
    return { domElement: { ownerDocument: this.ownerDocument } };
  }
  scene(): Group { return this.sceneRoot; }
  showNavInfo(): this { return this; }
  width(): this { return this; }

  cameraPosition(position?: Coordinates, lookAt?: Coordinates, duration?: number): this | (Coordinates & { lookAt: Coordinates }) {
    if (!position) return { ...this.pose.position, lookAt: { ...this.pose.lookAt } };
    this.cameraSetters.push({ duration, lookAt, position });
    this.pose = {
      position: { ...this.pose.position, ...position },
      lookAt: lookAt ? { ...lookAt } : this.pose.lookAt,
    };
    return this;
  }

  zoomToFit(duration?: number): this {
    this.zoomToFitDurations.push(duration);
    this.pose = {
      position: { x: 40, y: 20, z: 240 },
      lookAt: { x: 10, y: 5, z: 0 },
    };
    return this;
  }
}

function observeNeedsUpdateWrites(material: { needsUpdate: boolean }): () => number {
  let writes = 0;
  let currentValue = material.needsUpdate;
  Object.defineProperty(material, "needsUpdate", {
    configurable: true,
    get: () => currentValue,
    set: (value: boolean) => {
      writes += 1;
      currentValue = value;
    },
  });
  return () => writes;
}

function expectAllNodeBoundsWithinViewport(
  camera: { readonly lookAt?: Coordinates; readonly position: Coordinates },
  nodes: ReturnType<typeof createRenderGraphData>["nodes"],
  selectedNodeId: string,
  viewport: { readonly height: number; readonly width: number },
): void {
  if (!camera.lookAt) throw new Error("Expected a camera lookAt target");
  const normalize = (vector: Coordinates): Coordinates => {
    const length = Math.hypot(vector.x, vector.y, vector.z);
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
  };
  const center = camera.lookAt;
  const direction = normalize({
    x: camera.position.x - center.x,
    y: camera.position.y - center.y,
    z: camera.position.z - center.z,
  });
  const referenceUp = Math.abs(direction.y) > 0.94
    ? { x: 0, y: 0, z: 1 }
    : { x: 0, y: 1, z: 0 };
  const right = normalize({
    x: (referenceUp.y * direction.z) - (referenceUp.z * direction.y),
    y: (referenceUp.z * direction.x) - (referenceUp.x * direction.z),
    z: (referenceUp.x * direction.y) - (referenceUp.y * direction.x),
  });
  const up = {
    x: (direction.y * right.z) - (direction.z * right.y),
    y: (direction.z * right.x) - (direction.x * right.z),
    z: (direction.x * right.y) - (direction.y * right.x),
  };
  const verticalHalfFov = (50 * Math.PI) / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * (viewport.width / viewport.height));
  const padding = Math.min(36, Math.max(16, Math.min(viewport.width, viewport.height) * 0.035));
  const expectedBounds = {
    maximumX: viewport.width - padding,
    maximumY: viewport.height - padding,
    minimumX: padding,
    minimumY: padding,
  };

  nodes.forEach((node) => {
    const bodyRadius = node.type === "relation" ? 7.5 : 3;
    const radius = bodyRadius * 1.16 * (node.id === selectedNodeId ? 1.22 : 1);
    // The renderer sizes from an enclosing cube around each sphere. Testing all
    // eight enclosing-cube corners therefore proves a conservative screen
    // bound for every possible point on the node body.
    for (const horizontalOffset of [-radius, radius]) {
      for (const verticalOffset of [-radius, radius]) {
        for (const depthOffset of [-radius, radius]) {
          const delta = {
            x: (node.x - center.x) + (right.x * horizontalOffset) + (up.x * verticalOffset) + (direction.x * depthOffset),
            y: (node.y - center.y) + (right.y * horizontalOffset) + (up.y * verticalOffset) + (direction.y * depthOffset),
            z: (node.z - center.z) + (right.z * horizontalOffset) + (up.z * verticalOffset) + (direction.z * depthOffset),
          };
          const horizontal = (delta.x * right.x) + (delta.y * right.y) + (delta.z * right.z);
          const vertical = (delta.x * up.x) + (delta.y * up.y) + (delta.z * up.z);
          const depth = (camera.position.x - (center.x + delta.x)) * direction.x
            + (camera.position.y - (center.y + delta.y)) * direction.y
            + (camera.position.z - (center.z + delta.z)) * direction.z;
          const screenX = (0.5 + (horizontal / (2 * depth * Math.tan(horizontalHalfFov)))) * viewport.width;
          const screenY = (0.5 - (vertical / (2 * depth * Math.tan(verticalHalfFov)))) * viewport.height;
          expect(screenX).toBeGreaterThanOrEqual(expectedBounds.minimumX - 0.01);
          expect(screenX).toBeLessThanOrEqual(expectedBounds.maximumX + 0.01);
          expect(screenY).toBeGreaterThanOrEqual(expectedBounds.minimumY - 0.01);
          expect(screenY).toBeLessThanOrEqual(expectedBounds.maximumY + 0.01);
        }
      }
    }
  });
}

function projectedEndpointInBodyCoordinates(
  body: Mesh,
  endpoint: Coordinates,
  camera: Coordinates,
): Vector3 {
  body.updateWorldMatrix(true, false);
  const origin = body.localToWorld(new Vector3());
  const axisX = body.localToWorld(new Vector3(1, 0, 0)).sub(origin);
  const axisY = body.localToWorld(new Vector3(0, 1, 0)).sub(origin);
  const normal = axisX.cross(axisY).normalize();
  const ray = new Vector3(endpoint.x - camera.x, endpoint.y - camera.y, endpoint.z - camera.z);
  const denominator = ray.dot(normal);
  if (Math.abs(denominator) < 0.0001) throw new Error("Expected endpoint ray to meet a default body plane");
  const progress = origin.clone().sub(camera).dot(normal) / denominator;
  return body.worldToLocal(ray.multiplyScalar(progress).add(camera));
}

function expectEndpointOnDefaultBodyBoundary(
  body: Mesh,
  endpoint: Coordinates,
  camera: Coordinates,
): void {
  body.geometry.computeBoundingBox();
  const bounds = body.geometry.boundingBox!;
  const point = projectedEndpointInBodyCoordinates(body, endpoint, camera);
  const radius = bounds.max.y;
  if (body.userData.graphDefaultNodeSilhouette === "capsule") {
    const halfStraight = Math.max(0, bounds.max.x - radius);
    const boundaryRadius = Math.abs(point.x) <= halfStraight
      ? Math.abs(point.y)
      : Math.hypot(Math.abs(point.x) - halfStraight, point.y);
    expect(boundaryRadius).toBeCloseTo(radius, 2);
    return;
  }
  expect(Math.hypot(point.x, point.y)).toBeCloseTo(radius, 2);
}

describe("Three.js camera transitions", () => {
  const frames = new Map<number, FrameRequestCallback>();
  const cancelledFrames: number[] = [];
  let nextFrameId = 1;
  let graph: FakeForceGraph;

  beforeEach(() => {
    frames.clear();
    cancelledFrames.length = 0;
    nextFrameId = 1;
    graph = new FakeForceGraph();
    forceGraphFactory.create = () => graph;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
      cancelledFrames.push(frameId);
      frames.delete(frameId);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function runLatestFrame(timestamp: number): number {
    const frameId = Math.max(...frames.keys());
    if (!Number.isFinite(frameId)) throw new Error("Expected a scheduled animation frame");
    const callback = frames.get(frameId)!;
    frames.delete(frameId);
    callback(timestamp);
    return frameId;
  }

  function moveSelectionHalfway(
    renderer: ReturnType<typeof createThreeForceGraphRenderer>,
    data: ReturnType<typeof createRenderGraphData>,
    nodeId: string,
  ): void {
    renderer.setData(data);
    // GraphWorkbench syncs the normalized presentation immediately after data.
    // An equivalent presentation must not consume the pending scene transaction.
    renderer.setPresentation(data.presentation);
    renderer.transitionToNode!(nodeId, { reducedMotion: false });
    runLatestFrame(0);
    runLatestFrame(210);
  }

  function expectLiveNodesAt(data: ReturnType<typeof createRenderGraphData>): void {
    expect(graph.data.nodes.map(({ id, x, y, z }) => ({ id, x, y, z }))).toEqual(
      data.nodes.map(({ id, x, y, z }) => ({ id, x, y, z })),
    );
  }

  it("cancels stale focus, fit, zoom, and restore frames without starting vendor tweens", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] }));

    renderer.transitionToNode!("component:api", { reducedMotion: false });
    const staleFrame = frames.get(1)!;
    renderer.fit(250);
    const setterCount = graph.cameraSetters.length;
    staleFrame(100);
    expect(graph.cameraSetters).toHaveLength(setterCount);

    renderer.zoom(1.5);
    renderer.restoreCamera();
    renderer.cancelCameraTransition!();

    expect(cancelledFrames).toEqual([1, 2, 3, 4]);
    expect(graph.zoomToFitDurations).toEqual([0, 0]);
    expect(graph.cameraSetters.every(({ duration }) => duration === 0)).toBe(true);
  });

  it("cancels active transitions for OrbitControls interaction and built-in node drag", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] }));

    renderer.transitionToNode!("component:api", { reducedMotion: false });
    const orbitFrame = frames.get(1)!;
    graph.cameraControls.dispatch("start");
    orbitFrame(100);
    expect(cancelledFrames).toEqual([1]);
    expect(graph.cameraSetters).toHaveLength(0);

    graph.cameraControls.dispatch("end");
    renderer.transitionToNode!("component:api", { reducedMotion: false });
    graph.cameraControls.dispatch("change");
    expect(frames.has(2)).toBe(true);

    graph.cameraControls.dispatch("start");
    renderer.transitionToNode!("component:api", { reducedMotion: false });
    graph.nodeDragCallback?.();
    expect(cancelledFrames).toEqual([1, 2, 3]);

    renderer.destroy();
    expect(graph.cameraControls.listenerCount("start")).toBe(0);
    expect(graph.cameraControls.listenerCount("change")).toBe(0);
    expect(graph.cameraControls.listenerCount("end")).toBe(0);
  });

  it("suppresses only the malformed vendor drag release and removes the guard on destroy", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    expect(graph.ownerDocument.pointerUpListeners).toHaveLength(1);
    expect(graph.ownerDocument.pointerUpListeners[0]?.capture).toBe(true);

    const stopMalformedRelease = vi.fn();
    graph.ownerDocument.pointerUpListeners[0]?.listener({
      isTrusted: false,
      pointerId: 0,
      pointerType: "touch",
      stopImmediatePropagation: stopMalformedRelease,
      target: graph.ownerDocument,
    } as unknown as PointerEvent);
    expect(stopMalformedRelease).toHaveBeenCalledOnce();

    const stopNativeMouseRelease = vi.fn();
    graph.ownerDocument.pointerUpListeners[0]?.listener({
      isTrusted: true,
      pointerId: 1,
      pointerType: "mouse",
      stopImmediatePropagation: stopNativeMouseRelease,
      target: {},
    } as unknown as PointerEvent);
    expect(stopNativeMouseRelease).not.toHaveBeenCalled();

    renderer.destroy();
    expect(graph.ownerDocument.pointerUpListeners).toHaveLength(0);
  });

  it("projects the current renderer node coordinates into canvas-local screen coordinates", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] }));
    const liveObject = graph.nodeObjects.get("component:api")!;
    liveObject.position.set(17, -9, 31);

    const projected = renderer.getNodeScreenPosition?.("component:api")!;
    expect(projected).toEqual({ x: 117, y: 191 });
    expect(graph.projectionCalls).toEqual([{ x: 17, y: -9, z: 31 }]);
    expect(renderer.getNodeScreenPosition?.("missing")).toBeNull();

    liveObject.position.x = Number.NaN;
    expect(renderer.getNodeScreenPosition?.("component:api")).toBeNull();
    expect(graph.projectionCalls).toHaveLength(1);
  });

  it("keeps deterministic anchors stable while default objects receive continuous rendered drift", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, {}));
    runLatestFrame(0);
    const first = renderer.getAmbientMotionObservation!()!;
    runLatestFrame(1_000);
    const second = renderer.getAmbientMotionObservation!()!;

    expect(second.active).toBe(true);
    expect(second.elapsedMs).toBe(1_000);
    expect(second.anchorNodePositions).toEqual(first.anchorNodePositions);
    expect(second.renderedNodePositions).not.toEqual(first.renderedNodePositions);
    expect(second.renderedScreenPositions).not.toEqual(first.renderedScreenPositions);
    expect(renderer.getTransitionObservation!()?.nodePositions).toEqual(second.anchorNodePositions);
    const apiAnchor = second.anchorNodePositions.find((node) => node.id === "component:api")!;
    const apiRendered = second.renderedNodePositions.find((node) => node.id === "component:api")!;
    const apiObject = graph.nodeObjects.get("component:api")!;
    graph.nodePositionUpdater?.(apiObject, apiAnchor, graph.data.nodes.find((node) => node.id === "component:api")!);
    expect(apiObject.position.toArray()).toEqual([apiRendered.x, apiRendered.y, apiRendered.z]);
  });

  it("flows two restrained renderer-owned tokens outward across every focused default incident curve", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] }));
    runLatestFrame(0);
    const first = renderer.getAmbientMotionObservation!()!;
    const activeLinks = first.linkFlow.filter((link) => link.active);
    expect(activeLinks.map((link) => link.id).sort()).toEqual(["api-web", "release-api"]);
    activeLinks.forEach((link) => expect(link.particleCount).toBe(2));
    expect(first.particles).toHaveLength(activeLinks.reduce((total, link) => total + link.particleCount, 0));

    runLatestFrame(1_000);
    const second = renderer.getAmbientMotionObservation!()!;
    const firstParticle = first.particles[0]!;
    const secondParticle = second.particles.find((particle) => particle.id === firstParticle.id)!;
    expect(secondParticle.phase).not.toBe(firstParticle.phase);
    expect((secondParticle.phase - firstParticle.phase + 1) % 1).toBeCloseTo(0.11);
    expect(secondParticle.screenX).not.toBeNull();
    expect(secondParticle.screenY).not.toBeNull();
  });

  it("clips focused default curves at the live camera-facing node boundaries", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] }));

    const ambientRoot = new Group();
    ambientRoot.position.set(23, -17, 11);
    ambientRoot.rotation.set(0.1, -0.18, 0.07);
    ambientRoot.scale.set(1.08, 0.94, 1.03);
    graph.sceneRoot.add(ambientRoot);
    const source = graph.nodeObjects.get("component:api")!;
    const target = graph.nodeObjects.get("component:web")!;
    ambientRoot.add(source, target);

    const link = graph.linkObjects.get("api-web") as Line;
    const linkRoot = new Group();
    linkRoot.position.set(-13, 9, -7);
    linkRoot.rotation.set(-0.08, 0.16, -0.12);
    linkRoot.scale.set(0.91, 1.11, 0.96);
    graph.sceneRoot.add(linkRoot);
    linkRoot.add(link);

    const particleGroup = graph.sceneRoot.children.find((child) => child.name === "graph-workbench-flow-particles")!;
    const particleRoot = new Group();
    particleRoot.position.set(6, -11, 5);
    particleRoot.rotation.set(0.05, -0.09, 0.13);
    particleRoot.scale.set(1.04, 0.97, 1.06);
    graph.sceneRoot.add(particleRoot);
    particleRoot.add(particleGroup);

    runLatestFrame(0);
    runLatestFrame(1_000);

    const positions = link.geometry.getAttribute("position");
    expect(positions.count).toBe(29);
    const lineEndpointInWorld = (index: number) => link.localToWorld(new Vector3().fromBufferAttribute(positions, index));
    const sourceWorld = source.getWorldPosition(new Vector3());
    const targetWorld = target.getWorldPosition(new Vector3());
    const liveLink = graph.data.links.find((candidate) => candidate.id === "api-web") as {
      id: string;
      source: string;
      target: string;
    };
    const sourceAnchor = graph.data.nodes.find((node) => node.id === liveLink.source)!;
    const targetAnchor = graph.data.nodes.find((node) => node.id === liveLink.target)!;
    graph.linkPositionUpdater!(link, {
      end: targetAnchor,
      start: sourceAnchor,
    }, {
      ...liveLink,
      // d3-force-3d mutates this vendor callback input from ids to live node
      // objects. The renderer must resolve the canonical ids from its own link
      // state instead of falling back to these stale anchor coordinates.
      source: sourceAnchor,
      target: targetAnchor,
    });
    const ambient = renderer.getAmbientMotionObservation!()!;
    const endpoint = ambient.linkEndpoints.find((candidate) => candidate.id === "api-web")!;

    expect(endpoint.sourceBoundary).toMatchObject({
      endpointAtSilhouetteBoundary: true,
      exteriorProbeInside: false,
      interiorProbeInside: true,
    });
    expect(endpoint.targetBoundary).toMatchObject({
      endpointAtSilhouetteBoundary: true,
      exteriorProbeInside: false,
      interiorProbeInside: true,
    });
    expect(lineEndpointInWorld(0).distanceTo(sourceWorld)).toBeGreaterThan(0.1);
    expect(lineEndpointInWorld(positions.count - 1).distanceTo(targetWorld)).toBeGreaterThan(0.1);
    expect(new Vector3(endpoint.start.x, endpoint.start.y, endpoint.start.z).distanceTo(lineEndpointInWorld(0))).toBeLessThan(0.0001);
    expect(new Vector3(endpoint.end.x, endpoint.end.y, endpoint.end.z).distanceTo(lineEndpointInWorld(positions.count - 1))).toBeLessThan(0.0001);
    const sourceBody = source.children.find((child) => child.userData.graphVisualRole === "body") as Mesh;
    const targetBody = target.children.find((child) => child.userData.graphVisualRole === "body") as Mesh;
    expectEndpointOnDefaultBodyBoundary(sourceBody, endpoint.start, graph.pose.position);
    expectEndpointOnDefaultBodyBoundary(targetBody, endpoint.end, graph.pose.position);

    const endpointBeforeOrbit = { ...endpoint.start };
    graph.cameraControls.dispatch("start");
    graph.pose = {
      lookAt: { x: 4, y: -3, z: 0 },
      position: { x: 175, y: 75, z: 230 },
    };
    graph.cameraControls.dispatch("change");
    graph.cameraControls.dispatch("end");
    // Normal-motion Orbit changes share the already queued ambient RAF rather
    // than synchronously retrimming every default edge a second time.
    runLatestFrame(1_016);
    const afterOrbit = renderer.getAmbientMotionObservation!()!.linkEndpoints
      .find((candidate) => candidate.id === "api-web")!;
    expect(afterOrbit.start).not.toEqual(endpointBeforeOrbit);
    expectEndpointOnDefaultBodyBoundary(sourceBody, afterOrbit.start, graph.pose.position);
    expectEndpointOnDefaultBodyBoundary(targetBody, afterOrbit.end, graph.pose.position);

    const flow = ambient.particles.find((particle) => particle.linkId === "api-web")!;
    const particleIndex = Number.parseInt(flow.id.slice("flow:".length), 10);
    const particle = particleGroup.children[particleIndex] as Mesh;
    const particleWorld = particle.getWorldPosition(new Vector3());
    const distanceToRenderedSegment = (start: Vector3, end: Vector3): number => {
      const segment = end.clone().sub(start);
      const lengthSquared = segment.lengthSq();
      if (lengthSquared === 0) return particleWorld.distanceTo(start);
      const projection = Math.max(0, Math.min(1, particleWorld.clone().sub(start).dot(segment) / lengthSquared));
      return particleWorld.distanceTo(start.add(segment.multiplyScalar(projection)));
    };
    const nearestRenderedSegment = Math.min(...Array.from(
      { length: positions.count - 1 },
      (_unused, index) => distanceToRenderedSegment(
        link.localToWorld(new Vector3().fromBufferAttribute(positions, index)),
        link.localToWorld(new Vector3().fromBufferAttribute(positions, index + 1)),
      ),
    ));
    // The particle and the default Line are both under distinct nested
    // transforms. This proves it remains on the rendered tessellated segment,
    // rather than merely agreeing with Bézier endpoints or canvas bounds.
    expect(nearestRenderedSegment).toBeLessThan(0.0001);
  });

  it("uses each default flat silhouette as a link boundary", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData({
      layout: { seed: "endpoint-silhouettes" },
      nodes: [
        { id: "profile", kind: "profile", label: "Profile", layoutHint: { pinned: true, x: -90, y: 55, z: 0 }, type: "profile" },
        { id: "workflow", kind: "workflow", label: "Workflow", layoutHint: { pinned: true, x: -90, y: 18, z: 0 }, type: "workflow" },
        { id: "relation", kind: "relation", label: "Relation", layoutHint: { pinned: true, x: -90, y: -18, z: 0 }, type: "relation" },
        { id: "leaf", kind: "service", label: "Leaf", layoutHint: { pinned: true, x: -90, y: -55, z: 0 }, type: "component" },
        { id: "profile-target", kind: "service", label: "Profile target", layoutHint: { pinned: true, x: 90, y: 55, z: 0 }, type: "component" },
        { id: "workflow-target", kind: "service", label: "Workflow target", layoutHint: { pinned: true, x: 90, y: 18, z: 0 }, type: "component" },
        { id: "relation-target", kind: "service", label: "Relation target", layoutHint: { pinned: true, x: 90, y: -18, z: 0 }, type: "component" },
        { id: "relation-second-target", kind: "service", label: "Relation second target", layoutHint: { pinned: true, x: 70, y: -72, z: 0 }, type: "component" },
        { id: "leaf-target", kind: "service", label: "Leaf target", layoutHint: { pinned: true, x: 90, y: -55, z: 0 }, type: "component" },
      ],
      schemaVersion: 1,
      links: [
        { id: "profile-link", relationKind: "uses", source: "profile", target: "profile-target" },
        { id: "workflow-link", relationKind: "uses", source: "workflow", target: "workflow-target" },
        { id: "relation-link", relationKind: "uses", source: "relation", target: "relation-target" },
        { id: "relation-second-link", relationKind: "uses", source: "relation", target: "relation-second-target" },
        { id: "leaf-link", relationKind: "uses", source: "leaf", target: "leaf-target" },
      ],
    }, { reducedMotion: true }));

    const expectedSilhouettes = new Map([
      ["profile-link", "circle"],
      ["workflow-link", "capsule"],
      ["relation-link", "disk"],
      ["leaf-link", "dot"],
    ]);
    const endpoints = renderer.getAmbientMotionObservation!()!.linkEndpoints;
    expectedSilhouettes.forEach((silhouette, linkId) => {
      const endpoint = endpoints.find((candidate) => candidate.id === linkId)!;
      const source = graph.nodeObjects.get(endpoint.sourceId)!;
      const body = source.children.find((child) => child.userData.graphVisualRole === "body") as Mesh;
      expect(body.userData.graphDefaultNodeSilhouette).toBe(silhouette);
      expect(new Vector3(endpoint.start.x, endpoint.start.y, endpoint.start.z)
        .distanceTo(source.getWorldPosition(new Vector3()))).toBeGreaterThan(0.1);
      expectEndpointOnDefaultBodyBoundary(body, endpoint.start, graph.pose.position);
    });
  });

  it("coalesces normal OrbitControls clipping into ambient RAF while static modes update immediately", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, {}));
    runLatestFrame(0);

    const line = graph.linkObjects.get("api-web") as Line;
    const positions = line.geometry.getAttribute("position");
    const normalWrites = vi.spyOn(positions, "setXYZ");
    graph.pose = {
      lookAt: { x: -8, y: 5, z: 0 },
      position: { x: 175, y: 75, z: 230 },
    };
    graph.cameraControls.dispatch("change");
    expect(normalWrites).not.toHaveBeenCalled();

    runLatestFrame(16);
    expect(normalWrites).toHaveBeenCalled();
    normalWrites.mockRestore();

    renderer.setData(createRenderGraphData(graphFixture, { reducedMotion: true }));
    const staticWrites = vi.spyOn(positions, "setXYZ");
    graph.pose = {
      lookAt: { x: 11, y: -4, z: 0 },
      position: { x: 132, y: 64, z: 245 },
    };
    graph.cameraControls.dispatch("change");
    expect(staticWrites).toHaveBeenCalled();
  });

  it("coalesces ambient-disabled OrbitControls changes into a live camera transition", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { ambientMotion: false }));
    renderer.setData(createRenderGraphData(graphFixture, {
      ambientMotion: false,
      selectedNodeIds: ["component:api"],
    }));
    renderer.transitionToNode!("component:api", { reducedMotion: false });

    const line = graph.linkObjects.get("api-web") as Line;
    const positions = line.geometry.getAttribute("position");
    const transitionWrites = vi.spyOn(positions, "setXYZ");
    graph.pose = {
      lookAt: { x: -6, y: 4, z: 0 },
      position: { x: 168, y: 71, z: 228 },
    };
    graph.cameraControls.dispatch("change");
    expect(transitionWrites).not.toHaveBeenCalled();

    runLatestFrame(0);
    expect(transitionWrites).toHaveBeenCalled();
    runLatestFrame(420);
    transitionWrites.mockRestore();

    const staticWrites = vi.spyOn(positions, "setXYZ");
    graph.pose = {
      lookAt: { x: 8, y: -3, z: 0 },
      position: { x: 144, y: 65, z: 244 },
    };
    graph.cameraControls.dispatch("change");
    expect(staticWrites).toHaveBeenCalled();
  });

  it("keeps per-frame default-link boundary cache out of Line userData", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] }));
    runLatestFrame(0);

    const line = graph.linkObjects.get("api-web") as Line;
    const userDataKeys = Object.keys(line.userData).sort();
    runLatestFrame(125);
    runLatestFrame(250);

    expect(Object.keys(line.userData).sort()).toEqual(userDataKeys);
    expect(line.userData.graphDefaultLinkBoundaryEvidence).toBeUndefined();
    const endpoint = renderer.getAmbientMotionObservation!()!.linkEndpoints
      .find((candidate) => candidate.id === "api-web")!;
    expect(endpoint.sourceBoundary).toMatchObject({
      endpointAtSilhouetteBoundary: true,
      exteriorProbeInside: false,
      interiorProbeInside: true,
    });
    expect(endpoint.targetBoundary).toMatchObject({
      endpointAtSilhouetteBoundary: true,
      exteriorProbeInside: false,
      interiorProbeInside: true,
    });
  });

  it("leaves custom node and link factory geometry under host control", () => {
    const customNode = new Group();
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
      nodeObjectFactory: (node, descriptor) => node.id === "custom-source"
        ? customNode
        : createDefaultGraphNodeObject(node, descriptor),
    });
    renderer.setData(createRenderGraphData({
      layout: { seed: "custom-endpoint" },
      nodes: [
        { id: "custom-source", kind: "service", label: "Custom", layoutHint: { pinned: true, x: -40, y: 0, z: 0 }, type: "component" },
        { id: "default-target", kind: "service", label: "Default", layoutHint: { pinned: true, x: 40, y: 0, z: 0 }, type: "component" },
      ],
      schemaVersion: 1,
      links: [{ id: "custom-node-link", relationKind: "uses", source: "custom-source", target: "default-target" }],
    }, { reducedMotion: true }));

    const endpoint = renderer.getAmbientMotionObservation!()!.linkEndpoints[0]!;
    expect(new Vector3(endpoint.start.x, endpoint.start.y, endpoint.start.z))
      .toEqual(customNode.getWorldPosition(new Vector3()));
    const defaultTarget = graph.nodeObjects.get("default-target")!;
    expect(new Vector3(endpoint.end.x, endpoint.end.y, endpoint.end.z)
      .distanceTo(defaultTarget.getWorldPosition(new Vector3()))).toBeGreaterThan(0.1);
    expect(endpoint.sourceBoundary).toBeNull();
    expect(endpoint.targetBoundary).toMatchObject({
      endpointAtSilhouetteBoundary: true,
      exteriorProbeInside: false,
      interiorProbeInside: true,
    });

    const hostLink = new Group();
    const customLinkRenderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
      linkObjectFactory: () => hostLink,
    });
    customLinkRenderer.setData(createRenderGraphData(graphFixture, { reducedMotion: true }));
    const api = graph.data.nodes.find((node) => node.id === "component:api")!;
    const web = graph.data.nodes.find((node) => node.id === "component:web")!;
    expect(graph.linkPositionUpdater!(hostLink, { end: web, start: api }, {
      id: "api-web",
      source: api,
      target: web,
    })).toBe(false);
    expect(hostLink.visible).toBe(true);
  });

  it("freezes drift and flow for reduced motion, then clears and resumes safely across visibility changes", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const selected = createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] });
    renderer.setData(selected);
    runLatestFrame(0);
    expect(renderer.getAmbientMotionObservation!()?.particles.length).toBeGreaterThan(0);

    graph.ownerDocument.setVisibility("hidden");
    const hidden = renderer.getAmbientMotionObservation!()!;
    expect(hidden).toMatchObject({ active: false, paused: true });
    expect(hidden.particles).toEqual([]);
    const elapsedBeforeResume = hidden.elapsedMs;

    graph.ownerDocument.setVisibility("visible");
    runLatestFrame(10_000);
    const resumed = renderer.getAmbientMotionObservation!()!;
    expect(resumed).toMatchObject({ active: true, paused: false });
    expect(resumed.elapsedMs).toBe(elapsedBeforeResume);

    renderer.setData(createRenderGraphData(graphFixture, {
      reducedMotion: true,
      selectedNodeIds: ["component:api"],
    }));
    const reduced = renderer.getAmbientMotionObservation!()!;
    expect(reduced).toMatchObject({ active: false, reducedMotion: true });
    expect(reduced.particles).toEqual([]);
    expect(reduced.anchorNodePositions).toEqual(reduced.renderedNodePositions);
    expect(reduced.linkEndpoints).toHaveLength(graphFixture.links.length);
    reduced.linkEndpoints.forEach((endpoint) => {
      const source = graph.nodeObjects.get(endpoint.sourceId)!;
      const target = graph.nodeObjects.get(endpoint.targetId)!;
      const sourceCenter = source.getWorldPosition(new Vector3());
      const targetCenter = target.getWorldPosition(new Vector3());
      expect(new Vector3(endpoint.start.x, endpoint.start.y, endpoint.start.z).distanceTo(sourceCenter)).toBeGreaterThan(0.1);
      expect(new Vector3(endpoint.end.x, endpoint.end.y, endpoint.end.z).distanceTo(targetCenter)).toBeGreaterThan(0.1);
      expectEndpointOnDefaultBodyBoundary(
        source.children.find((child) => child.userData.graphVisualRole === "body") as Mesh,
        endpoint.start,
        graph.pose.position,
      );
      expectEndpointOnDefaultBodyBoundary(
        target.children.find((child) => child.userData.graphVisualRole === "body") as Mesh,
        endpoint.end,
        graph.pose.position,
      );
    });
  });

  it("publishes the same selected anchors synchronously for reduced and normal selection transactions", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const initial = createRenderGraphData(graphFixture, {});
    const normalSelected = createRenderGraphData(graphFixture, { selectedNodeIds: ["component:web"] });
    const reducedSelected = createRenderGraphData(graphFixture, {
      reducedMotion: true,
      selectedNodeIds: ["component:web"],
    });

    renderer.setData(initial);
    renderer.setData(normalSelected);
    renderer.transitionToNode!("component:web", { reducedMotion: false });
    runLatestFrame(0);
    runLatestFrame(420);
    const normalAnchors = renderer.getAmbientMotionObservation!()?.anchorNodePositions;

    renderer.setData(initial);
    renderer.cancelCameraTransition!();
    renderer.setData(reducedSelected);
    renderer.transitionToNode!("component:web", { reducedMotion: true });
    const reduced = renderer.getAmbientMotionObservation!()!;

    expect(normalAnchors).toEqual(normalSelected.nodes.map(({ id, x, y, z }) => ({ id, x, y, z })));
    expect(reduced.anchorNodePositions).toEqual(normalAnchors);
    expect(reduced.renderedNodePositions).toEqual(reduced.anchorNodePositions);
    expect(reduced.particles).toEqual([]);
  });

  it("keeps custom node factories at their actual anchors and does not churn graph data or factories on warm ticks", () => {
    const nodeFactory = vi.fn(() => new Group());
    const linkFactory = vi.fn(() => new Group());
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
      linkObjectFactory: linkFactory,
      nodeObjectFactory: nodeFactory,
    });
    renderer.setData(createRenderGraphData(graphFixture, {}));
    const graphDataSets = graph.graphDataSetCalls;
    const nodeCalls = nodeFactory.mock.calls.length;
    const linkCalls = linkFactory.mock.calls.length;
    const nodeObjects = [...graph.nodeObjects.entries()];
    const linkObjects = [...graph.linkObjects.entries()];
    runLatestFrame(0);
    runLatestFrame(1_000);
    expect(graph.graphDataSetCalls).toBe(graphDataSets);
    expect(nodeFactory).toHaveBeenCalledTimes(nodeCalls);
    expect(linkFactory).toHaveBeenCalledTimes(linkCalls);
    expect([...graph.nodeObjects.entries()]).toEqual(nodeObjects);
    expect([...graph.linkObjects.entries()]).toEqual(linkObjects);

    const observation = renderer.getAmbientMotionObservation!()!;
    expect(observation.anchorNodePositions).toEqual(observation.renderedNodePositions);
    const liveNode = graph.data.nodes.find((node) => node.id === "component:api")!;
    Object.assign(liveNode, { x: 17, y: -9, z: 31 });
    graph.nodeObjects.get("component:api")?.position.set(17, -9, 31);
    expect(renderer.getNodeScreenPosition?.("component:api")).toEqual({ x: 117, y: 191 });
  });

  it("keeps default ambient RAF ticks material-stable after warm-up", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] }));
    runLatestFrame(0);

    const nodeObject = graph.nodeObjects.get("component:api")!;
    const linkObject = graph.linkObjects.get("api-web")!;
    const body = nodeObject.children.find((child) => child.userData.graphVisualRole === "body") as Mesh;
    const label = nodeObject.children.find((child) => child.userData.graphVisualRole === "node-label") as Sprite;
    expect(linkObject).toBeInstanceOf(Line);
    expect(body.material).toBeInstanceOf(MeshBasicMaterial);
    expect(label.material).toBeInstanceOf(SpriteMaterial);
    const link = linkObject as Line;
    expect(link.material).toBeInstanceOf(LineBasicMaterial);

    const bodyMaterial = body.material as MeshBasicMaterial;
    const labelMaterial = label.material as SpriteMaterial;
    const linkMaterial = link.material as LineBasicMaterial;
    const particleGroup = graph.sceneRoot.children.find((child) => child.name === "graph-workbench-flow-particles")!;
    const particle = particleGroup.children[0] as Mesh;
    const graphData = graph.data;
    const graphDataSets = graph.graphDataSetCalls;
    const nodeGeometry = body.geometry;
    const linkGeometry = link.geometry;
    const particleGeometry = particle.geometry;
    const particleMaterial = particle.material;
    expect(particleGeometry.type).toBe("CircleGeometry");
    const nodeTraverse = vi.spyOn(nodeObject, "traverse");
    const linkTraverse = vi.spyOn(link, "traverse");
    const bodyNeedsUpdateWrites = observeNeedsUpdateWrites(bodyMaterial);
    const labelNeedsUpdateWrites = observeNeedsUpdateWrites(labelMaterial);
    const linkNeedsUpdateWrites = observeNeedsUpdateWrites(linkMaterial);

    runLatestFrame(125);
    runLatestFrame(250);
    runLatestFrame(375);

    expect(graph.graphDataSetCalls).toBe(graphDataSets);
    expect(graph.data).toBe(graphData);
    expect(graph.nodeObjects.get("component:api")).toBe(nodeObject);
    expect(graph.linkObjects.get("api-web")).toBe(linkObject);
    expect(body.material).toBe(bodyMaterial);
    expect(label.material).toBe(labelMaterial);
    expect(link.material).toBe(linkMaterial);
    expect(body.geometry).toBe(nodeGeometry);
    expect(link.geometry).toBe(linkGeometry);
    expect(particle.geometry).toBe(particleGeometry);
    expect(particle.material).toBe(particleMaterial);
    expect(bodyNeedsUpdateWrites()).toBe(0);
    expect(labelNeedsUpdateWrites()).toBe(0);
    expect(linkNeedsUpdateWrites()).toBe(0);
    expect(nodeTraverse).not.toHaveBeenCalled();
    expect(linkTraverse).not.toHaveBeenCalled();
  });

  it("keeps the canonical master floor above an unrelated far node after ambient RAF ticks", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const data = createRenderGraphData({
      ...graphFixture,
      nodes: [
        ...graphFixture.nodes,
        {
          id: "concept:far",
          kind: "concept",
          label: "Far",
          layoutHint: { pinned: true, x: -100, y: 0, z: 100 },
          type: "concept",
        },
      ],
    }, { selectedNodeIds: ["component:web"] });
    // This is the real RenderGraphData shape a host can project to a renderer:
    // it retains the canonical visual floor but deliberately omits source
    // GraphNode roles. Ambient readability must still preserve the master.
    renderer.setData({
      ...data,
      nodes: data.nodes.map(({ roles: _roles, ...node }) => node),
    });
    runLatestFrame(0);
    runLatestFrame(1_000);

    const observation = renderer.getRenderObservation!()!;
    const master = observation.nodes.find((node) => node.id === "relation:release")!;
    const far = observation.nodes.find((node) => node.id === "concept:far")!;
    expect(master.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.45);
    expect(master.label.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.45);
    expect(master.label.minimumVisibleMaterialOpacity).toBeGreaterThan(far.label.minimumVisibleMaterialOpacity!);
    expect(master.minimumVisibleMaterialOpacity).toBeGreaterThan(far.minimumVisibleMaterialOpacity!);
  });

  it("keeps the idle dark field visible while preserving its quiet depth and edge hierarchy", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const input: GraphInput = {
      ...graphFixture,
      nodes: [
        {
          ...graphFixture.nodes[0]!,
          layoutHint: { pinned: true, x: 0, y: 0, z: 42 },
        },
        {
          ...graphFixture.nodes[1]!,
          kind: "skill",
          layoutHint: { pinned: true, x: 46, y: 0, z: 88 },
        },
        {
          ...graphFixture.nodes[2]!,
          kind: "agent",
          layoutHint: { pinned: true, x: -46, y: 0, z: -126 },
        },
      ],
    };

    renderer.setData(createRenderGraphData(input, { theme: "dark" }));
    runLatestFrame(0);
    const idle = renderer.getRenderObservation!()!;
    const idleNear = idle.nodes.find((node) => node.id === "component:api")!;
    const idleFar = idle.nodes.find((node) => node.id === "component:web")!;
    const idleLink = idle.links.find((link) => link.id === "api-web")!;

    // Renderer observations, rather than color constants alone, protect the
    // actual default material opacity that reaches the dark field.
    expect(idleNear.bodyMaterialColor).toBe("#60a5fa");
    expect(idleFar.bodyMaterialColor).toBe("#f59e0b");
    expect(idleNear.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.5);
    expect(idleFar.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.22);
    expect(idleNear.minimumVisibleMaterialOpacity).toBeGreaterThan(idleFar.minimumVisibleMaterialOpacity!);
    expect(idleNear.worldScale!.x).toBeGreaterThan(idleFar.worldScale!.x);
    expect(idleLink.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.22);
    expect(idleLink.visibleMaterialLineWidths).toEqual([0.85]);

    // Reduced motion skips the ambient RAF. The static default-link path must
    // retain the same readable baseline instead of falling back to layout's
    // intentionally quieter raw cue.
    renderer.setData(createRenderGraphData(input, { reducedMotion: true, theme: "dark" }));
    const reducedIdleLink = renderer.getRenderObservation!()!.links.find((link) => link.id === "api-web")!;
    expect(reducedIdleLink.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.22);

    renderer.setData(createRenderGraphData(input, {
      reducedMotion: true,
      selectedNodeIds: ["component:api"],
      theme: "dark",
    }));
    renderer.transitionToNode!("component:api", { reducedMotion: true });
    const selectedLink = renderer.getRenderObservation!()!.links.find((link) => link.id === "api-web")!;
    expect(selectedLink.minimumVisibleMaterialOpacity).toBe(0.62);
    expect(selectedLink.visibleMaterialLineWidths).toEqual([1.25]);
    expect(idleLink.minimumVisibleMaterialOpacity).toBeLessThan(selectedLink.minimumVisibleMaterialOpacity! * 0.4);
  });

  it("refreshes ambient default references when the vendor replaces an attached node object", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:web"] }));
    const previousObject = graph.nodeObjects.get("relation:release")!;
    const previousLabel = previousObject.children.find((child) => child.userData.graphVisualRole === "node-label") as Sprite;
    const liveMaster = graph.data.nodes.find((node) => node.id === "relation:release")!;
    const replacementObject = graph.nodeObjectFactory!(liveMaster);
    const replacementLabel = replacementObject.children.find((child) => child.userData.graphVisualRole === "node-label") as Sprite;
    previousLabel.material.opacity = 0.18;
    replacementLabel.material.opacity = 0.18;
    previousObject.removeFromParent();
    graph.nodeObjects.set("relation:release", replacementObject);
    graph.sceneRoot.add(replacementObject);

    runLatestFrame(0);
    runLatestFrame(1_000);

    expect(replacementLabel.material.opacity).toBeGreaterThanOrEqual(0.45);
    expect(previousLabel.material.opacity).toBe(0.18);
  });

  it("cancels the shared RAF and disposes the bounded particle resources exactly once", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] }));
    const particleGroup = graph.sceneRoot.children.find((child) => child.name === "graph-workbench-flow-particles")!;
    const particle = particleGroup.children[0] as Mesh;
    const disposeGeometry = vi.spyOn(particle.geometry, "dispose");
    const disposeMaterial = vi.spyOn(particle.material as MeshBasicMaterial, "dispose");
    renderer.destroy();
    renderer.destroy();

    expect(cancelledFrames).toContain(1);
    expect(frames.size).toBe(0);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(particleGroup.parent).toBeNull();
    expect(graph.ownerDocument.visibilityListeners.size).toBe(0);
  });

  it("refreshes reused node, label, and restrained edge materials from the current selection visual cues", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, {}));
    const initialWebObject = graph.nodeObjects.get("component:web");
    const initialApiLinkObject = graph.linkObjects.get("api-web");

    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:web"] }));
    renderer.transitionToNode!("component:web", { reducedMotion: false });
    frames.get(1)!(0);
    frames.get(2)!(420);

    expect(graph.nodeObjects.get("component:web")).toBe(initialWebObject);
    expect(graph.linkObjects.get("api-web")).toBe(initialApiLinkObject);
    const observation = renderer.getRenderObservation!();
    const selected = observation.nodes.find((node) => node.id === "component:web");
    const neighbor = observation.nodes.find((node) => node.id === "component:api");
    const master = observation.nodes.find((node) => node.id === "relation:release");
    const selectedLink = observation.links.find((link) => link.id === "api-web");
    const distantLink = observation.links.find((link) => link.id === "release-api");
    expect(selected?.minimumVisibleMaterialOpacity).toBe(1);
    expect(neighbor?.minimumVisibleMaterialOpacity).toBeLessThan(neighbor!.visual.opacity);
    expect(neighbor?.minimumVisibleMaterialOpacity).toBeGreaterThan(0.5);
    expect(master?.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.5);
    expect(selectedLink).toMatchObject({
      curvePointCount: 29,
      depthWriteEnabled: false,
      minimumVisibleMaterialOpacity: 0.62,
      visibleMaterialLineWidths: [1.25],
    });
    expect(distantLink).toMatchObject({
      visibleMaterialLineWidths: [0.5],
    });
    expect(distantLink?.minimumVisibleMaterialOpacity).toBeLessThanOrEqual(0.055);
    expect(selected?.label).toMatchObject({
      objectTracked: true,
      objectVisible: true,
      sceneAttached: true,
      position: { id: "component:web", x: 0, y: 4.8, z: 0 },
      transparent: true,
    });
    expect(selected?.label.scale?.x).toBeGreaterThan(0);

    const selectedBody = initialWebObject?.children.find((child) => child instanceof Mesh) as Mesh | undefined;
    const selectedMaterial = selectedBody?.material as MeshBasicMaterial;
    expect(selectedMaterial).toBeInstanceOf(MeshBasicMaterial);
    expect("emissive" in selectedMaterial).toBe(false);
    expect("metalness" in selectedMaterial).toBe(false);
    expect("roughness" in selectedMaterial).toBe(false);
  });

  it("keeps quiet light-mode bodies and links readable while hiding distant labels", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const input: GraphInput = {
      ...graphFixture,
      nodes: [
        ...graphFixture.nodes,
        { id: "concept:docs", type: "concept", kind: "reference", label: "Docs" },
        { id: "concept:archive", type: "concept", kind: "reference", label: "Archive" },
      ],
      links: [
        ...graphFixture.links,
        { id: "docs-archive", source: "concept:docs", target: "concept:archive", relationKind: "references" },
      ],
    };
    renderer.setData(createRenderGraphData(input, {
      selectedNodeIds: ["component:api"],
      theme: "light",
    }));
    runLatestFrame(0);

    const observation = renderer.getRenderObservation!()!;
    const selectedLink = observation.links.find((link) => link.id === "api-web")!;
    const quietLink = observation.links.find((link) => link.id === "docs-archive")!;
    const quietNode = observation.nodes.find((node) => node.id === "concept:docs")!;

    expect(quietNode.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.2);
    expect(quietNode.label).toMatchObject({
      minimumVisibleMaterialOpacity: null,
      objectVisible: false,
      visibleMaterialOpacities: [],
    });
    expect(quietLink).toMatchObject({
      minimumVisibleMaterialOpacity: 0.16,
      visibleMaterialLineWidths: [0.68],
    });
    expect(selectedLink.minimumVisibleMaterialOpacity).toBe(0.62);
    expect(selectedLink.visibleMaterialLineWidths).toEqual([1.25]);
    expect(selectedLink.minimumVisibleMaterialOpacity).toBeGreaterThan(quietLink.minimumVisibleMaterialOpacity!);
    expect(selectedLink.visibleMaterialLineWidths[0]).toBeGreaterThan(quietLink.visibleMaterialLineWidths[0]!);

    renderer.setData(createRenderGraphData(input, {
      reducedMotion: true,
      selectedNodeIds: ["component:api"],
      theme: "light",
    }));
    const reduced = renderer.getRenderObservation!()!;
    const reducedQuietLink = reduced.links.find((link) => link.id === "docs-archive")!;
    const reducedQuietNode = reduced.nodes.find((node) => node.id === "concept:docs")!;
    expect(reducedQuietNode.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.2);
    expect(reducedQuietNode.label).toMatchObject({
      minimumVisibleMaterialOpacity: null,
      objectVisible: false,
      visibleMaterialOpacities: [],
    });
    expect(reducedQuietLink).toMatchObject({
      minimumVisibleMaterialOpacity: 0.16,
      visibleMaterialLineWidths: [0.68],
    });
  });

  it("keeps ordinary labels visible when the live graph has no meaningful camera-depth range", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const data = createRenderGraphData(graphFixture, { ambientMotion: false });
    renderer.setData({
      ...data,
      nodes: data.nodes.map((node) => ({ ...node, fz: 0, z: 0 })),
    });

    const observation = renderer.getRenderObservation!();
    observation.nodes.forEach((node) => {
      expect(node.label.objectVisible).toBe(true);
      expect(node.label.minimumVisibleMaterialOpacity).toBeGreaterThan(0);
    });
  });

  it("keeps only the camera-nearest ordinary labels while preserving node bodies", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const input: GraphInput = {
      ...graphFixture,
      nodes: [
        ...graphFixture.nodes,
        { id: "component:docs", type: "component", kind: "service", label: "Docs" },
      ],
    };
    const data = createRenderGraphData(input, { ambientMotion: false });
    const depthById = new Map([
      ["relation:release", -100],
      ["component:api", -12],
      ["component:web", 50],
      ["component:docs", 100],
    ]);
    renderer.setData({
      ...data,
      nodes: data.nodes.map((node) => ({
        ...node,
        fz: depthById.get(node.id),
        z: depthById.get(node.id) ?? node.z,
      })),
    });

    const observation = renderer.getRenderObservation!();
    const hidden = observation.nodes.find((node) => node.id === "component:api")!;
    const fading = observation.nodes.find((node) => node.id === "component:web")!;
    const nearest = observation.nodes.find((node) => node.id === "component:docs")!;

    expect(hidden.minimumVisibleMaterialOpacity).toBeGreaterThan(0);
    expect(hidden.label).toMatchObject({
      minimumVisibleMaterialOpacity: null,
      objectVisible: false,
      visibleMaterialOpacities: [],
    });
    expect(fading.label.objectVisible).toBe(true);
    expect(fading.label.minimumVisibleMaterialOpacity).toBeGreaterThan(0);
    expect(nearest.label.objectVisible).toBe(true);
    expect(nearest.label.minimumVisibleMaterialOpacity).toBeGreaterThan(
      fading.label.minimumVisibleMaterialOpacity!,
    );
  });

  it("moves live node coordinates, labels, links, and camera through one cancellable selection transaction", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const initial = createRenderGraphData(graphFixture, {});
    const selected = createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] });
    renderer.setData(initial);
    const startById = new Map(graph.data.nodes.map((node) => [node.id, { x: node.x, y: node.y, z: node.z }]));
    const targetById = new Map(selected.nodes.map((node) => [node.id, { x: node.x, y: node.y, z: node.z }]));
    expect(startById.get("component:api")).not.toEqual(targetById.get("component:api"));

    renderer.setData(selected);
    renderer.transitionToNode!("component:api", { reducedMotion: false });
    frames.get(1)!(0);
    frames.get(2)!(210);

    const halfway = graph.data.nodes.find((node) => node.id === "component:api")!;
    const observation = renderer.getTransitionObservation?.();
    expect(observation).toMatchObject({ active: true, durationMs: 420, progress: 0.5, reducedMotion: false });
    expect(observation?.nodePositions.find((node) => node.id === "component:api")).toEqual({
      id: "component:api",
      x: halfway.x,
      y: halfway.y,
      z: halfway.z,
    });
    expect(graph.data.nodes.every((node) => {
      const current = { x: node.x, y: node.y, z: node.z };
      return JSON.stringify(current) !== JSON.stringify(startById.get(node.id))
        && JSON.stringify(current) !== JSON.stringify(targetById.get(node.id));
    })).toBe(true);
    expect(graph.cameraSetters.at(-1)?.duration).toBe(0);
    const selectedObject = graph.nodeObjects.get("component:api")!;
    const selectedLabel = selectedObject.children.find((child) => child.userData.graphVisualRole === "node-label")!;
    expect(selectedLabel.visible).toBe(true);

    frames.get(3)!(420);
    const settled = graph.data.nodes.find((node) => node.id === "component:api")!;
    expect({ x: settled.x, y: settled.y, z: settled.z }).toEqual(targetById.get("component:api"));
    expect(renderer.getTransitionObservation?.()).toMatchObject({ active: false, progress: 1 });
    expect(selectedObject.scale.toArray()).toEqual([1.22, 1.22, 1.22]);

    renderer.setData(selected);
    expect(graph.data.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, z: node.z }))).toEqual(
      selected.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, z: node.z })),
    );

    renderer.setData(initial);
    renderer.transitionToNode!("component:api", { reducedMotion: true });
    expect(renderer.getTransitionObservation?.()).toMatchObject({
      active: false,
      durationMs: 0,
      progress: 1,
      reducedMotion: true,
    });
  });

  it("hides distant labels after selection while preserving selected, neighbor, hover, and master labels", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const expandedInput = {
      ...graphFixture,
      nodes: [
        ...graphFixture.nodes,
        { id: "component:docs", type: "component" as const, kind: "service", label: "Docs" },
      ],
    };
    const initial = createRenderGraphData(expandedInput, {});
    const selected = createRenderGraphData(expandedInput, { selectedNodeIds: ["component:api"] });
    const startById = new Map(initial.nodes.map((node) => [node.id, { x: node.x, y: node.y, z: node.z }]));
    const targetById = new Map(selected.nodes.map((node) => [node.id, { x: node.x, y: node.y, z: node.z }]));
    renderer.setData(initial);
    renderer.setData(selected);
    renderer.transitionToNode!("component:api", { reducedMotion: false });
    runLatestFrame(0);
    runLatestFrame(210);

    ["component:api", "component:web", "component:docs"].forEach((id) => {
      const live = graph.data.nodes.find((node) => node.id === id)!;
      const current = { x: live.x, y: live.y, z: live.z };
      expect(current).not.toEqual(startById.get(id));
      expect(current).not.toEqual(targetById.get(id));
    });
    const observation = renderer.getRenderObservation!();
    const distant = observation.nodes.find((node) => node.id === "component:docs")!;
    const selectedNode = observation.nodes.find((node) => node.id === "component:api")!;
    expect(distant.label).toMatchObject({ sceneAttached: true });
    expect(distant.worldScale!.x).toBeLessThan(selectedNode.worldScale!.x);

    runLatestFrame(420);
    expect(graph.data.nodes.find((node) => node.id === "component:docs")).toMatchObject(targetById.get("component:docs")!);
    const settledObservation = renderer.getRenderObservation!();
    const selectedLabel = settledObservation.nodes.find((node) => node.id === "component:api")!.label;
    const neighborLabel = settledObservation.nodes.find((node) => node.id === "component:web")!.label;
    const masterLabel = settledObservation.nodes.find((node) => node.id === "relation:release")!.label;
    const farLabel = settledObservation.nodes.find((node) => node.id === "component:docs")!.label;
    const selectedLabelOpacity = selectedLabel.minimumVisibleMaterialOpacity;
    const neighborLabelOpacity = neighborLabel.minimumVisibleMaterialOpacity;
    expect(selectedLabelOpacity).toBe(1);
    expect(neighborLabelOpacity).toBeGreaterThanOrEqual(0.68);
    expect(selectedLabel.objectVisible).toBe(true);
    expect(neighborLabel.objectVisible).toBe(true);
    expect(masterLabel.objectVisible).toBe(true);
    expect(farLabel).toMatchObject({
      minimumVisibleMaterialOpacity: null,
      objectTracked: true,
      objectVisible: false,
      sceneAttached: true,
      visibleMaterialOpacities: [],
    });
    expect(selectedLabelOpacity).toBeGreaterThan(neighborLabelOpacity!);

    graph.nodeHoverCallback?.(graph.data.nodes.find((node) => node.id === "component:docs")!);
    const hoveredFarLabel = renderer.getRenderObservation!()
      .nodes.find((node) => node.id === "component:docs")!.label;
    expect(hoveredFarLabel.objectVisible).toBe(true);
    expect(hoveredFarLabel.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.68);

    graph.nodeHoverCallback?.(null);
    expect(renderer.getRenderObservation!().nodes.find((node) => node.id === "component:docs")!.label)
      .toMatchObject({ minimumVisibleMaterialOpacity: null, objectVisible: false });
  });

  it("settles selection choreography before Orbit, node-drag, fit, zoom, or reduced-motion cancellation", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const initial = createRenderGraphData(graphFixture, {});
    const selectedApi = createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] });
    const selectedWeb = createRenderGraphData(graphFixture, { selectedNodeIds: ["component:web"] });
    renderer.setData(initial);

    moveSelectionHalfway(renderer, selectedApi, "component:api");
    const orbitStaleFrame = [...frames.values()][0]!;
    graph.cameraControls.dispatch("start");
    expectLiveNodesAt(selectedApi);
    expect(graph.nodeObjects.get("component:api")?.scale.toArray()).toEqual([1.22, 1.22, 1.22]);
    expect(renderer.getTransitionObservation?.()).toMatchObject({
      active: false,
      durationMs: 420,
      progress: 1,
    });
    const orbitSettled = JSON.stringify(graph.data.nodes);
    orbitStaleFrame(420);
    expect(JSON.stringify(graph.data.nodes)).toBe(orbitSettled);
    graph.cameraControls.dispatch("end");

    moveSelectionHalfway(renderer, selectedWeb, "component:web");
    graph.nodeDragCallback?.();
    expectLiveNodesAt(selectedWeb);
    expect(graph.nodeObjects.get("component:web")?.scale.toArray()).toEqual([1.22, 1.22, 1.22]);

    moveSelectionHalfway(renderer, selectedApi, "component:api");
    renderer.fit(250);
    expectLiveNodesAt(selectedApi);
    expect(renderer.getTransitionObservation?.()).toMatchObject({ active: true, progress: 0 });
    renderer.cancelCameraTransition!();
    expect(renderer.getTransitionObservation?.()).toMatchObject({
      active: false,
      durationMs: 250,
      progress: 0,
    });

    moveSelectionHalfway(renderer, selectedWeb, "component:web");
    renderer.zoom(1.4);
    expectLiveNodesAt(selectedWeb);
    expect(renderer.getTransitionObservation?.()).toMatchObject({ active: true, progress: 0 });
    renderer.cancelCameraTransition!();
    expect(renderer.getTransitionObservation?.()).toMatchObject({
      active: false,
      durationMs: 180,
      progress: 0,
    });

    moveSelectionHalfway(renderer, selectedApi, "component:api");
    renderer.transitionToNode!("component:api", { reducedMotion: true });
    expectLiveNodesAt(selectedApi);
    expect(renderer.getTransitionObservation?.()).toMatchObject({
      active: false,
      durationMs: 0,
      progress: 1,
      reducedMotion: true,
    });
  });

  it("queues only the latest resize layout while applying semantic updates during an active scene", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const initial = createRenderGraphData(graphFixture, {});
    const selectedApi = createRenderGraphData(
      graphFixture,
      { selectedNodeIds: ["component:api"] },
      { viewport: { height: 540, width: 720 } },
    );
    const firstResizedApi = createRenderGraphData(
      graphFixture,
      { selectedNodeIds: ["component:api"] },
      { viewport: { height: 480, width: 480 } },
    );
    const latestResizedApi = createRenderGraphData(
      graphFixture,
      { selectedNodeIds: ["component:api"] },
      { viewport: { height: 320, width: 960 } },
    );
    renderer.setData(initial);
    moveSelectionHalfway(renderer, selectedApi, "component:api");
    const activeGeneration = renderer.getTransitionObservation?.().generation;

    renderer.setData(firstResizedApi);
    renderer.setData(latestResizedApi);
    expect(renderer.getTransitionObservation?.()).toMatchObject({
      active: true,
      generation: activeGeneration,
      progress: 0.5,
    });
    runLatestFrame(420);
    expectLiveNodesAt(latestResizedApi);

    const selectedWeb = createRenderGraphData(graphFixture, { selectedNodeIds: ["component:web"] });
    moveSelectionHalfway(renderer, selectedWeb, "component:web");
    const staleSemanticFrame = [...frames.values()][0]!;
    const updatedInput = {
      ...graphFixture,
      links: graphFixture.links.map((link) => (
        link.id === "api-web" ? { ...link, relationKind: "serves-v2" } : link
      )),
      nodes: graphFixture.nodes.map((node) => (
        node.id === "component:api" ? { ...node, label: "API v2" } : node
      )),
    };
    const updatedWeb = createRenderGraphData(updatedInput, {
      nodeDescriptors: {
        "component:web": { label: "Web v2", opacity: 0.74 },
      },
      selectedNodeIds: ["component:web"],
    });

    renderer.setData(updatedWeb);
    expect(renderer.getTransitionObservation?.()).toMatchObject({
      active: false,
      durationMs: 420,
      progress: 1,
    });
    expectLiveNodesAt(updatedWeb);
    expect((graph.data.nodes.find((node) => node.id === "component:api") as typeof graph.data.nodes[number] & {
      label: string;
    }).label).toBe("API v2");
    expect((graph.data.links.find((link) => link.id === "api-web") as typeof graph.data.links[number] & {
      relationKind: string;
    }).relationKind).toBe("serves-v2");
    expect(renderer.getRenderObservation?.().nodes.find((node) => node.id === "component:web"))
      .toMatchObject({ minimumVisibleMaterialOpacity: 0.74 });
    const appliedSemanticUpdate = JSON.stringify(graph.data);
    staleSemanticFrame(420);
    expect(JSON.stringify(graph.data)).toBe(appliedSemanticUpdate);
  });

  it("preserves a custom node factory's nonuniform baseline scale throughout selection", () => {
    const customObjects = new Map<string, Group>();
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
      nodeObjectFactory(node) {
        const object = new Group();
        object.scale.set(2, 3, 4);
        object.add(new Mesh(
          new BoxGeometry(2, 2, 2),
          new MeshStandardMaterial({ opacity: 1, transparent: true }),
        ));
        const label = new Sprite(new SpriteMaterial({ opacity: 0.83, transparent: true }));
        label.userData.graphVisualRole = "node-label";
        object.add(label);
        customObjects.set(node.id, object);
        return object;
      },
    });
    const expandedInput = {
      ...graphFixture,
      nodes: [
        ...graphFixture.nodes,
        { id: "component:docs", type: "component" as const, kind: "service", label: "Docs" },
      ],
    };
    const initial = createRenderGraphData(expandedInput, {});
    const selected = createRenderGraphData(expandedInput, { selectedNodeIds: ["component:api"] });
    renderer.setData(initial);
    expect(customObjects.get("component:api")?.scale.toArray()).toEqual([2, 3, 4]);
    const customBody = customObjects.get("component:api")?.children[0] as Mesh;
    expect((customBody.material as MeshStandardMaterial).color.getHexString()).toBe("ffffff");
    renderer.setPresentation({ theme: "light" });
    expect((customBody.material as MeshStandardMaterial).color.getHexString()).toBe("ffffff");

    renderer.setData(selected);
    renderer.transitionToNode!("component:api", { reducedMotion: false });
    runLatestFrame(0);
    expect(customObjects.get("component:api")?.scale.toArray()).toEqual([2, 3, 4]);
    runLatestFrame(210);
    expect(customObjects.get("component:api")?.scale.toArray()).toEqual([2, 3, 4]);
    runLatestFrame(420);
    expect(customObjects.get("component:api")?.scale.toArray()).toEqual([2, 3, 4]);
    const distantCustomLabel = customObjects.get("component:docs")
      ?.children.find((child) => child.userData.graphVisualRole === "node-label") as Sprite;
    expect(distantCustomLabel.visible).toBe(true);
    expect((distantCustomLabel.material as SpriteMaterial).opacity).toBeGreaterThan(0);
  });

  it("fits the initial deterministic base graph once after its first resize", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, {}));
    renderer.resize();
    renderer.resize();

    expect(graph.zoomToFitDurations).toEqual([0]);
    expect((graph.data.nodes as Array<Coordinates & { fx?: number; fy?: number; fz?: number }>).every((node) => (
      node.fx === node.x && node.fy === node.y && node.fz === node.z
    ))).toBe(true);
  });

  it("keeps the full cloud in frame while biasing the camera toward the selected node", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const expandedInput = {
      ...graphFixture,
      nodes: [
        ...graphFixture.nodes,
        { id: "component:docs", type: "component" as const, kind: "service", label: "Docs" },
      ],
    };
    const selected = createRenderGraphData(expandedInput, { selectedNodeIds: ["component:web"] });
    renderer.setData(selected);
    renderer.transitionToNode!("component:web", { reducedMotion: true });

    const extents = selected.nodes.map((node) => {
      const degree = selected.links.reduce((count, link) => (
        count + Number(link.source === node.id) + Number(link.target === node.id)
      ), 0);
      const bodyRadius = node.type === "profile"
        ? 3.8
        : node.type === "workflow" || node.kind === "workflow"
          ? 7
          : degree === 1
            ? 1.6
            : node.type === "relation"
              ? 6.8
              : 2.8;
      const radius = bodyRadius * 1.16 * (node.id === "component:web" ? 1.22 : 1);
      return {
        maximum: { x: node.x + radius, y: node.y + radius, z: node.z + radius },
        minimum: { x: node.x - radius, y: node.y - radius, z: node.z - radius },
      };
    });
    const boundsCenter = {
      x: (Math.min(...extents.map(({ minimum }) => minimum.x))
        + Math.max(...extents.map(({ maximum }) => maximum.x))) / 2,
      y: (Math.min(...extents.map(({ minimum }) => minimum.y))
        + Math.max(...extents.map(({ maximum }) => maximum.y))) / 2,
      z: (Math.min(...extents.map(({ minimum }) => minimum.z))
        + Math.max(...extents.map(({ maximum }) => maximum.z))) / 2,
    };
    const selectedPosition = selected.nodes.find((node) => node.id === "component:web")!;
    const expectedCenter = {
      x: selectedPosition.x + ((boundsCenter.x - selectedPosition.x) * 0.18),
      y: selectedPosition.y + ((boundsCenter.y - selectedPosition.y) * 0.18),
      z: selectedPosition.z + ((boundsCenter.z - selectedPosition.z) * 0.18),
    };
    const targetCamera = graph.cameraSetters.at(-1)!;
    expect(targetCamera.lookAt?.x).toBeCloseTo(expectedCenter.x);
    expect(targetCamera.lookAt?.y).toBeCloseTo(expectedCenter.y);
    expect(targetCamera.lookAt?.z).toBeCloseTo(expectedCenter.z);
    expect(targetCamera.lookAt).not.toEqual({
      x: boundsCenter.x,
      y: boundsCenter.y,
      z: boundsCenter.z,
    });
    expect(Math.hypot(
      targetCamera.position.x - expectedCenter.x,
      targetCamera.position.y - expectedCenter.y,
      targetCamera.position.z - expectedCenter.z,
    )).toBeGreaterThan(160);
  });

  it("applies semantic default colors across theme and input updates while preserving descriptor overrides", () => {
    const semanticFixture: GraphInput = {
      schemaVersion: 1,
      layout: { seed: "semantic-palette" },
      nodes: [
        { id: "profile:ops", type: "profile", kind: "operating-profile", label: "Operations" },
        { id: "relation:release", type: "relation", kind: "workflow", label: "Release" },
        { id: "component:leaf", type: "component", kind: "skill", label: "Leaf skill" },
        { id: "component:skill", type: "component", kind: "skill", label: "Skill" },
        { id: "component:agent", type: "component", kind: "agent", label: "Agent" },
        { id: "component:hook", type: "component", kind: "hook", label: "Hook" },
        { id: "component:rule", type: "component", kind: "rule", label: "Rule" },
        { id: "component:command", type: "component", kind: "command", label: "Command" },
        { id: "component:composite", type: "component", kind: "composite", label: "Composite" },
        { id: "concept:hub", type: "concept", kind: "unknown", label: "Hub" },
        { id: "relation:unknown", type: "relation", kind: "inspection", label: "Inspect" },
      ],
      links: [
        { id: "profile-hub", source: "profile:ops", target: "concept:hub", relationKind: "contains" },
        { id: "workflow-hub", source: "relation:release", target: "concept:hub", relationKind: "runs" },
        { id: "leaf-hub", source: "component:leaf", target: "concept:hub", relationKind: "uses" },
        { id: "skill-agent", source: "component:skill", target: "component:agent", relationKind: "delegates" },
        { id: "agent-hook", source: "component:agent", target: "component:hook", relationKind: "runs" },
        { id: "hook-rule", source: "component:hook", target: "component:rule", relationKind: "checks" },
        { id: "rule-command", source: "component:rule", target: "component:command", relationKind: "allows" },
        { id: "command-composite", source: "component:command", target: "component:composite", relationKind: "calls" },
        { id: "composite-skill", source: "component:composite", target: "component:skill", relationKind: "contains" },
        { id: "unknown-hub", source: "relation:unknown", target: "concept:hub", relationKind: "inspects" },
        { id: "unknown-composite", source: "relation:unknown", target: "component:composite", relationKind: "inspects" },
      ],
    };
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const nodeColors = () => Object.fromEntries(
      renderer.getRenderObservation!().nodes.map((node) => [node.id, node.bodyMaterialColor]),
    );
    const defaultBodies = () => Object.fromEntries(
      renderer.getRenderObservation!().nodes.map((node) => [node.id, node.defaultBody]),
    );

    renderer.setData(createRenderGraphData(semanticFixture, { theme: "dark" }));
    expect(nodeColors()).toMatchObject({
      "component:agent": "#c4b5fd",
      "component:command": "#22d3ee",
      "component:composite": "#facc15",
      "component:hook": "#fb923c",
      "component:leaf": "#f59e0b",
      "component:rule": "#4ade80",
      "component:skill": "#60a5fa",
      "concept:hub": "#cbd5e1",
      "profile:ops": "#a5b4fc",
      "relation:release": "#fb7185",
      "relation:unknown": "#cbd5e1",
    });
    // The renderer owns this semantic-to-silhouette mapping. A custom factory
    // reports null instead, so a host never has to reproduce this visual rule.
    expect(defaultBodies()).toMatchObject({
      "component:leaf": { kind: "flat-2.5d", silhouette: "dot" },
      "profile:ops": { kind: "flat-2.5d", silhouette: "circle" },
      "relation:release": { kind: "flat-2.5d", silhouette: "capsule" },
      "relation:unknown": { kind: "flat-2.5d", silhouette: "disk" },
    });
    const darkFallback = nodeColors()["concept:hub"];

    renderer.setPresentation({ theme: "light" });
    expect(nodeColors()).toMatchObject({
      "component:agent": "#6d28d9",
      "component:command": "#0e7490",
      "component:composite": "#a16207",
      "component:hook": "#c2410c",
      "component:leaf": "#92400e",
      "component:rule": "#15803d",
      "component:skill": "#1d4ed8",
      "concept:hub": "#334155",
      "profile:ops": "#4338ca",
      "relation:release": "#be123c",
      "relation:unknown": "#334155",
    });
    const lightFallback = nodeColors()["concept:hub"];
    const luminance = (color: string) => {
      const rgb = new Color(color);
      return (0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b);
    };
    expect(luminance(darkFallback ?? "#000000"))
      .toBeGreaterThan(luminance(lightFallback ?? "#ffffff"));

    renderer.setData(createRenderGraphData(semanticFixture, {
      theme: "light",
      nodeDescriptors: { "component:skill": { color: "#f0abfc" } },
    }));
    expect(nodeColors()["component:skill"]).toBe("#f0abfc");

    renderer.setData(createRenderGraphData({
      ...semanticFixture,
      links: [
        ...semanticFixture.links,
        { id: "leaf-rule", source: "component:leaf", target: "component:rule", relationKind: "uses" },
      ],
    }, { theme: "light" }));
    // The input update gives the former leaf degree two, so it falls back to
    // its routine semantic kind instead of retaining the leaf amber.
    expect(nodeColors()["component:leaf"]).toBe("#1d4ed8");
  });

  it("refreshes cached default silhouettes and shape-dependent label bases after topology or type changes", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const initial: GraphInput = {
      schemaVersion: 1,
      layout: { seed: "silhouette-refresh" },
      nodes: [
        { id: "leaf", kind: "skill", label: "Leaf", type: "component" },
        { id: "leaf-target", kind: "concept", label: "Leaf target", type: "concept" },
        { id: "leaf-second-target", kind: "concept", label: "Leaf second target", type: "concept" },
        { id: "relation", kind: "inspection", label: "Relation", type: "relation" },
        { id: "relation-a", kind: "concept", label: "Relation A", type: "concept" },
        { id: "relation-b", kind: "concept", label: "Relation B", type: "concept" },
        { id: "profile", kind: "profile", label: "Profile", type: "profile" },
        { id: "profile-a", kind: "concept", label: "Profile A", type: "concept" },
        { id: "profile-b", kind: "concept", label: "Profile B", type: "concept" },
      ],
      links: [
        { id: "leaf-target", relationKind: "uses", source: "leaf", target: "leaf-target" },
        { id: "relation-a", relationKind: "uses", source: "relation", target: "relation-a" },
        { id: "relation-b", relationKind: "uses", source: "relation", target: "relation-b" },
        { id: "profile-a", relationKind: "uses", source: "profile", target: "profile-a" },
        { id: "profile-b", relationKind: "uses", source: "profile", target: "profile-b" },
      ],
    };
    renderer.setData(createRenderGraphData(initial, { reducedMotion: true }));

    const bodyAndLabel = (id: string) => {
      const object = graph.nodeObjects.get(id)!;
      return {
        body: object.children.find((child) => child.userData.graphVisualRole === "body") as Mesh,
        label: object.children.find((child) => child.userData.graphVisualRole === "node-label") as Sprite,
        object,
      };
    };
    const leafBefore = bodyAndLabel("leaf");
    const relationBefore = bodyAndLabel("relation");
    const profileBefore = bodyAndLabel("profile");
    expect(leafBefore.body.userData.graphDefaultNodeSilhouette).toBe("dot");
    expect(relationBefore.body.userData.graphDefaultNodeSilhouette).toBe("disk");
    expect(relationBefore.label.position.y).toBe(10.6);
    expect((relationBefore.label.userData.graphBaseLabelScale as Coordinates).y).toBe(10);
    expect(profileBefore.body.userData.graphDefaultNodeSilhouette).toBe("circle");
    profileBefore.body.geometry.computeBoundingBox();
    expect(profileBefore.body.geometry.boundingBox?.max.x).toBeCloseTo(3.8);

    renderer.setData(createRenderGraphData({
      ...initial,
      nodes: initial.nodes.map((node) => {
        if (node.id === "relation") return { ...node, kind: "skill", type: "component" as const };
        if (node.id === "profile") return { ...node, kind: "concept", type: "component" as const };
        return node;
      }),
      links: [
        ...initial.links,
        { id: "leaf-second-target", relationKind: "uses", source: "leaf", target: "leaf-second-target" },
      ],
    }, { reducedMotion: true }));

    const leafAfter = bodyAndLabel("leaf");
    const relationAfter = bodyAndLabel("relation");
    const profileAfter = bodyAndLabel("profile");
    expect(leafAfter.object).toBe(leafBefore.object);
    expect(leafAfter.body).toBe(leafBefore.body);
    expect(leafAfter.body.userData.graphDefaultNodeSilhouette).toBe("circle");
    expect(leafAfter.label.position.y).toBe(6.6);
    expect((leafAfter.label.userData.graphBaseLabelScale as Coordinates).y).toBe(8);
    expect(relationAfter.object).toBe(relationBefore.object);
    expect(relationAfter.body.userData.graphDefaultNodeSilhouette).toBe("circle");
    expect(relationAfter.label.position.y).toBe(6.6);
    expect((relationAfter.label.userData.graphBaseLabelScale as Coordinates).y).toBe(8);
    expect(relationAfter.label.userData.graphBaseLabelAnchorY).toBe(6.6);
    expect((relationAfter.label.userData.graphBaseLabelScale as Coordinates).y).toBe(8);
    expect(profileAfter.object).toBe(profileBefore.object);
    expect(profileAfter.body.userData.graphDefaultNodeSilhouette).toBe("circle");
    profileAfter.body.geometry.computeBoundingBox();
    expect(profileAfter.body.geometry.boundingBox?.max.x).toBeCloseTo(2.8);

    const observation = renderer.getAmbientMotionObservation!()!;
    const leafBoundary = observation.linkEndpoints.find((endpoint) => endpoint.id === "leaf-target")?.sourceBoundary;
    expect(leafBoundary).toEqual({
      endpointAtSilhouetteBoundary: true,
      exteriorProbeInside: false,
      interiorProbeInside: true,
      silhouette: "circle",
    });
  });

  it("uses routine-harness flat light materials without an outline shell or selection ring", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { theme: "light" }));

    const object = graph.nodeObjects.get("component:api")!;
    const body = object.children.find((child) => child.userData.graphVisualRole === "body") as Mesh;
    const label = object.children.find((child) => child.userData.graphVisualRole === "node-label") as Mesh;
    expect(body.material).toBeInstanceOf(MeshBasicMaterial);
    expect((body.material as MeshBasicMaterial).color.getHexString()).toBe("334155");
    expect((label.material as MeshStandardMaterial).color.getHexString()).toBe("334155");
    expect((label.material as MeshStandardMaterial).transparent).toBe(true);
    expect(object.children.some((child) => child.userData.graphVisualRole === "outline")).toBe(false);
    expect(object.children.some((child) => child.userData.graphVisualRole === "focus-rim")).toBe(false);
  });

  it("keeps renderer-owned flat bodies camera-facing through nested transforms", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, {}));

    const object = graph.nodeObjects.get("component:api")!;
    const body = object.children.find((child) => child.userData.graphVisualRole === "body") as Mesh;
    const nestedParent = new Group();
    nestedParent.position.set(13, -7, 4);
    nestedParent.rotation.set(0.28, -0.41, 0.17);
    graph.sceneRoot.add(nestedParent);
    nestedParent.add(object);

    const camera = new PerspectiveCamera(50, 4 / 3, 0.1, 1_000);
    camera.position.set(60, 35, 240);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const cameraWorldQuaternion = camera.getWorldQuaternion(new Quaternion());
    const expectCallbackWorldMatrixToFaceCamera = (mesh: Mesh) => {
      mesh.onBeforeRender(
        null as never,
        graph.sceneRoot as never,
        camera,
        mesh.geometry,
        mesh.material,
        null as never,
      );
      // Decompose the already-built world matrix directly. getWorldQuaternion
      // would update it during the assertion and hide a stale callback matrix.
      const renderedWorldQuaternion = new Quaternion();
      mesh.matrixWorld.decompose(new Vector3(), renderedWorldQuaternion, new Vector3());
      expect(renderedWorldQuaternion.angleTo(cameraWorldQuaternion)).toBeLessThan(0.000001);
    };

    expectCallbackWorldMatrixToFaceCamera(body);
    const particleGroup = graph.sceneRoot.children.find((child) => child.name === "graph-workbench-flow-particles")!;
    particleGroup.rotation.set(-0.19, 0.24, -0.11);
    expectCallbackWorldMatrixToFaceCamera(particleGroup.children[0] as Mesh);
    expect(renderer.getRenderObservation!().nodes.find((node) => node.id === "component:api")?.defaultBody)
      .toEqual({ kind: "flat-2.5d", silhouette: "circle" });
  });

  it("keeps flat body colors synchronized across palette updates", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    const bodyMaterial = (nodeId: string): MeshBasicMaterial => {
      const object = graph.nodeObjects.get(nodeId)!;
      const body = object.children.find((child) => child.userData.graphVisualRole === "body") as Mesh;
      expect(body.material).toBeInstanceOf(MeshBasicMaterial);
      return body.material as MeshBasicMaterial;
    };
    const expectFlatColor = (material: MeshBasicMaterial, color: string) => {
      expect(material.color.getHexString()).toBe(new Color(color).getHexString());
      expect("clearcoat" in material).toBe(false);
      expect("emissive" in material).toBe(false);
      expect("metalness" in material).toBe(false);
      expect("roughness" in material).toBe(false);
    };

    renderer.setData(createRenderGraphData(graphFixture, { theme: "dark" }));
    const darkWeb = bodyMaterial("component:web");
    expectFlatColor(darkWeb, "#f59e0b");
    expectFlatColor(bodyMaterial("relation:release"), "#fb7185");

    renderer.setPresentation({ theme: "light" });
    expect(bodyMaterial("component:web")).toBe(darkWeb);
    expectFlatColor(darkWeb, "#92400e");

    renderer.setData(createRenderGraphData(graphFixture, {
      theme: "light",
      nodeDescriptors: { "component:web": { color: "#f0abfc" } },
    }));
    expect(bodyMaterial("component:web")).toBe(darkWeb);
    expectFlatColor(darkWeb, "#f0abfc");

    renderer.setData(createRenderGraphData(graphFixture, {
      theme: "light",
      nodeDescriptors: { "component:web": { color: "#60a5fa" } },
    }));
    expectFlatColor(darkWeb, "#60a5fa");
  });

  it("disposes each CanvasTexture glyph mask once with its SpriteMaterial", () => {
    const context = {
      fillStyle: "",
      font: "",
      textAlign: "start",
      textBaseline: "alphabetic",
      fillText: vi.fn(),
      measureText: () => ({ width: 120 }),
    };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        getContext: () => context,
        height: 0,
        width: 0,
      })),
    });
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, {}));

    const label = graph.nodeObjects.get("component:api")?.children.find((child) => (
      child.userData.graphVisualRole === "node-label"
    ));
    const material = (label as Object3D & { readonly material: SpriteMaterial }).material;
    const texture = material.alphaMap;
    expect(texture).not.toBeNull();
    const disposeTexture = vi.spyOn(texture!, "dispose");

    material.dispose();
    material.dispose();

    expect(disposeTexture).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["desktop", { height: 540, width: 720 }],
    ["mobile", { height: 844, width: 390 }],
  ] as const)("keeps every node body within padded %s screen bounds after selection", (_device, viewport) => {
    graph.cameraProjection = { aspect: viewport.width / viewport.height, fov: 50 };
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: viewport.height, clientWidth: viewport.width } as HTMLElement,
    });
    const selectedNodeId = "component:web";
    const selected = createRenderGraphData(
      graphFixture,
      { selectedNodeIds: [selectedNodeId] },
      { viewport },
    );
    renderer.setData(selected);
    renderer.transitionToNode!(selectedNodeId, { reducedMotion: true });

    expectAllNodeBoundsWithinViewport(graph.cameraSetters.at(-1)!, selected.nodes, selectedNodeId, viewport);
    const observation = renderer.getRenderObservation!();
    observation.nodes.forEach((node) => {
      expect(node.label).toMatchObject({ objectVisible: true, sceneAttached: true, transparent: true });
      expect(node.label.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.02);
      expect(node.label.scale?.x).toBeGreaterThanOrEqual(8);
    });
  });

  it("uses the current portrait viewport when Three camera.aspect is stale during ResizeObserver framing", () => {
    const desktopViewport = { height: 900, width: 1280 };
    const mobileViewport = { height: 844, width: 390 };
    const selectedNodeId = "component:web";
    graph.cameraProjection = { aspect: desktopViewport.width / desktopViewport.height, fov: 50 };
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: desktopViewport.height, clientWidth: desktopViewport.width } as HTMLElement,
    });
    const desktopSelected = createRenderGraphData(
      graphFixture,
      { selectedNodeIds: [selectedNodeId] },
      { viewport: desktopViewport },
    );
    const mobileSelected = createRenderGraphData(
      graphFixture,
      { selectedNodeIds: [selectedNodeId] },
      { viewport: mobileViewport },
    );
    renderer.setData(desktopSelected);
    renderer.resize(desktopViewport.width, desktopViewport.height);
    renderer.transitionToNode!(selectedNodeId, { reducedMotion: true });

    // The fake graph intentionally keeps its desktop camera aspect after
    // resize, matching ThreeForceGraph's pre-render-tick state in the browser.
    renderer.resize(mobileViewport.width, mobileViewport.height);
    renderer.setData(mobileSelected);
    renderer.transitionToNode!(selectedNodeId, { reducedMotion: true });

    expect(graph.cameraProjection.aspect).toBeCloseTo(desktopViewport.width / desktopViewport.height);
    expectAllNodeBoundsWithinViewport(
      graph.cameraSetters.at(-1)!,
      mobileSelected.nodes,
      selectedNodeId,
      mobileViewport,
    );
  });

  it("reports only current graphData objects that remain attached to the public scene", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: {
        onBackgroundClick() {},
        onNodeClick() {},
        onNodeHover() {},
      },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] }));

    const observation = renderer.getRenderObservation?.();
    expect(observation?.nodeIds).toEqual(graphFixture.nodes.map((node) => node.id));
    expect(observation?.linkIds).toEqual(graphFixture.links.map((link) => link.id));
    const selected = observation?.nodes.find((node) => node.id === "component:api");
    const master = observation?.nodes.find((node) => node.id === "relation:release");
    expect(selected).toMatchObject({
      minimumVisibleMaterialOpacity: 1,
      objectTracked: true,
      objectVisible: true,
      sceneAttached: true,
    });
    expect(master).toMatchObject({
      objectTracked: true,
      objectVisible: true,
      sceneAttached: true,
    });
    expect(master?.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.62);
    expect(master?.minimumVisibleMaterialOpacity).toBeLessThan(master!.visual.opacity);
    expect(selected?.label).toMatchObject({
      objectTracked: true,
      objectVisible: true,
      sceneAttached: true,
    });
    expect(selected?.label.position?.y).toBeGreaterThan(0);

    const selectedObject = graph.sceneRoot.children.find((child) => child.userData.graphNodeId === "component:api")!;
    graph.sceneRoot.remove(selectedObject);
    const detached = renderer.getRenderObservation?.().nodes.find((node) => node.id === "component:api");
    expect(detached).toMatchObject({
      minimumVisibleMaterialOpacity: null,
      objectTracked: true,
      objectVisible: false,
      sceneAttached: false,
      visibleMaterialOpacities: [],
    });

    renderer.destroy();
    expect(renderer.getRenderObservation?.()).toBeNull();
  });
});
