import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SpriteMaterial, type Object3D } from "three";

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
  cameraProjection = { aspect: 4 / 3, fov: 50 };
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
  camera(): typeof this.cameraProjection { return this.cameraProjection; }
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
    const liveNode = graph.data.nodes.find((node) => node.id === "component:api")!;
    Object.assign(liveNode, { x: 17, y: -9, z: 31 });

    expect(renderer.getNodeScreenPosition?.("component:api")).toEqual({ x: 117, y: 191 });
    expect(graph.projectionCalls).toEqual([{ x: 17, y: -9, z: 31 }]);
    expect(renderer.getNodeScreenPosition?.("missing")).toBeNull();

    liveNode.x = Number.NaN;
    expect(renderer.getNodeScreenPosition?.("component:api")).toBeNull();
    expect(graph.projectionCalls).toHaveLength(1);
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
    expect(neighbor?.minimumVisibleMaterialOpacity).toBeGreaterThan(0.62);
    expect(master?.minimumVisibleMaterialOpacity).toBe(0.62);
    expect(selectedLink).toMatchObject({
      curvePointCount: 3,
      depthWriteEnabled: false,
      minimumVisibleMaterialOpacity: 0.62,
      visibleMaterialLineWidths: [1.25],
    });
    expect(distantLink).toMatchObject({
      minimumVisibleMaterialOpacity: 0.1,
      visibleMaterialLineWidths: [0.6],
    });
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
    expect(distant.label).toMatchObject({ objectVisible: true, sceneAttached: true });
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
    expect(neighborLabelOpacity).toBeGreaterThanOrEqual(0.82);
    expect(farLabelOpacity).toBe(0.72);
    expect(selectedLabelOpacity).toBeGreaterThan(neighborLabelOpacity!);
    expect(neighborLabelOpacity).toBeGreaterThan(farLabelOpacity!);
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
    expect((body.material as MeshStandardMaterial).color.getHexString()).toBe("64748b");
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
    const minimumLabelScale = _device === "mobile" ? 17 * (480 / 390) : 17;
    observation.nodes.forEach((node) => {
      expect(node.label).toMatchObject({ objectVisible: true, sceneAttached: true, transparent: true });
      expect(node.label.minimumVisibleMaterialOpacity).toBeGreaterThanOrEqual(0.72);
      expect(node.label.scale?.x).toBeGreaterThanOrEqual(minimumLabelScale);
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
