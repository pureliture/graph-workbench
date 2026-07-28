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
  `getNodeScreenPosition`, `getRenderObservation`, `getTransitionObservation`,
  `restoreCamera`
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
contribute material-opacity evidence. Built-in node bodies additionally report
`defaultBody: { kind: "flat-2.5d", silhouette }`, where `silhouette` is one of
`circle`, `capsule`, `dot`, or `disk`; host-provided node objects report `null`.
`defaultBody`는 기존 custom renderer observation과의 source compatibility를 위해 optional이며,
내장 renderer는 항상 이 필드를 제공합니다.

내장 renderer는 선택을 하나의 취소 가능한 transaction으로 처리합니다. 모든 live node는
현재 renderer-local 위치에서 deterministic target까지 보간되고, link emphasis, focus rim,
scale, camera reframe은 같은 bounded animation frame에서 진행됩니다. 명시적 선택은 420 ms
cubic transition, 선택 해제 복원은 250 ms를 사용하며 reduced motion에서는 즉시 settled
상태가 됩니다. 기본 node material은 routine-harness Tauri의 semantic light/dark palette와
flat 2.5D 원형·캡슐·점·디스크 silhouette을 사용합니다. 기본 body와 flow token은 카메라를
향하는 billboard이므로 camera drift/orbit에서도 edge-on으로 사라지지 않습니다. 깊이는 조명,
clearcoat, specular, sphere가 아니라 scale과 opacity 계층으로만 표현합니다. host는
`getTransitionObservation()`으로 active generation, progress, duration, motion mode,
실제 live node coordinates를 확인할 수 있습니다. 내장 renderer는 선택적으로 실제 camera
pose evidence(`camera.position`, `camera.lookAt`)도 함께 제공합니다. mount 전과 legacy custom
renderer에서는 `null`을 반환합니다.

`setReducedMotion(true)` (or `GraphPresentation.reducedMotion`) keeps the same selection
and camera target while requesting an immediate transition. Selection distance controls
node/link opacity, contrast, and label cues. Distant nodes remain present, and an
explicit `master` role always receives the built-in readability floor.

## Ambient motion and depth

내장 browser renderer는 기본적으로 `ambientMotion: true`인 조용한 kinetic constellation을
표현합니다. deterministic `targetNodePositions`와 selection/resize 계산은 그대로 앵커로
남고, 기본 node Object3D에만 공통의 느린 float와 안정적인 node별 breathing offset을 별도로
더합니다. 따라서 selection transaction이 끝난 뒤에도 그래프가 멈추지 않으며, legacy/custom
renderer는 `ambientMotion` 힌트를 무시해도 호환됩니다.

카메라 상대 깊이에 따라 기본 node body와 label의 opacity/scale이 달라집니다. 선택 node와
1-hop node는 읽기 쉬운 계층을 유지하고, 관련 없는 먼 label은 거의 사라질 수 있습니다.
명시적 `master`는 별도의 최소 가독성 계층을 유지합니다. 실제 blur나 post-processing은 사용하지
않습니다.

idle edge는 조용하지만 읽을 수 있는 0.22–0.28 opacity tier를 유지합니다. hover 또는 selected
focus의 기본 incident edge만 tessellated
quadratic curve 위에 2개의 작은 renderer-owned token을 focus에서 이웃 방향으로 흘립니다. custom
link factory의 geometry와 animation은 건드리지 않습니다. `reducedMotion`에서는 node offset과
flow가 즉시 0이 되고, document가 hidden이면 motion loop가 멈췄다가 visible에서 시간 점프 없이
재개됩니다.

`getAmbientMotionObservation()`은 mount된 내장 renderer의 read-only 관찰 seam입니다. anchor와
실제 rendered/world·screen node position, elapsed time/frame/phase, focus/lifecycle 상태, link flow와
particle phase/position을 반환합니다. transition의 앵커 transaction은 기존
`getTransitionObservation()`으로 계속 확인합니다. `getNodeScreenPosition()` 역시 실제 raycast
Object3D의 live world transform을 투영하므로, host/fixture는 움직이는 node를 정확한 위치에서
클릭할 수 있습니다. mount 전 또는 legacy custom renderer에서는 ambient observation이 `null`입니다.
기본 Line endpoint에는 optional `sourceBoundary`/`targetBoundary` evidence가 추가될 수 있습니다.
이 값은 기본 flat body에서만 silhouette과 camera-facing bisection trim의 안쪽·바깥쪽 probe 결과를
제공하며, custom body 또는 legacy observation에서는 `null` 또는 생략될 수 있습니다.

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
