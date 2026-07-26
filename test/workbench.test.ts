import { describe, expect, it, vi } from "vitest";

import {
  createGraphWorkbench,
  type GraphPresentation,
  type GraphRenderer,
  type GraphRendererFactoryOptions,
  type RenderGraphData,
} from "../src/index.js";
import { graphFixture } from "./fixtures.js";

class FakeElement {
  tabIndex = -1;
  private readonly listeners = new Map<string, Set<(event: KeyboardEvent) => void>>();
  private readonly attributes = new Map<string, string>();

  addEventListener(type: string, listener: (event: KeyboardEvent) => void): void {
    const values = this.listeners.get(type) ?? new Set();
    values.add(listener);
    this.listeners.set(type, values);
  }

  removeEventListener(type: string, listener: (event: KeyboardEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  dispatchKey(key: string): void {
    const preventDefault = vi.fn();
    const event = { key, preventDefault } as unknown as KeyboardEvent;
    this.listeners.get("keydown")?.forEach((listener) => listener(event));
    expect(preventDefault).toHaveBeenCalled();
  }
}

class FakeRenderer implements GraphRenderer {
  data: RenderGraphData | null = null;
  presentation: GraphPresentation | null = null;
  destroyed = false;
  focused: string | null = null;
  fitCalls: number[] = [];
  resizeCalls: Array<[number | undefined, number | undefined]> = [];
  zoomCalls: number[] = [];

  destroy(): void { this.destroyed = true; }
  fit(durationMs?: number): void { this.fitCalls.push(durationMs ?? 250); }
  focus(nodeId: string): void { this.focused = nodeId; }
  resize(width?: number, height?: number): void { this.resizeCalls.push([width, height]); }
  restoreCamera(): void {}
  setData(data: RenderGraphData): void { this.data = data; }
  setPresentation(presentation: GraphPresentation): void { this.presentation = presentation; }
  zoom(scale: number): void { this.zoomCalls.push(scale); }
}

describe("GraphWorkbench", () => {
  it("connects renderer events and keyboard focus to host-observable stable identities", () => {
    let renderer: FakeRenderer | null = null;
    let callbacks: GraphRendererFactoryOptions["callbacks"] | null = null;
    const clicks: string[] = [];
    const focus: Array<string | null> = [];
    const states: string[] = [];
    const workbench = createGraphWorkbench({
      input: graphFixture,
      onFocusChange: ({ nodeId }) => focus.push(nodeId),
      onNodeClick: ({ nodeId }) => clicks.push(nodeId),
      onRendererStateChange: ({ status }) => states.push(status),
      rendererFactory: (options) => {
        callbacks = options.callbacks;
        renderer = new FakeRenderer();
        return renderer;
      },
    });
    const element = new FakeElement();

    workbench.mount(element as unknown as HTMLElement);
    expect(renderer?.data?.nodes.map((node) => node.id)).toEqual(graphFixture.nodes.map((node) => node.id));
    expect(states).toEqual(["mounted"]);

    callbacks?.onNodeClick("component:api");
    expect(clicks).toEqual(["component:api"]);
    expect(focus).toEqual(["component:api"]);

    element.dispatchKey("ArrowRight");
    expect(renderer?.focused).toBe("component:web");
    element.dispatchKey("Enter");
    expect(clicks).toEqual(["component:api", "component:web"]);

    workbench.resize(640, 480);
    workbench.fit(0);
    workbench.zoom(1.5);
    workbench.setPresentation({ theme: "light", selectedNodeIds: ["component:web"] });
    expect(renderer?.resizeCalls).toContainEqual([640, 480]);
    expect(renderer?.fitCalls).toContain(0);
    expect(renderer?.zoomCalls).toEqual([1.5]);
    expect(renderer?.presentation?.theme).toBe("light");

    workbench.unmount();
    expect(renderer?.destroyed).toBe(true);
    expect(states).toEqual(["mounted", "unmounted"]);
  });
});
