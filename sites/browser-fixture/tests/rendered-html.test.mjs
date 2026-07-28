import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render({ headers = {}, url = "https://localhost/" } = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(url, {
      headers: { accept: "text/html", ...headers },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the graph workbench browser-fixture shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Graph Workbench Browser Fixture<\/title>/i);
  assert.match(html, /data-testid="graph-shell"/);
  assert.match(html, /data-testid="graph-detail-panel"/);
  assert.match(html, /data-testid="graph-render-observation"/);
  assert.match(html, /data-testid="graph-rendered-node-ids"/);
  assert.match(html, /data-testid="master-visibility"/);
  assert.match(html, /data-testid="selection-distance-visibility"/);
  assert.doesNotMatch(html, /renderer-live-data-and-scene-object-material|scene-attached-render-object/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|react-loading-skeleton|codex-preview/i);
});

test("uses the public Host over spoofed forwarded metadata headers", async () => {
  const response = await render({
    headers: {
      host: "fixture.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "http",
    },
    url: "https://fixture.example/",
  });
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /https:\/\/fixture\.example\/og\.png/i);
  assert.doesNotMatch(html, /attacker\.example|http:\/\/fixture\.example\/og\.png/i);
});

test("replaces the disposable starter surface with the graph fixture", async () => {
  const [page, layout, fixture, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/BrowserGraphFixture.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /BrowserGraphFixture/);
  assert.match(layout, /Graph Workbench Browser Fixture/);
  assert.match(fixture, /createBrowserGraphWorkbench/);
  assert.match(fixture, /getRenderObservation/);
  assert.match(fixture, /canvas\.dataset\.testid = "graph-canvas"/);
  assert.match(fixture, /data-testid="graph-detail-panel"/);
  assert.match(packageJson, /"@pureliture\/graph-workbench": "file:\.\.\/\.\."/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview/);

  await assert.rejects(access(new URL("app/_sites-preview", templateRoot)));
});
