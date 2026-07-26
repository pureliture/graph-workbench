import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Group, Mesh, MeshStandardMaterial, type Object3D } from "three";

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

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
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
    if (type !== "pointerup" || typeof listener !== "function") return;
    const capture = typeof options === "boolean" ? options : options?.capture ?? false;
    const index = this.pointerUpListeners.findIndex((registration) => (
      registration.listener === listener && registration.capture === capture
    ));
    if (index >= 0) this.pointerUpListeners.splice(index, 1);
  }
}

class FakeForceGraph {
  cameraSetters: Array<{ duration: number | undefined; lookAt: Coordinates | undefined; position: Coordinates }> = [];
  cameraControls = new FakeCameraControls();
  data: { links: Array<{ id: string }>; nodes: Array<Coordinates & { id: string }> } = { links: [], nodes: [] };
  linkObjectFactory: ((link: { id: string }) => Object3D) | undefined;
  linkObjects = new Map<string, Object3D>();
  nodeDragCallback: (() => void) | undefined;
  nodeObjectFactory: ((node: Coordinates & { id: string }) => Object3D) | undefined;
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
  controls(): FakeCameraControls { return this.cameraControls; }
  graph2ScreenCoords(x: number, y: number, z: number): Coordinates {
    this.projectionCalls.push({ x, y, z });
    return { x: x + 100, y: y + 200, z };
  }
  graphData(data?: typeof this.data): this | typeof this.data {
    if (!data) return this.data;
    this.data = data;
    this.sceneRoot.clear();
    data.nodes.forEach((node) => {
      const object = this.nodeObjects.get(node.id) ?? this.nodeObjectFactory?.(node);
      if (object) this.nodeObjects.set(node.id, object);
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
  linkPositionUpdate(): this { return this; }
  linkSource(): this { return this; }
  linkTarget(): this { return this; }
  linkThreeObject(factory: (link: { id: string }) => Object3D): this {
    this.linkObjectFactory = factory;
    return this;
  }
  nodeId(): this { return this; }
  nodeLabel(): this { return this; }
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
    const liveNode = graph.data.nodes.find((node) => node.id === "component:api")!;
    Object.assign(liveNode, { x: 17, y: -9, z: 31 });

    expect(renderer.getNodeScreenPosition?.("component:api")).toEqual({ x: 117, y: 191 });
    expect(graph.projectionCalls).toEqual([{ x: 17, y: -9, z: 31 }]);
    expect(renderer.getNodeScreenPosition?.("missing")).toBeNull();

    liveNode.x = Number.NaN;
    expect(renderer.getNodeScreenPosition?.("component:api")).toBeNull();
    expect(graph.projectionCalls).toHaveLength(1);
  });

  it("refreshes reused node and link materials from the current selection visual cues", () => {
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

    expect(graph.nodeObjects.get("component:web")).toBe(initialWebObject);
    expect(graph.linkObjects.get("api-web")).toBe(initialApiLinkObject);
    const observation = renderer.getRenderObservation!();
    const selected = observation.nodes.find((node) => node.id === "component:web");
    const neighbor = observation.nodes.find((node) => node.id === "component:api");
    const master = observation.nodes.find((node) => node.id === "relation:release");
    const selectedLink = observation.links.find((link) => link.id === "api-web");
    const distantLink = observation.links.find((link) => link.id === "release-api");
    expect(selected?.minimumVisibleMaterialOpacity).toBe(1);
    expect(neighbor?.minimumVisibleMaterialOpacity).toBe(0.86);
    expect(master?.minimumVisibleMaterialOpacity).toBe(0.62);
    expect(selectedLink).toMatchObject({
      minimumVisibleMaterialOpacity: 0.9,
      visibleMaterialLineWidths: [1.65],
    });
    expect(distantLink).toMatchObject({
      minimumVisibleMaterialOpacity: 0.22,
      visibleMaterialLineWidths: [0.7],
    });

    const selectedBody = initialWebObject?.children.find((child) => child instanceof Mesh) as Mesh | undefined;
    expect((selectedBody?.material as MeshStandardMaterial).emissiveIntensity).toBeCloseTo(0.4);
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
    expect(master?.minimumVisibleMaterialOpacity).toBe(master?.visual.opacity);

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
