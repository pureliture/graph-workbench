import type { GraphInput } from "../src/index.js";

export const graphFixture: GraphInput = {
  schemaVersion: 1,
  layout: { seed: "test-v1" },
  nodes: [
    { id: "relation:release", type: "relation", kind: "workflow", label: "Release", roles: ["master"] },
    { id: "component:api", type: "component", kind: "service", label: "API" },
    { id: "component:web", type: "component", kind: "application", label: "Web" },
  ],
  links: [
    {
      id: "release-api",
      source: "relation:release",
      target: "component:api",
      relationKind: "workflow-step",
      ordinal: 1,
    },
    {
      id: "api-web",
      source: "component:api",
      target: "component:web",
      relationKind: "serves",
    },
  ],
};
