"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GraphInput,
  type GraphRenderObservation,
  type GraphSelectionEvent,
  type GraphWorkbench,
} from "@pureliture/graph-workbench";

const densityNodeCount = 150;
const densityFocusNodeId = "relation:query";

const densityClusterSpecs = [
  { id: "source", size: 18, center: { x: -185, y: 90 } },
  { id: "index", size: 19, center: { x: -65, y: 75 } },
  { id: "evidence", size: 17, center: { x: 60, y: 120 } },
  { id: "delivery", size: 20, center: { x: 185, y: 24 } },
  { id: "runtime", size: 16, center: { x: -155, y: -70 } },
  { id: "memory", size: 19, center: { x: -42, y: -125 } },
  { id: "vector", size: 18, center: { x: 55, y: -40 } },
  { id: "evaluation", size: 19, center: { x: 145, y: -100 } },
] as const;

type DensityLayoutNode = {
  readonly id: string;
  readonly layoutHint: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
};

function densityUnit(ordinal: number, salt: number): number {
  const value = Math.sin((ordinal * 12.9898) + (salt * 78.233)) * 43_758.5453;
  return value - Math.floor(value);
}

function densityNodeId(ordinal: number): string {
  return `concept:density-${ordinal}`;
}

function densityClusterPosition(
  ordinal: number,
  clusterIndex: number,
  center: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number; readonly z: number } {
  const angle = densityUnit(ordinal, clusterIndex + 1) * Math.PI * 2;
  const radialSpread = 14 + (densityUnit(ordinal, clusterIndex + 11) * 42);
  const xOffset = Math.cos(angle) * radialSpread * (0.62 + densityUnit(ordinal, 31));
  const yOffset = Math.sin(angle) * radialSpread * (0.54 + densityUnit(ordinal, 47));
  return {
    x: center.x + xOffset + (yOffset * 0.18),
    y: center.y + yOffset - (xOffset * 0.11),
    z: (densityUnit(ordinal, 61) - 0.5) * 10,
  };
}

function squaredXyDistance(first: DensityLayoutNode, second: DensityLayoutNode): number {
  const x = first.layoutHint.x - second.layoutHint.x;
  const y = first.layoutHint.y - second.layoutHint.y;
  return (x * x) + (y * y);
}

function closestDensityNode(
  target: DensityLayoutNode,
  candidates: readonly DensityLayoutNode[],
): DensityLayoutNode {
  return candidates.reduce((closest, candidate) => (
    squaredXyDistance(target, candidate) < squaredXyDistance(target, closest)
      ? candidate
      : closest
  ));
}

function closestDensityNodePair(
  sources: readonly DensityLayoutNode[],
  targets: readonly DensityLayoutNode[],
): { readonly source: DensityLayoutNode; readonly target: DensityLayoutNode } {
  return sources.flatMap((source) => targets.map((target) => ({ source, target }))).reduce((closest, pair) => (
    squaredXyDistance(pair.source, pair.target) < squaredXyDistance(closest.source, closest.target)
      ? pair
      : closest
  ));
}

const densityDirectNeighborNodes = [
  {
    id: "concept:index",
    type: "concept" as const,
    kind: "index",
    label: "Index",
    metadata: { densityRole: "direct-neighbor" },
    layoutHint: { x: -38, y: 26, z: 12 },
  },
  {
    id: "concept:evidence",
    type: "concept" as const,
    kind: "evidence",
    label: "Evidence",
    metadata: { densityRole: "direct-neighbor" },
    layoutHint: { x: 39, y: 23, z: 8 },
  },
  {
    id: "concept:vector",
    type: "concept" as const,
    kind: "vector",
    label: "Vector",
    metadata: { densityRole: "direct-neighbor" },
    layoutHint: { x: 4, y: -42, z: 15 },
  },
] as const;

function createDensityBackgroundTopology() {
  let nextOrdinal = 1;
  const clusters = densityClusterSpecs.map((cluster, clusterIndex) => {
    const nodeOrdinals = Array.from({ length: cluster.size }, () => nextOrdinal++);
    const nodes = nodeOrdinals.map((ordinal) => ({
      id: densityNodeId(ordinal),
      type: "concept" as const,
      kind: "density-context",
      label: `Density ${ordinal}`,
      metadata: { clusterId: cluster.id, densityRole: "background", ordinal },
      layoutHint: { ...densityClusterPosition(ordinal, clusterIndex, cluster.center), pinned: true },
    }));
    const treeLinks = nodes.slice(1).map((target, localIndex) => {
      const source = closestDensityNode(target, nodes.slice(0, localIndex + 1));
      return {
        id: `density-${cluster.id}-tree-${localIndex + 1}`,
        source: source.id,
        target: target.id,
        relationKind: "contextualizes",
      };
    });
    return { id: cluster.id, nodeOrdinals, nodes, treeLinks };
  });
  if (nextOrdinal - 1 !== densityNodeCount - 4) {
    throw new Error("Density cluster sizes must account for every background node.");
  }
  const bridgePairs = [
    [0, 1],
    [1, 2],
    [3, 6],
    [4, 5],
    [5, 7],
  ] as const;
  const bridgeLinks = bridgePairs.map(([sourceClusterIndex, targetClusterIndex]) => {
    const previous = clusters[sourceClusterIndex];
    const cluster = clusters[targetClusterIndex];
    const pair = closestDensityNodePair(previous.nodes, cluster.nodes);
    return {
      id: `density-${previous.id}-${cluster.id}-bridge`,
      source: pair.source.id,
      target: pair.target.id,
      relationKind: "relates-to",
    };
  });
  const connectorLinks = [
    { id: "index-source-connector", source: "concept:index", clusterIndex: 0 },
    { id: "evidence-delivery-connector", source: "concept:evidence", clusterIndex: 3 },
    { id: "vector-runtime-connector", source: "concept:vector", clusterIndex: 4 },
  ].map(({ id, source, clusterIndex }) => {
    const cluster = clusters[clusterIndex];
    const origin = densityDirectNeighborNodes.find((node) => node.id === source);
    if (!origin) throw new Error(`Missing density connector origin: ${source}`);
    const target = closestDensityNode(origin, cluster.nodes);
    return {
      id,
      source,
      target: target.id,
      relationKind: "expands-to",
    };
  });

  return {
    nodes: clusters.flatMap(({ nodes }) => nodes),
    links: [
      ...clusters.flatMap(({ treeLinks }) => treeLinks),
      ...bridgeLinks,
      ...connectorLinks,
    ],
  };
}

const densityBackgroundTopology = createDensityBackgroundTopology();

const densityNodes = [
  {
    id: densityFocusNodeId,
    type: "relation",
    kind: "retrieval",
    label: "Query",
    metadata: { densityRole: "focus" },
    layoutHint: { x: 0, y: 0, z: 28 },
  },
  ...densityDirectNeighborNodes,
  ...densityBackgroundTopology.nodes,
] as const;

const densityInput = {
  schemaVersion: 1,
  layout: { seed: "browser-fixture-density-v1" },
  nodes: densityNodes,
  links: [
    {
      id: "query-index",
      source: densityFocusNodeId,
      target: "concept:index",
      relationKind: "serves",
      ordinal: 0,
    },
    {
      id: "query-evidence",
      source: densityFocusNodeId,
      target: "concept:evidence",
      relationKind: "returns",
      ordinal: 1,
    },
    {
      id: "query-vector",
      source: densityFocusNodeId,
      target: "concept:vector",
      relationKind: "searches",
      ordinal: 2,
    },
    ...densityBackgroundTopology.links.map((link, index) => ({
      ...link,
      ordinal: index + 3,
    })),
  ],
} as const satisfies GraphInput;

type RendererStatus = "failed" | "mounted" | "pending";
type WebglStatus = "failed" | "mounted" | "pending";
type RenderTelemetry =
  | {
      readonly availability: "observed";
      readonly observation: GraphRenderObservation;
      readonly observationScope: "renderer-live-data-and-scene-object-material";
      readonly selectionNodeId: string | null;
    }
  | {
      readonly availability: "pending" | "unavailable";
      readonly reason: string | null;
    };

function Telemetry({ testId, value }: { readonly testId: string; readonly value: unknown }) {
  const text = JSON.stringify(value);
  return (
    <output className="telemetry-value" data-testid={testId} data-value={text}>
      {text}
    </output>
  );
}

export function DenseGraphFixture() {
  const graphHostRef = useRef<HTMLDivElement | null>(null);
  const workbenchRef = useRef<GraphWorkbench | null>(null);
  const selectionNodeIdRef = useRef<string | null>(null);
  const [rendererStatus, setRendererStatus] = useState<RendererStatus>("pending");
  const [webglStatus, setWebglStatus] = useState<WebglStatus>("pending");
  const [rendererReason, setRendererReason] = useState<string | null>(null);
  const [selection, setSelection] = useState({
    neighborNodeIds: [] as readonly string[],
    nodeId: null as string | null,
    source: "programmatic",
  });
  const [renderTelemetry, setRenderTelemetry] = useState<RenderTelemetry>({
    availability: "pending",
    reason: "Waiting for the density renderer scene observation.",
  });
  const [renderRevision, setRenderRevision] = useState(0);
  const rendererReady = rendererStatus === "mounted" && webglStatus === "mounted";

  const selectFocus = useCallback(() => {
    workbenchRef.current?.selectNode(densityFocusNodeId, "density-control");
  }, []);

  useEffect(() => {
    const host = graphHostRef.current;
    if (!host) return undefined;

    let disposed = false;
    let canvasFrame: number | null = null;
    let canvasDeadline: number | null = null;
    let fitFrame: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let graphCanvas: HTMLCanvasElement | null = null;
    let contextLostListener: ((event: Event) => void) | null = null;
    let canvasProbeFinished = false;

    const markUnavailable = (reason: string) => {
      if (disposed) return;
      setRendererStatus("failed");
      setWebglStatus("failed");
      setRendererReason(reason);
      setRenderTelemetry({ availability: "unavailable", reason });
    };

    const mount = async () => {
      try {
        const { createBrowserGraphWorkbench } = await import("@pureliture/graph-workbench/browser");
        if (disposed) return;
        const workbench = createBrowserGraphWorkbench({
          input: densityInput,
          onRendererStateChange: ({ reason, status }) => {
            if (status === "failed") markUnavailable(reason ?? "The density renderer failed to mount.");
            if (status === "mounted") {
              setRendererStatus("mounted");
              setRendererReason(null);
            }
          },
          onSelectionChange: (event: GraphSelectionEvent) => {
            if (disposed) return;
            selectionNodeIdRef.current = event.nodeId;
            setSelection({
              neighborNodeIds: event.neighborNodeIds,
              nodeId: event.nodeId,
              source: event.source,
            });
            setRenderTelemetry({
              availability: "pending",
              reason: "Waiting for the current density selection observation.",
            });
            setRenderRevision((revision) => revision + 1);
          },
        });
        workbenchRef.current = workbench;
        workbench.mount(host);
        workbench.setPresentation({ ambientMotion: false, theme: "dark" });
        workbench.resize(host.clientWidth, host.clientHeight);
        resizeObserver = new ResizeObserver(([entry]) => {
          workbench.resize(entry.contentRect.width, entry.contentRect.height);
        });
        resizeObserver.observe(host);

        const finishCanvasProbe = () => {
          canvasProbeFinished = true;
          if (canvasDeadline !== null) window.clearTimeout(canvasDeadline);
          canvasDeadline = null;
        };
        const markCanvas = (): boolean => {
          if (disposed || canvasProbeFinished) return true;
          const canvas = host.querySelector<HTMLCanvasElement>("canvas");
          if (!canvas) {
            return false;
          }
          canvas.dataset.testid = "graph-canvas";
          canvas.setAttribute("aria-label", "WebGL density graph canvas");
          let webglContext: WebGLRenderingContext | WebGL2RenderingContext | null = null;
          try {
            webglContext = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
          } catch {
            webglContext = null;
          }
          if (!webglContext) {
            finishCanvasProbe();
            markUnavailable("A WebGL rendering context could not be created for the density graph.");
            return true;
          }
          graphCanvas = canvas;
          contextLostListener = () => {
            markUnavailable("The density graph lost its WebGL rendering context.");
          };
          graphCanvas.addEventListener("webglcontextlost", contextLostListener, { once: true });
          finishCanvasProbe();
          setWebglStatus("mounted");
          workbench.fit(0);
          fitFrame = window.requestAnimationFrame(() => {
            if (!disposed) workbench.fit(0);
          });
          return true;
        };
        const waitForCanvas = () => {
          if (markCanvas()) return;
          canvasFrame = window.requestAnimationFrame(waitForCanvas);
        };
        canvasDeadline = window.setTimeout(() => {
          if (canvasProbeFinished) return;
          finishCanvasProbe();
          markUnavailable("The density renderer mounted without an accessible WebGL canvas.");
        }, 4500);
        waitForCanvas();
      } catch (error) {
        markUnavailable(error instanceof Error ? error.message : String(error));
      }
    };

    void mount();
    return () => {
      disposed = true;
      if (canvasFrame !== null) window.cancelAnimationFrame(canvasFrame);
      if (canvasDeadline !== null) window.clearTimeout(canvasDeadline);
      if (fitFrame !== null) window.cancelAnimationFrame(fitFrame);
      resizeObserver?.disconnect();
      if (graphCanvas && contextLostListener) {
        graphCanvas.removeEventListener("webglcontextlost", contextLostListener);
      }
      workbenchRef.current?.destroy();
      workbenchRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!rendererReady) return undefined;
    let disposed = false;
    let frame: number | null = null;
    let observationDeadline: number | null = null;
    let observationFinished = false;

    const finishObservation = () => {
      observationFinished = true;
      if (observationDeadline !== null) window.clearTimeout(observationDeadline);
      observationDeadline = null;
    };
    const markObservationUnavailable = (reason: string) => {
      if (disposed || observationFinished) return;
      finishObservation();
      setRendererStatus("failed");
      setRendererReason(reason);
      setRenderTelemetry({ availability: "unavailable", reason });
    };

    const observe = () => {
      if (disposed || observationFinished) return;
      try {
        const observation = workbenchRef.current?.getRenderObservation() ?? null;
        const transition = workbenchRef.current?.getTransitionObservation() ?? null;
        const complete = observation
          && observation.nodes.length === densityInput.nodes.length
          && observation.links.length === densityInput.links.length
          && observation.nodes.every(({ objectTracked, sceneAttached }) => objectTracked && sceneAttached)
          && observation.links.every(({ objectTracked, sceneAttached }) => objectTracked && sceneAttached)
          && (!transition || (!transition.active && transition.progress === 1));
        if (complete) {
          finishObservation();
          setRenderTelemetry({
            availability: "observed",
            observation,
            observationScope: "renderer-live-data-and-scene-object-material",
            selectionNodeId: selectionNodeIdRef.current,
          });
          return;
        }
      } catch (error) {
        markObservationUnavailable(
          error instanceof Error
            ? error.message
            : "The density renderer scene observation failed.",
        );
        return;
      }
      frame = window.requestAnimationFrame(observe);
    };

    frame = window.requestAnimationFrame(observe);
    observationDeadline = window.setTimeout(() => {
      markObservationUnavailable("The density renderer did not expose a settled complete scene observation.");
    }, 5000);
    return () => {
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (observationDeadline !== null) window.clearTimeout(observationDeadline);
    };
  }, [renderRevision, rendererReady]);

  return (
    <main className="fixture-page density-fixture">
      <h1 className="sr-only">Graph Workbench Density Fixture</h1>
      <div className="density-controls">
        <span>{rendererReady ? "Density renderer ready" : rendererStatus === "failed" ? "Renderer unavailable" : "Preparing density renderer"}</span>
        <button
          data-testid="graph-density-selection-relation-query"
          disabled={!rendererReady}
          onClick={selectFocus}
          type="button"
        >
          Select Query focus
        </button>
      </div>
      <section className="graph-stage" aria-label="150-node density graph workbench">
        <div className="graph-panel">
          <div className="graph-shell" data-testid="graph-shell" ref={graphHostRef} />
        </div>
        {rendererStatus === "failed" && (
          <div className="renderer-failure" data-testid="graph-renderer-failure" role="alert">
            <span className="failure-mark" aria-hidden="true">!</span>
            <div>
              <strong>Renderer unavailable</strong>
              <span data-testid="graph-renderer-failure-reason">{rendererReason}</span>
            </div>
          </div>
        )}
      </section>
      <section className="telemetry-panel" aria-label="Density fixture telemetry">
        <Telemetry testId="graph-density-ready" value={{
          availability: rendererReady ? "observed" : rendererStatus === "failed" ? "unavailable" : "pending",
          nodeCount: densityInput.nodes.length,
          reason: rendererReason,
        }} />
        <Telemetry testId="graph-input-node-ids" value={densityInput.nodes.map(({ id }) => id)} />
        <Telemetry testId="graph-input-link-ids" value={densityInput.links.map(({ id }) => id)} />
        <Telemetry testId="graph-input-topology" value={densityInput.links.map(({ id, source, target }) => ({
          id,
          source,
          target,
        }))} />
        <Telemetry testId="graph-render-observation" value={renderTelemetry} />
        <Telemetry testId="graph-selection" value={{
          availability: rendererStatus === "failed" ? "unavailable" : "observed",
          neighborNodeIds: selection.neighborNodeIds,
          nodeId: selection.nodeId,
          settled: true,
          source: selection.source,
        }} />
      </section>
    </main>
  );
}
