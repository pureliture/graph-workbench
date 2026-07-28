import { afterEach, describe, expect, it, vi } from "vitest";

import { graphFixture } from "./fixtures.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("browser entry", () => {
  it("supports WebView and test hosts without window.matchMedia", async () => {
    vi.stubGlobal("window", {});
    const { createBrowserGraphWorkbench } = await import("../src/browser.js");

    expect(() => createBrowserGraphWorkbench({ input: graphFixture })).not.toThrow();
  });
});
