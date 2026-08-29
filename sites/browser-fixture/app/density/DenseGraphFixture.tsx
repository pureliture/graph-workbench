"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GraphNode,
  type GraphInput,
  type GraphRenderObservation,
  type GraphSelectionEvent,
  type GraphSelectionSource,
  type GraphWorkbench,
} from "@pureliture/graph-workbench";

const densityNodeCount = 150;
const densityFocusNodeId = "relation:query";

const densityClusterSpecs = [
  { id: "source", size: 17, center: { x: -185, y: 90, z: -68 } },
  { id: "index", size: 18, center: { x: -65, y: 75, z: 26 } },
  { id: "evidence", size: 16, center: { x: 60, y: 120, z: 74 } },
  { id: "delivery", size: 20, center: { x: 185, y: 24, z: -24 } },
  { id: "runtime", size: 16, center: { x: -155, y: -70, z: 52 } },
  { id: "memory", size: 19, center: { x: -42, y: -125, z: -92 } },
  { id: "vector", size: 18, center: { x: 55, y: -40, z: 38 } },
  { id: "evaluation", size: 19, center: { x: 145, y: -100, z: -48 } },
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
  center: { readonly x: number; readonly y: number; readonly z: number },
): { readonly x: number; readonly y: number; readonly z: number } {
  const angle = densityUnit(ordinal, clusterIndex + 1) * Math.PI * 2;
  const radialSpread = 14 + (densityUnit(ordinal, clusterIndex + 11) * 42);
  const xOffset = Math.cos(angle) * radialSpread * (0.62 + densityUnit(ordinal, 31));
  const yOffset = Math.sin(angle) * radialSpread * (0.54 + densityUnit(ordinal, 47));
  return {
    x: center.x + xOffset + (yOffset * 0.18),
    y: center.y + yOffset - (xOffset * 0.11),
    // Keep the dense fixture volumetric: the reference uses depth to create
    // scale/occlusion variation rather than laying every context node on one
    // shallow xy sheet.
    z: center.z + ((densityUnit(ordinal, 61) - 0.5) * 74)
      + (xOffset * 0.08)
      - (yOffset * 0.06),
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
    metadata: { densityRole: "direct-neighbor", semanticRole: "retrieval index" },
    layoutHint: { x: -38, y: 26, z: 36 },
  },
  {
    id: "concept:evidence",
    type: "concept" as const,
    kind: "evidence",
    label: "Evidence",
    metadata: { densityRole: "direct-neighbor", semanticRole: "grounding evidence" },
    layoutHint: { x: 39, y: 23, z: 22 },
  },
  {
    id: "concept:vector",
    type: "concept" as const,
    kind: "vector",
    label: "Vector",
    metadata: { densityRole: "direct-neighbor", semanticRole: "embedding representation" },
    layoutHint: { x: 4, y: -42, z: 52 },
  },
  {
    id: "concept:model",
    type: "concept" as const,
    kind: "model",
    label: "Model",
    metadata: { densityRole: "direct-neighbor", semanticRole: "requested model" },
    layoutHint: { x: -4, y: 72, z: 58 },
  },
  {
    id: "concept:provider",
    type: "concept" as const,
    kind: "provider",
    label: "Provider",
    metadata: { densityRole: "direct-neighbor", semanticRole: "model provider" },
    layoutHint: { x: 66, y: 50, z: 45 },
  },
  {
    id: "concept:context",
    type: "concept" as const,
    kind: "context",
    label: "Context",
    metadata: { densityRole: "direct-neighbor", semanticRole: "request context" },
    layoutHint: { x: -66, y: -24, z: 18 },
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
  if (nextOrdinal - 1 !== densityNodeCount - densityDirectNeighborNodes.length - 1) {
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
    layoutHint: { x: 0, y: 0, z: 72 },
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
    {
      id: "query-model",
      source: densityFocusNodeId,
      target: "concept:model",
      relationKind: "requests",
      ordinal: 3,
    },
    {
      id: "query-provider",
      source: densityFocusNodeId,
      target: "concept:provider",
      relationKind: "resolves-via",
      ordinal: 4,
    },
    {
      id: "query-context",
      source: densityFocusNodeId,
      target: "concept:context",
      relationKind: "scoped-by",
      ordinal: 5,
    },
    ...densityBackgroundTopology.links.map((link, index) => ({
      ...link,
      ordinal: index + 6,
    })),
  ],
} as const satisfies GraphInput;

const densityNodesById = new Map<string, GraphNode>(densityInput.nodes.map((node) => [node.id, node]));

// Keep the reference-facing term stable while the renderer uses a typed node
// id internally. This also makes browser history resolve aliases by the same
// rule as the initial deep-link.
const densityTermAliases = new Map<string, string>([
  ["model-provider-request", densityFocusNodeId],
]);

function densityNodeForTerm(rawTerm: string | null): GraphNode | null {
  if (!rawTerm) return null;
  const normalizedTerm = rawTerm.trim().toLocaleLowerCase();
  const slug = normalizedTerm.replace(/\s+/g, "-");
  const aliasNodeId = densityTermAliases.get(slug);
  if (aliasNodeId) return densityNodesById.get(aliasNodeId) ?? null;
  return densityInput.nodes.find((candidate) => (
    candidate.id === rawTerm
    || candidate.id === normalizedTerm
    || candidate.label.toLocaleLowerCase() === normalizedTerm
    || candidate.label.toLocaleLowerCase().replace(/\s+/g, "-") === slug
  )) ?? null;
}

type DensityNodeDetails = {
  readonly category: string;
  readonly definition: string;
  readonly source: string;
  readonly summary: string;
  readonly usage: string;
};

const densityNodeDetails = new Map<string, DensityNodeDetails>([
  [densityFocusNodeId, {
    category: "Retrieval relation",
    definition: "A query binds the requested model, provider, context and evidence into one retrievable graph request.",
    source: "Density reference fixture",
    summary: "The query anchor for a model-provider request path.",
    usage: "Select a related concept to follow the request path without losing the surrounding graph.",
  }],
  ["concept:index", {
    category: "Retrieval concept",
    definition: "An index narrows the candidate concepts that can satisfy the request.",
    source: "Density reference fixture",
    summary: "The retrieval index that serves the query.",
    usage: "Follow the index when you want to inspect how the request finds candidates.",
  }],
  ["concept:evidence", {
    category: "Grounding concept",
    definition: "Evidence is the material returned with a match so the request can be checked and grounded.",
    source: "Density reference fixture",
    summary: "The grounding evidence returned for the query.",
    usage: "Follow evidence to inspect why a result is considered trustworthy.",
  }],
  ["concept:vector", {
    category: "Representation concept",
    definition: "A vector is the embedding representation used to compare the request with candidate concepts.",
    source: "Density reference fixture",
    summary: "The embedding representation used during search.",
    usage: "Follow the vector when you want to inspect the semantic matching layer.",
  }],
  ["concept:model", {
    category: "Request concept",
    definition: "The model identifies which inference capability the request is asking the provider to run.",
    source: "Density reference fixture",
    summary: "The model requested by the query.",
    usage: "Follow the model to compare provider capability and request intent.",
  }],
  ["concept:provider", {
    category: "Provider concept",
    definition: "A provider resolves the model request to an available inference endpoint.",
    source: "Density reference fixture",
    summary: "The provider that resolves the requested model.",
    usage: "Follow the provider to inspect the endpoint chosen for the request.",
  }],
  ["concept:context", {
    category: "Request concept",
    definition: "Context carries the surrounding constraints that make a query meaningful to the graph.",
    source: "Density reference fixture",
    summary: "The request context that scopes the query.",
    usage: "Follow context to inspect the inputs carried into retrieval.",
  }],
]);

type DensityRelationship = {
  readonly direction: "incoming" | "outgoing";
  readonly linkId: string;
  readonly nodeId: string;
  readonly nodeLabel: string;
  readonly ordinal: number;
  readonly relationKind: string;
};

function densityDetailSummary(node: GraphNode): string {
  const details = densityNodeDetails.get(node.id);
  if (details) return details.summary;
  const role = node.metadata?.densityRole;
  if (role === "focus") return "The query anchor for the dense graph fixture.";
  if (role === "direct-neighbor") return `${node.label} is directly connected to the query anchor.`;
  const cluster = node.metadata?.clusterId;
  return typeof cluster === "string"
    ? `${node.label} is a background node in the ${cluster} density cluster.`
    : `${node.label} is a background node in the dense graph fixture.`;
}

function densityDetailsForNode(node: GraphNode): DensityNodeDetails {
  const known = densityNodeDetails.get(node.id);
  if (known) return known;
  const cluster = typeof node.metadata?.clusterId === "string" ? node.metadata.clusterId : "background";
  return {
    category: `${cluster} context`,
    definition: `${node.label} is a contextual concept in the ${cluster} branch of the request graph.`,
    source: "Density reference fixture",
    summary: `${node.label} is a contextual concept in the dense graph.`,
    usage: "Select a connected concept to continue reading the graph context.",
  };
}

function densityRelationships(nodeId: string): readonly DensityRelationship[] {
  return densityInput.links
    .map((link, inputIndex) => {
      if (link.source !== nodeId && link.target !== nodeId) return null;
      const outgoing = link.source === nodeId;
      const relatedNodeId = outgoing ? link.target : link.source;
      return {
        direction: outgoing ? "outgoing" as const : "incoming" as const,
        linkId: link.id,
        nodeId: relatedNodeId,
        nodeLabel: densityNodesById.get(relatedNodeId)?.label ?? relatedNodeId,
        ordinal: link.ordinal ?? inputIndex,
        relationKind: link.relationKind,
      };
    })
    .filter((relationship): relationship is DensityRelationship => relationship !== null)
    .sort((left, right) => (
      left.ordinal - right.ordinal
      || left.nodeLabel.localeCompare(right.nodeLabel)
      || left.linkId.localeCompare(right.linkId)
    ));
}

function densityNavigationTarget(nodeId: string, direction: -1 | 1): GraphNode | null {
  const currentIndex = densityInput.nodes.findIndex((node) => node.id === nodeId);
  if (currentIndex < 0 || densityInput.nodes.length === 0) return null;
  const nextIndex = (currentIndex + direction + densityInput.nodes.length) % densityInput.nodes.length;
  return densityInput.nodes[nextIndex] ?? null;
}

function densityTermPath(nodeId: string | null): string {
  const location = new URL(window.location.href);
  if (nodeId) location.searchParams.set("term", nodeId);
  else location.searchParams.delete("term");
  return `${location.pathname}${location.search}${location.hash}`;
}

type RendererStatus = "failed" | "mounted" | "pending";
type WebglStatus = "failed" | "mounted" | "pending";
type DensityScreenProjection = {
  readonly bounds: {
    readonly height: number;
    readonly maxX: number;
    readonly maxY: number;
    readonly minX: number;
    readonly minY: number;
    readonly width: number;
  } | null;
  readonly camera: ReturnType<GraphWorkbench["getTransitionObservation"]> extends infer T
    ? T extends { camera: infer C } ? C : null
    : null;
  readonly positions: readonly { readonly id: string; readonly x: number; readonly y: number }[];
};
type RenderTelemetry =
  | {
      readonly availability: "observed";
      readonly ambientMotion: ReturnType<GraphWorkbench["getAmbientMotionObservation"]>;
      readonly observation: GraphRenderObservation;
      readonly observationScope: "renderer-live-data-and-scene-object-material";
      readonly screenProjection: DensityScreenProjection;
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

function densityScreenProjection(workbench: GraphWorkbench): DensityScreenProjection {
  const positions = densityInput.nodes.flatMap((node) => {
    const position = workbench.getNodeScreenPosition(node.id);
    return position && Number.isFinite(position.x) && Number.isFinite(position.y)
      ? [{ id: node.id, x: position.x, y: position.y }]
      : [];
  });
  if (positions.length === 0) {
    return {
      bounds: null,
      camera: workbench.getTransitionObservation()?.camera ?? null,
      positions,
    };
  }
  const minX = Math.min(...positions.map(({ x }) => x));
  const maxX = Math.max(...positions.map(({ x }) => x));
  const minY = Math.min(...positions.map(({ y }) => y));
  const maxY = Math.max(...positions.map(({ y }) => y));
  return {
    bounds: { height: maxY - minY, maxX, maxY, minX, minY, width: maxX - minX },
    camera: workbench.getTransitionObservation()?.camera ?? null,
    positions,
  };
}

export function DenseGraphFixture() {
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const graphHostRef = useRef<HTMLDivElement | null>(null);
  const workbenchRef = useRef<GraphWorkbench | null>(null);
  const initialTermAppliedRef = useRef(false);
  const selectionNodeIdRef = useRef<string | null>(null);
  const settledGraphFitRef = useRef(false);
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

  const selectNode = useCallback((nodeId: string | null, source: GraphSelectionSource) => {
    if (!rendererReady) return;
    workbenchRef.current?.selectNode(nodeId, source);
  }, [rendererReady]);

  const selectFocus = useCallback(() => {
    selectNode(densityFocusNodeId, "density-control");
  }, [selectNode]);

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
            if (event.source !== "deep-link" && event.source !== "history") {
              const nextPath = densityTermPath(event.nodeId);
              const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
              if (nextPath !== currentPath) {
                window.history.pushState({ graphWorkbenchTerm: event.nodeId }, "", nextPath);
              }
            }
            setRenderTelemetry({
              availability: "pending",
              reason: "Waiting for the current density selection observation.",
            });
            setRenderRevision((revision) => revision + 1);
          },
        });
        workbenchRef.current = workbench;
        workbench.mount(host);
        workbench.setPresentation({ ambientMotion: true, theme: "dark" });
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
          fitFrame = window.requestAnimationFrame(() => {
            fitFrame = window.requestAnimationFrame(() => {
              // A deep-link can select a node before the deferred startup fit
              // runs. Do not let that initial full-graph fit overwrite the
              // selection camera target.
              if (!disposed && selectionNodeIdRef.current === null) {
                workbench.fit(0);
              }
            });
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
    if (!rendererReady || initialTermAppliedRef.current) return;
    initialTermAppliedRef.current = true;
    const rawTerm = new URL(window.location.href).searchParams.get("term");
    if (rawTerm === null) return;
    const node = densityNodeForTerm(rawTerm);
    if (node) {
      selectNode(node.id, "deep-link");
      return;
    }
    window.history.replaceState(window.history.state, "", densityTermPath(null));
  }, [rendererReady, selectNode]);

  useEffect(() => {
    const restoreSelectionFromHistory = () => {
      const rawTerm = new URL(window.location.href).searchParams.get("term");
      const node = densityNodeForTerm(rawTerm);
      selectNode(node?.id ?? null, "history");
    };
    window.addEventListener("popstate", restoreSelectionFromHistory);
    return () => window.removeEventListener("popstate", restoreSelectionFromHistory);
  }, [selectNode]);

  useEffect(() => {
    if (!rendererReady) return undefined;
    let disposed = false;
    let frame: number | null = null;
    let observationDeadline: number | null = null;
    let observationFinished = false;
    // One settled fit is needed only for the unselected startup scene. A
    // selected scene already owns its camera target and must not be reframed
    // back to the full graph after its transition settles.
    let settledFitRequested = settledGraphFitRef.current || selectionNodeIdRef.current !== null;

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
          if (!settledFitRequested && selectionNodeIdRef.current === null) {
            // The vendor graph creates node/link Object3D instances over its
            // render ticks. Fit once after the complete scene observation so
            // the camera includes the final volumetric bounds, not the early
            // canvas-only placeholder scene.
            settledFitRequested = true;
            settledGraphFitRef.current = true;
            workbenchRef.current?.fit(0);
            frame = window.requestAnimationFrame(observe);
            return;
          }
          finishObservation();
          setRenderTelemetry({
            availability: "observed",
            ambientMotion: workbenchRef.current!.getAmbientMotionObservation(),
            observation,
            observationScope: "renderer-live-data-and-scene-object-material",
            screenProjection: densityScreenProjection(workbenchRef.current!),
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

  const selectedNode = selection.nodeId ? densityNodesById.get(selection.nodeId) ?? null : null;
  const selectedRelationships = selectedNode ? densityRelationships(selectedNode.id) : [];
  const selectedDetails = selectedNode ? densityDetailsForNode(selectedNode) : null;
  const previousNode = selectedNode ? densityNavigationTarget(selectedNode.id, -1) : null;
  const nextNode = selectedNode ? densityNavigationTarget(selectedNode.id, 1) : null;
  const detailOpen = selectedNode !== null;
  const [copyState, setCopyState] = useState({ label: "Copy term link", nodeId: null as string | null });
  const copyStatus = copyState.nodeId === selectedNode?.id ? copyState.label : "Copy term link";

  const copyTermLink = async () => {
    if (!navigator.clipboard) {
      setCopyState({ label: "Copy unavailable", nodeId: selectedNode?.id ?? null });
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState({ label: "Link copied", nodeId: selectedNode?.id ?? null });
    } catch {
      setCopyState({ label: "Copy unavailable", nodeId: selectedNode?.id ?? null });
    }
  };

  useEffect(() => {
    if (detailOpen) return undefined;
    const activeElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (!activeElement || !detailPanelRef.current?.contains(activeElement)) return undefined;
    const focusFrame = window.requestAnimationFrame(() => graphHostRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(focusFrame);
  }, [detailOpen]);

  return (
    <main className="fixture-page density-fixture" data-detail-open={detailOpen ? "true" : "false"}>
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
      <aside
        aria-hidden={!detailOpen}
        aria-label="Selected node details"
        className="detail-panel density-detail-panel"
        data-active={detailOpen ? "true" : "false"}
        data-testid="graph-density-detail-panel"
        inert={detailOpen ? undefined : true}
        ref={detailPanelRef}
      >
        <div className="detail-heading">
          <div>
            <p className="panel-kicker">Selected node</p>
            <h2>{selectedNode?.label ?? "No node selected"}</h2>
          </div>
          <button
            aria-label="Close selected node details"
            className="drawer-close"
            data-testid="graph-density-detail-close"
            disabled={!selectedNode}
            onClick={() => selectNode(null, "background")}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="detail-content">
          <p className="detail-summary">{selectedNode ? densityDetailSummary(selectedNode) : ""}</p>
          <dl>
            <div><dt>Identity</dt><dd>{selectedNode?.id ?? "—"}</dd></div>
            <div><dt>Kind</dt><dd>{selectedNode?.kind ?? "—"}</dd></div>
            <div><dt>Category</dt><dd>{selectedDetails?.category ?? "—"}</dd></div>
            <div><dt>Neighbors</dt><dd>{selectedRelationships.length || "—"}</dd></div>
            <div><dt>Source</dt><dd>{selectedDetails?.source ?? selection.source}</dd></div>
          </dl>
          <section aria-label="Node definition" className="detail-definition">
            <p className="panel-kicker">Definition</p>
            <p>{selectedDetails?.definition ?? ""}</p>
            <p className="detail-usage"><strong>Usage</strong>{selectedDetails?.usage ?? ""}</p>
          </section>
          <section aria-label="Connected graph nodes" className="detail-relationships">
            <p className="panel-kicker">Related concepts</p>
            {selectedRelationships.length > 0 ? (
              <div className="relationship-list">
                {selectedRelationships.map((relationship) => (
                  <button
                    aria-label={`${relationship.direction === "outgoing" ? "Open" : "Return to"} ${relationship.nodeLabel}`}
                    className="relationship-chip"
                    data-testid={`graph-density-detail-relationship-${relationship.nodeId.replace(/:/g, "-")}`}
                    key={relationship.linkId}
                    onClick={() => selectNode(relationship.nodeId, "relationship")}
                    type="button"
                  >
                    <span aria-hidden="true">{relationship.direction === "outgoing" ? "→" : "←"}</span>
                    <strong>{relationship.nodeLabel}</strong>
                    <small>{relationship.relationKind}</small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="detail-empty">No direct graph connections.</p>
            )}
          </section>
          <div className="detail-actions">
            <button data-testid="graph-density-detail-copy-link" onClick={copyTermLink} type="button">
              {copyStatus}
            </button>
            <button data-testid="graph-density-detail-clear" onClick={() => selectNode(null, "background")} type="button">
              Clear focus
            </button>
          </div>
          <nav aria-label="Selected node navigation" className="detail-navigation">
            <button
              data-testid="graph-density-detail-previous"
              disabled={!previousNode}
              onClick={() => previousNode && selectNode(previousNode.id, "navigation")}
              type="button"
            >
              <span>Previous</span>
              <strong>{previousNode?.label ?? "—"}</strong>
            </button>
            <button
              data-testid="graph-density-detail-next"
              disabled={!nextNode}
              onClick={() => nextNode && selectNode(nextNode.id, "navigation")}
              type="button"
            >
              <span>Next</span>
              <strong>{nextNode?.label ?? "—"}</strong>
            </button>
          </nav>
        </div>
      </aside>
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
        <Telemetry testId="graph-density-screen-projection" value={renderTelemetry.availability === "observed"
          ? renderTelemetry.screenProjection
          : renderTelemetry} />
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
