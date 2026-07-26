import { expect, test, type Page } from "@playwright/test";

const inputNodeIds = ["relation:release", "component:api", "component:web", "profile:platform"];
const inputLinkIds = ["release-api", "api-web", "release-profile", "profile-api"];

interface ObservedSelectionState {
  readonly availability: "observed";
  readonly nodeId: string | null;
  readonly neighborNodeIds: readonly string[];
  readonly settled: true;
  readonly source: string;
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

interface MotionTelemetryFrame {
  readonly positions: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
  }[];
  readonly transition: {
    readonly active: boolean;
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

interface ObservedRenderTelemetry {
  readonly availability: "observed";
  readonly observation: {
    readonly linkIds: readonly string[];
    readonly links: readonly RenderObjectObservation[];
    readonly nodeIds: readonly string[];
    readonly nodes: readonly RenderObjectObservation[];
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

async function waitForSettledLayout(page: Page): Promise<ObservedSettledLayout> {
  await expect.poll(async () => readTelemetry<ObservedSettledLayout>(page, "graph-settled-layout")).toMatchObject({
    availability: "observed",
    seed: expect.any(String),
    settled: true,
    targetNodePositions: expect.any(Array),
  });
  const layout = await readTelemetry<ObservedSettledLayout>(page, "graph-settled-layout");
  expect(layout.targetNodePositions.map((node) => node.id).sort()).toEqual([...inputNodeIds].sort());
  expect(layout.viewport).toBeTruthy();
  return layout;
}

async function waitForSelectedScreenPosition(page: Page, nodeId: string): Promise<ObservedScreenPosition> {
  const canvas = page.getByTestId("graph-canvas");
  await canvas.scrollIntoViewIfNeeded();
  await expect.poll(async () => readTelemetry<ObservedScreenPosition>(page, "graph-selected-screen-position"))
    .toMatchObject({
      availability: "observed",
      nodeId,
      x: expect.any(Number),
      y: expect.any(Number),
    });

  const position = await readTelemetry<ObservedScreenPosition>(page, "graph-selected-screen-position");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("graph canvas does not have a measurable bounding box");
  expect(Number.isFinite(position.x)).toBe(true);
  expect(Number.isFinite(position.y)).toBe(true);
  expect(position.x).toBeGreaterThan(0);
  expect(position.x).toBeLessThan(box.width);
  expect(position.y).toBeGreaterThan(0);
  expect(position.y).toBeLessThan(box.height);
  return position;
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

async function openFixture(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("graph-shell")).toBeVisible();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await waitForSettledLayout(page);
}

async function waitForRendererPointerSample(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function clickSelectedCanvasNode(page: Page, nodeId: string): Promise<void> {
  const canvas = page.getByTestId("graph-canvas");
  const { x, y } = await waitForSelectedScreenPosition(page, nodeId);
  await canvas.hover({ position: { x, y } });
  await waitForRendererPointerSample(page);
  await canvas.click({ position: { x, y } });
}

async function hoverSelectedCanvasNode(page: Page, nodeId: string): Promise<void> {
  const canvas = page.getByTestId("graph-canvas");
  const { x, y } = await waitForSelectedScreenPosition(page, nodeId);
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

  await expect.poll(async () => readTelemetry<string[]>(page, "graph-input-node-ids")).toEqual(inputNodeIds);
  await expect.poll(async () => readTelemetry<string[]>(page, "graph-input-link-ids")).toEqual(inputLinkIds);
  expect((await waitForRenderedIds(page, "graph-rendered-node-ids")).ids).toEqual(inputNodeIds);
  expect((await waitForRenderedIds(page, "graph-rendered-link-ids")).ids).toEqual(inputLinkIds);

  const { observation } = await waitForRenderObservation(page);
  expect(observation.nodeIds).toEqual(inputNodeIds);
  expect(observation.linkIds).toEqual(inputLinkIds);
  expect(observation.nodes.map(({ id }) => id)).toEqual(inputNodeIds);
  expect(observation.links.map(({ id }) => id)).toEqual(inputLinkIds);
  expect(observation.nodes.every(({ objectTracked, sceneAttached }) => objectTracked && sceneAttached)).toBe(true);
  expect(observation.links.every(({ objectTracked, sceneAttached }) => objectTracked && sceneAttached)).toBe(true);
});

test("observes the master floor and selection-distance opacity in attached scene objects", async ({ page }) => {
  await openFixture(page);
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
      minimumVisibleMaterialOpacity: 0.62,
      observationScope: "scene-object-and-material-not-rendered-pixels",
      pixelVisibility: "not-observed",
      visual: {
        contrast: 0.72,
        labelCue: "visible",
        opacity: 0.62,
        opacityFloor: 0.62,
      },
    });
  const master = await readTelemetry<ObservedMasterVisibility>(page, "master-visibility");
  expect(master.visibleMaterialOpacities).toContain(0.62);

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
    minimumVisibleMaterialOpacity: 1,
    visual: { opacity: 1 },
  });
  expect(distanceVisibility.neighbors).toHaveLength(1);
  expect(distanceVisibility.neighbors[0]).toMatchObject({
    nodeId: "component:api",
    objectVisible: true,
    sceneAttached: true,
    minimumVisibleMaterialOpacity: 0.86,
    visual: { opacity: 0.86 },
  });
  const distantById = new Map(distanceVisibility.distant.map((node) => [node.nodeId, node]));
  expect(distantById.get("profile:platform")).toMatchObject({
    objectVisible: true,
    sceneAttached: true,
    minimumVisibleMaterialOpacity: 0.3,
    visual: { opacity: 0.3 },
  });
  expect(distantById.get("relation:release")).toMatchObject({
    objectVisible: true,
    sceneAttached: true,
    minimumVisibleMaterialOpacity: 0.62,
    visual: { opacity: 0.62, opacityFloor: 0.62 },
  });
  const linksById = new Map(distanceVisibility.links.map((link) => [link.linkId, link]));
  expect(linksById.get("api-web")).toMatchObject({
    objectVisible: true,
    sceneAttached: true,
    minimumVisibleMaterialOpacity: 0.9,
    visibleMaterialLineWidths: [1.65],
    visual: { opacity: 0.9, width: 1.65 },
  });
  expect(linksById.get("release-profile")).toMatchObject({
    objectVisible: true,
    sceneAttached: true,
    minimumVisibleMaterialOpacity: 0.22,
    visibleMaterialLineWidths: [0.7],
    visual: { opacity: 0.22, width: 0.7 },
  });

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

test("reproduces selected target positions from the same seed and viewport", async ({ page }) => {
  await openFixture(page);

  await selectMatrixNode(page, "component:api");
  const selection = await waitForSelection(page, "matrix");
  expect(selection).toMatchObject({
    nodeId: "component:api",
    neighborNodeIds: ["relation:release", "component:web", "profile:platform"],
    settled: true,
  });
  const first = await waitForSettledLayout(page);

  await page.getByTestId("reset-layout").click();
  await waitForSelection(page, "programmatic");
  await selectMatrixNode(page, "component:api");
  await waitForSelection(page, "matrix");
  const second = await waitForSettledLayout(page);

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
  const layout = await waitForSettledLayout(page);
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

test("preserves one selection identity across Matrix, actual canvas mouse, keyboard, and re-selection", async ({ page }) => {
  test.slow();
  await openFixture(page);

  await selectMatrixNode(page, "component:api");
  expect(await waitForSelection(page, "matrix")).toMatchObject({ nodeId: "component:api" });
  await expect(page.getByTestId("graph-detail-panel")).toContainText("component:api");

  await clickSelectedCanvasNode(page, "component:api");
  expect(await waitForSelection(page, "mouse")).toMatchObject({ nodeId: "component:api", settled: true });

  await clickSelectedCanvasNode(page, "component:api");
  expect(await waitForSelection(page, "mouse")).toMatchObject({ nodeId: "component:api", settled: true });

  await page.getByTestId("graph-shell").focus();
  await page.keyboard.press("ArrowRight");
  expect(await waitForSelection(page, "keyboard")).toMatchObject({ nodeId: "component:web" });
  await expect(page.getByTestId("graph-detail-panel")).toContainText("component:web");

  await selectMatrixNode(page, "component:web");
  expect(await waitForSelection(page, "matrix")).toMatchObject({ nodeId: "component:web" });
  await expect(page.getByTestId("matrix-selection")).toContainText("component:web");
  await expect(page.getByTestId("graph-detail-panel")).toContainText("component:web");
});

test("actual canvas hover preserves the current public selection identity", async ({ page }) => {
  await openFixture(page);
  await selectMatrixNode(page, "component:api");
  const beforeSelection = await waitForSelection(page, "matrix");
  const beforeCamera = await waitForCameraObservation(page, "component:api");

  await hoverSelectedCanvasNode(page, "component:api");

  expect(await readTelemetry<ObservedSelectionState>(page, "graph-selection")).toEqual(beforeSelection);
  expect(await readTelemetry<ObservedScreenPosition>(page, "graph-camera-state")).toEqual(beforeCamera);
});

test("actual canvas navigation drag preserves the selected public identity", async ({ page }) => {
  await openFixture(page);
  const canvas = page.getByTestId("graph-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("graph canvas does not have a measurable bounding box");

  await selectMatrixNode(page, "component:api");
  const beforeSelection = await waitForSelection(page, "matrix");

  await page.mouse.move(box.x + box.width - 32, box.y + box.height - 32);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.x + box.width - 200, box.y + box.height - 120, { steps: 4 });
  await page.mouse.up({ button: "right" });

  await expect(canvas).toBeVisible();
  expect(await readTelemetry<ObservedSelectionState>(page, "graph-selection")).toEqual(beforeSelection);
});

test("reduced motion reaches the same public selection target and deterministic layout", async ({ browser }) => {
  test.slow();
  const normalContext = await browser.newContext();
  const normalPage = await normalContext.newPage();
  await openFixture(normalPage);
  await selectMatrixNode(normalPage, "component:web");
  const normal = await waitForSelection(normalPage, "matrix");
  const normalLayout = await waitForSettledLayout(normalPage);

  const reducedContext = await browser.newContext({ reducedMotion: "reduce" });
  const reducedPage = await reducedContext.newPage();
  await openFixture(reducedPage);
  await selectMatrixNode(reducedPage, "component:web");
  const reduced = await waitForSelection(reducedPage, "matrix");
  const reducedLayout = await waitForSettledLayout(reducedPage);

  expect(reduced).toEqual(normal);
  expect(reducedLayout).toEqual(normalLayout);
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

  await normalContext.close();
  await reducedContext.close();
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
