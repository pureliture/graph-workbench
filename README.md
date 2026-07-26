# graph-workbench

Reusable TypeScript 3D graph workbench powered by Three.js and `3d-force-graph`.

The package only consumes normalized graph input. It does not read files, call Tauri,
invoke backend commands, or infer domain semantics from the rendered scene.

## Install

```sh
npm install @pureliture/graph-workbench
```

For a Git-based integration, pin an immutable commit rather than a moving branch.

```json
{
  "dependencies": {
    "@pureliture/graph-workbench": "git+https://github.com/pureliture/graph-workbench.git#<commit>"
  }
}
```

## Graph input

`GraphInput` has both static TypeScript types and the exported
`graphInputJsonSchema` / `validateGraphInput()` runtime contract.

```ts
import { createBrowserGraphWorkbench } from "@pureliture/graph-workbench/browser";
import type { GraphInput } from "@pureliture/graph-workbench";

const input: GraphInput = {
  schemaVersion: 1,
  layout: { seed: "demo-v1" },
  nodes: [
    {
      id: "workflow:release",
      type: "relation",
      kind: "workflow",
      label: "Release workflow",
      roles: ["master"],
    },
    {
      id: "component:api",
      type: "component",
      kind: "service",
      label: "API",
    },
  ],
  links: [
    {
      id: "workflow:release->component:api",
      source: "workflow:release",
      target: "component:api",
      relationKind: "workflow-step",
      ordinal: 1,
    },
  ],
};

const workbench = createBrowserGraphWorkbench({
  input,
  onNodeClick: ({ nodeId }) => console.log(nodeId),
});
workbench.mount(document.querySelector("#graph")!);
```

`master` is an explicit role. The renderer does not infer it from node degree,
screen position, or visual size. Inputs without a master node are valid.

## Public API

- `mount`, `unmount`, `destroy`
- `setInput`, `setPresentation`
- `resize`, `fit`, `zoom`, `focusNode`, `restoreCamera`
- `onNodeClick`, `onNodeHover`, `onFocusChange`, `onBackgroundClick`,
  `onRendererStateChange`

The root entry is renderer-neutral and can be used with a test or host-provided
`rendererFactory`. The `/browser` entry is the browser-only Three.js and
`3d-force-graph` adapter.

The host owns selection persistence and any domain-specific action. It can pass generic
presentation descriptors for labels, colors, opacity, and link width without exposing
host actions or private metadata to the core.

## Development

```sh
npm install
npm run check
npm run demo
```

The browser fixture uses only sanitized example data. It is independent of Tauri and
can be replaced with any valid `GraphInput`.

## Limits

- The core does not produce graph data or call host IPC.
- Domain-specific panels, fallback copy, scanning, and SoT readers stay in the host.
- Selection-driven re-layout, physics choreography, fog, and depth-of-field are not
  part of this initial module.
