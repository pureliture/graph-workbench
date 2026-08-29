"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type GraphAmbientMotionObservation,
  type GraphInput,
  type GraphNode,
  type GraphRenderLinkObservation,
  type GraphRenderNodeObservation,
  type GraphRenderObservation,
  type GraphSelectionEvent,
  type GraphSelectionSource,
  type GraphSelectionState,
  type GraphTransitionObservation,
  type GraphWorkbench,
} from "@pureliture/graph-workbench";

const graphInput = {
  schemaVersion: 1,
  layout: { seed: "browser-fixture-selection-v2" },
  nodes: [
    {
      id: "relation:release",
      type: "relation",
      kind: "workflow",
      label: "Release workflow",
      roles: ["master"],
      metadata: { domain: "delivery", visualTier: "near", workflow: "release" },
      layoutHint: { x: 10, y: 4, z: 26 },
    },
    {
      id: "component:api",
      type: "component",
      kind: "service",
      label: "API service",
      metadata: { domain: "platform", owner: "runtime", visualTier: "near" },
      layoutHint: { x: -44, y: -10, z: 16 },
    },
    {
      id: "component:web",
      type: "component",
      kind: "application",
      label: "Web console",
      metadata: { domain: "experience", owner: "console", visualTier: "mid" },
      layoutHint: { x: -88, y: -35, z: -24 },
    },
    {
      id: "profile:platform",
      type: "profile",
      kind: "operating-profile",
      label: "Platform profile",
      metadata: { domain: "platform", environment: "production", visualTier: "mid" },
      layoutHint: { x: -14, y: 47, z: -16 },
    },
    {
      id: "relation:ingest",
      type: "relation",
      kind: "ingestion",
      label: "Ingest",
      metadata: { domain: "knowledge", visualTier: "near" },
      layoutHint: { x: -86, y: 42, z: -28 },
    },
    {
      id: "relation:query",
      type: "relation",
      kind: "retrieval",
      label: "Query",
      metadata: { domain: "knowledge", visualTier: "near" },
      layoutHint: { x: 77, y: 32, z: 18 },
    },
    {
      id: "relation:review",
      type: "relation",
      kind: "review",
      label: "Review",
      metadata: { domain: "quality", visualTier: "mid" },
      layoutHint: { x: 96, y: -19, z: -8 },
    },
    {
      id: "relation:handoff",
      type: "relation",
      kind: "handoff",
      label: "Handoff",
      metadata: { domain: "delivery", visualTier: "near" },
      layoutHint: { x: 24, y: -72, z: 7 },
    },
    {
      id: "component:cache",
      type: "component",
      kind: "cache",
      label: "Prefix cache",
      metadata: { domain: "runtime", visualTier: "mid" },
      layoutHint: { x: -55, y: -63, z: 37 },
    },
    {
      id: "component:queue",
      type: "component",
      kind: "queue",
      label: "Queue",
      metadata: { domain: "runtime", visualTier: "near" },
      layoutHint: { x: 16, y: -32, z: -49 },
    },
    {
      id: "component:controller",
      type: "component",
      kind: "controller",
      label: "Controller",
      metadata: { domain: "runtime", visualTier: "mid" },
      layoutHint: { x: 57, y: 67, z: -37 },
    },
    {
      id: "concept:source",
      type: "concept",
      kind: "input",
      label: "Source",
      metadata: { visualTier: "near" },
      layoutHint: { x: -125, y: 58, z: 22 },
    },
    {
      id: "concept:event",
      type: "concept",
      kind: "event",
      label: "Event",
      metadata: { visualTier: "mid" },
      layoutHint: { x: -111, y: 19, z: -42 },
    },
    {
      id: "concept:schema",
      type: "concept",
      kind: "schema",
      label: "Schema",
      metadata: { visualTier: "near" },
      layoutHint: { x: -63, y: 76, z: 11 },
    },
    {
      id: "concept:index",
      type: "concept",
      kind: "index",
      label: "Index",
      metadata: { visualTier: "mid" },
      layoutHint: { x: -22, y: 88, z: -42 },
    },
    {
      id: "concept:evidence",
      type: "concept",
      kind: "evidence",
      label: "Evidence",
      metadata: { visualTier: "near" },
      layoutHint: { x: 53, y: 57, z: 44 },
    },
    {
      id: "concept:policy",
      type: "concept",
      kind: "policy",
      label: "Policy",
      metadata: { visualTier: "mid" },
      layoutHint: { x: 110, y: 45, z: -25 },
    },
    {
      id: "concept:permission",
      type: "concept",
      kind: "permission",
      label: "Permission",
      metadata: { visualTier: "far" },
      layoutHint: { x: 137, y: 14, z: -53 },
    },
    {
      id: "concept:boundary",
      type: "concept",
      kind: "boundary",
      label: "Boundary",
      metadata: { visualTier: "far" },
      layoutHint: { x: 135, y: -42, z: 41 },
    },
    {
      id: "concept:contract",
      type: "concept",
      kind: "contract",
      label: "Contract",
      metadata: { visualTier: "near" },
      layoutHint: { x: 92, y: -61, z: 24 },
    },
    {
      id: "concept:registry",
      type: "concept",
      kind: "registry",
      label: "Registry",
      metadata: { visualTier: "mid" },
      layoutHint: { x: 54, y: -89, z: -35 },
    },
    {
      id: "concept:artifact",
      type: "concept",
      kind: "artifact",
      label: "Artifact",
      metadata: { visualTier: "near" },
      layoutHint: { x: 2, y: -106, z: 31 },
    },
    {
      id: "concept:memory",
      type: "concept",
      kind: "memory",
      label: "Memory",
      metadata: { visualTier: "mid" },
      layoutHint: { x: -41, y: -92, z: -17 },
    },
    {
      id: "concept:context",
      type: "concept",
      kind: "context",
      label: "Context",
      metadata: { visualTier: "near" },
      layoutHint: { x: -92, y: -77, z: 12 },
    },
    {
      id: "concept:session",
      type: "concept",
      kind: "session",
      label: "Session",
      metadata: { visualTier: "far" },
      layoutHint: { x: -128, y: -54, z: -46 },
    },
    {
      id: "concept:turn",
      type: "concept",
      kind: "turn",
      label: "Turn",
      metadata: { visualTier: "mid" },
      layoutHint: { x: -122, y: -5, z: 34 },
    },
    {
      id: "concept:task",
      type: "concept",
      kind: "task",
      label: "Task",
      metadata: { visualTier: "near" },
      layoutHint: { x: -106, y: -30, z: 54 },
    },
    {
      id: "concept:workflow",
      type: "concept",
      kind: "workflow",
      label: "Workflow",
      metadata: { visualTier: "far" },
      layoutHint: { x: -71, y: -15, z: 64 },
    },
    {
      id: "concept:hook",
      type: "concept",
      kind: "hook",
      label: "Hook",
      metadata: { visualTier: "mid" },
      layoutHint: { x: 28, y: 92, z: 47 },
    },
    {
      id: "concept:tool",
      type: "concept",
      kind: "tool",
      label: "Tool",
      metadata: { visualTier: "near" },
      layoutHint: { x: 100, y: 84, z: -8 },
    },
    {
      id: "concept:trace",
      type: "concept",
      kind: "trace",
      label: "Trace",
      metadata: { visualTier: "far" },
      layoutHint: { x: 139, y: 67, z: 38 },
    },
    {
      id: "concept:state",
      type: "concept",
      kind: "state",
      label: "State",
      metadata: { visualTier: "mid" },
      layoutHint: { x: 120, y: -75, z: -43 },
    },
    {
      id: "relation:orchestrate",
      type: "relation",
      kind: "orchestration",
      label: "Orchestrate",
      metadata: { domain: "control", visualTier: "near" },
      layoutHint: { x: -4, y: -12, z: 70 },
    },
    {
      id: "relation:inspect",
      type: "relation",
      kind: "inspection",
      label: "Inspect",
      metadata: { domain: "quality", visualTier: "mid" },
      layoutHint: { x: 42, y: 12, z: -66 },
    },
    {
      id: "relation:promote",
      type: "relation",
      kind: "promotion",
      label: "Promote",
      metadata: { domain: "delivery", visualTier: "near" },
      layoutHint: { x: 78, y: -53, z: 52 },
    },
    {
      id: "concept:model",
      type: "concept",
      kind: "model",
      label: "Model",
      metadata: { visualTier: "near" },
      layoutHint: { x: -22, y: 14, z: 54 },
    },
    {
      id: "concept:provider",
      type: "concept",
      kind: "provider",
      label: "Provider",
      metadata: { visualTier: "mid" },
      layoutHint: { x: 14, y: 29, z: 61 },
    },
    {
      id: "concept:token",
      type: "concept",
      kind: "token",
      label: "Token",
      metadata: { visualTier: "far" },
      layoutHint: { x: 44, y: 43, z: 66 },
    },
    {
      id: "concept:ledger",
      type: "concept",
      kind: "ledger",
      label: "Ledger",
      metadata: { visualTier: "near" },
      layoutHint: { x: -46, y: 1, z: 49 },
    },
    {
      id: "concept:vector",
      type: "concept",
      kind: "vector",
      label: "Vector",
      metadata: { visualTier: "mid" },
      layoutHint: { x: 64, y: 1, z: -56 },
    },
    {
      id: "concept:snapshot",
      type: "concept",
      kind: "snapshot",
      label: "Snapshot",
      metadata: { visualTier: "mid" },
      layoutHint: { x: -8, y: -52, z: 58 },
    },
    {
      id: "concept:branch",
      type: "concept",
      kind: "branch",
      label: "Branch",
      metadata: { visualTier: "near" },
      layoutHint: { x: -82, y: -43, z: 62 },
    },
    {
      id: "concept:review-thread",
      type: "concept",
      kind: "review-thread",
      label: "Review thread",
      metadata: { visualTier: "far" },
      layoutHint: { x: -96, y: 2, z: -61 },
    },
    {
      id: "concept:check",
      type: "concept",
      kind: "check",
      label: "Check",
      metadata: { visualTier: "near" },
      layoutHint: { x: 45, y: -39, z: 55 },
    },
    {
      id: "concept:release",
      type: "concept",
      kind: "release",
      label: "Release",
      metadata: { visualTier: "mid" },
      layoutHint: { x: 102, y: -3, z: 59 },
    },
    {
      id: "concept:delta",
      type: "concept",
      kind: "delta",
      label: "Delta",
      metadata: { visualTier: "far" },
      layoutHint: { x: 124, y: 32, z: -63 },
    },
    {
      id: "concept:owner",
      type: "concept",
      kind: "owner",
      label: "Owner",
      metadata: { visualTier: "near" },
      layoutHint: { x: -16, y: 69, z: 55 },
    },
    {
      id: "concept:operator",
      type: "concept",
      kind: "operator",
      label: "Operator",
      metadata: { visualTier: "mid" },
      layoutHint: { x: -58, y: 46, z: 61 },
    },
    {
      id: "concept:signal",
      type: "concept",
      kind: "signal",
      label: "Signal",
      metadata: { visualTier: "far" },
      layoutHint: { x: 117, y: 76, z: -58 },
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
    { id: "ingest-source", source: "relation:ingest", target: "concept:source", relationKind: "reads", ordinal: 4 },
    { id: "source-event", source: "concept:source", target: "concept:event", relationKind: "emits", ordinal: 5 },
    { id: "event-schema", source: "concept:event", target: "concept:schema", relationKind: "conforms-to", ordinal: 6 },
    { id: "schema-index", source: "concept:schema", target: "concept:index", relationKind: "indexes", ordinal: 7 },
    { id: "index-query", source: "concept:index", target: "relation:query", relationKind: "serves", ordinal: 8 },
    { id: "query-evidence", source: "relation:query", target: "concept:evidence", relationKind: "returns", ordinal: 9 },
    { id: "evidence-policy", source: "concept:evidence", target: "concept:policy", relationKind: "checks", ordinal: 10 },
    { id: "policy-permission", source: "concept:policy", target: "concept:permission", relationKind: "permits", ordinal: 11 },
    { id: "permission-boundary", source: "concept:permission", target: "concept:boundary", relationKind: "guards", ordinal: 12 },
    { id: "review-contract", source: "relation:review", target: "concept:contract", relationKind: "reviews", ordinal: 13 },
    { id: "contract-registry", source: "concept:contract", target: "concept:registry", relationKind: "records", ordinal: 14 },
    { id: "registry-artifact", source: "concept:registry", target: "concept:artifact", relationKind: "stores", ordinal: 15 },
    { id: "handoff-artifact", source: "relation:handoff", target: "concept:artifact", relationKind: "hands-off", ordinal: 16 },
    { id: "handoff-memory", source: "relation:handoff", target: "concept:memory", relationKind: "summarizes", ordinal: 17 },
    { id: "memory-context", source: "concept:memory", target: "concept:context", relationKind: "restores", ordinal: 18 },
    { id: "context-session", source: "concept:context", target: "concept:session", relationKind: "bounds", ordinal: 19 },
    { id: "session-turn", source: "concept:session", target: "concept:turn", relationKind: "contains", ordinal: 20 },
    { id: "turn-task", source: "concept:turn", target: "concept:task", relationKind: "advances", ordinal: 21 },
    { id: "task-workflow", source: "concept:task", target: "concept:workflow", relationKind: "follows", ordinal: 22 },
    { id: "workflow-hook", source: "concept:workflow", target: "concept:hook", relationKind: "calls", ordinal: 23 },
    { id: "hook-tool", source: "concept:hook", target: "concept:tool", relationKind: "exposes", ordinal: 24 },
    { id: "tool-trace", source: "concept:tool", target: "concept:trace", relationKind: "produces", ordinal: 25 },
    { id: "trace-state", source: "concept:trace", target: "concept:state", relationKind: "observes", ordinal: 26 },
    { id: "state-queue", source: "concept:state", target: "component:queue", relationKind: "queues", ordinal: 27 },
    { id: "queue-controller", source: "component:queue", target: "component:controller", relationKind: "dispatches", ordinal: 28 },
    { id: "controller-cache", source: "component:controller", target: "component:cache", relationKind: "hydrates", ordinal: 29 },
    { id: "orchestrate-task", source: "relation:orchestrate", target: "concept:task", relationKind: "assigns", ordinal: 30 },
    { id: "task-branch", source: "concept:task", target: "concept:branch", relationKind: "tracks", ordinal: 31 },
    { id: "branch-review-thread", source: "concept:branch", target: "concept:review-thread", relationKind: "opens", ordinal: 32 },
    { id: "review-thread-check", source: "concept:review-thread", target: "concept:check", relationKind: "requires", ordinal: 33 },
    { id: "check-promote", source: "concept:check", target: "relation:promote", relationKind: "permits", ordinal: 34 },
    { id: "promote-release", source: "relation:promote", target: "relation:release", relationKind: "promotes", ordinal: 35 },
    { id: "release-signal", source: "relation:release", target: "concept:signal", relationKind: "emits", ordinal: 36 },
    { id: "signal-owner", source: "concept:signal", target: "concept:owner", relationKind: "alerts", ordinal: 37 },
    { id: "owner-operator", source: "concept:owner", target: "concept:operator", relationKind: "routes", ordinal: 38 },
    { id: "operator-ledger", source: "concept:operator", target: "concept:ledger", relationKind: "records", ordinal: 39 },
    { id: "ledger-snapshot", source: "concept:ledger", target: "concept:snapshot", relationKind: "captures", ordinal: 40 },
    { id: "snapshot-delta", source: "concept:snapshot", target: "concept:delta", relationKind: "compares", ordinal: 41 },
    { id: "delta-vector", source: "concept:delta", target: "concept:vector", relationKind: "indexes", ordinal: 42 },
    { id: "vector-model", source: "concept:vector", target: "concept:model", relationKind: "retrieves", ordinal: 43 },
    { id: "model-provider", source: "concept:model", target: "concept:provider", relationKind: "runs-on", ordinal: 44 },
    { id: "provider-token", source: "concept:provider", target: "concept:token", relationKind: "bills", ordinal: 45 },
    { id: "ingest-ledger", source: "relation:ingest", target: "concept:ledger", relationKind: "persists", ordinal: 46 },
    { id: "query-vector", source: "relation:query", target: "concept:vector", relationKind: "searches", ordinal: 47 },
    { id: "review-owner", source: "relation:review", target: "concept:owner", relationKind: "notifies", ordinal: 48 },
    { id: "handoff-snapshot", source: "relation:handoff", target: "concept:snapshot", relationKind: "preserves", ordinal: 49 },
    { id: "context-model", source: "concept:context", target: "concept:model", relationKind: "conditions", ordinal: 50 },
    { id: "workflow-operator", source: "concept:workflow", target: "concept:operator", relationKind: "coordinates", ordinal: 51 },
    { id: "hook-provider", source: "concept:hook", target: "concept:provider", relationKind: "calls", ordinal: 52 },
    { id: "tool-check", source: "concept:tool", target: "concept:check", relationKind: "verifies", ordinal: 53 },
    { id: "trace-delta", source: "concept:trace", target: "concept:delta", relationKind: "measures", ordinal: 54 },
    { id: "state-ledger", source: "concept:state", target: "concept:ledger", relationKind: "restores", ordinal: 55 },
    { id: "cache-token", source: "component:cache", target: "concept:token", relationKind: "caches", ordinal: 56 },
    { id: "controller-signal", source: "component:controller", target: "concept:signal", relationKind: "observes", ordinal: 57 },
    { id: "queue-owner", source: "component:queue", target: "concept:owner", relationKind: "assigns", ordinal: 58 },
    { id: "inspect-evidence", source: "relation:inspect", target: "concept:evidence", relationKind: "inspects", ordinal: 59 },
  ],
} as const satisfies GraphInput;

type RendererStatus = "failed" | "mounted" | "pending";
type TelemetryAvailability = "observed" | "pending" | "unavailable";
type ResolvedMode = "dark" | "light";

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

interface ObservedSelectionTransitionTelemetry {
  readonly availability: "observed";
  readonly generation: number;
  readonly nodeId: string | null;
  readonly source: GraphSelectionSource;
}

type SelectionTransitionTelemetry = ObservedSelectionTransitionTelemetry | UnavailableTelemetry;

interface ObservedNodeHoverTelemetry {
  readonly availability: "observed";
  readonly nodeId: string | null;
}

type NodeHoverTelemetry = ObservedNodeHoverTelemetry | UnavailableTelemetry;

interface ObservedInitialViewportTelemetry {
  readonly availability: "observed";
  /** Renderer transition that applied the fixture's initial zoom. */
  readonly generation: number;
}

type InitialViewportTelemetry = ObservedInitialViewportTelemetry | UnavailableTelemetry;

interface ObservedScreenPositionTelemetry {
  readonly availability: "observed";
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}

type ScreenPositionTelemetry = ObservedScreenPositionTelemetry | UnavailableTelemetry;

interface ObservedNodeProjectionTelemetry {
  readonly availability: "observed";
  readonly projections: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
  }[];
}

type NodeProjectionTelemetry = ObservedNodeProjectionTelemetry | UnavailableTelemetry;

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

type LabelVisibilityTelemetry = RenderTelemetry | {
  readonly availability: "pending";
  readonly reason: string;
};

interface MotionTelemetryFrame {
  readonly positions: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
  }[];
  readonly transition: GraphTransitionObservation;
}

interface ObservedMotionTelemetry extends MotionTelemetryFrame {
  readonly availability: "observed";
  readonly frames: readonly MotionTelemetryFrame[];
}

type MotionTelemetry = ObservedMotionTelemetry | UnavailableTelemetry;

interface AmbientMotionFrame extends GraphAmbientMotionObservation {
  /** Browser performance clock at the bounded diagnostic sample. */
  readonly sampledAtMs: number;
  readonly visibleLinkFlow: GraphAmbientMotionObservation["linkFlow"];
  readonly visibleParticles: GraphAmbientMotionObservation["particles"];
}

interface ObservedAmbientMotionTelemetry extends AmbientMotionFrame {
  readonly availability: "observed";
  readonly frames: readonly AmbientMotionFrame[];
}

type AmbientMotionTelemetry = ObservedAmbientMotionTelemetry | UnavailableTelemetry | {
  readonly availability: "pending";
  readonly reason: string | null;
};

interface RendererState {
  readonly reason: string | null;
  readonly status: RendererStatus;
}

interface DetailRelationship {
  readonly direction: "incoming" | "outgoing";
  readonly linkId: string;
  readonly nodeId: string;
  readonly nodeLabel: string;
  readonly ordinal: number;
  readonly relationKind: string;
}

const projectionSampleLimit = 180;
const renderObservationSampleLimit = 180;
// This is fixture-only evidence, never a renderer hot path. Keep it below the
// render cadence so hidden diagnostic serialization cannot perturb motion.
const ambientTelemetrySampleIntervalMs = 50;
const nodeIds = graphInput.nodes.map((node) => node.id);
const linkIds = graphInput.links.map((link) => link.id);
const nodesById = new Map<string, GraphNode>(graphInput.nodes.map((node) => [node.id, node]));
const masterNodeId = graphInput.nodes.find((node) => node.roles?.includes("master"))?.id ?? null;
const termSearchParameter = "term";

const graphPresentationByMode = {
  light: {
    linkColor: "#4b5a70",
  },
  dark: {
    linkColor: "#aaa7c2",
  },
} as const satisfies Record<
  ResolvedMode,
  {
    readonly linkColor: string;
  }
>;

const typeLabelVisibilityPolicy = {
  labelVisibility: {
    byType: {
      component: "hidden",
      relation: "always",
    },
  },
} as const;

function testIdForNode(prefix: string, nodeId: string): string {
  return `${prefix}-${nodeId.replace(/:/g, "-")}`;
}

function detailSummary(node: GraphNode): string {
  const explicitSummary = node.metadata?.summary;
  if (typeof explicitSummary === "string" && explicitSummary.trim().length > 0) return explicitSummary;

  const domain = node.metadata?.domain;
  const domainSuffix = typeof domain === "string" && domain.trim().length > 0
    ? ` in the ${domain} domain`
    : "";
  return `${node.label} is a ${node.kind} ${node.type}${domainSuffix}.`;
}

function detailRelationships(nodeId: string): readonly DetailRelationship[] {
  return graphInput.links
    .map((link, inputIndex) => {
      if (link.source !== nodeId && link.target !== nodeId) return null;
      const direction = link.source === nodeId ? "outgoing" as const : "incoming" as const;
      const relatedNodeId = direction === "outgoing" ? link.target : link.source;
      const relatedNode = nodesById.get(relatedNodeId);
      return {
        direction,
        linkId: link.id,
        nodeId: relatedNodeId,
        nodeLabel: relatedNode?.label ?? relatedNodeId,
        ordinal: link.ordinal ?? inputIndex,
        relationKind: link.relationKind,
      };
    })
    .filter((relationship): relationship is DetailRelationship => relationship !== null)
    .sort((left, right) => (
      left.ordinal - right.ordinal
      || left.nodeLabel.localeCompare(right.nodeLabel)
      || left.linkId.localeCompare(right.linkId)
    ));
}

function navigationTarget(nodeId: string, direction: -1 | 1): GraphNode | null {
  const currentIndex = graphInput.nodes.findIndex((node) => node.id === nodeId);
  if (currentIndex < 0 || graphInput.nodes.length === 0) return null;
  const nextIndex = (currentIndex + direction + graphInput.nodes.length) % graphInput.nodes.length;
  return graphInput.nodes[nextIndex] ?? null;
}

function termPath(nodeId: string | null): string {
  const location = new URL(window.location.href);
  if (nodeId) location.searchParams.set(termSearchParameter, nodeId);
  else location.searchParams.delete(termSearchParameter);
  return `${location.pathname}${location.search}${location.hash}`;
}

function selectedNodeMarkdown(node: GraphNode, relationships: readonly DetailRelationship[]): string {
  const relationshipLines = relationships.length > 0
    ? relationships.map((relationship) => (
      `- ${relationship.direction === "outgoing" ? "→" : "←"} ${relationship.nodeLabel} (${relationship.relationKind})`
    )).join("\n")
    : "- No direct graph connections.";
  return [
    `# ${node.label}`,
    "",
    detailSummary(node),
    "",
    `- Identity: \`${node.id}\``,
    `- Kind: ${node.kind}`,
    "",
    "## Connects to",
    relationshipLines,
  ].join("\n");
}

function applySystemPresentation(
  workbench: GraphWorkbench,
  mode: ResolvedMode,
  reducedMotion: boolean,
) {
  const selection = workbench.getSelectionState();
  const palette = graphPresentationByMode[mode];
  workbench.setPresentation({
    focusNodeId: selection.nodeId,
    linkDescriptors: Object.fromEntries(
      graphInput.links.map((link) => [link.id, { color: palette.linkColor }]),
    ),
    reducedMotion,
    selectedNodeIds: selection.nodeId ? [selection.nodeId] : [],
    theme: mode,
  });
}

function Telemetry({ testId, value }: { readonly testId: string; readonly value: unknown }) {
  const text = JSON.stringify(value);
  return (
    <output className="telemetry-value" data-testid={testId} data-value={text}>
      {text}
    </output>
  );
}

/**
 * Renderer projections are deliberately live: ambient motion means a finite
 * position must not be mistaken for a settled one. This probe only certifies
 * that a current renderer-owned coordinate exists; callers that need a fresh
 * click target read `graph-node-projections`, from the current bounded core
 * ambient snapshot rather than any Matrix or deterministic-layout fallback.
 */
function observeRenderedScreenPosition(
  nodeId: string,
  getPosition: () => { readonly x: number; readonly y: number } | null,
  publish: (telemetry: ScreenPositionTelemetry) => void,
): () => void {
  let animationFrame: number | null = null;
  let attempts = 0;
  let disposed = false;

  const sampleProjection = () => {
    if (disposed) return;
    if (attempts === 0) {
      publish({
        availability: "pending",
        reason: "Waiting for a finite renderer projection.",
      });
    }
    attempts += 1;
    const position = getPosition();
    const finite = position
      && Number.isFinite(position.x)
      && Number.isFinite(position.y);

    if (finite) {
      publish({
        availability: "observed",
        nodeId,
        x: position.x,
        y: position.y,
      });
      return;
    }

    if (attempts >= projectionSampleLimit) {
      publish({
        availability: "unavailable",
        reason: "A finite renderer projection was not observed.",
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

function ambientMotionFrame(observation: GraphAmbientMotionObservation, sampledAtMs: number): AmbientMotionFrame {
  const visibleLinkFlow = observation.linkFlow.filter(({ active, particleCount }) => active || particleCount > 0);
  return {
    ...observation,
    sampledAtMs,
    visibleLinkFlow,
    visibleParticles: observation.particles,
  };
}

export function BrowserGraphFixture() {
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const detailWasOpenRef = useRef(false);
  const graphHostRef = useRef<HTMLDivElement | null>(null);
  const initialTermAppliedRef = useRef(false);
  const matrixPaletteRef = useRef<HTMLElement | null>(null);
  const matrixReturnFocusRef = useRef<HTMLElement | null>(null);
  const matrixSearchInputRef = useRef<HTMLInputElement | null>(null);
  const matrixTriggerRef = useRef<HTMLButtonElement | null>(null);
  const motionFramesRef = useRef<MotionTelemetryFrame[]>([]);
  const motionGenerationRef = useRef<number | null>(null);
  const motionPublishedKeyRef = useRef("");
  const initialViewportGenerationRef = useRef<number | null>(null);
  const ambientFramesRef = useRef<AmbientMotionFrame[]>([]);
  const ambientPublishedKeyRef = useRef("");
  const reducedMotionRef = useRef(false);
  const workbenchRef = useRef<GraphWorkbench | null>(null);
  const rendererReadyRef = useRef(false);
  const [selectionState, setSelectionState] = useState<GraphSelectionState | null>(null);
  const [selectionTelemetry, setSelectionTelemetry] = useState<SelectionTelemetry>({
    availability: "pending",
    reason: null,
  });
  const [selectionTransitionTelemetry, setSelectionTransitionTelemetry] = useState<SelectionTransitionTelemetry>({
    availability: "pending",
    reason: "Waiting for a selection-triggered renderer transition.",
  });
  const [nodeHoverTelemetry, setNodeHoverTelemetry] = useState<NodeHoverTelemetry>({
    availability: "pending",
    reason: "Waiting for a renderer node-hover callback.",
  });
  const [initialViewportTelemetry, setInitialViewportTelemetry] = useState<InitialViewportTelemetry>({
    availability: "pending",
    reason: "Waiting for the fixture's initial viewport transition.",
  });
  const [selectedScreenPosition, setSelectedScreenPosition] = useState<ScreenPositionTelemetry>({
    availability: "pending",
    reason: null,
  });
  const [masterScreenPosition, setMasterScreenPosition] = useState<ScreenPositionTelemetry>({
    availability: "pending",
    reason: null,
  });
  const [nodeProjectionTelemetry, setNodeProjectionTelemetry] = useState<NodeProjectionTelemetry>({
    availability: "unavailable",
    reason: "Waiting for renderer projection support.",
  });
  const [renderTelemetry, setRenderTelemetry] = useState<RenderTelemetry>({
    availability: "pending",
    reason: null,
  });
  const [labelVisibilityTelemetry, setLabelVisibilityTelemetry] = useState<LabelVisibilityTelemetry>({
    availability: "pending",
    reason: "Waiting for a host label-visibility policy interaction.",
  });
  const [motionTelemetry, setMotionTelemetry] = useState<MotionTelemetry>({
    availability: "pending",
    reason: null,
  });
  const [ambientMotionTelemetry, setAmbientMotionTelemetry] = useState<AmbientMotionTelemetry>({
    availability: "pending",
    reason: "Waiting for live ambient renderer evidence.",
  });
  const [renderObservationRevision, setRenderObservationRevision] = useState(0);
  const [renderer, setRenderer] = useState<RendererState>({ status: "pending", reason: null });
  const [webglState, setWebglState] = useState("pending");
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [detailActionStatus, setDetailActionStatus] = useState<string | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [matrixQuery, setMatrixQuery] = useState("");
  const [hostUpdate, setHostUpdate] = useState({
    setInputSafe: false,
    collapseSafe: false,
    labelVisibilitySafe: false,
  });
  const rendererAvailable = renderer.status === "mounted" && webglState === "mounted";
  const observedSelection = selectionTelemetry.availability === "observed" ? selectionTelemetry : null;
  const filteredNodes = graphInput.nodes.filter((node) => {
    const query = matrixQuery.trim().toLocaleLowerCase();
    return query.length === 0 || [node.label, node.id, node.kind, node.type]
      .some((value) => value.toLocaleLowerCase().includes(query));
  });

  const selectNode = useCallback((nodeId: string | null, source: GraphSelectionSource) => {
    if (!rendererReadyRef.current) return;
    workbenchRef.current?.selectNode(nodeId, source);
  }, []);

  const selectTermFromLocation = useCallback((source: GraphSelectionSource) => {
    if (!rendererReadyRef.current || !workbenchRef.current) return;
    const rawTerm = new URL(window.location.href).searchParams.get(termSearchParameter);
    if (rawTerm === null && source === "deep-link") return;
    const nodeId = rawTerm && nodesById.has(rawTerm) ? rawTerm : null;
    if (rawTerm !== null && nodeId === null) {
      window.history.replaceState(window.history.state, "", termPath(null));
      if (source === "deep-link") return;
    }
    workbenchRef.current.selectNode(nodeId, source);
  }, []);

  const clearSelection = useCallback((source: GraphSelectionSource) => {
    setCollapsed(false);
    setHostUpdate((current) => ({ ...current, collapseSafe: true }));
    selectNode(null, source);
  }, [selectNode]);

  const updateReducedMotion = useCallback((nextReducedMotion: boolean) => {
    if (!rendererReadyRef.current) return;
    reducedMotionRef.current = nextReducedMotion;
    setReducedMotion(nextReducedMotion);
    workbenchRef.current?.setReducedMotion(nextReducedMotion);
  }, []);

  const applyTypeLabelVisibilityPolicy = useCallback(() => {
    const workbench = workbenchRef.current;
    if (!rendererReadyRef.current || !workbench) return;

    const selection = workbench.getSelectionState();
    const mode = resolvedMode ?? "dark";
    const palette = graphPresentationByMode[mode];
    workbench.setPresentation({
      ...typeLabelVisibilityPolicy,
      focusNodeId: selection.nodeId,
      linkDescriptors: Object.fromEntries(
        graphInput.links.map((link) => [link.id, { color: palette.linkColor }]),
      ),
      reducedMotion,
      selectedNodeIds: selection.nodeId ? [selection.nodeId] : [],
      theme: mode,
    });
    setSelectionState(workbench.getSelectionState());
    setRenderTelemetry({
      availability: "pending",
      reason: "Waiting for the host label-visibility renderer scene observation.",
    });
    const observation = workbench.getRenderObservation();
    setLabelVisibilityTelemetry(observation
      ? {
          availability: "observed",
          observation,
          observationScope: "renderer-live-data-and-scene-object-material",
        }
      : {
          availability: "unknown",
          reason: "The host label-visibility policy did not expose a live renderer observation.",
        });
    setRenderObservationRevision((revision) => revision + 1);
    setHostUpdate((current) => ({ ...current, labelVisibilitySafe: true }));
  }, [reducedMotion, resolvedMode]);
  const openMatrixPalette = useCallback(() => {
    matrixReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : matrixTriggerRef.current;
    setMatrixOpen(true);
    window.setTimeout(() => matrixSearchInputRef.current?.focus(), 0);
  }, []);

  const captureMatrixSearchInput = useCallback((input: HTMLInputElement | null) => {
    matrixSearchInputRef.current = input;
    if (input && matrixOpen) input.focus();
  }, [matrixOpen]);

  useEffect(() => {
    const restoreSelectionFromHistory = () => selectTermFromLocation("history");
    window.addEventListener("popstate", restoreSelectionFromHistory);
    return () => window.removeEventListener("popstate", restoreSelectionFromHistory);
  }, [selectTermFromLocation]);

  useEffect(() => {
    const openMatrix = (event: KeyboardEvent) => {
      const target = event.target;
      const isTextInput = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable);
      const commandShortcut = (event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k";
      const slashShortcut = event.key === "/" && !isTextInput && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!commandShortcut && !slashShortcut) return;
      event.preventDefault();
      openMatrixPalette();
    };
    document.addEventListener("keydown", openMatrix);
    return () => document.removeEventListener("keydown", openMatrix);
  }, [openMatrixPalette]);

  useEffect(() => {
    if (!matrixOpen) return undefined;

    const previouslyFocused = matrixReturnFocusRef.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : matrixTriggerRef.current);
    matrixSearchInputRef.current?.focus();
    const isolatePaletteKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setMatrixOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(matrixPaletteRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", isolatePaletteKeyboard, true);
    return () => {
      document.removeEventListener("keydown", isolatePaletteKeyboard, true);
      previouslyFocused?.focus();
    };
  }, [matrixOpen]);

  useEffect(() => {
    const host = graphHostRef.current;
    if (!host) return undefined;

    let animationFrame = 0;
    let colorSchemeMedia: MediaQueryList | null = null;
    let disposed = false;
    let fitFrame: number | null = null;
    let zoomFrame: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let syncColorScheme: ((event: MediaQueryListEvent) => void) | null = null;
    initialTermAppliedRef.current = false;

    const markRendererUnavailable = (reason: string, destroy = false) => {
      if (disposed) return;
      rendererReadyRef.current = false;
      setRenderer({ status: "failed", reason });
      setWebglState("unavailable");
      setSelectionState(null);
      setSelectionTelemetry({ availability: "unavailable", reason });
      setSelectionTransitionTelemetry({ availability: "unavailable", reason });
      setNodeHoverTelemetry({ availability: "unavailable", reason });
      initialViewportGenerationRef.current = null;
      setInitialViewportTelemetry({ availability: "unavailable", reason });
      setSelectedScreenPosition({ availability: "unavailable", reason });
      setMasterScreenPosition({ availability: "unavailable", reason });
      setNodeProjectionTelemetry({ availability: "unavailable", reason });
      setRenderTelemetry({ availability: "unavailable", reason });
      motionFramesRef.current = [];
      motionGenerationRef.current = null;
      motionPublishedKeyRef.current = "";
      ambientFramesRef.current = [];
      ambientPublishedKeyRef.current = "";
      setMotionTelemetry({ availability: "unavailable", reason });
      setAmbientMotionTelemetry({ availability: "unavailable", reason });
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
          onNodeHover: ({ nodeId }) => {
            if (!rendererReadyRef.current) return;
            setNodeHoverTelemetry({ availability: "observed", nodeId });
          },
          onSelectionChange: (event: GraphSelectionEvent) => {
            if (!rendererReadyRef.current) return;
            const next = workbenchRef.current?.getSelectionState();
            if (next) setSelectionState(next);
            setCollapsed(false);
            setDetailActionStatus(null);
            if (event.source !== "deep-link" && event.source !== "history") {
              const nextPath = termPath(event.nodeId);
              const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
              if (nextPath !== currentPath) {
                window.history.pushState({ graphWorkbenchTerm: event.nodeId }, "", nextPath);
              }
            }
            setSelectedScreenPosition({
              availability: "pending",
              reason: event.nodeId
                ? "Waiting for a finite renderer projection."
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
            // `onSelectionChange` runs after the workbench has started the
            // corresponding scene transition. Record that exact generation at
            // the event boundary so test evidence cannot mistake a prior
            // background retry for this mouse selection.
            const transition = workbenchRef.current?.getTransitionObservation();
            if (transition) {
              setSelectionTransitionTelemetry({
                availability: "observed",
                generation: transition.generation,
                nodeId: event.nodeId,
                source: event.source,
              });
            }
          },
        });
        workbenchRef.current = workbench;
        workbench.mount(host);
        const defaultReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        reducedMotionRef.current = defaultReducedMotion;
        setReducedMotion(defaultReducedMotion);
        colorSchemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
        const initialMode: ResolvedMode = colorSchemeMedia.matches ? "dark" : "light";
        setResolvedMode(initialMode);
        applySystemPresentation(workbench, initialMode, defaultReducedMotion);
        syncColorScheme = (event) => {
          const nextMode: ResolvedMode = event.matches ? "dark" : "light";
          setResolvedMode(nextMode);
          applySystemPresentation(workbench, nextMode, reducedMotionRef.current);
          setSelectionState(workbench.getSelectionState());
          setRenderTelemetry({
            availability: "pending",
            reason: "Waiting for the system-theme renderer scene observation.",
          });
          setRenderObservationRevision((revision) => revision + 1);
        };
        colorSchemeMedia.addEventListener("change", syncColorScheme);

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
            fitFrame = window.requestAnimationFrame(() => {
              fitFrame = window.requestAnimationFrame(() => {
                if (!disposed && rendererReadyRef.current) {
                  workbench.fit(0);
                  zoomFrame = window.requestAnimationFrame(() => {
                    if (disposed || !rendererReadyRef.current) return;
                    workbench.zoom(1.15);
                    const transition = workbench.getTransitionObservation();
                    if (!transition) {
                      markRendererUnavailable("The initial viewport zoom did not expose transition evidence.");
                      return;
                    }
                    initialViewportGenerationRef.current = transition.generation;
                    setInitialViewportTelemetry({
                      availability: "pending",
                      reason: "Waiting for the initial viewport zoom to settle.",
                    });
                  });
                }
              });
            });
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
      if (colorSchemeMedia && syncColorScheme) {
        colorSchemeMedia.removeEventListener("change", syncColorScheme);
      }
      if (fitFrame !== null) window.cancelAnimationFrame(fitFrame);
      if (zoomFrame !== null) window.cancelAnimationFrame(zoomFrame);
      window.cancelAnimationFrame(animationFrame);
      workbenchRef.current?.destroy();
      workbenchRef.current = null;
      initialTermAppliedRef.current = false;
    };
  }, [selectTermFromLocation]);

  useEffect(() => {
    if (initialViewportTelemetry.availability !== "observed" || initialTermAppliedRef.current) return;
    initialTermAppliedRef.current = true;
    selectTermFromLocation("deep-link");
  }, [initialViewportTelemetry, selectTermFromLocation]);

  useEffect(() => {
    const nodeId = observedSelection?.nodeId ?? null;
    if (renderer.status === "failed" || !rendererAvailable || !nodeId) return undefined;

    return observeRenderedScreenPosition(
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

    return observeRenderedScreenPosition(
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
          const transition = workbenchRef.current?.getTransitionObservation() ?? null;
          const transitionSettled = transition === null
            || (!transition.active && transition.progress === 1);
          if (allSceneObjectsObserved && transitionSettled) {
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

  useEffect(() => {
    if (renderer.status === "failed" || !rendererAvailable) return undefined;

    let animationFrame: number | null = null;
    let disposed = false;
    const sampleMotion = () => {
      if (disposed) return;
      const workbench = workbenchRef.current;
      const transition = workbench?.getTransitionObservation() ?? null;
      const position = workbench?.getNodeScreenPosition("profile:platform") ?? null;
      if (
        transition
        && position
        && Number.isFinite(position.x)
        && Number.isFinite(position.y)
      ) {
        if (transition.generation !== motionGenerationRef.current) {
          motionGenerationRef.current = transition.generation;
          motionFramesRef.current = [];
        }
        const liveFrame: MotionTelemetryFrame = {
          positions: [{ id: "profile:platform", x: position.x, y: position.y }],
          transition,
        };
        if (transition.active && transition.progress > 0 && transition.progress < 1) {
          motionFramesRef.current = [
            ...motionFramesRef.current.slice(-47),
            liveFrame,
          ];
        }
        const publishedKey = [
          transition.generation,
          transition.active,
          transition.progress.toFixed(4),
          position.x.toFixed(3),
          position.y.toFixed(3),
          motionFramesRef.current.length,
        ].join(":");
        if (publishedKey !== motionPublishedKeyRef.current) {
          motionPublishedKeyRef.current = publishedKey;
          setMotionTelemetry({
            availability: "observed",
            frames: motionFramesRef.current,
            ...liveFrame,
          });
        }
        const initialViewportGeneration = initialViewportGenerationRef.current;
        if (
          initialViewportGeneration !== null
          && transition.generation === initialViewportGeneration
          && !transition.active
          && transition.progress === 1
        ) {
          initialViewportGenerationRef.current = null;
          setInitialViewportTelemetry({
            availability: "observed",
            generation: transition.generation,
          });
        }
      } else {
        const publishedKey = transition ? "pending:projection" : "pending:transition";
        if (publishedKey !== motionPublishedKeyRef.current) {
          motionPublishedKeyRef.current = publishedKey;
          setMotionTelemetry({
            availability: "pending",
            reason: transition
              ? "Waiting for the profile node renderer projection."
              : "Waiting for live renderer transition evidence.",
          });
        }
      }
      animationFrame = window.requestAnimationFrame(sampleMotion);
    };

    animationFrame = window.requestAnimationFrame(sampleMotion);
    return () => {
      disposed = true;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [renderer.status, rendererAvailable]);

  useEffect(() => {
    if (renderer.status === "failed" || !rendererAvailable) return undefined;

    let animationFrame: number | null = null;
    let disposed = false;
    let lastAmbientSampleAt = Number.NEGATIVE_INFINITY;
    const publishAmbientMotion = (force = false) => {
      if (disposed) return;
      const observation = workbenchRef.current?.getAmbientMotionObservation() ?? null;
      if (observation) {
        const frame = ambientMotionFrame(observation, performance.now());
        const latest = ambientFramesRef.current.at(-1);
        const shouldStoreFrame = latest?.frame !== frame.frame;
        if (shouldStoreFrame) {
          ambientFramesRef.current = [...ambientFramesRef.current.slice(-5), frame];
        }
        const publishedKey = [
          frame.frame,
          frame.phase,
          frame.active,
          frame.paused,
          frame.reducedMotion,
          frame.focusNodeId ?? "",
          frame.visibleLinkFlow.map(({ id, particleCount }) => `${id}:${particleCount}`).join(","),
          frame.visibleParticles.length,
          // A reduced-motion graph may keep the same ambient frame while the
          // user orbits the camera. Include live projections so this fixture
          // does not publish a stale camera state after a real drag.
          frame.renderedScreenPositions.map(({ id, x, y }) => (
            `${id}:${x.toFixed(3)}:${y.toFixed(3)}`
          )).join(","),
        ].join(":");
        const shouldPublish = publishedKey !== ambientPublishedKeyRef.current
          && (force || shouldStoreFrame || frame.frame === 0 || frame.paused || frame.reducedMotion);
        if (shouldPublish) {
          ambientPublishedKeyRef.current = publishedKey;
          setNodeProjectionTelemetry({
            availability: "observed",
            projections: frame.renderedScreenPositions,
          });
          setAmbientMotionTelemetry({
            availability: "observed",
            frames: ambientFramesRef.current,
            ...frame,
          });
        }
      } else if (ambientPublishedKeyRef.current !== "pending") {
        ambientPublishedKeyRef.current = "pending";
        setNodeProjectionTelemetry({
          availability: "unavailable",
          reason: "The mounted renderer did not provide ambient motion evidence.",
        });
        setAmbientMotionTelemetry({
          availability: "pending",
          reason: "The mounted renderer did not provide ambient motion evidence.",
        });
      }
    };
    const sampleAmbientMotion = () => {
      if (disposed) return;
      const now = performance.now();
      if (now - lastAmbientSampleAt >= ambientTelemetrySampleIntervalMs) {
        lastAmbientSampleAt = now;
        publishAmbientMotion();
      }
      animationFrame = window.requestAnimationFrame(sampleAmbientMotion);
    };
    const observeVisibilityChange = () => publishAmbientMotion(true);

    animationFrame = window.requestAnimationFrame(sampleAmbientMotion);
    document.addEventListener("visibilitychange", observeVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", observeVisibilityChange);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [renderer.status, rendererAvailable]);

  const selectedNode = observedSelection?.nodeId ? nodesById.get(observedSelection.nodeId) ?? null : null;
  const selectedRelationships = useMemo(
    () => selectedNode ? detailRelationships(selectedNode.id) : [],
    [selectedNode],
  );
  const previousNode = selectedNode ? navigationTarget(selectedNode.id, -1) : null;
  const nextNode = selectedNode ? navigationTarget(selectedNode.id, 1) : null;

  const copySelectedNodeMarkdown = useCallback(async () => {
    if (!selectedNode) return;
    try {
      await navigator.clipboard.writeText(selectedNodeMarkdown(selectedNode, selectedRelationships));
      setDetailActionStatus("Markdown copied.");
    } catch {
      setDetailActionStatus("Clipboard access is unavailable.");
    }
  }, [selectedNode, selectedRelationships]);

  const shareSelectedNode = useCallback(async () => {
    if (!selectedNode) return;
    const url = new URL(termPath(selectedNode.id), window.location.origin).toString();
    const shareNavigator = navigator as Navigator & {
      readonly share?: (data: { readonly text: string; readonly title: string; readonly url: string }) => Promise<void>;
    };
    try {
      if (shareNavigator.share) {
        await shareNavigator.share({ title: selectedNode.label, text: detailSummary(selectedNode), url });
        setDetailActionStatus("Share sheet opened.");
      } else {
        await navigator.clipboard.writeText(url);
        setDetailActionStatus("Share link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setDetailActionStatus("Share cancelled.");
      } else {
        setDetailActionStatus("Sharing is unavailable.");
      }
    }
  }, [selectedNode]);

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
  const detailOpen = selectedNode !== null && !collapsed;
  const rendererStatus = renderer.status === "failed"
    ? "WebGL unavailable"
    : rendererAvailable
      ? "Renderer ready"
      : "Preparing renderer";

  useEffect(() => {
    const wasOpen = detailWasOpenRef.current;
    detailWasOpenRef.current = detailOpen;
    if (!wasOpen || detailOpen) return undefined;

    const activeElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusWasInDrawer = activeElement !== null
      && detailPanelRef.current?.contains(activeElement) === true;
    const focusWasLost = activeElement === null
      || activeElement === document.body
      || activeElement.closest("[inert]") !== null;
    if (!focusWasInDrawer && !focusWasLost) return undefined;

    const focusFrame = window.requestAnimationFrame(() => {
      const matrixIsOpen = matrixPaletteRef.current
        ?.closest<HTMLElement>(".command-backdrop")
        ?.dataset.open === "true";
      if (!matrixIsOpen) graphHostRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [detailOpen]);

  return (
    <main
      className="fixture-page"
      data-detail-open={detailOpen ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-resolved-mode={resolvedMode ?? undefined}
    >
      <h1 className="sr-only">Graph Workbench Browser Fixture</h1>

      <header className="fixture-chrome">
        <div className="app-identity">
          <span className="app-mark" aria-hidden="true">GW</span>
          <div>
            <strong>Graph Workbench</strong>
            <span>selection-driven fixture</span>
          </div>
        </div>

        <div className="status-cluster" aria-label="Fixture runtime status">
          <span className={`status-dot ${rendererAvailable ? "is-ready" : ""}`} />
          <span>{rendererStatus}</span>
          <span className="status-divider" aria-hidden="true" />
          <span>{reducedMotion ? "Reduced motion" : "Motion enabled"}</span>
        </div>

        <nav className="toolbar-actions" aria-label="Graph controls">
          <button
            aria-expanded={matrixOpen}
            aria-haspopup="dialog"
            aria-label="Open Matrix command palette"
            className="command-trigger"
            data-testid="matrix-command-trigger"
            onClick={() => {
              if (matrixOpen) setMatrixOpen(false);
              else openMatrixPalette();
            }}
            ref={matrixTriggerRef}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m20 20-4.6-4.6m2.1-5.15a7.25 7.25 0 1 1-14.5 0 7.25 7.25 0 0 1 14.5 0Z" />
            </svg>
            <span>Find node</span>
            <kbd>⌘K</kbd>
          </button>
          <button
            aria-label="Reset graph selection and layout"
            className="icon-control"
            data-testid="reset-layout"
            disabled={!rendererAvailable}
            onClick={() => selectNode(null, "programmatic")}
            title="Reset graph selection"
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4.75 9A8 8 0 1 1 4 13.45M4.75 9V4.5m0 4.5h4.5" />
            </svg>
          </button>
          <button
            aria-label="Hide component labels and keep relation labels visible"
            className="icon-control"
            data-testid="host-label-visibility-policy"
            disabled={!rendererAvailable}
            onClick={applyTypeLabelVisibilityPolicy}
            title="Apply type label visibility policy"
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h10m-10 6h16M17 9v6m-3-3h6" />
            </svg>
          </button>
          <label className="motion-toggle" title={reducedMotion ? "Enable motion" : "Reduce motion"}>
            <input
              aria-label={reducedMotion ? "Enable motion" : "Reduce motion"}
              checked={reducedMotion}
              data-testid="reduced-motion-toggle"
              disabled={!rendererAvailable}
              onChange={(event) => updateReducedMotion(event.target.checked)}
              type="checkbox"
            />
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 8.5h12M8.5 12h7M10 15.5h4M4 5h16v14H4z" />
            </svg>
          </label>
          <button
            aria-label="Clear selected node and return to the full graph"
            className="icon-control"
            data-testid="host-toggle-collapse"
            disabled={!selectedNode}
            onClick={() => clearSelection("close")}
            title="Clear selected node"
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M5 4h14v16H5zM14 4v16M9 9h1m-1 3h1m-1 3h1" />
            </svg>
          </button>
        </nav>
      </header>

      <section className="graph-stage" aria-label="Selection-driven graph workbench">
        <section className="graph-panel" aria-label="3D graph canvas">
          <div
            className="graph-shell"
            data-mounted={renderer.status}
            data-testid="graph-shell"
            data-webgl-state={webglState}
            ref={graphHostRef}
          />

          {renderer.status === "failed" && (
            <div className="renderer-failure" data-testid="graph-renderer-failure" role="alert">
              <span className="failure-mark" aria-hidden="true">!</span>
              <div>
                <strong>WebGL unavailable</strong>
                <span data-testid="graph-renderer-failure-reason">{renderer.reason}</span>
              </div>
            </div>
          )}

          <div className="canvas-probes" aria-live="polite">
            <span>{rendererAvailable
              ? selectedNode
                ? `${selectedNode.label} selected · ${observedSelection?.neighborNodeIds.length ?? 0} one-hop neighbors`
                : "Select a node on the canvas, or open Find node."
              : "Graph interactions are unavailable until the renderer is ready."}
            </span>
            <span aria-hidden="true">Drag to orbit · Scroll to zoom · Arrows to navigate</span>
          </div>
        </section>
      </section>

      <aside
        aria-hidden={!detailOpen}
        aria-label="Selected node details"
        className="detail-panel"
        data-active={detailOpen ? "true" : "false"}
        data-collapsed={collapsed ? "true" : "false"}
        data-testid="graph-detail-panel"
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
            data-testid="detail-drawer-close"
            disabled={!selectedNode}
            onClick={() => clearSelection("close")}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="detail-content">
          <p className="detail-summary">{selectedNode ? detailSummary(selectedNode) : ""}</p>
          <dl>
            <div><dt>Identity</dt><dd>{selectedNode?.id ?? "—"}</dd></div>
            <div><dt>Kind</dt><dd>{selectedNode?.kind ?? "—"}</dd></div>
            <div><dt>Neighbors</dt><dd>{observedSelection?.neighborNodeIds.length ?? "—"}</dd></div>
            <div><dt>Source</dt><dd>{observedSelection?.source ?? "—"}</dd></div>
          </dl>
          <section aria-label="Connected graph nodes" className="detail-relationships">
            <p className="panel-kicker">Connects to</p>
            {selectedRelationships.length > 0 ? (
              <div className="relationship-list">
                {selectedRelationships.map((relationship) => (
                  <button
                    aria-label={`${relationship.direction === "outgoing" ? "Open" : "Return to"} ${relationship.nodeLabel}`}
                    className="relationship-chip"
                    data-testid={testIdForNode("detail-relationship", relationship.nodeId)}
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
          <div className="detail-actions" aria-label="Selected node actions">
            <button
              data-testid="detail-share"
              disabled={!selectedNode}
              onClick={() => void shareSelectedNode()}
              type="button"
            >
              Share
            </button>
            <button
              data-testid="detail-copy-markdown"
              disabled={!selectedNode}
              onClick={() => void copySelectedNodeMarkdown()}
              type="button"
            >
              Copy markdown
            </button>
          </div>
          {detailActionStatus && (
            <p className="detail-action-status" role="status">{detailActionStatus}</p>
          )}
          <nav aria-label="Selected node navigation" className="detail-navigation">
            <button
              data-testid="detail-previous"
              disabled={!previousNode}
              onClick={() => previousNode && selectNode(previousNode.id, "navigation")}
              type="button"
            >
              <span>Previous</span>
              <strong>{previousNode?.label ?? "—"}</strong>
            </button>
            <button
              data-testid="detail-next"
              disabled={!nextNode}
              onClick={() => nextNode && selectNode(nextNode.id, "navigation")}
              type="button"
            >
              <span>Next</span>
              <strong>{nextNode?.label ?? "—"}</strong>
            </button>
          </nav>
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
      </aside>

      <div
        aria-hidden={!matrixOpen}
        className="command-backdrop"
        data-open={matrixOpen ? "true" : "false"}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) setMatrixOpen(false);
        }}
      >
        <section
          aria-label="Matrix node selector"
          aria-modal={matrixOpen || undefined}
          className="matrix-panel"
          data-testid="matrix-command-palette"
          inert={matrixOpen ? undefined : true}
          ref={matrixPaletteRef}
          role="dialog"
        >
          <div className="matrix-heading">
            <div>
              <p className="panel-kicker">Matrix selector</p>
              <h2>Find an input identity</h2>
            </div>
            <button aria-label="Close Matrix selector" onClick={() => setMatrixOpen(false)} type="button">×</button>
          </div>
          <label className="matrix-search">
            <span className="sr-only">Filter graph nodes</span>
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m20 20-4.6-4.6m2.1-5.15a7.25 7.25 0 1 1-14.5 0 7.25 7.25 0 0 1 14.5 0Z" />
            </svg>
            <input
              autoComplete="off"
              data-testid="matrix-input"
              onChange={(event) => setMatrixQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  matrixPaletteRef.current?.querySelector<HTMLButtonElement>(".matrix-row:not(:disabled)")?.focus();
                }
                if (event.key === "Enter" && rendererAvailable && filteredNodes[0]) {
                  event.preventDefault();
                  selectNode(filteredNodes[0].id, "matrix");
                  setMatrixOpen(false);
                }
              }}
              placeholder="Label, identity, or kind"
              ref={captureMatrixSearchInput}
              type="search"
              value={matrixQuery}
            />
            <kbd>ESC</kbd>
          </label>
          <div className="matrix-meta">
            <span>{filteredNodes.length} identities</span>
            <span>Shared graph + detail selection</span>
          </div>
          <div className="matrix-table" role="listbox" aria-label="Graph node identities">
            {filteredNodes.map((node) => {
              const selected = node.id === observedSelection?.nodeId;
              return (
                <button
                  aria-selected={selected}
                  className={`matrix-row ${selected ? "is-selected" : ""}`}
                  data-testid={testIdForNode("matrix-row", node.id)}
                  key={node.id}
                  onClick={() => {
                    selectNode(node.id, "matrix");
                    setMatrixOpen(false);
                  }}
                  onKeyDown={(event) => {
                    if (!["ArrowDown", "ArrowUp", "End", "Home"].includes(event.key)) return;
                    event.preventDefault();
                    const rows = [...(matrixPaletteRef.current?.querySelectorAll<HTMLButtonElement>(
                      ".matrix-row:not(:disabled)",
                    ) ?? [])];
                    const currentIndex = rows.indexOf(event.currentTarget);
                    const nextIndex = event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? rows.length - 1
                        : event.key === "ArrowDown"
                          ? (currentIndex + 1) % rows.length
                          : (currentIndex - 1 + rows.length) % rows.length;
                    rows[nextIndex]?.focus();
                  }}
                  disabled={!rendererAvailable}
                  role="option"
                  type="button"
                >
                  <span className="node-mark" aria-hidden="true" />
                  <span className="matrix-node-copy">
                    <strong>{node.label}</strong>
                    <small>{node.id}</small>
                  </span>
                  <span className="matrix-kind">{node.kind}</span>
                  <span className="matrix-state">{selected ? "Selected" : "Inspect"}</span>
                </button>
              );
            })}
            {filteredNodes.length === 0 && (
              <p className="matrix-empty">No matching graph identity.</p>
            )}
          </div>
          <p className="matrix-footer">Use ↑↓ to move, Enter to select, Escape to return to the graph.</p>
        </section>
      </div>

      <section className="telemetry-panel" aria-label="Deterministic fixture telemetry">
        <div className="telemetry-heading">
          <span className={`status-dot ${rendererAvailable ? "is-ready" : ""}`} />
          <strong>Evidence</strong>
          <span>{rendererAvailable ? "live renderer state" : rendererStatus}</span>
        </div>
        <div className="telemetry-grid">
          <Telemetry testId="graph-input-node-ids" value={nodeIds} />
          <Telemetry testId="graph-input-link-ids" value={linkIds} />
          <Telemetry testId="graph-rendered-node-ids" value={renderedNodeIdsTelemetry} />
          <Telemetry testId="graph-rendered-link-ids" value={renderedLinkIdsTelemetry} />
          <Telemetry testId="graph-render-observation" value={renderTelemetry} />
          <Telemetry testId="host-label-visibility-observation" value={labelVisibilityTelemetry} />
          <Telemetry testId="graph-selection" value={selectionTelemetry} />
          <Telemetry testId="graph-selection-transition" value={selectionTransitionTelemetry} />
          <Telemetry testId="graph-node-hover" value={nodeHoverTelemetry} />
          <Telemetry testId="graph-initial-viewport-ready" value={initialViewportTelemetry} />
          <Telemetry testId="matrix-selection" value={selectionTelemetry} />
          <Telemetry testId="reduced-motion-selection" value={{ ...selectionTelemetry, reducedMotion }} />
          <Telemetry testId="graph-settled-layout" value={layoutTelemetry} />
          <Telemetry testId="graph-selected-screen-position" value={selectedScreenPosition} />
          <Telemetry testId="graph-master-screen-position" value={masterScreenPosition} />
          <Telemetry testId="graph-node-projections" value={nodeProjectionTelemetry} />
          <Telemetry testId="graph-camera-state" value={selectedScreenPosition} />
          <Telemetry testId="camera-transition-status" value={selectedScreenPosition} />
          <Telemetry testId="graph-motion-observation" value={motionTelemetry} />
          <Telemetry testId="graph-ambient-motion" value={ambientMotionTelemetry} />
          <Telemetry testId="master-visibility" value={masterVisibilityTelemetry} />
          <Telemetry testId="selection-distance-visibility" value={selectionDistanceVisibilityTelemetry} />
          <Telemetry testId="host-update-status" value={hostUpdateTelemetry} />
          <Telemetry testId="collapse-status" value={{ collapsed, selectedNodeId: observedSelection?.nodeId ?? null }} />
        </div>
      </section>
    </main>
  );
}
