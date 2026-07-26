import { describe, expect, it } from "vitest";

import {
  GraphInputValidationError,
  createRenderGraphData,
  graphInputJsonSchema,
  validateGraphInput,
} from "../src/index.js";
import { graphFixture } from "./fixtures.js";

describe("GraphInput", () => {
  it("keeps stable identities, relation kinds, and an explicit master role", () => {
    const result = validateGraphInput(graphFixture);
    expect(result.nodes.map((node) => node.id)).toEqual([
      "relation:release",
      "component:api",
      "component:web",
    ]);
    expect(result.links.map((link) => link.relationKind)).toEqual(["workflow-step", "serves"]);
    expect(result.nodes.find((node) => node.roles?.includes("master"))?.id).toBe("relation:release");
    expect(graphInputJsonSchema.properties.schemaVersion.const).toBe(1);
  });

  it("rejects duplicate identities and link endpoints outside the input", () => {
    const invalid = {
      ...graphFixture,
      nodes: [...graphFixture.nodes, { ...graphFixture.nodes[0] }],
      links: [{ ...graphFixture.links[0], target: "missing:node" }],
    };
    expect(() => validateGraphInput(invalid)).toThrow(GraphInputValidationError);
  });

  it("creates deterministic renderer-local positions without mutating the input", () => {
    const first = createRenderGraphData(graphFixture, {});
    const second = createRenderGraphData(graphFixture, {});
    expect(first.nodes.map(({ id, x, y, z }) => ({ id, x, y, z }))).toEqual(
      second.nodes.map(({ id, x, y, z }) => ({ id, x, y, z })),
    );
    expect(graphFixture.nodes[0]).not.toHaveProperty("x");
  });
});
