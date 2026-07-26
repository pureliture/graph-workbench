import type { GraphInput } from "../src/index.js";

export const fixture: GraphInput = {
  schemaVersion: 1,
  layout: { seed: "sanitized-release-fixture-v1" },
  nodes: [
    {
      id: "workflow:release",
      type: "relation",
      kind: "workflow",
      label: "Release workflow",
      roles: ["master"],
      metadata: { priority: "anchor" },
    },
    {
      id: "component:api",
      type: "component",
      kind: "service",
      label: "API",
    },
    {
      id: "component:web",
      type: "component",
      kind: "application",
      label: "Web client",
    },
    {
      id: "component:worker",
      type: "component",
      kind: "worker",
      label: "Worker",
    },
  ],
  links: [
    {
      id: "workflow:release->component:api",
      source: "workflow:release",
      target: "component:api",
      relationKind: "workflow-step",
      ordinal: 1,
      occurrences: [{ ordinal: 1, id: "release-api" }],
    },
    {
      id: "component:api->component:web",
      source: "component:api",
      target: "component:web",
      relationKind: "serves",
    },
    {
      id: "component:api->component:worker",
      source: "component:api",
      target: "component:worker",
      relationKind: "dispatches",
    },
  ],
};
