import { describe, expect, it, vi } from "vitest";

import {
  createGraphWorkbench,
  createRenderGraphData,
  type GraphPresentation,
  type GraphRenderer,
  type GraphRendererFactoryOptions,
  type RenderGraphData,
} from "../src/index.js";
import { graphFixture } from "./fixtures.js";

class FakeElement {
  clientHeight = 540;
  clientWidth = 720;
  tabIndex = -1;
  private readonly listeners = new Map<string, Set<(event: KeyboardEvent) => void>>();

  addEventListener(type: string, listener: (event: KeyboardEvent) => void): void {
    const values = this.listeners.get(type) ?? new Set();
    values.add(listener);
    this.listeners.set(type, values);
  }

  removeEventListener(type: string, listener: (event: KeyboardEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  setAttribute(): void {}

  dispatchKey(key: string): void {
    const preventDefault = vi.fn();
    const event = { key, preventDefault } as unknown as KeyboardEvent;
    this.listeners.get("keydown")?.forEach((listener) => listener(event));
    expect(preventDefault).toHaveBeenCalled();
  }
}

class TransitionRenderer implements GraphRenderer {
  cancelCalls = 0;
  data: RenderGraphData | null = null;
  operations: string[] = [];
  presentationCalls = 0;
  presentation: GraphPresentation | null = null;
  restoreCalls = 0;
  transitions: Array<{ durationMs?: number; nodeId: string; reducedMotion: boolean }> = [];

  cancelCameraTransition(): void {
    this.cancelCalls += 1;
    this.operations.push("cancel");
  }
  destroy(): void {}
  fit(): void {}
  focus(): void { throw new Error("enhanced transition seam should be preferred"); }
  resize(): void {}
  restoreCamera(): void { this.restoreCalls += 1; }
  setData(data: RenderGraphData): void {
    this.data = data;
    this.operations.push(`data:${data.selection.nodeId ?? "null"}`);
  }
  setPresentation(presentation: GraphPresentation): void {
    this.presentation = presentation;
    this.presentationCalls += 1;
  }
  transitionToNode(nodeId: string, options: { durationMs?: number; reducedMotion: boolean }): void {
    this.transitions.push({
      ...(options.durationMs === undefined ? {} : { durationMs: options.durationMs }),
      nodeId,
      reducedMotion: options.reducedMotion,
    });
  }
  zoom(): void {}
}

describe("selection-driven layout", () => {
  it("keeps legacy focus-only presentation separate from programmatic selection", () => {
    const data = createRenderGraphData(graphFixture, { focusNodeId: "component:api" });

    expect(data.selection.nodeId).toBeNull();
    expect(data.nodes.every((node) => node.fx === undefined)).toBe(true);
  });

  it("has repeatable settled targets for the selected node and its ordered one-hop neighborhood", () => {
    const presentation = { selectedNodeIds: ["component:api"] };
    const options = { viewport: { width: 720, height: 540 } };
    const first = createRenderGraphData(graphFixture, presentation, options);
    const second = createRenderGraphData(graphFixture, presentation, options);
    const targetNodePositions = ["component:api", "component:web", "relation:release"].map((id) => {
      const node = first.nodes.find((candidate) => candidate.id === id)!;
      return { id, x: node.x, y: node.y, z: node.z };
    });

    expect(first.selection).toEqual({
      nodeId: "component:api",
      neighborNodeIds: ["relation:release", "component:web"],
      settled: true,
      targetNodePositions,
      viewport: options.viewport,
    });
    expect(second.selection.targetNodePositions).toEqual(targetNodePositions);
    expect(targetNodePositions.some(({ x, y, z }) => [x, y, z].some((value) => !Number.isInteger(value)))).toBe(true);
    expect(graphFixture.nodes.every((node) => !("x" in node))).toBe(true);
    expect(first.nodes.map(({ id, x, y, z, fx, fy, fz }) => ({ id, x, y, z, fx, fy, fz }))).toEqual(
      second.nodes.map(({ id, x, y, z, fx, fy, fz }) => ({ id, x, y, z, fx, fy, fz })),
    );
    expect(first.nodes.filter((node) => node.fx !== undefined).map((node) => node.id)).toEqual([
      "relation:release",
      "component:api",
      "component:web",
    ]);
    expect(first.links).toHaveLength(graphFixture.links.length);
    expect(first.links[0]?.occurrences).toBe(graphFixture.links[0]?.occurrences);
    expect(first.links.map((link) => link.relationKind)).toEqual(["workflow-step", "serves"]);
  });

  it("hides the idle relationship field and reveals only selected-node incident links", () => {
    const input = {
      ...graphFixture,
      nodes: [
        ...graphFixture.nodes,
        { id: "concept:docs", type: "concept" as const, kind: "reference", label: "Docs" },
        { id: "concept:archive", type: "concept" as const, kind: "reference", label: "Archive" },
      ],
      links: [
        ...graphFixture.links,
        { id: "docs-archive", source: "concept:docs", target: "concept:archive", relationKind: "references" },
      ],
    };

    const idle = createRenderGraphData(input, {});
    const selected = createRenderGraphData(input, { selectedNodeIds: ["component:api"] });

    expect(idle.links.every((link) => !link.visual.visible)).toBe(true);
    expect(new Map(selected.links.map((link) => [link.id, link.visual.visible]))).toEqual(new Map([
      ["release-api", true],
      ["api-web", true],
      ["docs-archive", false],
    ]));
  });

  it("keeps selected identity and visual cues while preserving the base layout", () => {
    const base = createRenderGraphData(graphFixture, {});
    const preserve = createRenderGraphData(graphFixture, {
      selectedNodeIds: ["component:api"],
      selectionLayout: "preserve",
    });
    const constellation = createRenderGraphData(graphFixture, {
      selectedNodeIds: ["component:api"],
      selectionLayout: "constellation",
    });

    expect(preserve.selection).toMatchObject({
      nodeId: "component:api",
      neighborNodeIds: ["relation:release", "component:web"],
      settled: true,
    });
    expect(preserve.selection.targetNodePositions).toEqual(base.selection.targetNodePositions);
    expect(preserve.nodes.every((node) => node.fx === undefined && node.fy === undefined && node.fz === undefined)).toBe(true);
    expect(constellation.selection.targetNodePositions).not.toEqual(base.selection.targetNodePositions);
    const selectedConstellationNode = constellation.nodes.find((node) => node.id === "component:api");
    expect(selectedConstellationNode).toMatchObject({ visual: { labelCue: "primary", opacity: 1 } });
    expect([selectedConstellationNode?.fx, selectedConstellationNode?.fy, selectedConstellationNode?.fz]
      .every((value) => typeof value === "number" && Number.isFinite(value))).toBe(true);
  });

  it("keeps the deterministic depth field while restaging only the selected relationship lane", () => {
    const input = {
      ...graphFixture,
      nodes: [
        ...graphFixture.nodes,
        { id: "component:docs", type: "component" as const, kind: "service", label: "Docs" },
        {
          id: "component:pinned",
          type: "component" as const,
          kind: "service",
          label: "Pinned",
          layoutHint: { pinned: true, x: 180, y: -48, z: 72 },
        },
      ],
    };
    const base = createRenderGraphData(input, {});
    const selected = createRenderGraphData(input, { selectedNodeIds: ["component:api"] });
    const repeated = createRenderGraphData(input, { selectedNodeIds: ["component:api"] });
    const baseById = new Map(base.nodes.map((node) => [node.id, { x: node.x, y: node.y, z: node.z }]));
    const selectedById = new Map(selected.nodes.map((node) => [node.id, { x: node.x, y: node.y, z: node.z }]));

    expect(new Set(base.nodes.map((node) => node.z)).size).toBeGreaterThan(3);
    expect(Math.max(...base.nodes.map((node) => node.y)) - Math.min(...base.nodes.map((node) => node.y))).toBeGreaterThan(100);
    ["relation:release", "component:web"].forEach((id) => {
      expect(selectedById.get(id)).not.toEqual(baseById.get(id));
    });
    ["component:api", "component:docs"].forEach((id) => {
      expect(selectedById.get(id)).toEqual(baseById.get(id));
    });
    expect(selectedById.get("component:pinned")).toEqual(baseById.get("component:pinned"));
    expect(selected.selection.targetNodePositions).toEqual(repeated.selection.targetNodePositions);
    expect(base.nodes.every((node) => node.visual.labelCue === "visible")).toBe(true);
  });

  it("uses UTF-16 code-unit ordering for non-ASCII one-hop identities", () => {
    const input = {
      schemaVersion: 1 as const,
      layout: { seed: "unicode-order" },
      nodes: [
        { id: "relation:center", type: "relation", kind: "workflow", label: "Center" },
        { id: "component:ä", type: "component", kind: "service", label: "Umlaut" },
        { id: "component:z", type: "component", kind: "service", label: "Zed" },
      ],
      links: [
        { id: "center-umlaut", source: "relation:center", target: "component:ä", relationKind: "step" },
        { id: "center-zed", source: "relation:center", target: "component:z", relationKind: "step" },
      ],
    };

    const selection = createRenderGraphData(input, { selectedNodeIds: ["relation:center"] }).selection;
    expect(selection.neighborNodeIds).toEqual([
      "component:z",
      "component:ä",
    ]);
    expect(selection.targetNodePositions.map(({ id }) => id)).toEqual([
      "component:z",
      "component:ä",
      "relation:center",
    ]);
  });

  it("keeps an explicit master readable while giving distant nodes a reduced visual cue", () => {
    const input = {
      ...graphFixture,
      nodes: [
        ...graphFixture.nodes,
        { id: "component:docs", type: "component", kind: "service", label: "Docs" },
      ],
    };
    const data = createRenderGraphData(input, { selectedNodeIds: ["component:web"] });
    const master = data.nodes.find((node) => node.id === "relation:release")!;
    const distant = data.nodes.find((node) => node.id === "component:docs")!;

    expect(master.visual.opacity).toBeGreaterThanOrEqual(0.62);
    expect(master.visual.contrast).toBeGreaterThanOrEqual(0.72);
    expect(master.visual.labelCue).toBe("visible");
    expect(distant.visual).toMatchObject({ opacity: 0.3, contrast: 0.3, labelCue: "muted" });
    expect(distant.visual.opacity).toBeGreaterThan(0);
  });

  it("uses one selection outcome for mouse, keyboard, and programmatic paths", () => {
    let callbacks: GraphRendererFactoryOptions["callbacks"] | null = null;
    let renderer: TransitionRenderer | null = null;
    const selections: Array<{ nodeId: string | null; source: string; node: unknown; settled: boolean }> = [];
    const workbench = createGraphWorkbench({
      input: graphFixture,
      onSelectionChange: (event) => selections.push({
        nodeId: event.nodeId,
        source: event.source,
        node: event.node,
        settled: event.settled,
      }),
      rendererFactory: (options) => {
        callbacks = options.callbacks;
        renderer = new TransitionRenderer();
        return renderer;
      },
    });
    const element = new FakeElement();

    workbench.mount(element as unknown as HTMLElement);
    callbacks?.onNodeClick("component:api");
    element.dispatchKey("ArrowRight");
    workbench.selectNode("relation:release", "matrix");
    workbench.setReducedMotion(true);
    workbench.selectNode("component:web");

    expect(selections.map(({ nodeId, source }) => ({ nodeId, source }))).toEqual([
      { nodeId: "component:api", source: "mouse" },
      { nodeId: "component:web", source: "keyboard" },
      { nodeId: "relation:release", source: "matrix" },
      { nodeId: "component:web", source: "programmatic" },
    ]);
    expect(selections[0]?.node).toBe(graphFixture.nodes[1]);
    expect(selections.every((selection) => selection.settled)).toBe(true);
    expect(workbench.getSelectionState()).toMatchObject({
      nodeId: "component:web",
      neighborNodeIds: ["component:api"],
      settled: true,
    });
    expect(renderer?.transitions.at(-1)).toEqual({ nodeId: "component:web", reducedMotion: true });
    // The workbench leaves cancellation to the renderer. This lets a viewport
    // resize retarget the same active scene without snapping its node frame to
    // the final layout first.
    expect(renderer?.cancelCalls).toBe(0);
    expect(workbench.getSelectionState()).toBe(renderer?.data?.selection);
    expect(renderer?.presentation?.selectionLayout).toBe("constellation");
  });

  it("offers an immutable intent before mutations and leaves every selection side effect untouched when rejected", () => {
    let callbacks: GraphRendererFactoryOptions["callbacks"] | null = null;
    let renderer: TransitionRenderer | null = null;
    const selectionChange = vi.fn();
    const focusChange = vi.fn();
    const nodeClick = vi.fn();
    const resolveSelection = vi.fn(() => false as const);
    const workbench = createGraphWorkbench({
      input: graphFixture,
      onFocusChange: focusChange,
      onNodeClick: nodeClick,
      onSelectionChange: selectionChange,
      resolveSelection,
      rendererFactory: (options) => {
        callbacks = options.callbacks;
        renderer = new TransitionRenderer();
        return renderer;
      },
    });

    workbench.mount(new FakeElement() as unknown as HTMLElement);
    const dataCallsBefore = renderer!.operations.length;
    const presentationCallsBefore = renderer!.presentationCalls;
    const transitionCallsBefore = renderer!.transitions.length;
    const cancellationCallsBefore = renderer!.cancelCalls;

    callbacks?.onNodeClick("component:api");

    expect(resolveSelection).toHaveBeenCalledOnce();
    expect(resolveSelection).toHaveBeenCalledWith({
      input: graphFixture,
      node: graphFixture.nodes[1],
      neighborNodeIds: ["relation:release", "component:web"],
      nodeId: "component:api",
      source: "mouse",
    });
    expect(renderer!.operations).toHaveLength(dataCallsBefore);
    expect(renderer!.presentationCalls).toBe(presentationCallsBefore);
    expect(renderer!.transitions).toHaveLength(transitionCallsBefore);
    expect(renderer!.cancelCalls).toBe(cancellationCallsBefore);
    expect(workbench.getSelectionState().nodeId).toBeNull();
    expect(selectionChange).not.toHaveBeenCalled();
    expect(focusChange).not.toHaveBeenCalled();
    expect(nodeClick).not.toHaveBeenCalled();
  });

  it("applies accepted preserve and camera policies while retaining the contextual legacy fallback", () => {
    let callbacks: GraphRendererFactoryOptions["callbacks"] | null = null;
    let renderer: TransitionRenderer | null = null;
    const workbench = createGraphWorkbench({
      input: graphFixture,
      resolveSelection: () => ({
        camera: { durationMs: 180, kind: "contextual" },
        layout: "preserve",
      }),
      rendererFactory: (options) => {
        callbacks = options.callbacks;
        renderer = new TransitionRenderer();
        return renderer;
      },
    });

    workbench.mount(new FakeElement() as unknown as HTMLElement);
    callbacks?.onNodeClick("component:api");

    expect(renderer!.presentation?.selectionLayout).toBe("preserve");
    expect(renderer!.data?.selection).toMatchObject({
      nodeId: "component:api",
      neighborNodeIds: ["relation:release", "component:web"],
    });
    expect(renderer!.data?.nodes.every((node) => node.fx === undefined && node.fy === undefined && node.fz === undefined)).toBe(true);
    expect(renderer!.transitions.at(-1)).toEqual({ durationMs: 180, nodeId: "component:api", reducedMotion: false });

    const noneCameraWorkbench = createGraphWorkbench({
      input: graphFixture,
      resolveSelection: () => ({ camera: { kind: "none" }, layout: "constellation" }),
      rendererFactory: () => renderer!,
    });
    noneCameraWorkbench.mount(new FakeElement() as unknown as HTMLElement);
    const transitionsBefore = renderer!.transitions.length;
    const cancellationsBefore = renderer!.cancelCalls;
    noneCameraWorkbench.selectNode("component:web");
    expect(renderer!.presentation?.selectionLayout).toBe("constellation");
    expect(renderer!.transitions).toHaveLength(transitionsBefore);
    expect(renderer!.cancelCalls).toBe(cancellationsBefore);

    const restoreRenderer = new TransitionRenderer();
    const restoreWorkbench = createGraphWorkbench({
      input: graphFixture,
      resolveSelection: () => ({ camera: { durationMs: 220, kind: "restore" } }),
      rendererFactory: () => restoreRenderer,
    });
    restoreWorkbench.mount(new FakeElement() as unknown as HTMLElement);
    restoreWorkbench.selectNode("component:web");
    expect(restoreRenderer.restoreCalls).toBe(1);
    expect(restoreRenderer.transitions).toHaveLength(0);
  });

  it("reframes a mouse-selected full cloud after a ResizeObserver-style viewport sync", () => {
    let callbacks: GraphRendererFactoryOptions["callbacks"] | null = null;
    let renderer: TransitionRenderer | null = null;
    const workbench = createGraphWorkbench({
      input: graphFixture,
      rendererFactory: (options) => {
        callbacks = options.callbacks;
        renderer = new TransitionRenderer();
        return renderer;
      },
    });
    const element = new FakeElement();

    workbench.mount(element as unknown as HTMLElement);
    callbacks?.onNodeClick("component:api");
    const transitionsBeforeResize = renderer!.transitions.length;
    const operationsBeforeResize = renderer!.operations.length;

    // This is the order used by BrowserGraphFixture's ResizeObserver:
    // viewport update -> renderer.resize() -> graphData sync.
    workbench.resize(390, 844);

    expect(renderer!.operations.slice(operationsBeforeResize, operationsBeforeResize + 1)).toEqual([
      "data:component:api",
    ]);
    expect(renderer!.data?.selection).toMatchObject({
      nodeId: "component:api",
      viewport: { height: 844, width: 390 },
    });
    expect(renderer!.transitions).toHaveLength(transitionsBeforeResize + 1);
    expect(renderer!.transitions.at(-1)).toEqual({ nodeId: "component:api", reducedMotion: false });

    workbench.setReducedMotion(true);
    const reducedMotionTransitions = renderer!.transitions.length;
    workbench.resize(720, 540);
    expect(renderer!.transitions).toHaveLength(reducedMotionTransitions + 1);
    expect(renderer!.transitions.at(-1)).toEqual({ nodeId: "component:api", reducedMotion: true });
  });

  it("cancels the active camera before background clear and a setInput removal", () => {
    let callbacks: GraphRendererFactoryOptions["callbacks"] | null = null;
    let renderer: TransitionRenderer | null = null;
    const workbench = createGraphWorkbench({
      input: graphFixture,
      rendererFactory: (options) => {
        callbacks = options.callbacks;
        renderer = new TransitionRenderer();
        return renderer;
      },
    });

    workbench.mount(new FakeElement() as unknown as HTMLElement);
    callbacks?.onNodeClick("component:api");
    const backgroundStart = renderer!.operations.length;
    callbacks?.onBackgroundClick();
    expect(renderer!.operations.slice(backgroundStart, backgroundStart + 2)).toEqual(["cancel", "data:null"]);

    workbench.selectNode("component:api");
    const removalStart = renderer!.operations.length;
    workbench.setInput({
      ...graphFixture,
      nodes: graphFixture.nodes.filter((node) => node.id !== "component:api"),
      links: [],
    });
    expect(renderer!.operations.slice(removalStart, removalStart + 2)).toEqual(["cancel", "data:null"]);
  });
});
