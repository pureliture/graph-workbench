import { expect, test, type CDPSession, type Page } from "@playwright/test";

const requiredNodeIds = ["relation:release", "component:api", "component:web", "profile:platform"];
const requiredLinkIds = ["release-api", "api-web", "release-profile", "profile-api"];
const fixtureNodeCount = 49;
const fixtureLinkCount = 60;
const canvasHitAttemptLimit = 3;
const canvasSelectionConfirmationTimeoutMs = 1_000;
const canvasHoverConfirmationTimeoutMs = 750;

interface ObservedSelectionState {
  readonly availability: "observed";
  readonly nodeId: string | null;
  readonly neighborNodeIds: readonly string[];
  readonly settled: true;
  readonly source: string;
}

interface ObservedNodeHoverState {
  readonly availability: "observed";
  readonly nodeId: string | null;
}

interface ObservedInitialViewportState {
  readonly availability: "observed";
  readonly generation: number;
}

interface ObservedSettledLayout {
  readonly availability: "observed";
  readonly nodeId: string | null;
  readonly neighborNodeIds: readonly string[];
  readonly seed: string;
  readonly settled: true;
  readonly targetNodePositions: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }[];
  readonly viewport: unknown;
}

interface ObservedScreenPosition {
  readonly availability: "observed";
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}

interface ObservedNodeProjections {
  readonly availability: "observed";
  readonly projections: readonly ObservedScreenPosition[];
}

interface MotionTelemetryFrame {
  readonly positions: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
  }[];
  readonly transition: {
    readonly active: boolean;
    readonly camera?: {
      readonly lookAt: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      };
      readonly position: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      };
    } | null;
    readonly durationMs: number;
    readonly generation: number;
    readonly nodePositions: readonly {
      readonly id: string;
      readonly x: number;
      readonly y: number;
      readonly z: number;
    }[];
    readonly progress: number;
    readonly reducedMotion: boolean;
  };
}

interface ObservedMotionTelemetry extends MotionTelemetryFrame {
  readonly availability: "observed";
  readonly frames: readonly MotionTelemetryFrame[];
}

type MotionTelemetry = ObservedMotionTelemetry | {
  readonly availability: "pending" | "unavailable";
  readonly reason: string | null;
};

interface AmbientPosition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface AmbientScreenPosition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

interface AmbientLinkFlow {
  readonly active: boolean;
  readonly id: string;
  readonly particleCount: number;
}

interface AmbientLinkEndpointBoundary {
  readonly endpointAtSilhouetteBoundary: boolean;
  readonly exteriorProbeInside: boolean;
  readonly interiorProbeInside: boolean;
  readonly silhouette: DefaultNodeSilhouette;
}

interface AmbientLinkEndpoint {
  readonly end: AmbientPosition;
  readonly id: string;
  readonly sourceId: string;
  readonly sourceBoundary?: AmbientLinkEndpointBoundary | null;
  readonly start: AmbientPosition;
  readonly targetId: string;
  readonly targetBoundary?: AmbientLinkEndpointBoundary | null;
}

interface AmbientParticle extends AmbientPosition {
  readonly linkId: string;
  readonly phase: number;
  readonly screenX: number | null;
  readonly screenY: number | null;
}

interface AmbientMotionFrame {
  readonly active: boolean;
  readonly anchorNodePositions: readonly AmbientPosition[];
  readonly elapsedMs: number;
  readonly focusNodeId: string | null;
  readonly frame: number;
  readonly linkEndpoints: readonly AmbientLinkEndpoint[];
  readonly linkFlow: readonly AmbientLinkFlow[];
  readonly particles: readonly AmbientParticle[];
  readonly paused: boolean;
  readonly phase: number;
  readonly reducedMotion: boolean;
  readonly renderedNodePositions: readonly AmbientPosition[];
  readonly renderedScreenPositions: readonly AmbientScreenPosition[];
  readonly sampledAtMs: number;
  readonly visibleLinkFlow: readonly AmbientLinkFlow[];
  readonly visibleParticles: readonly AmbientParticle[];
}

interface ObservedAmbientMotion extends AmbientMotionFrame {
  readonly availability: "observed";
  readonly frames: readonly AmbientMotionFrame[];
}

type AmbientMotion = ObservedAmbientMotion | {
  readonly availability: "pending" | "unavailable";
  readonly reason: string | null;
};

interface RenderVisualCue {
  readonly contrast?: number;
  readonly labelCue?: "muted" | "primary" | "visible";
  readonly opacity: number;
  readonly opacityFloor?: number;
  readonly width?: number;
}

interface RenderObjectObservation {
  readonly id: string;
  readonly minimumVisibleMaterialOpacity: number | null;
  readonly objectTracked: boolean;
  readonly objectVisible: boolean | null;
  readonly sceneAttached: boolean;
  readonly visibleMaterialLineWidths: readonly number[];
  readonly visibleMaterialOpacities: readonly number[];
  readonly visual: RenderVisualCue;
}

interface RenderTransformObservation {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface RenderNodeLabelObservation extends RenderObjectObservation {
  readonly position: RenderTransformObservation | null;
  readonly scale: RenderTransformObservation | null;
}

type DefaultNodeSilhouette = "capsule" | "circle" | "disk" | "dot";

interface RenderDefaultNodeBodyObservation {
  readonly kind: "flat-2.5d";
  readonly silhouette: DefaultNodeSilhouette;
}

interface RenderNodeObservation extends RenderObjectObservation {
  readonly bodyMaterialColor: string | null;
  readonly defaultBody?: RenderDefaultNodeBodyObservation | null;
  readonly label: RenderNodeLabelObservation;
  readonly worldPosition: RenderTransformObservation;
  readonly worldScale: RenderTransformObservation | null;
}

interface RenderLinkObservation extends RenderObjectObservation {
  readonly curvePointCount: number | null;
  readonly depthWriteEnabled: boolean | null;
}

interface ObservedRenderTelemetry {
  readonly availability: "observed";
  readonly observation: {
    readonly linkIds: readonly string[];
    readonly links: readonly RenderLinkObservation[];
    readonly nodeIds: readonly string[];
    readonly nodes: readonly RenderNodeObservation[];
  };
  readonly observationScope: "renderer-live-data-and-scene-object-material";
}

interface ObservedRenderedIds {
  readonly availability: "observed";
  readonly ids: readonly string[];
  readonly observationScope: "scene-attached-render-object";
}

interface ObservedMasterVisibility extends Omit<RenderObjectObservation, "id"> {
  readonly availability: "observed";
  readonly nodeId: string;
  readonly observationScope: "scene-object-and-material-not-rendered-pixels";
  readonly pixelVisibility: "not-observed";
}

interface ObservedSelectionDistanceVisibility {
  readonly availability: "observed";
  readonly distant: readonly (Omit<RenderObjectObservation, "id"> & { readonly nodeId: string })[];
  readonly links: readonly (Omit<RenderObjectObservation, "id"> & { readonly linkId: string })[];
  readonly neighbors: readonly (Omit<RenderObjectObservation, "id"> & { readonly nodeId: string })[];
  readonly observationScope: "scene-object-and-material-not-rendered-pixels";
  readonly selected: Omit<RenderObjectObservation, "id"> & { readonly nodeId: string };
}

interface UnavailableTelemetry {
  readonly availability: "unavailable";
  readonly reason: string | null;
}

async function readTelemetry<T>(page: Page, testId: string): Promise<T> {
  const locator = page.getByTestId(testId);
  await expect(locator).toBeVisible();
  const text = await locator.textContent();
  if (!text) throw new Error(`${testId} telemetry is empty`);
  return JSON.parse(text) as T;
}

async function waitForSelection(page: Page, source: string): Promise<ObservedSelectionState> {
  await expect.poll(async () => readTelemetry<ObservedSelectionState>(page, "graph-selection")).toMatchObject({
    availability: "observed",
    settled: true,
    source,
  });
  return readTelemetry<ObservedSelectionState>(page, "graph-selection");
}

async function waitForSettledLayout(page: Page, nodeId?: string): Promise<ObservedSettledLayout> {
  await expect.poll(async () => {
    const candidate = await readTelemetry<ObservedSettledLayout>(page, "graph-settled-layout");
    return candidate.availability === "observed"
      && candidate.seed.length > 0
      && candidate.settled
      && Array.isArray(candidate.targetNodePositions)
      && (nodeId === undefined || candidate.nodeId === nodeId);
  }).toBe(true);
  const layout = await readTelemetry<ObservedSettledLayout>(page, "graph-settled-layout");
  expect(layout.targetNodePositions).toHaveLength(fixtureNodeCount);
  expect(layout.targetNodePositions.map((node) => node.id)).toEqual(expect.arrayContaining(requiredNodeIds));
  expect(layout.viewport).toBeTruthy();
  return layout;
}

async function waitForNodeProjection(page: Page, nodeId: string): Promise<ObservedScreenPosition> {
  let projection: ObservedScreenPosition | null = null;
  await expect.poll(async () => {
    const candidate = await readTelemetry<ObservedNodeProjections>(page, "graph-node-projections");
    if (candidate.availability !== "observed") return false;
    projection = candidate.projections.find(({ id }) => id === nodeId) ?? null;
    return projection !== null
      && Number.isFinite(projection.x)
      && Number.isFinite(projection.y);
  }).toBe(true);
  if (!projection) throw new Error(`${nodeId} did not have a stable live screen projection.`);
  const canvas = page.getByTestId("graph-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("graph canvas does not have a measurable bounding box");
  expect(projection.x).toBeGreaterThan(0);
  expect(projection.x).toBeLessThan(box.width);
  expect(projection.y).toBeGreaterThan(0);
  expect(projection.y).toBeLessThan(box.height);
  return projection;
}

async function waitForEveryNodeProjectionWithinCanvas(page: Page): Promise<readonly ObservedScreenPosition[]> {
  let observed: readonly ObservedScreenPosition[] = [];
  await expect.poll(async () => {
    const candidate = await readTelemetry<ObservedNodeProjections>(page, "graph-node-projections");
    const box = await page.getByTestId("graph-canvas").boundingBox();
    if (candidate.availability !== "observed" || !box) return false;
    const uniqueIds = new Set(candidate.projections.map(({ id }) => id));
    const everyProjectionIsVisible = candidate.projections.every(({ x, y }) => (
      Number.isFinite(x)
      && Number.isFinite(y)
      && x > 0
      && x < box.width
      && y > 0
      && y < box.height
    ));
    if (candidate.projections.length === fixtureNodeCount && uniqueIds.size === fixtureNodeCount && everyProjectionIsVisible) {
      observed = candidate.projections;
      return true;
    }
    return false;
  }).toBe(true);
  return observed;
}

async function waitForProjectedNodeSeparation(
  page: Page,
  nodeId: string,
  minimumDistancePx: number,
): Promise<ObservedScreenPosition> {
  await waitForNodeProjection(page, nodeId);
  const telemetry = await readTelemetry<ObservedNodeProjections>(page, "graph-node-projections");
  if (telemetry.availability !== "observed") throw new Error("Live graph node projections were unavailable.");
  const projection = telemetry.projections.find(({ id }) => id === nodeId);
  if (!projection || !Number.isFinite(projection.x) || !Number.isFinite(projection.y)) {
    throw new Error(`${nodeId} did not have a fresh live screen projection.`);
  }
  const nearest = telemetry.projections
    .filter(({ id }) => id !== nodeId)
    .reduce((minimum, candidate) => Math.min(
      minimum,
      Math.hypot(projection.x - candidate.x, projection.y - candidate.y),
    ), Number.POSITIVE_INFINITY);
  expect(nearest).toBeGreaterThan(minimumDistancePx);
  return projection;
}

async function waitForCameraObservation(page: Page, nodeId: string): Promise<ObservedScreenPosition> {
  await expect.poll(async () => readTelemetry<ObservedScreenPosition>(page, "graph-camera-state")).toMatchObject({
    availability: "observed",
    nodeId,
    x: expect.any(Number),
    y: expect.any(Number),
  });
  return readTelemetry<ObservedScreenPosition>(page, "graph-camera-state");
}

async function waitForRenderObservation(page: Page): Promise<ObservedRenderTelemetry> {
  await expect.poll(async () => readTelemetry<ObservedRenderTelemetry>(page, "graph-render-observation"))
    .toMatchObject({
      availability: "observed",
      observationScope: "renderer-live-data-and-scene-object-material",
      observation: {
        nodeIds: expect.any(Array),
        linkIds: expect.any(Array),
        nodes: expect.any(Array),
        links: expect.any(Array),
      },
    });
  return readTelemetry<ObservedRenderTelemetry>(page, "graph-render-observation");
}

async function waitForRenderedIds(page: Page, testId: string): Promise<ObservedRenderedIds> {
  await expect.poll(async () => readTelemetry<ObservedRenderedIds>(page, testId)).toMatchObject({
    availability: "observed",
    ids: expect.any(Array),
    observationScope: "scene-attached-render-object",
  });
  return readTelemetry<ObservedRenderedIds>(page, testId);
}

function matrixRowTestId(nodeId: string): string {
  return `matrix-row-${nodeId.replace(/:/g, "-")}`;
}

async function matrixPaletteIsOpen(page: Page): Promise<boolean> {
  return page.getByTestId("matrix-command-palette").evaluate(
    (element) => element.parentElement?.getAttribute("data-open") === "true",
  );
}

async function selectMatrixNode(page: Page, nodeId: string): Promise<void> {
  const row = page.getByTestId(matrixRowTestId(nodeId));
  if (!await matrixPaletteIsOpen(page)) await openMatrixPalette(page);
  await row.click();
}

async function openMatrixPalette(page: Page): Promise<void> {
  const palette = page.getByTestId("matrix-command-palette");
  if (await matrixPaletteIsOpen(page)) return;
  await page.getByTestId("matrix-command-trigger").click();
  await expect.poll(() => matrixPaletteIsOpen(page)).toBe(true);
  await expect(palette).toBeVisible();
}

async function waitForMotionFrames(page: Page, afterGeneration?: number): Promise<readonly MotionTelemetryFrame[]> {
  let observed: readonly MotionTelemetryFrame[] = [];
  await expect.poll(async () => {
    const candidate = await readTelemetry<MotionTelemetry>(page, "graph-motion-observation");
    if (candidate.availability !== "observed") return false;
    const activeFrames = candidate.frames
      .filter((frame) => (
        frame.transition.active
        && frame.transition.progress > 0
        && frame.transition.progress < 1
        && (afterGeneration === undefined || frame.transition.generation > afterGeneration)
      ));
    if (activeFrames.length > 0) observed = activeFrames;
    const generation = activeFrames[0]?.transition.generation;
    return activeFrames.length > 0
      && !candidate.transition.active
      && candidate.transition.progress === 1
      && candidate.transition.generation === generation;
  }).toBe(true);
  if (observed.length === 0) throw new Error("An active renderer motion frame was not observed.");
  return observed;
}

async function waitForSelectionTransitionGeneration(
  page: Page,
  nodeId: string,
  source: string,
  previousGeneration: number,
): Promise<number> {
  let observed: number | null = null;
  await expect.poll(async () => {
    const candidate = await readTelemetry<{
      readonly availability: "observed";
      readonly generation: number;
      readonly nodeId: string | null;
      readonly source: string;
    }>(page, "graph-selection-transition");
    if (
      candidate.availability !== "observed"
      || candidate.nodeId !== nodeId
      || candidate.source !== source
      || candidate.generation <= previousGeneration
    ) return false;
    observed = candidate.generation;
    return true;
  }).toBe(true);
  if (observed === null) throw new Error("The confirmed canvas selection did not expose its transition generation.");
  return observed;
}

async function waitForMotionFramesForGeneration(
  page: Page,
  generation: number,
): Promise<readonly MotionTelemetryFrame[]> {
  let observed: readonly MotionTelemetryFrame[] = [];
  await expect.poll(async () => {
    const candidate = await readTelemetry<MotionTelemetry>(page, "graph-motion-observation");
    if (candidate.availability !== "observed") return false;
    const activeFrames = candidate.frames.filter((frame) => (
      frame.transition.generation === generation
      && frame.transition.active
      && frame.transition.progress > 0
      && frame.transition.progress < 1
    ));
    // A throttled headless renderer can cross the full 420ms transition in the
    // frame after its first in-flight sample. The path proof below combines
    // the pre-transition frame, at least one real in-flight sample, and the
    // settled frame, so it does not require a second scheduler-dependent sample.
    const distinctActiveFrames = activeFrames.filter((frame, index) => (
      activeFrames.findIndex((candidate) => (
        candidate.transition.progress === frame.transition.progress
      )) === index
    ));
    if (distinctActiveFrames.length >= 1) observed = distinctActiveFrames;
    return distinctActiveFrames.length >= 1
      && !candidate.transition.active
      && candidate.transition.progress === 1
      && candidate.transition.generation === generation;
  }).toBe(true);
  if (observed.length < 1) {
    throw new Error(`Motion generation ${generation} did not expose an active frame.`);
  }
  return observed;
}

async function waitForMotionSettled(page: Page, generation?: number): Promise<ObservedMotionTelemetry> {
  let observed: ObservedMotionTelemetry | null = null;
  await expect.poll(async () => {
    const candidate = await readTelemetry<MotionTelemetry>(page, "graph-motion-observation");
    if (candidate.availability !== "observed") return false;
    const settled = !candidate.transition.active
      && candidate.transition.progress === 1
      && (generation === undefined || candidate.transition.generation === generation);
    if (settled) observed = candidate;
    return settled;
  }).toBe(true);
  if (!observed) throw new Error("A settled renderer motion observation was not observed.");
  return observed;
}

async function waitForInitialViewportReady(page: Page): Promise<ObservedInitialViewportState> {
  let observed: ObservedInitialViewportState | null = null;
  await expect.poll(async () => {
    const candidate = await readTelemetry<ObservedInitialViewportState>(page, "graph-initial-viewport-ready");
    if (candidate.availability !== "observed") return false;
    observed = candidate;
    return true;
  }).toBe(true);
  if (!observed) throw new Error("The fixture initial viewport did not settle.");
  return observed;
}

async function waitForNewerMotionSettled(page: Page, afterGeneration: number): Promise<ObservedMotionTelemetry> {
  let observed: ObservedMotionTelemetry | null = null;
  await expect.poll(async () => {
    const candidate = await readTelemetry<MotionTelemetry>(page, "graph-motion-observation");
    if (candidate.availability !== "observed") return false;
    const settled = !candidate.transition.active
      && candidate.transition.progress === 1
      && candidate.transition.generation > afterGeneration;
    if (settled) observed = candidate;
    return settled;
  }).toBe(true);
  if (!observed) throw new Error("A newer settled renderer motion observation was not observed.");
  return observed;
}

async function waitForAmbientMotion(
  page: Page,
  predicate: (motion: ObservedAmbientMotion) => boolean = () => true,
): Promise<ObservedAmbientMotion> {
  let observed: ObservedAmbientMotion | null = null;
  await expect.poll(async () => {
    const candidate = await readTelemetry<AmbientMotion>(page, "graph-ambient-motion");
    if (candidate.availability !== "observed" || !predicate(candidate)) return false;
    observed = candidate;
    return true;
  }).toBe(true);
  if (!observed) throw new Error("Live ambient motion telemetry was not observed.");
  return observed;
}

async function waitForAmbientMotionAfter(
  page: Page,
  afterFrame: number,
  minimumFrameDelta = 1,
  predicate: (motion: ObservedAmbientMotion) => boolean = () => true,
): Promise<ObservedAmbientMotion> {
  return waitForAmbientMotion(
    page,
    (motion) => motion.frame >= afterFrame + minimumFrameDelta && predicate(motion),
  );
}

async function waitForAmbientMotionAfterWhileHovering(
  page: Page,
  nodeId: string,
  afterFrame: number,
  minimumFrameDelta = 1,
  predicate: (motion: ObservedAmbientMotion) => boolean = () => true,
): Promise<ObservedAmbientMotion> {
  let observed: ObservedAmbientMotion | null = null;
  await expect.poll(async () => {
    // Ambient/parallax motion can move a small node out from under a stationary
    // pointer. Re-project through the real canvas while sampling the hover
    // interaction, rather than turning this into a programmatic focus test.
    await hoverProjectedCanvasNode(page, nodeId);
    const candidate = await readTelemetry<AmbientMotion>(page, "graph-ambient-motion");
    if (
      candidate.availability !== "observed"
      || candidate.frame < afterFrame + minimumFrameDelta
      || !predicate(candidate)
    ) return false;
    observed = candidate;
    return true;
  }).toBe(true);
  if (!observed) throw new Error("Live hovered ambient motion telemetry was not observed.");
  return observed;
}

function ambientPosition(frame: AmbientMotionFrame, nodeId: string, field: "anchorNodePositions" | "renderedNodePositions") {
  const position = frame[field].find(({ id }) => id === nodeId);
  if (!position) throw new Error(`${nodeId} was absent from ambient ${field}.`);
  return position;
}

function ambientScreenPosition(frame: AmbientMotionFrame, nodeId: string) {
  const position = frame.renderedScreenPositions.find(({ id }) => id === nodeId);
  if (!position) throw new Error(`${nodeId} was absent from ambient rendered screens.`);
  return position;
}

function expectDefaultLinkEndpointsAtFlatSilhouetteBoundaries(
  frame: AmbientMotionFrame,
  render: ObservedRenderTelemetry["observation"],
  linkIds: readonly string[],
  focusedNodeId?: string,
): void {
  const endpointsById = new Map(frame.linkEndpoints.map((endpoint) => [endpoint.id, endpoint]));
  const linksById = new Map(render.links.map((link) => [link.id, link]));
  const nodesById = new Map(render.nodes.map((node) => [node.id, node]));
  for (const linkId of linkIds) {
    const link = linksById.get(linkId);
    if (!link) throw new Error(`${linkId} was absent from the live renderer observation.`);
    // This fixture mounts only renderer-owned default Lines, so a missing
    // tessellated curve observation is a failed default-renderer contract.
    if (typeof link.curvePointCount !== "number") {
      throw new Error(`${linkId} did not expose a live default Line curve.`);
    }
    expect(link.curvePointCount).toBeGreaterThanOrEqual(2);
    expect(link).toMatchObject({ objectTracked: true, objectVisible: true, sceneAttached: true });
    const endpoint = endpointsById.get(linkId);
    if (!endpoint) throw new Error(`${linkId} did not expose live default Line endpoints.`);
    if (focusedNodeId) {
      expect([endpoint.sourceId, endpoint.targetId]).toContain(focusedNodeId);
    }
    for (const [end, nodeId, boundary] of [
      ["source", endpoint.sourceId, endpoint.sourceBoundary],
      ["target", endpoint.targetId, endpoint.targetBoundary],
    ] as const) {
      const node = nodesById.get(nodeId);
      if (!node) throw new Error(`${nodeId} was absent from the live renderer observation.`);
      if (!node.defaultBody) {
        throw new Error(`${nodeId} did not expose a renderer-owned default flat body in this fixture.`);
      }
      if (!boundary) {
        throw new Error(`${linkId} did not expose ${end} silhouette boundary evidence.`);
      }
      expect(node).toMatchObject({ objectTracked: true, objectVisible: true, sceneAttached: true });
      expect(boundary).toEqual({
        silhouette: node.defaultBody.silhouette,
        endpointAtSilhouetteBoundary: true,
        interiorProbeInside: true,
        exteriorProbeInside: false,
      });
    }
  }
}

function averageScreenMotion(
  before: AmbientMotionFrame,
  after: AmbientMotionFrame,
  nodeIds: readonly string[],
): { readonly x: number; readonly y: number } {
  const vectors = nodeIds.map((nodeId) => {
    const start = ambientScreenPosition(before, nodeId);
    const end = ambientScreenPosition(after, nodeId);
    return { x: end.x - start.x, y: end.y - start.y };
  });
  return {
    x: vectors.reduce((total, vector) => total + vector.x, 0) / vectors.length,
    y: vectors.reduce((total, vector) => total + vector.y, 0) / vectors.length,
  };
}

function dotProduct(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return (left.x * right.x) + (left.y * right.y);
}

function profileScreenPosition(telemetry: MotionTelemetryFrame) {
  const position = telemetry.positions.find(({ id }) => id === "profile:platform");
  if (!position) throw new Error("Profile screen position was absent from live motion telemetry.");
  return position;
}

function nodeWorldPosition(telemetry: MotionTelemetryFrame, nodeId: string) {
  const position = telemetry.transition.nodePositions.find(({ id }) => id === nodeId);
  if (!position) throw new Error(`${nodeId} world position was absent from live motion telemetry.`);
  return position;
}

function distanceBetween(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function particleScreenPosition(particle: AmbientParticle): { readonly x: number; readonly y: number } {
  if (
    particle.screenX === null
    || particle.screenY === null
    || ![particle.screenX, particle.screenY].every((coordinate) => Number.isFinite(coordinate))
  ) {
    throw new Error(`${particle.id} did not expose a finite renderer screen position.`);
  }
  return { x: particle.screenX, y: particle.screenY };
}

function particlesForLink(frame: AmbientMotionFrame, linkId: string): readonly AmbientParticle[] {
  return frame.visibleParticles.filter((particle) => particle.linkId === linkId);
}

function persistentParticleScreenMotionByLink(
  before: AmbientMotionFrame,
  after: AmbientMotionFrame,
  linkIds: readonly string[],
): readonly { readonly id: string; readonly maximumDistance: number }[] {
  return linkIds.map((linkId) => {
    const first = particlesForLink(before, linkId);
    const laterById = new Map(particlesForLink(after, linkId).map((particle) => [particle.id, particle]));
    if (first.length === 0) throw new Error(`${linkId} did not expose any visible flow particles.`);
    const maximumDistance = Math.max(...first.map((particle) => {
      const later = laterById.get(particle.id);
      if (!later) throw new Error(`${particle.id} did not persist across flow samples.`);
      return distanceBetween(particleScreenPosition(particle), particleScreenPosition(later));
    }));
    return { id: linkId, maximumDistance };
  });
}

function flowParticleDensity(frame: AmbientMotionFrame, linkIds: readonly string[]): number {
  const flowById = new Map(frame.visibleLinkFlow.map((flow) => [flow.id, flow]));
  const counts = linkIds.map((linkId) => {
    const flow = flowById.get(linkId);
    if (!flow || !flow.active) throw new Error(`${linkId} was not an active visible flow.`);
    return flow.particleCount;
  });
  return counts.reduce((total, count) => total + count, 0) / counts.length;
}

function expectFocusedFlowHasScreenHierarchy(
  before: AmbientMotionFrame,
  after: AmbientMotionFrame,
  focusedLinkIds: readonly string[],
  canvasShortEdge: number,
): void {
  // Density is read per active link instead of from total particles so this
  // continues to describe the interaction hierarchy as graph degree changes.
  expect(flowParticleDensity(before, focusedLinkIds)).toBeGreaterThanOrEqual(2);
  expect(flowParticleDensity(after, focusedLinkIds)).toBeGreaterThanOrEqual(2);

  const normalizedMotion = persistentParticleScreenMotionByLink(before, after, focusedLinkIds)
    .map(({ maximumDistance }) => maximumDistance / canvasShortEdge);
  // Every incident flow needs a visible screen-space advance. This is a
  // viewport-relative threshold, not a captured coordinate or screenshot.
  expect(Math.min(...normalizedMotion)).toBeGreaterThan(0.004);
}

function expectFocusedParticleScreenMotion(
  before: AmbientMotionFrame,
  after: AmbientMotionFrame,
  focusedLinkIds: readonly string[],
  minimumDiscernibleDistance: number,
): void {
  for (const linkId of focusedLinkIds) {
    const first = particlesForLink(before, linkId);
    const laterById = new Map(particlesForLink(after, linkId).map((particle) => [particle.id, particle]));
    expect(first.length).toBeGreaterThanOrEqual(2);

    for (let index = 0; index < first.length; index += 1) {
      const particle = first[index]!;
      const later = laterById.get(particle.id);
      if (!later) throw new Error(`${particle.id} did not persist across focused flow samples.`);
      particleScreenPosition(particle);
      particleScreenPosition(later);
      for (const other of first.slice(index + 1)) {
        expect(distanceBetween(particleScreenPosition(particle), particleScreenPosition(other)))
          .toBeGreaterThan(minimumDiscernibleDistance);
      }
    }

    const maximumMotion = Math.max(...first.map((particle) => {
      const later = laterById.get(particle.id)!;
      return distanceBetween(particleScreenPosition(particle), particleScreenPosition(later));
    }));
    expect(maximumMotion).toBeGreaterThan(minimumDiscernibleDistance);
  }
}

function expectNonCollinearScreenConstellation(
  points: readonly { readonly x: number; readonly y: number }[],
  minimumNodeSeparation: number,
): void {
  if (points.length !== 3) throw new Error("A small-degree constellation must expose exactly three screen positions.");
  const [center, firstNeighbor, secondNeighbor] = points;
  if (!center || !firstNeighbor || !secondNeighbor) throw new Error("Constellation screen positions were incomplete.");
  const edgeLengths = [
    distanceBetween(center, firstNeighbor),
    distanceBetween(center, secondNeighbor),
    distanceBetween(firstNeighbor, secondNeighbor),
  ];
  expect(Math.min(...edgeLengths)).toBeGreaterThan(minimumNodeSeparation);
  const twiceArea = Math.abs(
    ((firstNeighbor.x - center.x) * (secondNeighbor.y - center.y))
    - ((firstNeighbor.y - center.y) * (secondNeighbor.x - center.x)),
  );
  const longestEdge = Math.max(...edgeLengths);
  // Normalize against its own scale so the assertion survives responsive
  // framing while still rejecting a visually linear three-node constellation.
  expect(twiceArea / (longestEdge ** 2)).toBeGreaterThan(0.035);
}

function spatialDistance(
  left: { readonly x: number; readonly y: number; readonly z: number },
  right: { readonly x: number; readonly y: number; readonly z: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function mostInteriorMotionFrame(
  frames: readonly MotionTelemetryFrame[],
  nodeId: string,
  start: { readonly x: number; readonly y: number; readonly z: number },
  end: { readonly x: number; readonly y: number; readonly z: number },
): MotionTelemetryFrame {
  const best = frames.reduce<{ readonly frame: MotionTelemetryFrame; readonly score: number } | null>((current, frame) => {
    const position = nodeWorldPosition(frame, nodeId);
    const score = Math.min(spatialDistance(start, position), spatialDistance(position, end));
    return !current || score > current.score ? { frame, score } : current;
  }, null);
  if (!best) throw new Error("No active renderer motion frames were available.");
  return best.frame;
}

function expectWorldPositionOnTargetPath(
  start: { readonly x: number; readonly y: number; readonly z: number },
  middle: { readonly x: number; readonly y: number; readonly z: number },
  end: { readonly x: number; readonly y: number; readonly z: number },
): void {
  const targetVector = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  };
  const intermediateVector = {
    x: middle.x - start.x,
    y: middle.y - start.y,
    z: middle.z - start.z,
  };
  const targetLengthSquared = (targetVector.x ** 2) + (targetVector.y ** 2) + (targetVector.z ** 2);
  expect(targetLengthSquared).toBeGreaterThan(0);
  const pathProgress = (
    (intermediateVector.x * targetVector.x)
    + (intermediateVector.y * targetVector.y)
    + (intermediateVector.z * targetVector.z)
  ) / targetLengthSquared;
  expect(pathProgress).toBeGreaterThan(0);
  expect(pathProgress).toBeLessThan(1);
  const projected = {
    x: start.x + (targetVector.x * pathProgress),
    y: start.y + (targetVector.y * pathProgress),
    z: start.z + (targetVector.z * pathProgress),
  };
  expect(spatialDistance(middle, projected)).toBeLessThan(0.001);
}

function expectLiveTransitionTargets(
  motion: ObservedMotionTelemetry,
  layout: ObservedSettledLayout,
  nodeIds: readonly string[],
): void {
  const liveById = new Map(motion.transition.nodePositions.map((position) => [position.id, position]));
  const targetById = new Map(layout.targetNodePositions.map((position) => [position.id, position]));
  for (const nodeId of nodeIds) {
    const live = liveById.get(nodeId);
    const target = targetById.get(nodeId);
    if (!live || !target) throw new Error(`Live or target position was absent for ${nodeId}.`);
    expect(live.x).toBeCloseTo(target.x, 3);
    expect(live.y).toBeCloseTo(target.y, 3);
    expect(live.z).toBeCloseTo(target.z, 3);
  }
}

function expectWorldMotionForNode(
  before: MotionTelemetryFrame,
  activeFrames: readonly MotionTelemetryFrame[],
  after: MotionTelemetryFrame,
  nodeId: string,
): void {
  const start = nodeWorldPosition(before, nodeId);
  const end = nodeWorldPosition(after, nodeId);
  const middleFrame = mostInteriorMotionFrame(activeFrames, nodeId, start, end);
  const middle = nodeWorldPosition(middleFrame, nodeId);
  expect(spatialDistance(start, end)).toBeGreaterThan(0.01);
  expect(spatialDistance(start, middle)).toBeGreaterThan(0.01);
  expect(spatialDistance(middle, end)).toBeGreaterThan(0.01);
  expectWorldPositionOnTargetPath(start, middle, end);
}

function transitionCameraPose(frame: MotionTelemetryFrame): NonNullable<MotionTelemetryFrame["transition"]["camera"]> {
  const camera = frame.transition.camera;
  if (!camera) throw new Error("A live renderer camera pose was absent from transition telemetry.");
  return camera;
}

function mostInteriorCameraFrame(
  frames: readonly MotionTelemetryFrame[],
  start: NonNullable<MotionTelemetryFrame["transition"]["camera"]>,
  end: NonNullable<MotionTelemetryFrame["transition"]["camera"]>,
): MotionTelemetryFrame {
  const best = frames.reduce<{ readonly frame: MotionTelemetryFrame; readonly score: number } | null>((current, frame) => {
    const camera = transitionCameraPose(frame);
    const score = Math.min(
      spatialDistance(start.position, camera.position) + spatialDistance(start.lookAt, camera.lookAt),
      spatialDistance(camera.position, end.position) + spatialDistance(camera.lookAt, end.lookAt),
    );
    return !current || score > current.score ? { frame, score } : current;
  }, null);
  if (!best) throw new Error("No active renderer frames were available for camera observation.");
  return best.frame;
}

function expectCameraMotion(
  before: MotionTelemetryFrame,
  activeFrames: readonly MotionTelemetryFrame[],
  after: MotionTelemetryFrame,
): void {
  const start = transitionCameraPose(before);
  const end = transitionCameraPose(after);
  const middle = transitionCameraPose(mostInteriorCameraFrame(activeFrames, start, end));

  expect(spatialDistance(start.position, end.position)).toBeGreaterThan(0.01);
  expect(spatialDistance(start.lookAt, end.lookAt)).toBeGreaterThan(0.01);
  expect(spatialDistance(start.position, middle.position)).toBeGreaterThan(0.01);
  expect(spatialDistance(middle.position, end.position)).toBeGreaterThan(0.01);
}

async function openFixture(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("graph-shell")).toBeVisible();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await waitForSettledLayout(page);
  // `markCanvas` deliberately defers fit then zoom across nested RAFs. The
  // fixture publishes this exact zoom generation only once it has genuinely
  // settled, so user-input tests cannot race the startup camera transition.
  await waitForInitialViewportReady(page);
  await waitForMotionSettled(page);
}

async function screenDiscernibilityThreshold(page: Page): Promise<number> {
  const box = await page.getByTestId("graph-canvas").boundingBox();
  if (!box) throw new Error("graph canvas does not have a measurable bounding box");
  return Math.max(4, Math.min(box.width, box.height) * 0.005);
}

async function canvasShortEdge(page: Page): Promise<number> {
  const box = await page.getByTestId("graph-canvas").boundingBox();
  if (!box) throw new Error("graph canvas does not have a measurable bounding box");
  return Math.min(box.width, box.height);
}

async function expectFocusedParticlesInsideCanvas(
  page: Page,
  frame: AmbientMotionFrame,
  focusedLinkIds: readonly string[],
): Promise<void> {
  const box = await page.getByTestId("graph-canvas").boundingBox();
  if (!box) throw new Error("graph canvas does not have a measurable bounding box");
  const inset = Math.max(2, Math.min(box.width, box.height) * 0.003);
  const particles = frame.visibleParticles.filter(({ linkId }) => focusedLinkIds.includes(linkId));
  expect(particles.length).toBeGreaterThan(0);
  for (const particle of particles) {
    const position = particleScreenPosition(particle);
    expect(position.x).toBeGreaterThan(inset);
    expect(position.x).toBeLessThan(box.width - inset);
    expect(position.y).toBeGreaterThan(inset);
    expect(position.y).toBeLessThan(box.height - inset);
  }
}

async function waitForRendererPointerSample(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function waitForRawCanvasHover(page: Page, nodeId: string): Promise<boolean> {
  const deadline = Date.now() + canvasHoverConfirmationTimeoutMs;
  while (Date.now() < deadline) {
    const candidate = await readTelemetry<Partial<ObservedNodeHoverState>>(page, "graph-node-hover");
    if (candidate.availability === "observed" && candidate.nodeId === nodeId) return true;
    await page.waitForTimeout(25);
  }
  return false;
}

async function clickReachedRequestedNode(
  page: Page,
  nodeId: string,
  previous: Partial<ObservedSelectionState>,
): Promise<boolean> {
  const deadline = Date.now() + canvasSelectionConfirmationTimeoutMs;
  while (Date.now() < deadline) {
    const candidate = await readTelemetry<Partial<ObservedSelectionState>>(page, "graph-selection");
    if (candidate.availability === "observed") {
      if (candidate.nodeId === nodeId && candidate.source === "mouse") return true;
      // 3d-force-graph can publish a transient background state between the
      // pointer release and its node callback. Only a different real node
      // selected by the same mouse action makes this target attempt invalid.
      if (candidate.nodeId !== null && candidate.nodeId !== previous.nodeId && candidate.source === "mouse") {
        return false;
      }
    }
    await page.waitForTimeout(50);
  }
  return false;
}

async function advanceAnimationFrames(page: Page, frameCount: number): Promise<void> {
  await page.evaluate((count) => new Promise<void>((resolve) => {
    let remaining = count;
    const advance = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(advance);
    };
    requestAnimationFrame(advance);
  }), frameCount);
}

async function clickProjectedCanvasNode(page: Page, nodeId: string): Promise<MotionTelemetryFrame> {
  const canvas = page.getByTestId("graph-canvas");
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("graph canvas does not have a measurable bounding box");
  for (let attempt = 1; attempt <= canvasHitAttemptLimit; attempt += 1) {
    const previous = await readTelemetry<Partial<ObservedSelectionState>>(page, "graph-selection");
    const { x, y } = await waitForProjectedNodeSeparation(page, nodeId, 22);
    await page.mouse.move(canvasBox.x + x, canvasBox.y + y);
    await waitForRendererPointerSample(page);
    // The renderer's now-visible ambient/parallax motion can advance a small
    // target during the pointer-sample RAFs. Re-project just before the real
    // click so this remains a canvas hit test, not a stale screen coordinate.
    const current = await waitForProjectedNodeSeparation(page, nodeId, 22);
    const clientX = canvasBox.x + current.x;
    const clientY = canvasBox.y + current.y;
    const hitTestId = await page.evaluate(({ x: pointerX, y: pointerY }) => (
      document.elementFromPoint(pointerX, pointerY)?.getAttribute("data-testid") ?? null
    ), { x: clientX, y: clientY });
    expect(hitTestId).toBe("graph-canvas");
    // 3d-force-graph resolves the current node from its preceding pointer
    // move. Locator.click() can dispatch its down/up before that fresh move is
    // rendered, so send the final real pointer move and button sequence here.
    await page.mouse.move(clientX, clientY);
    // Ambient focus intentionally prefers the selected identity. This fixture
    // probe instead records the raw renderer hover callback, proving the final
    // pointer-to-world hit before the real mouse press in either state. React
    // commits the callback telemetry asynchronously, so confirm it while the
    // real pointer stays fixed rather than sampling it in the move's same turn.
    if (!await waitForRawCanvasHover(page, nodeId)) continue;
    await page.mouse.down();
    const beforeSelection = await readTelemetry<MotionTelemetry>(page, "graph-motion-observation");
    await page.mouse.up();
    // The initial fit/zoom and vendor raycast cache can make a fresh projection
    // miss on first mount. Preserve the real canvas path, then accept it only
    // when its own mouse-selection telemetry identifies the requested node.
    if (await clickReachedRequestedNode(page, nodeId, previous)) {
      if (beforeSelection.availability !== "observed") {
        throw new Error(`Canvas click for ${nodeId} did not expose its pre-selection motion frame.`);
      }
      return beforeSelection;
    }
  }
  throw new Error(
    `Canvas clicks did not select ${nodeId} after ${canvasHitAttemptLimit} fresh projection attempts.`,
  );
}

async function hoverProjectedCanvasNode(page: Page, nodeId: string): Promise<void> {
  const canvas = page.getByTestId("graph-canvas");
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("graph canvas does not have a measurable bounding box");
  for (let attempt = 1; attempt <= canvasHitAttemptLimit; attempt += 1) {
    const initial = await waitForProjectedNodeSeparation(page, nodeId, 22);
    await page.mouse.move(canvasBox.x + initial.x, canvasBox.y + initial.y);
    await waitForRendererPointerSample(page);
    // Use the same real pointer-to-world path as the click contract. A small
    // ambient offset can otherwise leave the pointer on an old projection by
    // the time the renderer performs its raycast.
    const current = await waitForProjectedNodeSeparation(page, nodeId, 22);
    const clientX = canvasBox.x + current.x;
    const clientY = canvasBox.y + current.y;
    const hitTestId = await page.evaluate(({ x: pointerX, y: pointerY }) => (
      document.elementFromPoint(pointerX, pointerY)?.getAttribute("data-testid") ?? null
    ), { x: clientX, y: clientY });
    expect(hitTestId).toBe("graph-canvas");
    await page.mouse.move(clientX, clientY);
    if (await waitForRawCanvasHover(page, nodeId)) return;
  }
  throw new Error(
    `Canvas hover did not reach ${nodeId} after ${canvasHitAttemptLimit} fresh projection attempts.`,
  );
}

async function hoverSelectedCanvasNode(page: Page, nodeId: string): Promise<void> {
  const canvas = page.getByTestId("graph-canvas");
  const { x, y } = await waitForNodeProjection(page, nodeId);
  await canvas.hover({ position: { x, y } });
  await waitForRendererPointerSample(page);
}

test("mounts a real WebGL canvas and keeps input/render identities exact", async ({ page }) => {
  await openFixture(page);

  const context = await page.getByTestId("graph-canvas").evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) return null;
    return element.getContext("webgl2") ? "webgl2" : element.getContext("webgl") ? "webgl" : null;
  });
  expect(context).toMatch(/webgl2?|webgl/);

  const inputNodes = await readTelemetry<string[]>(page, "graph-input-node-ids");
  const inputLinks = await readTelemetry<string[]>(page, "graph-input-link-ids");
  expect(inputNodes).toHaveLength(fixtureNodeCount);
  expect(inputNodes).toEqual(expect.arrayContaining(requiredNodeIds));
  expect(inputLinks).toHaveLength(fixtureLinkCount);
  expect(inputLinks).toEqual(expect.arrayContaining(requiredLinkIds));
  expect((await waitForRenderedIds(page, "graph-rendered-node-ids")).ids).toEqual(inputNodes);
  expect((await waitForRenderedIds(page, "graph-rendered-link-ids")).ids).toEqual(inputLinks);

  const { observation } = await waitForRenderObservation(page);
  expect(observation.nodeIds).toEqual(inputNodes);
  expect(observation.linkIds).toEqual(inputLinks);
  expect(observation.nodes.map(({ id }) => id)).toEqual(inputNodes);
  expect(observation.links.map(({ id }) => id)).toEqual(inputLinks);
  expect(observation.nodes.every(({ objectTracked, sceneAttached }) => objectTracked && sceneAttached)).toBe(true);
  expect(observation.links.every(({ objectTracked, sceneAttached }) => objectTracked && sceneAttached)).toBe(true);
});

test("actual WebGL scene exposes semantic default node colors across system themes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openFixture(page);

  const darkRender = (await waitForRenderObservation(page)).observation;
  const dark = darkRender.nodes;
  const darkColor = (nodeId: string) => dark.find(({ id }) => id === nodeId)?.bodyMaterialColor;
  expect(darkColor("relation:release")).toBe("#fb7185");
  expect(darkColor("profile:platform")).toBe("#a5b4fc");
  expect(darkColor("component:web")).toBe("#f59e0b");
  expect(darkColor("relation:ingest")).toBe("#cbd5e1");

  await selectMatrixNode(page, "relation:release");
  await waitForSelection(page, "matrix");
  const darkSelection = await waitForAmbientMotion(page, (motion) => (
    motion.focusNodeId === "relation:release" && motion.visibleLinkFlow.length > 0
  ));
  expectDefaultLinkEndpointsAtFlatSilhouetteBoundaries(
    darkSelection,
    (await waitForRenderObservation(page)).observation,
    ["release-api", "release-profile"],
    "relation:release",
  );

  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(async () => {
    const telemetry = await readTelemetry<ObservedRenderTelemetry>(page, "graph-render-observation");
    if (telemetry.availability !== "observed") return null;
    return telemetry.observation.nodes.find(({ id }) => id === "profile:platform")?.bodyMaterialColor ?? null;
  }).toBe("#4338ca");

  const lightRender = await waitForRenderObservation(page);
  const lightColor = (nodeId: string) => lightRender.observation.nodes.find(({ id }) => id === nodeId)?.bodyMaterialColor;
  expect(lightColor("relation:release")).toBe("#be123c");
  expect(lightColor("component:web")).toBe("#92400e");
  expect(lightColor("relation:ingest")).toBe("#334155");
  const lightSelection = await waitForAmbientMotion(page, (motion) => (
    motion.focusNodeId === "relation:release" && motion.visibleLinkFlow.length > 0
  ));
  expectDefaultLinkEndpointsAtFlatSilhouetteBoundaries(
    lightSelection,
    lightRender.observation,
    ["release-api", "release-profile"],
    "relation:release",
  );
});

test("actual WebGL scene attaches profile, workflow, leaf, and relation flat default bodies", async ({ page }) => {
  await openFixture(page);

  const { observation } = await waitForRenderObservation(page);
  const expectedBodies: Readonly<Record<string, RenderDefaultNodeBodyObservation>> = {
    "profile:platform": { kind: "flat-2.5d", silhouette: "circle" },
    "relation:release": { kind: "flat-2.5d", silhouette: "capsule" },
    // This relation has one incident edge, so the renderer's semantic leaf
    // rule deliberately wins over its raw relation type.
    "relation:orchestrate": { kind: "flat-2.5d", silhouette: "dot" },
    "relation:ingest": { kind: "flat-2.5d", silhouette: "disk" },
  };
  const nodesById = new Map(observation.nodes.map((node) => [node.id, node]));

  for (const [nodeId, defaultBody] of Object.entries(expectedBodies)) {
    const node = nodesById.get(nodeId);
    if (!node) throw new Error(`${nodeId} was absent from the live WebGL renderer observation.`);
    expect(node).toMatchObject({
      defaultBody,
      objectTracked: true,
      objectVisible: true,
      sceneAttached: true,
    });
    expect(node.minimumVisibleMaterialOpacity ?? 0).toBeGreaterThan(0);
  }
});

test("keeps ambient motion live while deterministic anchors stay fixed", async ({ page }) => {
  await openFixture(page);

  const first = await waitForAmbientMotion(page, (motion) => (
    motion.active
    && !motion.paused
    && !motion.reducedMotion
    && motion.anchorNodePositions.length === fixtureNodeCount
    && motion.renderedNodePositions.length === fixtureNodeCount
    && motion.renderedScreenPositions.length === fixtureNodeCount
  ));
  const later = await waitForAmbientMotionAfter(page, first.frame, 24, (motion) => motion.active && !motion.paused);
  const probeIds = ["relation:release", "component:api", "concept:session"];

  for (const nodeId of probeIds) {
    expect(ambientPosition(later, nodeId, "anchorNodePositions")).toEqual(
      ambientPosition(first, nodeId, "anchorNodePositions"),
    );
  }

  const commonMotion = averageScreenMotion(first, later, probeIds);
  expect(Math.hypot(commonMotion.x, commonMotion.y)).toBeGreaterThan(0.1);
  const elapsedSeconds = (later.sampledAtMs - first.sampledAtMs) / 1_000;
  expect(elapsedSeconds).toBeGreaterThan(0);
  expect(elapsedSeconds).toBeLessThan(2);
  const commonSpeedPxPerSecond = Math.hypot(commonMotion.x, commonMotion.y) / elapsedSeconds;
  expect(commonSpeedPxPerSecond).toBeGreaterThan(1);
  expect(commonSpeedPxPerSecond).toBeLessThan(30);
  const screenVectors = probeIds.map((nodeId) => {
    const start = ambientScreenPosition(first, nodeId);
    const end = ambientScreenPosition(later, nodeId);
    return { x: end.x - start.x, y: end.y - start.y };
  });
  // Camera parallax and per-node breathing deliberately add local vectors, so
  // the field need not collapse into one screen-space direction.
  expect(screenVectors.some((vector) => dotProduct(vector, commonMotion) > 0)).toBe(true);

  // The field cannot be a camera-only slide: at least two node-local render
  // offsets separate while their deterministic layout anchors remain exact.
  const apiOffset = {
    x: ambientPosition(later, "component:api", "renderedNodePositions").x
      - ambientPosition(first, "component:api", "renderedNodePositions").x,
    y: ambientPosition(later, "component:api", "renderedNodePositions").y
      - ambientPosition(first, "component:api", "renderedNodePositions").y,
    z: ambientPosition(later, "component:api", "renderedNodePositions").z
      - ambientPosition(first, "component:api", "renderedNodePositions").z,
  };
  const sessionOffset = {
    x: ambientPosition(later, "concept:session", "renderedNodePositions").x
      - ambientPosition(first, "concept:session", "renderedNodePositions").x,
    y: ambientPosition(later, "concept:session", "renderedNodePositions").y
      - ambientPosition(first, "concept:session", "renderedNodePositions").y,
    z: ambientPosition(later, "concept:session", "renderedNodePositions").z
      - ambientPosition(first, "concept:session", "renderedNodePositions").z,
  };
  expect(spatialDistance(apiOffset, sessionOffset)).toBeGreaterThan(0.001);

  // `concept:session` is an actual non-selected peripheral node in the live
  // WebGL scene. Its motion must be visible in screen space after normalizing
  // against the current canvas rather than relying on fixture pixel coordinates.
  expect(first.focusNodeId).toBeNull();
  expect(later.focusNodeId).toBeNull();
  const defaultSelection = await readTelemetry<Partial<ObservedSelectionState>>(page, "graph-selection");
  expect(defaultSelection.nodeId ?? null).toBeNull();
  const peripheralDrift = distanceBetween(
    ambientScreenPosition(first, "concept:session"),
    ambientScreenPosition(later, "concept:session"),
  ) / await canvasShortEdge(page);
  // Flat camera-facing bodies change the fitted screen scale slightly. Keep a
  // viewport-relative lower bound that still proves visible peripheral drift
  // without coupling this renderer observation to the former sphere framing.
  expect(peripheralDrift).toBeGreaterThan(0.0035);
  expect(peripheralDrift).toBeLessThan(0.08);
  expect(later.frames.length).toBeGreaterThanOrEqual(2);
});

test("actual canvas hover differentiates bounded idle and focus flow particles without selecting", async ({ page }) => {
  await openFixture(page);
  const minimumDiscernibleDistance = await screenDiscernibilityThreshold(page);

  const idleRender = (await waitForRenderObservation(page)).observation;
  expect(idleRender.links).toHaveLength(fixtureLinkCount);
  expect(idleRender.links.every(({ minimumVisibleMaterialOpacity, objectVisible, sceneAttached }) => (
    objectVisible && sceneAttached && (minimumVisibleMaterialOpacity ?? 0) > 0
  ))).toBe(true);
  const idleApiWeb = idleRender.links.find(({ id }) => id === "api-web");
  if (!idleApiWeb) throw new Error("The default idle api-web edge was absent from the live renderer observation.");
  expect(idleApiWeb.minimumVisibleMaterialOpacity ?? 0).toBeGreaterThanOrEqual(0.22);
  expect(idleApiWeb.minimumVisibleMaterialOpacity ?? 1).toBeLessThanOrEqual(0.28);
  expect(idleApiWeb.visibleMaterialLineWidths[0] ?? 0).toBeGreaterThanOrEqual(0.7);
  expect(idleApiWeb.visibleMaterialLineWidths[0] ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(0.82);
  const idle = await waitForAmbientMotion(page, (motion) => (
    motion.focusNodeId === null
    && motion.visibleLinkFlow.length > 0
    && motion.visibleParticles.length > 0
  ));
  expect(idle.visibleLinkFlow).toHaveLength(idle.visibleParticles.length);
  expect(idle.visibleLinkFlow.length).toBeLessThanOrEqual(3);
  expect(idle.visibleLinkFlow.every(({ active, particleCount }) => active && particleCount === 1)).toBe(true);
  expect(idle.visibleParticles.every(({ linkId, phase }) => (
    idle.visibleLinkFlow.some(({ id }) => id === linkId) && Number.isFinite(phase)
  ))).toBe(true);
  expect(idle.linkEndpoints).toHaveLength(fixtureLinkCount);
  expectDefaultLinkEndpointsAtFlatSilhouetteBoundaries(
    idle,
    idleRender,
    idle.linkEndpoints.map(({ id }) => id),
  );
  const laterIdle = await waitForAmbientMotionAfter(
    page,
    idle.frame,
    12,
    (motion) => motion.focusNodeId === null && motion.visibleParticles.length > 0,
  );
  const firstIdleParticle = idle.visibleParticles[0];
  const laterIdleParticle = laterIdle.visibleParticles.find(({ id }) => id === firstIdleParticle?.id);
  if (!firstIdleParticle || !laterIdleParticle) throw new Error("An idle flow particle did not persist across samples.");
  expect(laterIdleParticle.phase).not.toBe(firstIdleParticle.phase);

  await hoverProjectedCanvasNode(page, "relation:query");
  const hover = await waitForAmbientMotion(page, (motion) => (
    motion.focusNodeId === "relation:query"
    && motion.visibleLinkFlow.length > 0
    && motion.visibleParticles.length > 0
  ));
  // Every active token runs away from the focused query. The inbound relation
  // is intentionally reversed at render time, so only its *incident* links
  // participate and no unrelated edge can leak into hover flow.
  const focusIncidentLinkIds = new Set(["index-query", "query-evidence", "query-vector"]);
  expect(hover.visibleLinkFlow.map(({ id }) => id)).toEqual(expect.arrayContaining([...focusIncidentLinkIds]));
  expect(hover.visibleLinkFlow.every(({ active, id, particleCount }) => (
    active && focusIncidentLinkIds.has(id) && particleCount === 2
  ))).toBe(true);
  // Focus increases the link-level particle density above bounded idle flow,
  // making the interaction hierarchy observable before any screenshot review.
  expect(hover.visibleParticles.length).toBeGreaterThan(idle.visibleParticles.length);
  expect(hover.visibleParticles.every(({ linkId, phase }) => (
    focusIncidentLinkIds.has(linkId) && Number.isFinite(phase)
  ))).toBe(true);
  const hoverRender = (await waitForRenderObservation(page)).observation;
  expectDefaultLinkEndpointsAtFlatSilhouetteBoundaries(
    hover,
    hoverRender,
    [...focusIncidentLinkIds],
    "relation:query",
  );
  const laterHover = await waitForAmbientMotionAfterWhileHovering(
    page,
    "relation:query",
    hover.frame,
    12,
    (motion) => motion.focusNodeId === "relation:query" && motion.visibleParticles.length > 0,
  );
  expectFocusedParticleScreenMotion(
    hover,
    laterHover,
    [...focusIncidentLinkIds],
    minimumDiscernibleDistance,
  );
  expectFocusedFlowHasScreenHierarchy(
    hover,
    laterHover,
    [...focusIncidentLinkIds],
    await canvasShortEdge(page),
  );
  // Hover flow is intentionally a stronger interaction tier than the bounded
  // idle field: every incident link carries more visible tokens. The focused
  // screen-space advance is checked above and its pixel-per-second range below.
  const idleLinkIds = idle.visibleLinkFlow.map(({ id }) => id);
  expect(flowParticleDensity(hover, [...focusIncidentLinkIds]))
    .toBeGreaterThan(flowParticleDensity(idle, idleLinkIds));
  await expectFocusedParticlesInsideCanvas(page, hover, [...focusIncidentLinkIds]);
  await expectFocusedParticlesInsideCanvas(page, laterHover, [...focusIncidentLinkIds]);
  const selectionAfterHover = await readTelemetry<Partial<ObservedSelectionState>>(page, "graph-selection");
  expect(selectionAfterHover.nodeId ?? null).toBeNull();
});

test("keeps hovered active link curves attached to rendered node positions across frames", async ({ page }) => {
  await openFixture(page);

  await hoverProjectedCanvasNode(page, "relation:query");
  const hover = await waitForAmbientMotion(page, (motion) => (
    motion.active
    && !motion.reducedMotion
    && motion.focusNodeId === "relation:query"
    && motion.visibleLinkFlow.some(({ active }) => active)
  ));
  const activeLinkIds = hover.visibleLinkFlow.filter(({ active }) => active).map(({ id }) => id);
  expect(activeLinkIds).not.toHaveLength(0);
  const hoverRender = (await waitForRenderObservation(page)).observation;
  expectDefaultLinkEndpointsAtFlatSilhouetteBoundaries(hover, hoverRender, activeLinkIds, "relation:query");

  // The endpoint observation is sampled again after a later renderer frame,
  // rather than comparing the curve to a static layout snapshot. This catches
  // ambient node offsets that leave the active Line geometry behind.
  const laterHover = await waitForAmbientMotionAfterWhileHovering(
    page,
    "relation:query",
    hover.frame,
    1,
    (motion) => (
      motion.active
      && !motion.reducedMotion
      && motion.focusNodeId === "relation:query"
      && motion.visibleLinkFlow.some(({ active }) => active)
    ),
  );
  expect(laterHover.frame).toBeGreaterThan(hover.frame);
  const laterActiveLinkIds = laterHover.visibleLinkFlow.filter(({ active }) => active).map(({ id }) => id);
  expect(laterActiveLinkIds).not.toHaveLength(0);
  expectDefaultLinkEndpointsAtFlatSilhouetteBoundaries(laterHover, hoverRender, laterActiveLinkIds, "relation:query");
});

test("observes the master floor and selection-distance opacity in attached scene objects", async ({ page }) => {
  await openFixture(page);
  const idleRender = (await waitForRenderObservation(page)).observation;
  const idleEdge = idleRender.links.find((link) => link.id === "api-web");
  if (!idleEdge) throw new Error("The default idle api-web edge was absent from the live renderer observation.");
  const idleOpacity = idleEdge.minimumVisibleMaterialOpacity;
  const idleWidth = idleEdge.visibleMaterialLineWidths[0];
  expect(idleOpacity).toBeGreaterThanOrEqual(0.22);
  expect(idleOpacity).toBeLessThanOrEqual(0.28);
  const beforeMotion = await waitForMotionSettled(page);
  await selectMatrixNode(page, "component:web");
  expect(await waitForSelection(page, "matrix")).toMatchObject({
    nodeId: "component:web",
    neighborNodeIds: ["component:api"],
  });
  await waitForNewerMotionSettled(page, beforeMotion.transition.generation);

  await expect.poll(async () => readTelemetry<ObservedMasterVisibility>(page, "master-visibility"))
    .toMatchObject({
      availability: "observed",
      nodeId: "relation:release",
      objectTracked: true,
      objectVisible: true,
      sceneAttached: true,
      observationScope: "scene-object-and-material-not-rendered-pixels",
      pixelVisibility: "not-observed",
    });
  const master = await readTelemetry<ObservedMasterVisibility>(page, "master-visibility");
  expect(master.minimumVisibleMaterialOpacity ?? 0).toBeGreaterThanOrEqual(0.45);
  expect(master.visibleMaterialOpacities.some((opacity) => opacity >= 0.45)).toBe(true);

  await expect.poll(
    async () => readTelemetry<ObservedSelectionDistanceVisibility>(page, "selection-distance-visibility"),
  ).toMatchObject({
    availability: "observed",
    selected: { nodeId: "component:web" },
  });
  const distanceVisibility = await readTelemetry<ObservedSelectionDistanceVisibility>(
    page,
    "selection-distance-visibility",
  );
  expect(distanceVisibility.observationScope).toBe("scene-object-and-material-not-rendered-pixels");
  expect(distanceVisibility.selected).toMatchObject({
    nodeId: "component:web",
    objectVisible: true,
    sceneAttached: true,
  });
  expect(distanceVisibility.selected.minimumVisibleMaterialOpacity ?? 0).toBeGreaterThanOrEqual(0.95);
  expect(distanceVisibility.neighbors).toHaveLength(1);
  expect(distanceVisibility.neighbors[0]).toMatchObject({
    nodeId: "component:api",
    objectVisible: true,
    sceneAttached: true,
  });
  const distantById = new Map(distanceVisibility.distant.map((node) => [node.nodeId, node]));
  expect(distantById.get("profile:platform")).toMatchObject({
    objectVisible: true,
    sceneAttached: true,
  });
  expect(distantById.get("relation:release")).toMatchObject({
    objectVisible: true,
    sceneAttached: true,
  });
  const neighboringOpacity = distanceVisibility.neighbors[0]?.minimumVisibleMaterialOpacity ?? 0;
  const profileOpacity = distantById.get("profile:platform")?.minimumVisibleMaterialOpacity ?? 0;
  expect(neighboringOpacity).toBeGreaterThan(0.6);
  expect(profileOpacity).toBeGreaterThan(0);
  expect(neighboringOpacity).toBeGreaterThan(profileOpacity);
  expect(master.minimumVisibleMaterialOpacity ?? 0).toBeGreaterThan(profileOpacity);
  const linksById = new Map(distanceVisibility.links.map((link) => [link.linkId, link]));
  const selectedEdge = linksById.get("api-web");
  const distantEdge = linksById.get("release-profile");
  expect(selectedEdge).toMatchObject({
    objectVisible: true,
    sceneAttached: true,
  });
  expect(distantEdge).toMatchObject({
    objectVisible: true,
    sceneAttached: true,
  });
  expect(selectedEdge?.minimumVisibleMaterialOpacity ?? 0).toBeGreaterThan(
    distantEdge?.minimumVisibleMaterialOpacity ?? 0,
  );
  expect(selectedEdge?.visibleMaterialLineWidths[0] ?? 0).toBeGreaterThan(
    distantEdge?.visibleMaterialLineWidths[0] ?? 0,
  );
  expect(selectedEdge?.visual.opacity ?? 0).toBeGreaterThan(distantEdge?.visual.opacity ?? 0);
  expect(selectedEdge?.visual.width ?? 0).toBeGreaterThan(distantEdge?.visual.width ?? 0);
  // `api-web` is the selected node's incident link. Its material tier has to
  // rise above the independently readable idle default, not merely above a
  // distant edge that was muted by the selection.
  expect(selectedEdge?.minimumVisibleMaterialOpacity ?? 0).toBeGreaterThan((idleOpacity ?? 0) * 2);
  expect((selectedEdge?.visibleMaterialLineWidths[0] ?? 0) - (idleWidth ?? 0)).toBeGreaterThan(0.35);

  const canvas = page.getByTestId("graph-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("graph canvas does not have a measurable bounding box");
  await expect.poll(async () => readTelemetry<ObservedScreenPosition>(page, "graph-master-screen-position"))
    .toMatchObject({
      availability: "observed",
      nodeId: "relation:release",
      x: expect.any(Number),
      y: expect.any(Number),
    });
  const masterScreen = await readTelemetry<ObservedScreenPosition>(page, "graph-master-screen-position");
  expect(masterScreen.x).toBeGreaterThan(0);
  expect(masterScreen.x).toBeLessThan(box.width);
  expect(masterScreen.y).toBeGreaterThan(0);
  expect(masterScreen.y).toBeLessThan(box.height);
});

test("keeps every scene label continuously visible while preserving semantic emphasis", async ({ page }) => {
  await openFixture(page);
  const idleObservation = (await waitForRenderObservation(page)).observation;
  const idleVisibleLabelCount = idleObservation.nodes
    .filter((node) => node.label.objectVisible === true).length;
  expect(idleVisibleLabelCount).toBe(idleObservation.nodes.length);

  await selectMatrixNode(page, "relation:query");
  expect(await waitForSelection(page, "matrix")).toMatchObject({
    nodeId: "relation:query",
    neighborNodeIds: expect.arrayContaining(["concept:index", "concept:evidence", "concept:vector"]),
  });
  const { observation } = await waitForRenderObservation(page);
  const nodeById = new Map(observation.nodes.map((node) => [node.id, node]));
  const selected = nodeById.get("relation:query");
  const neighbor = nodeById.get("concept:index");
  const master = nodeById.get("relation:release");
  const far = nodeById.get("concept:session");
  if (!selected || !neighbor || !master || !far) {
    throw new Error("Required label observations were absent from the live scene.");
  }

  for (const node of [selected, neighbor, master]) {
    expect(node.label).toMatchObject({
      objectTracked: true,
      objectVisible: true,
      sceneAttached: true,
      position: { y: expect.any(Number) },
      scale: { x: expect.any(Number), y: expect.any(Number) },
    });
    expect(node.label.position?.y ?? 0).toBeGreaterThan(0);
    expect(node.label.visibleMaterialOpacities[0]).toBeGreaterThan(0);
  }
  const visibleLabelCount = observation.nodes.filter((node) => node.label.objectVisible === true).length;
  expect(visibleLabelCount).toBe(observation.nodes.length);
  expect(far.label).toMatchObject({
    objectTracked: true,
    objectVisible: true,
    sceneAttached: true,
  });
  expect(far.label.minimumVisibleMaterialOpacity ?? 0).toBeGreaterThan(0);
  expect(selected.label.minimumVisibleMaterialOpacity ?? 0).toBeGreaterThan(
    neighbor.label.minimumVisibleMaterialOpacity ?? 0,
  );
  // Master stays readable even when it is outside the selected neighborhood.
  expect(selected.label.minimumVisibleMaterialOpacity ?? 0).toBeGreaterThan(
    master.label.minimumVisibleMaterialOpacity ?? 0,
  );
  expect(selected.worldScale?.x ?? 0).toBeGreaterThan(neighbor.worldScale?.x ?? 0);
  expect(neighbor.worldScale?.x ?? 0).toBeGreaterThan(far.worldScale?.x ?? 0);
  expect(master.worldScale?.x ?? 0).toBeGreaterThan(far.worldScale?.x ?? 0);
  expect(far.visual.labelCue).toBe("muted");

  // The actual edge objects stay transparent and render through a tessellated
  // quadratic curve rather than as a flat DOM diagram. This is scene
  // observation, not a screenshot-pixel heuristic.
  expect(observation.links.every((link) => (
    link.curvePointCount === 29
    && link.depthWriteEnabled === false
    && link.objectTracked
    && link.sceneAttached
  ))).toBe(true);
});

test("applies host type label visibility policy to live Sprite observations", async ({ page }) => {
  await openFixture(page);
  const defaultObservation = (await waitForRenderObservation(page)).observation;
  expect(defaultObservation.nodes.every((node) => node.label.objectVisible === true)).toBe(true);

  await page.getByTestId("host-label-visibility-policy").click();
  await expect.poll(async () => {
    const telemetry = await readTelemetry<ObservedRenderTelemetry>(page, "host-label-visibility-observation");
    if (telemetry.availability !== "observed") return false;
    const component = telemetry.observation.nodes.find(({ id }) => id === "component:api");
    const relation = telemetry.observation.nodes.find(({ id }) => id === "relation:release");
    return component?.label.objectVisible === false && relation?.label.objectVisible === true;
  }).toBe(true);

  const { observation } = await readTelemetry<ObservedRenderTelemetry>(page, "host-label-visibility-observation");
  const component = observation.nodes.find(({ id }) => id === "component:api");
  const relation = observation.nodes.find(({ id }) => id === "relation:release");
  if (!component || !relation) throw new Error("Required label observations were absent from the live scene.");

  expect(component.label).toMatchObject({
    objectTracked: true,
    objectVisible: false,
    sceneAttached: true,
  });
  expect(relation.label).toMatchObject({
    objectTracked: true,
    objectVisible: true,
    sceneAttached: true,
  });
});

test("reproduces selected target positions from the same seed and viewport", async ({ page }) => {
  await openFixture(page);

  await selectMatrixNode(page, "component:api");
  const selection = await waitForSelection(page, "matrix");
  expect(selection).toMatchObject({
    nodeId: "component:api",
    neighborNodeIds: ["relation:release", "component:web", "profile:platform"],
    settled: true,
  });
  const first = await waitForSettledLayout(page, "component:api");

  await page.getByTestId("reset-layout").click();
  await waitForSelection(page, "programmatic");
  await selectMatrixNode(page, "component:api");
  await waitForSelection(page, "matrix");
  const second = await waitForSettledLayout(page, "component:api");

  expect(second).toEqual(first);
});

test("moves a non-selected node through a real renderer-owned intermediate frame", async ({ page }) => {
  await openFixture(page);
  const before = await waitForMotionSettled(page);
  const beforeProfile = profileScreenPosition(before);
  const beforeProfileWorld = nodeWorldPosition(before, "profile:platform");

  await openMatrixPalette(page);
  const activeFramesPromise = waitForMotionFrames(page, before.transition.generation);
  await page.getByTestId("matrix-row-component-api").click();
  const activeFrames = await activeFramesPromise;

  expect(await waitForSelection(page, "matrix")).toMatchObject({ nodeId: "component:api" });
  const layout = await waitForSettledLayout(page, "component:api");
  const after = await waitForMotionSettled(page, activeFrames[0]?.transition.generation);
  const afterProfileWorld = nodeWorldPosition(after, "profile:platform");
  const middle = mostInteriorMotionFrame(
    activeFrames,
    "profile:platform",
    beforeProfileWorld,
    afterProfileWorld,
  );
  expect(middle.transition.reducedMotion).toBe(false);
  expect(middle.transition.durationMs).toBeGreaterThan(0);
  expect(middle.transition.nodePositions.map(({ id }) => id)).toContain("profile:platform");
  const middleProfile = profileScreenPosition(middle);
  const middleProfileWorld = nodeWorldPosition(middle, "profile:platform");
  const afterProfile = profileScreenPosition(after);

  // `profile:platform` is a one-hop neighbor, but it is not the selected node.
  // These three projections are sampled from the live renderer API, not a timer
  // or an expected-layout snapshot. The middle sample is retained from a real
  // requestAnimationFrame before the transaction settles.
  expect(distanceBetween(beforeProfile, afterProfile)).toBeGreaterThan(1);
  expect(distanceBetween(beforeProfile, middleProfile)).toBeGreaterThan(0.25);
  expect(distanceBetween(middleProfile, afterProfile)).toBeGreaterThan(0.25);
  expect(spatialDistance(beforeProfileWorld, afterProfileWorld)).toBeGreaterThan(0.01);
  expect(spatialDistance(beforeProfileWorld, middleProfileWorld)).toBeGreaterThan(0.01);
  expect(spatialDistance(middleProfileWorld, afterProfileWorld)).toBeGreaterThan(0.01);
  expectWorldPositionOnTargetPath(beforeProfileWorld, middleProfileWorld, afterProfileWorld);
  expect(after.transition).toMatchObject({ active: false, progress: 1, reducedMotion: false });
  const profileTarget = layout.targetNodePositions.find(({ id }) => id === "profile:platform");
  if (!profileTarget) throw new Error("Profile target position was absent from the settled layout.");
  expect(afterProfileWorld.x).toBeCloseTo(profileTarget.x, 3);
  expect(afterProfileWorld.y).toBeCloseTo(profileTarget.y, 3);
  expect(afterProfileWorld.z).toBeCloseTo(profileTarget.z, 3);
  expectLiveTransitionTargets(after, layout, ["component:api", "relation:release", "component:web", "profile:platform"]);

  // The selected-node drawer is part of the same responsive scene: closing it
  // must not let a force simulation drift a layout that has already settled or
  // strand keyboard focus inside the now-inert drawer.
  const drawerClose = page.getByTestId("detail-drawer-close");
  await expect(drawerClose).toBeVisible();
  await expect(drawerClose).toBeEnabled();
  await drawerClose.focus();
  await expect(drawerClose).toBeFocused();
  await drawerClose.click();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect.poll(async () => readTelemetry<{ readonly collapsed: boolean }>(page, "collapse-status"))
    .toMatchObject({ collapsed: true });
  const graphShell = page.getByTestId("graph-shell");
  await expect(graphShell).toHaveAttribute("role", "application");
  await expect(graphShell).toBeFocused();
  expectLiveTransitionTargets(await waitForMotionSettled(page, activeFrames[0]?.transition.generation), layout, [
    "component:api",
    "relation:release",
    "component:web",
    "profile:platform",
  ]);
});

test("two actual canvas node clicks move selected, neighbor, and far graph positions", async ({ page }) => {
  test.slow();
  await openFixture(page);

  const initial = await waitForMotionSettled(page);
  await clickProjectedCanvasNode(page, "relation:review");
  expect(await waitForSelection(page, "mouse")).toMatchObject({
    nodeId: "relation:review",
    neighborNodeIds: expect.arrayContaining(["concept:contract", "concept:owner"]),
  });
  // The pointer helper confirms the target renderer callback before returning.
  // Bind subsequent transition evidence to that confirmed selection rather than
  // to any bounded background retry that may have preceded the successful hit.
  const firstGeneration = await waitForSelectionTransitionGeneration(
    page,
    "relation:review",
    "mouse",
    initial.transition.generation,
  );
  const firstActiveFrames = await waitForMotionFramesForGeneration(page, firstGeneration);
  const firstLayout = await waitForSettledLayout(page, "relation:review");
  const firstSettled = await waitForMotionSettled(page, firstGeneration);
  const allNodeIds = firstLayout.targetNodePositions.map(({ id }) => id);

  // This is a real canvas hit path, not Matrix preselection: the selected
  // relation and every attached or peripheral node expose real
  // start/intermediate/final world coordinates. The same transaction carries
  // a live camera pose; no screenshot or fixed canvas coordinate is used.
  for (const frame of firstActiveFrames) {
    expect([...frame.transition.nodePositions.map(({ id }) => id)].sort()).toEqual([...allNodeIds].sort());
  }
  for (const nodeId of allNodeIds) {
    expectWorldMotionForNode(initial, firstActiveFrames, firstSettled, nodeId);
  }
  expectLiveTransitionTargets(firstSettled, firstLayout, allNodeIds);
  expectCameraMotion(initial, firstActiveFrames, firstSettled);
  const reviewConstellation = await Promise.all([
    waitForNodeProjection(page, "relation:review"),
    waitForNodeProjection(page, "concept:contract"),
    waitForNodeProjection(page, "concept:owner"),
  ]);
  expectNonCollinearScreenConstellation(
    reviewConstellation,
    (await screenDiscernibilityThreshold(page)) * 3,
  );

  const secondStart = await clickProjectedCanvasNode(page, "relation:query");
  expect(await waitForSelection(page, "mouse")).toMatchObject({ nodeId: "relation:query" });
  const secondGeneration = await waitForSelectionTransitionGeneration(
    page,
    "relation:query",
    "mouse",
    firstSettled.transition.generation,
  );
  const secondActiveFrames = await waitForMotionFramesForGeneration(page, secondGeneration);
  const secondLayout = await waitForSettledLayout(page, "relation:query");
  const secondSettled = await waitForMotionSettled(page, secondGeneration);

  expect(secondSettled.transition.generation).toBeGreaterThan(firstSettled.transition.generation);
  expect(secondLayout.nodeId).toBe("relation:query");
  expect(secondLayout.targetNodePositions).not.toEqual(firstLayout.targetNodePositions);
  for (const frame of secondActiveFrames) {
    expect([...frame.transition.nodePositions.map(({ id }) => id)].sort()).toEqual([...allNodeIds].sort());
  }
  expectLiveTransitionTargets(secondSettled, secondLayout, allNodeIds);
  // A bounded background retry can move the renderer before the exact Query
  // mouse event. The click helper captures the live frame between pointer-down
  // and the selecting pointer-up, giving this path proof its actual start even
  // when a throttled browser exposes only one later in-flight frame.
  expectWorldMotionForNode(secondStart, secondActiveFrames, secondSettled, "relation:query");
  expectWorldMotionForNode(secondStart, secondActiveFrames, secondSettled, "concept:index");
  expectWorldMotionForNode(secondStart, secondActiveFrames, secondSettled, "concept:session");
  expectCameraMotion(secondStart, secondActiveFrames, secondSettled);

  const ambientAfterSelection = await waitForAmbientMotion(page, (motion) => (
    motion.focusNodeId === "relation:query"
    && motion.active
    && motion.anchorNodePositions.length === fixtureNodeCount
  ));
  const ambientLater = await waitForAmbientMotionAfter(
    page,
    ambientAfterSelection.frame,
    12,
    (motion) => motion.focusNodeId === "relation:query" && motion.active,
  );
  // This follows the actual mouse-selection path above. Active link endpoints
  // must keep their source/target identities and stay attached to the live
  // ambient node transforms, rather than the deterministic layout anchors.
  expect(ambientAfterSelection.reducedMotion).toBe(false);
  const selectedActiveLinkIds = ambientAfterSelection.visibleLinkFlow
    .filter(({ active }) => active)
    .map(({ id }) => id);
  const selectedFocusLinkIds = ["index-query", "query-evidence", "query-vector"];
  expect([...selectedActiveLinkIds].sort()).toEqual([...selectedFocusLinkIds].sort());
  const selectedRender = (await waitForRenderObservation(page)).observation;
  expectDefaultLinkEndpointsAtFlatSilhouetteBoundaries(
    ambientAfterSelection,
    selectedRender,
    selectedActiveLinkIds,
    "relation:query",
  );
  const laterSelectedActiveLinkIds = ambientLater.visibleLinkFlow
    .filter(({ active }) => active)
    .map(({ id }) => id);
  expect(laterSelectedActiveLinkIds).toEqual(selectedActiveLinkIds);
  expectDefaultLinkEndpointsAtFlatSilhouetteBoundaries(
    ambientLater,
    selectedRender,
    laterSelectedActiveLinkIds,
    "relation:query",
  );
  expectFocusedParticleScreenMotion(
    ambientAfterSelection,
    ambientLater,
    selectedFocusLinkIds,
    await screenDiscernibilityThreshold(page),
  );
  expectFocusedFlowHasScreenHierarchy(
    ambientAfterSelection,
    ambientLater,
    selectedFocusLinkIds,
    await canvasShortEdge(page),
  );
  await expectFocusedParticlesInsideCanvas(page, ambientAfterSelection, selectedFocusLinkIds);
  await expectFocusedParticlesInsideCanvas(page, ambientLater, selectedFocusLinkIds);
  for (const nodeId of ["relation:query", "concept:index", "concept:session"]) {
    expect(ambientPosition(ambientLater, nodeId, "anchorNodePositions")).toEqual(
      ambientPosition(ambientAfterSelection, nodeId, "anchorNodePositions"),
    );
  }
  expect(distanceBetween(
    ambientScreenPosition(ambientAfterSelection, "concept:session"),
    ambientScreenPosition(ambientLater, "concept:session"),
  )).toBeGreaterThan(0.1);
});

test("keeps every live node inside the canvas after an actual selection and mobile resize", async ({ page }) => {
  test.slow();
  await openFixture(page);

  await clickProjectedCanvasNode(page, "relation:review");
  expect(await waitForSelection(page, "mouse")).toMatchObject({ nodeId: "relation:review" });
  await waitForMotionSettled(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  const settledAfterResize = await waitForMotionSettled(page);
  expect(settledAfterResize.transition).toMatchObject({ active: false, progress: 1 });

  const projections = await waitForEveryNodeProjectionWithinCanvas(page);
  expect(projections.map(({ id }) => id)).toEqual(expect.arrayContaining(requiredNodeIds));
  expect(await readTelemetry<ObservedSelectionState>(page, "graph-selection")).toMatchObject({
    nodeId: "relation:review",
    source: "mouse",
    settled: true,
  });

  const firstMobileAmbient = await waitForAmbientMotion(page, (motion) => (
    motion.active && motion.renderedScreenPositions.length === fixtureNodeCount
  ));
  const laterMobileAmbient = await waitForAmbientMotionAfter(page, firstMobileAmbient.frame, 12);
  for (const frame of [firstMobileAmbient, laterMobileAmbient]) {
    const canvasBox = await page.getByTestId("graph-canvas").boundingBox();
    if (!canvasBox) throw new Error("graph canvas does not have a measurable bounding box");
    expect(frame.renderedScreenPositions.every(({ x, y }) => (
      x > 0 && x < canvasBox.width && y > 0 && y < canvasBox.height
    ))).toBe(true);
  }
});

test("preserves actual canvas and keyboard selection identity across distinct nodes", async ({ page }) => {
  test.slow();
  await openFixture(page);

  // Each pointer assertion starts from an unselected target. Re-clicking a
  // Matrix-preselected node does not prove the renderer selected anything.
  await clickProjectedCanvasNode(page, "relation:review");
  expect(await waitForSelection(page, "mouse")).toMatchObject({ nodeId: "relation:review", settled: true });
  await expect(page.getByTestId("graph-detail-panel")).toContainText("relation:review");
  // The first real canvas selection reframes the graph. Let that renderer
  // transition settle before projecting the next real pointer target.
  await waitForMotionSettled(page);

  await clickProjectedCanvasNode(page, "relation:query");
  expect(await waitForSelection(page, "mouse")).toMatchObject({ nodeId: "relation:query", settled: true });
  await expect(page.getByTestId("graph-detail-panel")).toContainText("relation:query");

  await page.getByTestId("graph-shell").focus();
  await page.keyboard.press("ArrowRight");
  const keyboardSelection = await waitForSelection(page, "keyboard");
  expect(keyboardSelection.nodeId).not.toBe("relation:query");
  await expect(page.getByTestId("graph-detail-panel")).toContainText(keyboardSelection.nodeId);
});

test("keeps Matrix reachable above an open selected-node detail rail", async ({ page }) => {
  await openFixture(page);

  await selectMatrixNode(page, "component:api");
  await expect(page.getByTestId("graph-detail-panel")).toContainText("component:api");

  // This is a real pointer click. It must not be intercepted by the detail heading.
  await page.getByTestId("matrix-command-trigger").click();
  await expect.poll(() => matrixPaletteIsOpen(page)).toBe(true);

  await page.getByTestId(matrixRowTestId("component:web")).click();
  expect(await waitForSelection(page, "matrix")).toMatchObject({ nodeId: "component:web" });
  await expect(page.getByTestId("graph-detail-panel")).toContainText("component:web");
});

test("actual canvas hover preserves the current public selection identity", async ({ page }) => {
  await openFixture(page);
  await selectMatrixNode(page, "component:api");
  const beforeSelection = await waitForSelection(page, "matrix");
  const beforeLayout = await waitForSettledLayout(page, "component:api");
  const beforeMotion = await waitForMotionSettled(page);
  const beforeAmbient = await waitForAmbientMotion(page, (motion) => (
    motion.focusNodeId === "component:api" && motion.visibleParticles.length > 0
  ));

  await hoverSelectedCanvasNode(page, "component:api");

  expect(await readTelemetry<ObservedSelectionState>(page, "graph-selection")).toEqual(beforeSelection);
  expect(await waitForSettledLayout(page, "component:api")).toEqual(beforeLayout);
  expect((await waitForMotionSettled(page)).transition.generation).toBe(beforeMotion.transition.generation);
  const ambient = await waitForAmbientMotion(page, (motion) => (
    motion.focusNodeId === "component:api"
    && motion.visibleLinkFlow.length > 0
    && motion.visibleParticles.length > 0
  ));
  expect(ambient.anchorNodePositions).toEqual(beforeAmbient.anchorNodePositions);
  const focusIncidentLinkIds = new Set(["release-api", "api-web", "profile-api"]);
  expect(ambient.visibleLinkFlow.map(({ id }) => id)).toEqual(expect.arrayContaining([...focusIncidentLinkIds]));
  expect(ambient.visibleLinkFlow.every(({ active, id, particleCount }) => (
    active && focusIncidentLinkIds.has(id) && particleCount === 2
  ))).toBe(true);
  expect(ambient.visibleParticles.every(({ linkId }) => focusIncidentLinkIds.has(linkId))).toBe(true);
  const laterAmbient = await waitForAmbientMotionAfter(
    page,
    ambient.frame,
    12,
    (motion) => motion.focusNodeId === "component:api" && motion.visibleParticles.length > 0,
  );
  const screenDrift = distanceBetween(
    ambientScreenPosition(ambient, "component:api"),
    ambientScreenPosition(laterAmbient, "component:api"),
  );
  const normalizedScreenDrift = screenDrift / await canvasShortEdge(page);
  // Keep the selected-node ambient cue visible yet bounded relative to the
  // actual viewport, so the ceiling remains meaningful across canvas sizes.
  expect(normalizedScreenDrift).toBeGreaterThan(0.0001);
  expect(normalizedScreenDrift).toBeLessThan(0.05);
});

test("actual node left-drag orbits the camera without moving the selected node", async ({ page }) => {
  await openFixture(page);
  await page.getByTestId("reduced-motion-toggle").check();
  await expect(page.getByTestId("reduced-motion-toggle")).toBeChecked();
  await waitForMotionSettled(page);
  const canvas = page.getByTestId("graph-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("graph canvas does not have a measurable bounding box");

  await selectMatrixNode(page, "component:api");
  const beforeSelection = await waitForSelection(page, "matrix");
  await waitForMotionSettled(page);
  const beforeAmbient = await waitForAmbientMotion(page, (motion) => (
    motion.reducedMotion
    && !motion.active
    && motion.renderedNodePositions.length === fixtureNodeCount
    && motion.renderedScreenPositions.length === fixtureNodeCount
  ));
  const beforeApiPosition = ambientPosition(beforeAmbient, "component:api", "renderedNodePositions");
  const beforeWebProjection = ambientScreenPosition(beforeAmbient, "component:web");
  const apiProjection = await waitForProjectedNodeSeparation(page, "component:api", 22);
  const startX = box.x + apiProjection.x;
  const startY = box.y + apiProjection.y;
  await page.mouse.move(startX, startY);
  expect(await waitForRawCanvasHover(page, "component:api")).toBe(true);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(startX + 120, startY + 64, { steps: 4 });
  await page.mouse.up({ button: "left" });

  await expect(canvas).toBeVisible();
  expect(await readTelemetry<ObservedSelectionState>(page, "graph-selection")).toEqual(beforeSelection);
  let afterAmbient: ObservedAmbientMotion | null = null;
  await expect.poll(async () => {
    const candidate = await readTelemetry<AmbientMotion>(page, "graph-ambient-motion");
    if (candidate.availability !== "observed" || !candidate.reducedMotion) return 0;
    const afterWebProjection = ambientScreenPosition(candidate, "component:web");
    const projectionDistance = distanceBetween(beforeWebProjection, afterWebProjection);
    if (projectionDistance > 4) afterAmbient = candidate;
    return projectionDistance;
  }).toBeGreaterThan(4);
  if (!afterAmbient) throw new Error("A post-drag live renderer observation was not observed.");
  expect(ambientPosition(afterAmbient, "component:api", "renderedNodePositions")).toEqual(beforeApiPosition);
});

test("reduced motion reaches the same public selection target and deterministic layout", async ({ browser }) => {
  test.slow();
  const normalContext = await browser.newContext();
  const normalPage = await normalContext.newPage();
  await openFixture(normalPage);
  await selectMatrixNode(normalPage, "component:web");
  const normal = await waitForSelection(normalPage, "matrix");
  const normalLayout = await waitForSettledLayout(normalPage, "component:web");
  const normalAmbient = await waitForAmbientMotion(normalPage, (motion) => (
    motion.active && !motion.reducedMotion && motion.focusNodeId === "component:web"
  ));
  const laterNormalAmbient = await waitForAmbientMotionAfter(normalPage, normalAmbient.frame, 12);
  const normalRender = (await waitForRenderObservation(normalPage)).observation;
  const normalBodies = normalRender.nodes
    .filter(({ id }) => ["profile:platform", "relation:release", "relation:orchestrate", "relation:ingest"].includes(id))
    .map(({ defaultBody, id }) => ({ defaultBody, id }));

  const reducedContext = await browser.newContext({ reducedMotion: "reduce" });
  const reducedPage = await reducedContext.newPage();
  await openFixture(reducedPage);
  await selectMatrixNode(reducedPage, "component:web");
  const reduced = await waitForSelection(reducedPage, "matrix");
  const reducedLayout = await waitForSettledLayout(reducedPage, "component:web");
  const reducedAmbient = await waitForAmbientMotion(reducedPage, (motion) => (
    motion.reducedMotion && !motion.active && motion.focusNodeId === "component:web"
  ));
  const reducedRender = (await waitForRenderObservation(reducedPage)).observation;
  const reducedBodies = reducedRender.nodes
    .filter(({ id }) => ["profile:platform", "relation:release", "relation:orchestrate", "relation:ingest"].includes(id))
    .map(({ defaultBody, id }) => ({ defaultBody, id }));

  expect(reduced).toEqual(normal);
  expect(reducedLayout).toEqual(normalLayout);
  expect(reducedBodies).toEqual(normalBodies);
  expect(reducedBodies).toEqual([
    { defaultBody: { kind: "flat-2.5d", silhouette: "capsule" }, id: "relation:release" },
    { defaultBody: { kind: "flat-2.5d", silhouette: "circle" }, id: "profile:platform" },
    { defaultBody: { kind: "flat-2.5d", silhouette: "disk" }, id: "relation:ingest" },
    { defaultBody: { kind: "flat-2.5d", silhouette: "dot" }, id: "relation:orchestrate" },
  ]);
  expect((await waitForMotionSettled(normalPage)).transition).toMatchObject({
    active: false,
    progress: 1,
    reducedMotion: false,
  });
  expect((await waitForMotionSettled(reducedPage)).transition).toMatchObject({
    active: false,
    progress: 1,
    reducedMotion: true,
  });
  expect(await readTelemetry<ObservedSelectionState & { readonly reducedMotion: boolean }>(
    reducedPage,
    "reduced-motion-selection",
  )).toEqual({ ...reduced, reducedMotion: true });
  expect(reducedAmbient.anchorNodePositions).toEqual(normalAmbient.anchorNodePositions);
  expect(reducedAmbient.renderedNodePositions).toEqual(reducedAmbient.anchorNodePositions);
  expect(reducedAmbient.linkEndpoints).toHaveLength(fixtureLinkCount);
  expectDefaultLinkEndpointsAtFlatSilhouetteBoundaries(
    normalAmbient,
    normalRender,
    normalAmbient.linkEndpoints.map(({ id }) => id),
  );
  expectDefaultLinkEndpointsAtFlatSilhouetteBoundaries(
    reducedAmbient,
    reducedRender,
    reducedAmbient.linkEndpoints.map(({ id }) => id),
  );
  expect(reducedAmbient.visibleLinkFlow).toHaveLength(0);
  expect(reducedAmbient.visibleParticles).toHaveLength(0);
  expect(laterNormalAmbient.frame).toBeGreaterThan(normalAmbient.frame);
  expect(distanceBetween(
    ambientScreenPosition(normalAmbient, "component:web"),
    ambientScreenPosition(laterNormalAmbient, "component:web"),
  )).toBeGreaterThan(0.1);

  await advanceAnimationFrames(reducedPage, 12);
  const laterReducedAmbient = await waitForAmbientMotion(reducedPage, (motion) => motion.reducedMotion);
  expect(laterReducedAmbient.frame).toBe(reducedAmbient.frame);
  expect(laterReducedAmbient.phase).toBe(reducedAmbient.phase);
  expect(laterReducedAmbient.renderedNodePositions).toEqual(reducedAmbient.renderedNodePositions);
  expect(laterReducedAmbient.renderedScreenPositions).toEqual(reducedAmbient.renderedScreenPositions);
  expect(laterReducedAmbient.visibleParticles).toEqual(reducedAmbient.visibleParticles);

  await normalContext.close();
  await reducedContext.close();
});

test("pauses ambient motion while hidden and resumes when CDP visibility control is available", async ({ page }) => {
  await openFixture(page);
  const active = await waitForAmbientMotion(page, (motion) => motion.active && !motion.paused);
  let session: CDPSession | null = null;

  try {
    session = await page.context().newCDPSession(page);
    try {
      await session.send("Emulation.setPageVisibilityState", { visibilityState: "hidden" });
    } catch {
      test.skip(true, "This Chromium runtime does not expose controllable page visibility.");
      return;
    }
    const hidden = await page.evaluate(() => document.visibilityState === "hidden");
    if (!hidden) {
      test.skip(true, "This Chromium runtime does not expose controllable document visibility.");
      return;
    }

    const paused = await waitForAmbientMotion(page, (motion) => motion.paused && !motion.active);
    expect(paused.frame).toBeGreaterThanOrEqual(active.frame);
    expect(paused.elapsedMs).toBeGreaterThanOrEqual(active.elapsedMs);
    expect(paused.visibleParticles).toHaveLength(0);

    await session.send("Emulation.setPageVisibilityState", { visibilityState: "visible" });
    const visible = await page.evaluate(() => document.visibilityState === "visible");
    if (!visible) {
      test.skip(true, "This Chromium runtime cannot restore document visibility.");
      return;
    }
    const resumed = await waitForAmbientMotionAfter(
      page,
      paused.frame,
      1,
      (motion) => motion.active && !motion.paused,
    );
    expect(resumed.phase).not.toBe(paused.phase);
    expect(resumed.elapsedMs).toBeGreaterThan(paused.elapsedMs);
  } finally {
    await session?.detach().catch(() => undefined);
  }
});

test("does not claim unobserved camera transitions and survives setInput/collapse host updates", async ({ page }) => {
  await openFixture(page);
  await selectMatrixNode(page, "component:api");
  await waitForSelection(page, "matrix");
  await waitForCameraObservation(page, "component:api");

  await page.getByTestId("host-set-input").click();
  await expect.poll(async () => readTelemetry<{
    readonly selectedNodeId: string | null;
    readonly setInputSafe: boolean;
  }>(page, "host-update-status")).toMatchObject({
    selectedNodeId: "component:api",
    setInputSafe: true,
  });

  await page.getByTestId("host-toggle-collapse").click();
  await expect.poll(async () => readTelemetry<{
    readonly selectedNodeId: string | null;
    readonly collapsed: boolean;
  }>(page, "collapse-status")).toMatchObject({
    collapsed: true,
    selectedNodeId: "component:api",
  });
  await expect.poll(async () => readTelemetry<{
    readonly collapseSafe: boolean;
    readonly selectedNodeId: string | null;
  }>(page, "host-update-status")).toMatchObject({
    collapseSafe: true,
    selectedNodeId: "component:api",
  });
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
});

test("reports forced WebGL context failure without selection or camera success telemetry", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patchedGetContext(contextId, ...args) {
      if (typeof contextId === "string" && /^(?:webgl2?|experimental-webgl)$/i.test(contextId)) return null;
      return nativeGetContext.call(this, contextId, ...args);
    };
  });

  await page.goto("/");
  await expect(page.getByTestId("graph-renderer-failure")).toContainText("WebGL unavailable");
  await expect(page.getByTestId("graph-renderer-failure-reason")).toContainText(/WebGL|context|renderer/i);

  const selection = await readTelemetry<UnavailableTelemetry>(page, "graph-selection");
  expect(selection).toMatchObject({ availability: "unavailable" });
  expect(selection).not.toHaveProperty("nodeId");
  expect(selection).not.toHaveProperty("source");

  const layout = await readTelemetry<UnavailableTelemetry>(page, "graph-settled-layout");
  expect(layout).toMatchObject({ availability: "unavailable" });
  expect(layout).not.toHaveProperty("targetNodePositions");

  const camera = await readTelemetry<UnavailableTelemetry>(page, "graph-camera-state");
  expect(camera).toMatchObject({ availability: "unavailable" });
  expect(camera).not.toHaveProperty("status");
  expect(camera).not.toHaveProperty("x");
  expect(camera).not.toHaveProperty("y");

  const screenPosition = await readTelemetry<UnavailableTelemetry>(page, "graph-selected-screen-position");
  expect(screenPosition).toMatchObject({ availability: "unavailable" });
  expect(screenPosition).not.toHaveProperty("x");
  expect(screenPosition).not.toHaveProperty("y");
  const masterScreenPosition = await readTelemetry<UnavailableTelemetry>(page, "graph-master-screen-position");
  expect(masterScreenPosition).toMatchObject({ availability: "unavailable" });
  expect(masterScreenPosition).not.toHaveProperty("x");
  expect(masterScreenPosition).not.toHaveProperty("y");

  const renderObservation = await readTelemetry<UnavailableTelemetry>(page, "graph-render-observation");
  expect(renderObservation).toMatchObject({ availability: "unavailable" });
  expect(renderObservation).not.toHaveProperty("observation");
  const renderedNodeIds = await readTelemetry<UnavailableTelemetry>(page, "graph-rendered-node-ids");
  expect(renderedNodeIds).toMatchObject({ availability: "unavailable" });
  expect(renderedNodeIds).not.toHaveProperty("ids");
  const renderedLinkIds = await readTelemetry<UnavailableTelemetry>(page, "graph-rendered-link-ids");
  expect(renderedLinkIds).toMatchObject({ availability: "unavailable" });
  expect(renderedLinkIds).not.toHaveProperty("ids");
  const masterVisibility = await readTelemetry<UnavailableTelemetry>(page, "master-visibility");
  expect(masterVisibility).toMatchObject({ availability: "unavailable" });
  expect(masterVisibility).not.toHaveProperty("objectVisible");
  const distanceVisibility = await readTelemetry<UnavailableTelemetry>(page, "selection-distance-visibility");
  expect(distanceVisibility).toMatchObject({ availability: "unavailable" });
  expect(distanceVisibility).not.toHaveProperty("selected");

  await openMatrixPalette(page);
  await expect(page.getByTestId("matrix-row-component-api")).toBeDisabled();
  await expect(page.getByTestId("host-set-input")).toBeDisabled();
});
