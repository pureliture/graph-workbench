import { describe, expect, it } from "vitest";

import {
  createGraphSearchIndex,
  createGraphWorkbench,
  createRenderGraphData,
  searchGraph,
  toGraphSearchText,
  type GraphInput,
  type GraphRenderer,
  type RenderGraphData,
} from "../src/index.js";

const searchableFixture: GraphInput = {
  schemaVersion: 1,
  layout: { seed: "search-v1" },
  nodes: [
    {
      id: "term:context-window",
      type: "term",
      kind: "concept",
      label: "Context window",
      metadata: {
        aliases: ["context window", "prompt budget"],
        summary: "How much text a model can read at once.",
        definition: "The token budget a model receives per request.",
        usage: "Long documents overflow the context window.",
        avoid: "Calling it memory is a common mistake.",
        section: "Sessions, Context Windows & Turns",
      },
    },
    {
      id: "term:agent",
      type: "term",
      kind: "concept",
      label: "Agent",
      metadata: {
        aliases: ["autonomous worker"],
        summary: "A model that plans and calls tools on its own.",
        definition: "An agent loops between reasoning and tool calls.",
        section: "Patterns of Work",
      },
    },
    {
      id: "term:handoff",
      type: "term",
      kind: "concept",
      label: "Handoff",
      metadata: {
        summary: "Passing a task to another agent.",
        definition: "A handoff transfers context between agents.",
        section: "Handoffs",
      },
    },
    {
      id: "term:token",
      type: "term",
      kind: "concept",
      label: "Token",
      metadata: {
        summary: "The unit a model reads text in.",
        section: "The Model",
      },
    },
    {
      id: "term:tool-call",
      type: "term",
      kind: "concept",
      label: "Tool call",
      metadata: {
        summary: "A structured request to run a tool.",
        definition: "Agents emit tool calls to reach outside the model.",
        section: "Tools & Environment",
      },
    },
  ],
  links: [
    { id: "agent-tool", source: "term:agent", target: "term:tool-call", relationKind: "uses" },
    { id: "agent-handoff", source: "term:agent", target: "term:handoff", relationKind: "performs" },
    { id: "context-token", source: "term:context-window", target: "term:token", relationKind: "measured-in" },
  ],
};

describe("graph search", () => {
  it("ranks a title match above a body-only match", () => {
    const index = createGraphSearchIndex(searchableFixture);

    const result = searchGraph(index, "agent");

    expect(result.nodeIds[0]).toBe("term:agent");
    expect(result.nodeIds).toContain("term:handoff");
    expect(result.scores.get("term:agent")!).toBeGreaterThan(result.scores.get("term:handoff")!);
  });

  it("tolerates a typo through fuzzy matching", () => {
    const index = createGraphSearchIndex(searchableFixture);

    const result = searchGraph(index, "agent");

    expect(result.nodeIds).toContain("term:agent");
  });

  it("matches a prefix of a longer term", () => {
    const index = createGraphSearchIndex(searchableFixture);

    const result = searchGraph(index, "hando");

    expect(result.nodeIds).toContain("term:handoff");
  });

  it("searches alias, summary, definition, and usage metadata", () => {
    const index = createGraphSearchIndex(searchableFixture);

    expect(searchGraph(index, "prompt budget").nodeIds).toContain("term:context-window");
    expect(searchGraph(index, "reads text in").nodeIds).toContain("term:token");
    expect(searchGraph(index, "overflow").nodeIds).toContain("term:context-window");
    expect(searchGraph(index, "autonomous worker").nodeIds).toContain("term:agent");
  });

  it("searches the section a node belongs to", () => {
    const index = createGraphSearchIndex(searchableFixture);

    expect(searchGraph(index, "Patterns of Work").nodeIds).toEqual(["term:agent"]);
    expect(searchGraph(index, "Tools & Environment").nodeIds).toEqual(["term:tool-call"]);
  });

  it("recovers a node from a misspelled query", () => {
    const index = createGraphSearchIndex(searchableFixture);

    expect(searchGraph(index, "agnt").nodeIds).toContain("term:agent");
    expect(searchGraph(index, "promt budget").nodeIds).toContain("term:context-window");
  });

  it("drops matches that stay far below the best score", () => {
    const index = createGraphSearchIndex(searchableFixture);

    const result = searchGraph(index, "agent");

    expect(result.nodeIds).not.toContain("term:token");
  });

  it("caps the number of returned matches", () => {
    const manyNodes: GraphInput = {
      ...searchableFixture,
      nodes: Array.from({ length: 40 }, (_, index) => ({
        id: `term:match-${index}`,
        type: "term",
        kind: "concept",
        label: `Match ${index}`,
      })),
    };
    const index = createGraphSearchIndex(manyNodes);

    const result = searchGraph(index, "match");

    expect(result.nodeIds.length).toBe(15);
  });

  it("returns nothing for an empty query", () => {
    const index = createGraphSearchIndex(searchableFixture);

    expect(searchGraph(index, "   ").nodeIds).toEqual([]);
    expect(searchGraph(index, "").query).toBe("");
  });

  it("is deterministic for the same input and query", () => {
    const index = createGraphSearchIndex(searchableFixture);

    const first = searchGraph(index, "agent");
    const second = searchGraph(index, "agent");

    expect(first.nodeIds).toEqual(second.nodeIds);
    expect([...first.scores.entries()]).toEqual([...second.scores.entries()]);
  });

  it("flattens markdown into searchable plain text", () => {
    expect(toGraphSearchText("A [linked term](https://example.com) and **bold** text"))
      .toBe("A linked term and bold text");
    expect(toGraphSearchText("# Heading\n\nBody")).toBe("Heading Body");
  });

  it("honours a host-owned document resolver", () => {
    const index = createGraphSearchIndex(searchableFixture, {
      resolveDocument: (node) => (node.id === "term:token" ? { description: "unique-host-only-phrase" } : {}),
    });

    expect(searchGraph(index, "unique-host-only-phrase").nodeIds).toEqual(["term:token"]);
  });
});

describe("search reading mode", () => {
  it("keeps the normal reading tiers when no search is running", () => {
    const data = createRenderGraphData(searchableFixture, {});

    expect(data.search.active).toBe(false);
    expect(data.search.matchedNodeIds).toEqual([]);
    expect(data.nodes.every((node) => node.visual.labelCue === "visible")).toBe(true);
  });

  it("emphasizes matched nodes and dims the rest while a search is running", () => {
    const data = createRenderGraphData(searchableFixture, {
      matchedNodeIds: ["term:agent"],
    });

    const matched = data.nodes.find((node) => node.id === "term:agent")!;
    const unmatched = data.nodes.find((node) => node.id === "term:token")!;

    expect(data.search.active).toBe(true);
    expect(matched.visual.labelCue).toBe("primary");
    expect(matched.visual.opacity).toBeGreaterThan(unmatched.visual.opacity);
    expect(unmatched.visual.labelCue).toBe("muted");
  });

  it("treats an empty match list as an active search that matched nothing", () => {
    const data = createRenderGraphData(searchableFixture, { matchedNodeIds: [] });

    expect(data.search.active).toBe(true);
    expect(data.nodes.every((node) => node.visual.labelCue === "muted")).toBe(true);
  });

  it("shows only the edges that connect two matched nodes", () => {
    const data = createRenderGraphData(searchableFixture, {
      matchedNodeIds: ["term:agent", "term:tool-call"],
    });

    const visible = data.links.filter((link) => link.visual.visible).map((link) => link.id);

    expect(visible).toEqual(["agent-tool"]);
  });

  it("clusters the matched nodes and leaves the rest of the graph in place", () => {
    const idle = createRenderGraphData(searchableFixture, {});
    const searching = createRenderGraphData(searchableFixture, {
      matchedNodeIds: ["term:agent", "term:tool-call", "term:handoff"],
    });

    const idlePosition = (data: typeof idle, id: string) => {
      const node = data.nodes.find((candidate) => candidate.id === id)!;
      return { x: node.x, y: node.y, z: node.z };
    };

    const idleAgent = idlePosition(idle, "term:agent");
    const searchingAgent = idlePosition(searching, "term:agent");
    expect(searchingAgent).not.toEqual(idleAgent);

    // An unmatched node keeps its canonical position.
    expect(idlePosition(searching, "term:token")).toEqual(idlePosition(idle, "term:token"));

    // The matched group is pulled into one readable cluster around the origin.
    const clusterRadius = Math.max(
      ...["term:agent", "term:tool-call", "term:handoff"].map((id) => {
        const { x, y, z } = idlePosition(searching, id);
        return Math.hypot(x, y, z);
      }),
    );
    expect(clusterRadius).toBeLessThan(
      Math.max(...["term:agent", "term:tool-call", "term:handoff"].map((id) => {
        const { x, y, z } = idlePosition(idle, id);
        return Math.hypot(x, y, z);
      })),
    );
    expect(searching.search.fitRadius).toBeGreaterThan(0);
  });

  it("produces the same cluster for the same input and match list", () => {
    const presentation = { matchedNodeIds: ["term:agent", "term:tool-call", "term:handoff"] };

    const first = createRenderGraphData(searchableFixture, presentation);
    const second = createRenderGraphData(searchableFixture, presentation);

    expect(first.nodes.map((node) => [node.id, node.x, node.y, node.z]))
      .toEqual(second.nodes.map((node) => [node.id, node.x, node.y, node.z]));
    expect(first.search.fitRadius).toBe(second.search.fitRadius);
  });

  it("keeps a live selection as the reading subject instead of the search cluster", () => {
    const data = createRenderGraphData(searchableFixture, {
      selectedNodeIds: ["term:agent"],
      matchedNodeIds: ["term:tool-call"],
    });

    const selected = data.nodes.find((node) => node.id === "term:agent")!;
    expect(selected.visual.labelCue).toBe("primary");
    // The matched node did not move into a cluster while a selection owns the
    // reading layout.
    const idle = createRenderGraphData(searchableFixture, {});
    const idlePosition = idle.nodes.find((node) => node.id === "term:tool-call")!;
    expect(selected.visual.opacity).toBeGreaterThan(0);
    expect(data.search.matchedNodeIds).toEqual(["term:tool-call"]);
    expect(idlePosition.id).toBe("term:tool-call");
  });
});

class SearchRenderer implements GraphRenderer {
  data: RenderGraphData | null = null;
  focusedSets: string[][] = [];
  restoreCalls = 0;

  destroy(): void {}
  fit(): void {}
  focus(): void {}
  focusNodeSet(nodeIds: readonly string[]): void {
    this.focusedSets.push([...nodeIds]);
  }
  resize(): void {}
  restoreCamera(): void {
    this.restoreCalls += 1;
  }
  setData(data: RenderGraphData): void {
    this.data = data;
  }
  setPresentation(): void {}
  zoom(): void {}
}

function mountSearchWorkbench(renderer: SearchRenderer) {
  const workbench = createGraphWorkbench({
    input: searchableFixture,
    rendererFactory: () => renderer,
  });
  const container = {
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    clientWidth: 720,
    clientHeight: 540,
    tabIndex: 0,
  } as unknown as HTMLElement;
  workbench.mount(container);
  return workbench;
}

describe("workbench search reading mode", () => {
  it("applies the matched nodes to the renderer data", () => {
    const renderer = new SearchRenderer();
    const workbench = mountSearchWorkbench(renderer);

    workbench.setSearchQuery("agent");

    const state = workbench.getSearchState();
    expect(state.active).toBe(true);
    expect(state.query).toBe("agent");
    expect(state.nodeIds).toContain("term:agent");
    expect(renderer.data?.search.active).toBe(true);
    expect(renderer.data?.search.matchedNodeIds).toEqual(state.nodeIds);
    expect(renderer.data?.nodes.find((node) => node.id === "term:agent")?.visual.labelCue).toBe("primary");
  });

  it("frames the matched cluster and restores the camera when the query clears", () => {
    const renderer = new SearchRenderer();
    const workbench = mountSearchWorkbench(renderer);

    workbench.setSearchQuery("agent");
    expect(renderer.focusedSets.at(-1)).toContain("term:agent");

    workbench.clearSearch();
    expect(workbench.getSearchState().active).toBe(false);
    expect(renderer.data?.search.active).toBe(false);
    expect(renderer.restoreCalls).toBe(1);
  });

  it("keeps a host presentation update from dropping the matched nodes", () => {
    const renderer = new SearchRenderer();
    const workbench = mountSearchWorkbench(renderer);

    workbench.setSearchQuery("agent");
    workbench.setPresentation({ theme: "light" });

    expect(renderer.data?.search.matchedNodeIds).toContain("term:agent");
  });

  it("runs a query without changing the reading mode", () => {
    const renderer = new SearchRenderer();
    const workbench = mountSearchWorkbench(renderer);

    const result = workbench.search("handoff");

    expect(result.nodeIds).toContain("term:handoff");
    expect(workbench.getSearchState().active).toBe(false);
    expect(renderer.data?.search.active).toBe(false);
  });

  it("re-runs the running query when the graph itself changes", () => {
    const renderer = new SearchRenderer();
    const workbench = mountSearchWorkbench(renderer);

    workbench.setSearchQuery("agent");
    workbench.setInput(searchableFixture);

    expect(workbench.getSearchState().nodeIds).toContain("term:agent");
    expect(renderer.data?.search.matchedNodeIds).toContain("term:agent");
  });
});
