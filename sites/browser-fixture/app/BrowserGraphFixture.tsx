"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GraphInput,
  type GraphRenderLinkObservation,
  type GraphRenderNodeObservation,
  type GraphRenderObservation,
  type GraphSelectionEvent,
  type GraphSelectionSource,
  type GraphSelectionState,
  type GraphWorkbench,
} from "@pureliture/graph-workbench";

const graphInput = {
  schemaVersion: 1,
  layout: { seed: "browser-fixture-selection-v1" },
  nodes: [
    {
      id: "relation:release",
      type: "relation",
      kind: "workflow",
      label: "Release workflow",
      roles: ["master"],
      metadata: { domain: "delivery", workflow: "release" },
    },
    {
      id: "component:api",
      type: "component",
      kind: "service",
      label: "API service",
      metadata: { domain: "platform", owner: "runtime" },
    },
    {
      id: "component:web",
      type: "component",
      kind: "application",
      label: "Web console",
      metadata: { domain: "experience", owner: "console" },
    },
    {
      id: "profile:platform",
      type: "profile",
      kind: "operating-profile",
      label: "Platform profile",
      metadata: { domain: "platform", environment: "production" },
    },
  ],
  links: [
    {
      id: "release-api",
      source: "relation:release",
      target: "component:api",
      relationKind: "workflow-step",
      ordinal: 0,
      occurrences: [
        { id: "release-api:validate", ordinal: 0, metadata: { phase: "validate" } },
        { id: "release-api:publish", ordinal: 1, metadata: { phase: "publish" } },
      ],
      metadata: { workflow: "release" },
    },
    {
      id: "api-web",
      source: "component:api",
      target: "component:web",
      relationKind: "serves",
      ordinal: 1,
      occurrences: [{ id: "api-web:serve", ordinal: 0, metadata: { protocol: "https" } }],
      metadata: { contract: "public-api" },
    },
    {
      id: "release-profile",
      source: "relation:release",
      target: "profile:platform",
      relationKind: "uses-profile",
      ordinal: 2,
      occurrences: [{ id: "release-profile:target", ordinal: 0 }],
      metadata: { workflow: "release" },
    },
    {
      id: "profile-api",
      source: "profile:platform",
      target: "component:api",
      relationKind: "governs",
      ordinal: 3,
      occurrences: [{ id: "profile-api:runtime", ordinal: 0 }],
      metadata: { policy: "runtime" },
    },
  ],
} as const satisfies GraphInput;

type RendererStatus = "failed" | "mounted" | "pending";
type TelemetryAvailability = "observed" | "pending" | "unavailable";

interface ObservedSelectionTelemetry {
  readonly availability: "observed";
  readonly neighborNodeIds: readonly string[];
  readonly nodeId: string | null;
  readonly settled: true;
  readonly source: GraphSelectionSource;
}

interface UnavailableTelemetry {
  readonly availability: Exclude<TelemetryAvailability, "observed">;
  readonly reason: string | null;
}

type SelectionTelemetry = ObservedSelectionTelemetry | UnavailableTelemetry;

interface ObservedScreenPositionTelemetry {
  readonly availability: "observed";
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}

type ScreenPositionTelemetry = ObservedScreenPositionTelemetry | UnavailableTelemetry;

interface UnknownTelemetry {
  readonly availability: "unknown";
  readonly reason: string;
}

interface ObservedRenderTelemetry {
  readonly availability: "observed";
  readonly observation: GraphRenderObservation;
  readonly observationScope: "renderer-live-data-and-scene-object-material";
}

type RenderTelemetry = ObservedRenderTelemetry | UnavailableTelemetry | UnknownTelemetry;

interface RendererState {
  readonly reason: string | null;
  readonly status: RendererStatus;
}

const projectionStabilityThresholdPx = 0.25;
const projectionStableFrameCount = 3;
const projectionSampleLimit = 180;
const renderObservationSampleLimit = 180;
const nodeIds = graphInput.nodes.map((node) => node.id);
const linkIds = graphInput.links.map((link) => link.id);
const nodesById = new Map(graphInput.nodes.map((node) => [node.id, node]));
const masterNodeId = graphInput.nodes.find((node) => node.roles?.includes("master"))?.id ?? null;

function testIdForNode(prefix: string, nodeId: string): string {
  return `${prefix}-${nodeId.replace(/:/g, "-")}`;
}

function Telemetry({ testId, value }: { readonly testId: string; readonly value: unknown }) {
  const text = JSON.stringify(value);
  return (
    <output className="telemetry-value" data-testid={testId} data-value={text}>
      {text}
    </output>
  );
}

function observeStableScreenPosition(
  nodeId: string,
  getPosition: () => { readonly x: number; readonly y: number } | null,
  publish: (telemetry: ScreenPositionTelemetry) => void,
): () => void {
  let animationFrame: number | null = null;
  let attempts = 0;
  let previousPosition: { readonly x: number; readonly y: number } | null = null;
  let stableFrames = 0;
  let disposed = false;

  const sampleProjection = () => {
    if (disposed) return;
    if (attempts === 0) {
      publish({
        availability: "pending",
        reason: "Waiting for a finite, stable renderer projection.",
      });
    }
    attempts += 1;
    const position = getPosition();
    const finite = position
      && Number.isFinite(position.x)
      && Number.isFinite(position.y);

    if (finite) {
      const stable = previousPosition !== null
        && Math.hypot(
          position.x - previousPosition.x,
          position.y - previousPosition.y,
        ) <= projectionStabilityThresholdPx;
      stableFrames = stable ? stableFrames + 1 : 0;
      previousPosition = position;
      if (stableFrames >= projectionStableFrameCount) {
        publish({
          availability: "observed",
          nodeId,
          x: position.x,
          y: position.y,
        });
        return;
      }
    } else {
      previousPosition = null;
      stableFrames = 0;
    }

    if (attempts >= projectionSampleLimit) {
      publish({
        availability: "unavailable",
        reason: "A finite, stable renderer projection was not observed.",
      });
      return;
    }
    animationFrame = window.requestAnimationFrame(sampleProjection);
  };

  animationFrame = window.requestAnimationFrame(sampleProjection);
  return () => {
    disposed = true;
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
  };
}

function observedNodeVisibility(node: GraphRenderNodeObservation) {
  return {
    nodeId: node.id,
    minimumVisibleMaterialOpacity: node.minimumVisibleMaterialOpacity,
    objectTracked: node.objectTracked,
    objectVisible: node.objectVisible,
    sceneAttached: node.sceneAttached,
    visibleMaterialLineWidths: node.visibleMaterialLineWidths,
    visibleMaterialOpacities: node.visibleMaterialOpacities,
    visual: node.visual,
  };
}

function observedLinkVisibility(link: GraphRenderLinkObservation) {
  return {
    linkId: link.id,
    minimumVisibleMaterialOpacity: link.minimumVisibleMaterialOpacity,
    objectTracked: link.objectTracked,
    objectVisible: link.objectVisible,
    sceneAttached: link.sceneAttached,
    visibleMaterialLineWidths: link.visibleMaterialLineWidths,
    visibleMaterialOpacities: link.visibleMaterialOpacities,
    visual: link.visual,
  };
}

export function BrowserGraphFixture() {
  const graphHostRef = useRef<HTMLDivElement | null>(null);
  const workbenchRef = useRef<GraphWorkbench | null>(null);
  const rendererReadyRef = useRef(false);
  const [selectionState, setSelectionState] = useState<GraphSelectionState | null>(null);
  const [selectionTelemetry, setSelectionTelemetry] = useState<SelectionTelemetry>({
    availability: "pending",
    reason: null,
  });
  const [selectedScreenPosition, setSelectedScreenPosition] = useState<ScreenPositionTelemetry>({
    availability: "pending",
    reason: null,
  });
  const [masterScreenPosition, setMasterScreenPosition] = useState<ScreenPositionTelemetry>({
    availability: "pending",
    reason: null,
  });
  const [renderTelemetry, setRenderTelemetry] = useState<RenderTelemetry>({
    availability: "pending",
    reason: null,
  });
  const [renderObservationRevision, setRenderObservationRevision] = useState(0);
  const [renderer, setRenderer] = useState<RendererState>({ status: "pending", reason: null });
  const [webglState, setWebglState] = useState("pending");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hostUpdate, setHostUpdate] = useState({ setInputSafe: false, collapseSafe: false });
  const rendererAvailable = renderer.status === "mounted" && webglState === "mounted";
  const observedSelection = selectionTelemetry.availability === "observed" ? selectionTelemetry : null;

  const selectNode = useCallback((nodeId: string | null, source: GraphSelectionSource) => {
    if (!rendererReadyRef.current) return;
    workbenchRef.current?.selectNode(nodeId, source);
  }, []);

  const updateReducedMotion = useCallback((nextReducedMotion: boolean) => {
    if (!rendererReadyRef.current) return;
    setReducedMotion(nextReducedMotion);
    workbenchRef.current?.setReducedMotion(nextReducedMotion);
  }, []);

  useEffect(() => {
    const host = graphHostRef.current;
    if (!host) return undefined;

    let animationFrame = 0;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const markRendererUnavailable = (reason: string, destroy = false) => {
      if (disposed) return;
      rendererReadyRef.current = false;
      setRenderer({ status: "failed", reason });
      setWebglState("unavailable");
      setSelectionState(null);
      setSelectionTelemetry({ availability: "unavailable", reason });
      setSelectedScreenPosition({ availability: "unavailable", reason });
      setMasterScreenPosition({ availability: "unavailable", reason });
      setRenderTelemetry({ availability: "unavailable", reason });
      if (destroy) {
        workbenchRef.current?.destroy();
        workbenchRef.current = null;
      }
    };

    const mountBrowserWorkbench = async () => {
      try {
        const { createBrowserGraphWorkbench } = await import("@pureliture/graph-workbench/browser");
        if (disposed) return;

        const workbench = createBrowserGraphWorkbench({
          input: graphInput,
          onRendererStateChange: ({ reason, status }) => {
            if (disposed) return;
            if (status === "failed") {
              markRendererUnavailable(reason ?? "The browser graph renderer failed to mount.");
              return;
            }
            if (status === "mounted") setRenderer({ status, reason: null });
          },
          onSelectionChange: (event: GraphSelectionEvent) => {
            if (!rendererReadyRef.current) return;
            const next = workbenchRef.current?.getSelectionState();
            if (next) setSelectionState(next);
            setSelectedScreenPosition({
              availability: "pending",
              reason: event.nodeId
                ? "Waiting for a finite, stable renderer projection."
                : "No node is selected.",
            });
            setMasterScreenPosition({
              availability: "pending",
              reason: "Waiting for the master node renderer projection.",
            });
            setRenderTelemetry({
              availability: "pending",
              reason: "Waiting for the current renderer scene observation.",
            });
            setRenderObservationRevision((revision) => revision + 1);
            setSelectionTelemetry({
              availability: "observed",
              nodeId: event.nodeId,
              neighborNodeIds: event.neighborNodeIds,
              settled: event.settled,
              source: event.source,
            });
          },
        });
        workbenchRef.current = workbench;
        workbench.mount(host);
        const defaultReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        setReducedMotion(defaultReducedMotion);
        workbench.setReducedMotion(defaultReducedMotion);

        let attempts = 0;
        const markCanvas = () => {
          const canvas = host.querySelector<HTMLCanvasElement>("canvas");
          if (canvas) {
            canvas.dataset.testid = "graph-canvas";
            canvas.setAttribute("aria-label", "WebGL graph canvas");
            let webglContext: WebGLRenderingContext | WebGL2RenderingContext | null = null;
            try {
              webglContext = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
            } catch {
              webglContext = null;
            }
            if (!webglContext) {
              markRendererUnavailable("A WebGL rendering context could not be created.", true);
              return;
            }
            rendererReadyRef.current = true;
            setWebglState("mounted");
            setSelectionState(workbench.getSelectionState());
            return;
          }
          attempts += 1;
          if (!disposed && attempts < 24) {
            animationFrame = window.requestAnimationFrame(markCanvas);
          } else if (!disposed) {
            markRendererUnavailable("The renderer mounted without an accessible WebGL canvas.", true);
          }
        };
        animationFrame = window.requestAnimationFrame(markCanvas);

        resizeObserver = new ResizeObserver(([entry]) => {
          const workbenchInstance = workbenchRef.current;
          if (!rendererReadyRef.current || !workbenchInstance) return;
          workbenchInstance.resize(entry.contentRect.width, entry.contentRect.height);
          setSelectionState(workbenchInstance.getSelectionState());
        });
        resizeObserver.observe(host);
      } catch (error) {
        if (disposed) return;
        const reason = error instanceof Error ? error.message : String(error);
        markRendererUnavailable(reason);
      }
    };

    void mountBrowserWorkbench();

    return () => {
      disposed = true;
      rendererReadyRef.current = false;
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(animationFrame);
      workbenchRef.current?.destroy();
      workbenchRef.current = null;
    };
  }, []);

  useEffect(() => {
    const nodeId = observedSelection?.nodeId ?? null;
    if (renderer.status === "failed" || !rendererAvailable || !nodeId) return undefined;

    return observeStableScreenPosition(
      nodeId,
      () => workbenchRef.current?.getNodeScreenPosition(nodeId) ?? null,
      setSelectedScreenPosition,
    );
  }, [
    observedSelection,
    renderer.reason,
    renderer.status,
    rendererAvailable,
    selectionState?.viewport.height,
    selectionState?.viewport.width,
  ]);

  useEffect(() => {
    if (renderer.status === "failed" || !rendererAvailable || !masterNodeId) return undefined;

    return observeStableScreenPosition(
      masterNodeId,
      () => workbenchRef.current?.getNodeScreenPosition(masterNodeId) ?? null,
      setMasterScreenPosition,
    );
  }, [
    observedSelection,
    renderer.reason,
    renderer.status,
    rendererAvailable,
    selectionState?.viewport.height,
    selectionState?.viewport.width,
  ]);

  useEffect(() => {
    if (renderer.status === "failed" || !rendererAvailable) return undefined;

    let animationFrame: number | null = null;
    let attempts = 0;
    let disposed = false;
    let sawObservation = false;

    const inspectRenderer = () => {
      if (disposed) return;
      attempts += 1;
      try {
        const observation = workbenchRef.current?.getRenderObservation() ?? null;
        if (observation) {
          sawObservation = true;
          const allSceneObjectsObserved = observation.nodes.length === observation.nodeIds.length
            && observation.links.length === observation.linkIds.length
            && observation.nodes.every(({ objectTracked, sceneAttached }) => objectTracked && sceneAttached)
            && observation.links.every(({ objectTracked, sceneAttached }) => objectTracked && sceneAttached);
          if (allSceneObjectsObserved) {
            setRenderTelemetry({
              availability: "observed",
              observation,
              observationScope: "renderer-live-data-and-scene-object-material",
            });
            return;
          }
        }
      } catch {
        setRenderTelemetry({
          availability: "unknown",
          reason: "The mounted renderer scene inspection failed.",
        });
        return;
      }

      if (attempts >= renderObservationSampleLimit) {
        setRenderTelemetry({
          availability: "unknown",
          reason: sawObservation
            ? "The mounted renderer scene objects were not fully observable."
            : "The mounted renderer did not provide a live scene observation.",
        });
        return;
      }
      animationFrame = window.requestAnimationFrame(inspectRenderer);
    };

    animationFrame = window.requestAnimationFrame(inspectRenderer);
    return () => {
      disposed = true;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [renderObservationRevision, renderer.status, rendererAvailable]);

  const selectedNode = observedSelection?.nodeId ? nodesById.get(observedSelection.nodeId) ?? null : null;
  const layoutTelemetry = rendererAvailable && selectionState
    ? {
        availability: "observed" as const,
        nodeId: selectionState.nodeId,
        neighborNodeIds: selectionState.neighborNodeIds,
        seed: graphInput.layout.seed,
        settled: selectionState.settled,
        targetNodePositions: selectionState.targetNodePositions.map(({ id, x, y, z }) => ({
          id,
          x: Math.round(x * 1_000_000) / 1_000_000,
          y: Math.round(y * 1_000_000) / 1_000_000,
          z: Math.round(z * 1_000_000) / 1_000_000,
        })),
        viewport: selectionState.viewport,
      }
    : {
        availability: renderer.status === "failed" ? "unavailable" as const : "pending" as const,
        reason: renderer.reason,
      };
  const observedRender = renderTelemetry.availability === "observed"
    ? renderTelemetry.observation
    : null;
  const renderedNodeIdsTelemetry = observedRender
    ? {
        availability: "observed" as const,
        ids: observedRender.nodes
          .filter(({ objectTracked, sceneAttached }) => objectTracked && sceneAttached)
          .map(({ id }) => id),
        observationScope: "scene-attached-render-object" as const,
      }
    : renderTelemetry;
  const renderedLinkIdsTelemetry = observedRender
    ? {
        availability: "observed" as const,
        ids: observedRender.links
          .filter(({ objectTracked, sceneAttached }) => objectTracked && sceneAttached)
          .map(({ id }) => id),
        observationScope: "scene-attached-render-object" as const,
      }
    : renderTelemetry;
  const masterVisibilityTelemetry = (() => {
    if (!observedRender) return renderTelemetry;
    if (!masterNodeId) {
      return {
        availability: "unavailable" as const,
        reason: "The input has no explicit master node.",
      };
    }
    const master = observedRender.nodes.find(({ id }) => id === masterNodeId);
    if (!master) {
      return {
        availability: "unknown" as const,
        reason: "The explicit master node was absent from the renderer observation.",
      };
    }
    return {
      availability: "observed" as const,
      observationScope: "scene-object-and-material-not-rendered-pixels" as const,
      pixelVisibility: "not-observed" as const,
      ...observedNodeVisibility(master),
    };
  })();
  const selectionDistanceVisibilityTelemetry = (() => {
    if (!observedRender) return renderTelemetry;
    const selectedNodeId = observedSelection?.nodeId ?? null;
    if (!selectedNodeId) {
      return {
        availability: "pending" as const,
        reason: "No node is selected.",
      };
    }
    const selected = observedRender.nodes.find(({ id }) => id === selectedNodeId);
    if (!selected) {
      return {
        availability: "unknown" as const,
        reason: "The selected node was absent from the renderer observation.",
      };
    }
    const neighborIds = new Set(observedSelection?.neighborNodeIds ?? []);
    return {
      availability: "observed" as const,
      observationScope: "scene-object-and-material-not-rendered-pixels" as const,
      selected: observedNodeVisibility(selected),
      neighbors: observedRender.nodes
        .filter(({ id }) => neighborIds.has(id))
        .map(observedNodeVisibility),
      distant: observedRender.nodes
        .filter(({ id }) => id !== selectedNodeId && !neighborIds.has(id))
        .map(observedNodeVisibility),
      links: observedRender.links.map(observedLinkVisibility),
    };
  })();
  const hostUpdateTelemetry = {
    ...hostUpdate,
    rendererAvailable,
    selectedNodeId: observedSelection?.nodeId ?? null,
  };

  return (
    <main className="fixture-page" data-reduced-motion={reducedMotion ? "true" : "false"}>
      <header className="fixture-header">
        <div>
          <p className="eyebrow">Browser evidence · deterministic selection</p>
          <h1>Graph Workbench</h1>
          <p className="intro">
            Public <code>@pureliture/graph-workbench/browser</code> surface mounted against a realistic release workflow.
          </p>
        </div>
        <div className="status-cluster" aria-label="Fixture runtime status">
          <span className={`status-dot ${rendererAvailable ? "is-ready" : ""}`} />
          <span>{renderer.status === "failed" ? "WebGL unavailable" : rendererAvailable ? "WebGL mounted" : "Preparing WebGL"}</span>
          <span className="status-divider" />
          <span>{reducedMotion ? "Reduced motion" : "Motion enabled"}</span>
        </div>
      </header>

      <section className="workbench-grid" aria-label="Selection-driven graph workbench">
        <section className="graph-panel" aria-label="3D graph canvas">
          <div className="graph-toolbar">
            <div>
              <p className="panel-kicker">Live graph</p>
              <p className="panel-title">Release topology</p>
            </div>
            <div className="toolbar-actions">
              <button data-testid="reset-layout" disabled={!rendererAvailable} onClick={() => selectNode(null, "programmatic")} type="button">
                Reset layout
              </button>
              <label className="motion-toggle">
                <input
                  checked={reducedMotion}
                  data-testid="reduced-motion-toggle"
                  disabled={!rendererAvailable}
                  onChange={(event) => updateReducedMotion(event.target.checked)}
                  type="checkbox"
                />
                <span>Reduce motion</span>
              </label>
            </div>
          </div>

          <div
            className="graph-shell"
            data-mounted={renderer.status}
            data-testid="graph-shell"
            data-webgl-state={webglState}
            ref={graphHostRef}
          />

          {renderer.status === "failed" && (
            <div className="renderer-failure" data-testid="graph-renderer-failure" role="alert">
              <strong>WebGL unavailable</strong>
              <span data-testid="graph-renderer-failure-reason">{renderer.reason}</span>
            </div>
          )}

          <div className="canvas-probes" aria-label="Graph interaction guidance">
            <span>{rendererAvailable
              ? "Select a node in the canvas or Matrix. Canvas events retain the public mouse source."
              : "Graph interactions are disabled until a WebGL renderer is available."}
            </span>
          </div>
        </section>

        <aside className="detail-panel" data-collapsed={collapsed ? "true" : "false"} data-testid="graph-detail-panel">
          <div className="detail-heading">
            <div>
              <p className="panel-kicker">Shared selection</p>
              <h2>{selectedNode?.label ?? "No node selected"}</h2>
            </div>
            <button
              data-testid="host-toggle-collapse"
              onClick={() => {
                setCollapsed((current) => !current);
                setHostUpdate((current) => ({ ...current, collapseSafe: true }));
              }}
              type="button"
            >
              {collapsed ? "Expand" : "Collapse"}
            </button>
          </div>

          {!collapsed && (
            <div className="detail-content">
              <dl>
                <div><dt>Identity</dt><dd>{selectedNode?.id ?? "—"}</dd></div>
                <div><dt>Kind</dt><dd>{selectedNode?.kind ?? "—"}</dd></div>
                <div><dt>Neighbors</dt><dd>{observedSelection?.neighborNodeIds.length ?? "—"}</dd></div>
                <div><dt>Source</dt><dd>{observedSelection?.source ?? "—"}</dd></div>
              </dl>
              <button
                className="host-update"
                data-testid="host-set-input"
                onClick={() => {
                  if (!rendererReadyRef.current || !workbenchRef.current) return;
                  workbenchRef.current.setInput({
                    ...graphInput,
                    metadata: { fixtureRevision: "host-safe-update" },
                  });
                  setSelectionState(workbenchRef.current.getSelectionState());
                  setRenderTelemetry({
                    availability: "pending",
                    reason: "Waiting for the host-updated renderer scene observation.",
                  });
                  setRenderObservationRevision((revision) => revision + 1);
                  setHostUpdate((current) => ({ ...current, setInputSafe: true }));
                }}
                disabled={!rendererAvailable}
                type="button"
              >
                Apply host-safe input update
              </button>
            </div>
          )}
        </aside>
      </section>

      <section className="matrix-panel" aria-label="Matrix selector">
        <div className="matrix-heading">
          <div>
            <p className="panel-kicker">Matrix selector</p>
            <h2>Input identity stays host-owned</h2>
          </div>
          <p>Every row selects the same identity used by the graph and detail panel.</p>
        </div>
        <div className="matrix-table">
          <div className="matrix-row matrix-labels">
            <span>Node</span>
            <span>Type</span>
            <span>Selection</span>
          </div>
          {graphInput.nodes.map((node) => {
            const selected = node.id === observedSelection?.nodeId;
            return (
              <button
                aria-pressed={selected}
                className={`matrix-row ${selected ? "is-selected" : ""}`}
                data-testid={testIdForNode("matrix-row", node.id)}
                key={node.id}
                onClick={() => selectNode(node.id, "matrix")}
                disabled={!rendererAvailable}
                type="button"
              >
                <span>{node.label}</span>
                <span>{node.kind}</span>
                <span>{selected ? "selected" : "inspect"}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="telemetry-panel" aria-label="Deterministic fixture telemetry">
        <div className="telemetry-heading">
          <p className="panel-kicker">Observable state</p>
          <p>Stable browser evidence only; no host IPC, filesystem scan, or snapshot reload.</p>
        </div>
        <div className="telemetry-grid">
          <Telemetry testId="graph-input-node-ids" value={nodeIds} />
          <Telemetry testId="graph-input-link-ids" value={linkIds} />
          <Telemetry testId="graph-rendered-node-ids" value={renderedNodeIdsTelemetry} />
          <Telemetry testId="graph-rendered-link-ids" value={renderedLinkIdsTelemetry} />
          <Telemetry testId="graph-render-observation" value={renderTelemetry} />
          <Telemetry testId="graph-selection" value={selectionTelemetry} />
          <Telemetry testId="matrix-selection" value={selectionTelemetry} />
          <Telemetry testId="reduced-motion-selection" value={{ ...selectionTelemetry, reducedMotion }} />
          <Telemetry testId="graph-settled-layout" value={layoutTelemetry} />
          <Telemetry testId="graph-selected-screen-position" value={selectedScreenPosition} />
          <Telemetry testId="graph-master-screen-position" value={masterScreenPosition} />
          <Telemetry testId="graph-camera-state" value={selectedScreenPosition} />
          <Telemetry testId="camera-transition-status" value={selectedScreenPosition} />
          <Telemetry testId="master-visibility" value={masterVisibilityTelemetry} />
          <Telemetry testId="selection-distance-visibility" value={selectionDistanceVisibilityTelemetry} />
          <Telemetry testId="host-update-status" value={hostUpdateTelemetry} />
          <Telemetry testId="collapse-status" value={{ collapsed, selectedNodeId: observedSelection?.nodeId ?? null }} />
        </div>
      </section>
    </main>
  );
}
