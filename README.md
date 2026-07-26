# graph-workbench

Reusable TypeScript 3D graph workbench powered by Three.js and `3d-force-graph`.

The package only consumes normalized graph input. It does not read files, call Tauri,
invoke backend commands, or infer domain semantics from the rendered scene.

## Install

```sh
npm install git+https://github.com/pureliture/graph-workbench.git#2b40f3936dc05bcf6493cad82009d254825a156f
```

This first release is consumed from Git rather than a package registry. Pin an immutable
commit rather than a moving branch.

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
      occurrences: [{ ordinal: 1, id: "release-api" }],
    },
  ],
};

const workbench = createBrowserGraphWorkbench({
  input,
  onNodeClick: ({ nodeId }) => console.log(nodeId),
  onSelectionChange: ({ node, neighborNodeIds, settled }) => {
    // node is the original GraphInput node object; no renderer-local identity leaks.
    console.log(node?.id, neighborNodeIds, settled);
  },
});
workbench.mount(document.querySelector("#graph")!);
```

`master` is an explicit role. The renderer does not infer it from node degree,
screen position, or visual size. Inputs without a master node are valid.
Bundled links can preserve more than one ordered occurrence through `occurrences`.

## Public API

- `mount`, `unmount`, `destroy`
- `setInput`, `setPresentation`, `setReducedMotion`
- `resize`, `fit`, `zoom`, `selectNode`, `focusNode`, `getSelectionState`,
  `getNodeScreenPosition`, `getRenderObservation`, `restoreCamera`
- `onNodeClick`, `onNodeHover`, `onFocusChange`, `onSelectionChange`,
  `onBackgroundClick`, `onRendererStateChange`

The root entry is renderer-neutral and can be used with a test or host-provided
`rendererFactory`. The `/browser` entry is the browser-only Three.js and
`3d-force-graph` adapter.

The host owns selection persistence and any domain-specific action. It can pass generic
presentation descriptors for labels, colors, opacity, and link width without exposing
host actions or private metadata to the core.

`selectNode()` is the canonical programmatic selection path. Mouse clicks, arrow-key
navigation, and `selectNode()` produce the same selected identity, 1-hop neighborhood,
and `onSelectionChange` payload. Hosts may provide an optional source label (for example,
`"matrix"`) when calling `selectNode`. `focusNode()` remains a camera-only compatibility
method. The payload's `node` is the original node object from the active `GraphInput`;
graph data is never reconstructed or fetched during selection.

For a selected node, the selected node and its 1-hop neighbors receive deterministic,
settled renderer-local targets derived from `layout.seed` and the viewport. The core
does not mutate the input. `getSelectionState()` exposes the selected identity,
ordered 1-hop IDs, viewport, settled result, and raw `targetNodePositions` actually sent
to the renderer. Target positions use stable UTF-16 code-unit ID order so hydrated hosts
can round values only at their display boundary. Re-selecting cancels an enhanced renderer
camera transition before starting the next target. Existing custom
`GraphRenderer` implementations remain valid; they may optionally implement
`cancelCameraTransition()` and `transitionToNode()` for that behavior.
`getNodeScreenPosition(nodeId)` returns the built-in renderer's current canvas-local
projection after layout and camera updates. It returns `null` before mount, for an
unknown node, or when a legacy custom renderer does not implement the optional
projection seam.

`getRenderObservation()` exposes the built-in renderer's current graphData IDs
and read-only evidence for factory-return `Object3D` instances: whether each object
is still attached to the public Three.js scene, effectively visible, and the opacity
and line-width values of visible materials. It is `null` before mount and for legacy custom renderers. This
is scene/object evidence only; it does not claim that a node is visible in rendered
pixels. Detached stale factory objects are reported as not scene-attached and do not
contribute material-opacity evidence.

`setReducedMotion(true)` (or `GraphPresentation.reducedMotion`) keeps the same selection
and camera target while requesting an immediate transition. Selection distance controls
node/link opacity, contrast, and label cues. Distant nodes remain present, and an
explicit `master` role always receives the built-in readability floor.

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
- It does not provide domain-specific collapse state; hosts may change valid input or
  presentation without any per-click backend work.
