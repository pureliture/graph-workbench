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
import { createThreeForceGraphRenderer } from "../src/renderer.js";
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
  onNodeHover(): this { return this; }
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

  it("flows two or three renderer-owned tokens outward across every focused default incident curve", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] }));
    runLatestFrame(0);
    const first = renderer.getAmbientMotionObservation!()!;
    const activeLinks = first.linkFlow.filter((link) => link.active);
    expect(activeLinks.map((link) => link.id).sort()).toEqual(["api-web", "release-api"]);
    activeLinks.forEach((link) => expect(link.particleCount).toBeGreaterThanOrEqual(2));
    activeLinks.forEach((link) => expect(link.particleCount).toBeLessThanOrEqual(3));
    expect(first.particles).toHaveLength(activeLinks.reduce((total, link) => total + link.particleCount, 0));

    runLatestFrame(1_000);
    const second = renderer.getAmbientMotionObservation!()!;
    const firstParticle = first.particles[0]!;
    const secondParticle = second.particles.find((particle) => particle.id === firstParticle.id)!;
    expect(secondParticle.phase).not.toBe(firstParticle.phase);
    expect((secondParticle.phase - firstParticle.phase + 1) % 1).toBeCloseTo(0.22);
    expect(secondParticle.screenX).not.toBeNull();
    expect(secondParticle.screenY).not.toBeNull();
  });

  it("attaches focused default links to the actual world positions of ambient node objects", () => {
    const renderer = createThreeForceGraphRenderer({
      callbacks: { onBackgroundClick() {}, onNodeClick() {}, onNodeHover() {} },
      container: { clientHeight: 540, clientWidth: 720 } as HTMLElement,
    });
    renderer.setData(createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] }));

    const ambientRoot = new Group();
    ambientRoot.position.set(23, -17, 11);
    graph.sceneRoot.add(ambientRoot);
    const source = graph.nodeObjects.get("component:api")!;
    const target = graph.nodeObjects.get("component:web")!;
    ambientRoot.add(source, target);

    runLatestFrame(0);
    runLatestFrame(1_000);

    const link = graph.linkObjects.get("api-web") as Line;
    const positions = link.geometry.getAttribute("position");
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

    expect(lineEndpointInWorld(0).distanceTo(sourceWorld)).toBeLessThan(0.0001);
    expect(lineEndpointInWorld(positions.count - 1).distanceTo(targetWorld)).toBeLessThan(0.0001);
    expect(new Vector3(endpoint.start.x, endpoint.start.y, endpoint.start.z).distanceTo(sourceWorld)).toBeLessThan(0.0001);
    expect(new Vector3(endpoint.end.x, endpoint.end.y, endpoint.end.z).distanceTo(targetWorld)).toBeLessThan(0.0001);
    const renderedNodes = new Map(ambient.renderedNodePositions.map((node) => [node.id, node]));
    const renderedSource = renderedNodes.get(endpoint.sourceId)!;
    const renderedTarget = renderedNodes.get(endpoint.targetId)!;
    expect(new Vector3(endpoint.start.x, endpoint.start.y, endpoint.start.z).distanceTo(renderedSource)).toBeLessThan(0.0001);
    expect(new Vector3(endpoint.end.x, endpoint.end.y, endpoint.end.z).distanceTo(renderedTarget)).toBeLessThan(0.0001);

    const flow = ambient.particles.find((particle) => particle.linkId === "api-web")!;
    const particleIndex = Number.parseInt(flow.id.slice("flow:".length), 10);
    const particleGroup = graph.sceneRoot.children.find((child) => child.name === "graph-workbench-flow-particles")!;
    const particle = particleGroup.children[particleIndex] as Mesh;
    const progress = flow.phase;
    const inverse = 1 - progress;
    const expectedParticleWorld = link.localToWorld(new Vector3(
      (inverse * inverse * positions.getX(0)) + (2 * inverse * progress * positions.getX(1)) + (progress * progress * positions.getX(2)),
      (inverse * inverse * positions.getY(0)) + (2 * inverse * progress * positions.getY(1)) + (progress * progress * positions.getY(2)),
      (inverse * inverse * positions.getZ(0)) + (2 * inverse * progress * positions.getZ(1)) + (progress * progress * positions.getZ(2)),
    ));
    expect(particle.getWorldPosition(new Vector3()).distanceTo(expectedParticleWorld)).toBeLessThan(0.0001);
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
    const reducedNodes = new Map(reduced.renderedNodePositions.map((node) => [node.id, node]));
    reduced.linkEndpoints.forEach((endpoint) => {
      const source = reducedNodes.get(endpoint.sourceId)!;
      const target = reducedNodes.get(endpoint.targetId)!;
      expect(new Vector3(endpoint.start.x, endpoint.start.y, endpoint.start.z).distanceTo(source)).toBeLessThan(0.0001);
      expect(new Vector3(endpoint.end.x, endpoint.end.y, endpoint.end.z).distanceTo(target)).toBeLessThan(0.0001);
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
    expect(body.material).toBeInstanceOf(MeshStandardMaterial);
    expect(label.material).toBeInstanceOf(SpriteMaterial);
    const link = linkObject as Line;
    expect(link.material).toBeInstanceOf(LineBasicMaterial);

    const bodyMaterial = body.material as MeshStandardMaterial;
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
      curvePointCount: 3,
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
      position: { id: "component:web", x: 0, y: 6.8, z: 0 },
      transparent: true,
    });
    expect(selected?.label.scale?.x).toBeGreaterThan(0);

    const selectedBody = initialWebObject?.children.find((child) => child instanceof Mesh) as Mesh | undefined;
    const selectedMaterial = selectedBody?.material as MeshStandardMaterial;
    expect(selectedMaterial.emissiveIntensity).toBe(0);
    expect(selectedMaterial.metalness).toBeCloseTo(0.22);
    expect(selectedMaterial.roughness).toBeCloseTo(0.58);
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

  it("moves selected, one-hop, and distant nodes through the same world-space selection choreography", () => {
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
    const selectedLabelOpacity = settledObservation.nodes.find((node) => node.id === "component:api")
      ?.label.minimumVisibleMaterialOpacity;
    const neighborLabelOpacity = settledObservation.nodes.find((node) => node.id === "component:web")
      ?.label.minimumVisibleMaterialOpacity;
    const farLabelOpacity = settledObservation.nodes.find((node) => node.id === "component:docs")
      ?.label.minimumVisibleMaterialOpacity;
    expect(selectedLabelOpacity).toBe(1);
    expect(neighborLabelOpacity).toBeGreaterThanOrEqual(0.68);
    expect(farLabelOpacity ?? 0).toBeLessThan(0.35);
    expect(selectedLabelOpacity).toBeGreaterThan(neighborLabelOpacity!);
    expect(neighborLabelOpacity).toBeGreaterThan(farLabelOpacity ?? 0);
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
        customObjects.set(node.id, object);
        return object;
      },
    });
    const initial = createRenderGraphData(graphFixture, {});
    const selected = createRenderGraphData(graphFixture, { selectedNodeIds: ["component:api"] });
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
      const bodyRadius = node.type === "relation" ? 7.5 : 3;
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

  it("uses routine-harness light materials without an outline shell or selection ring", () => {
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
    expect((body.material as MeshStandardMaterial).color.getHexString()).toBe("334155");
    expect((label.material as MeshStandardMaterial).color.getHexString()).toBe("334155");
    expect((label.material as MeshStandardMaterial).transparent).toBe(true);
    expect(object.children.some((child) => child.userData.graphVisualRole === "outline")).toBe(false);
    expect(object.children.some((child) => child.userData.graphVisualRole === "focus-rim")).toBe(false);
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
