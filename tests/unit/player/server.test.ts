/**
 * @ember/player/server — the loopback server an exported game serves itself from.
 *
 * The last suite here starts a real socket: the exported exe once crashed inside
 * `onListen` before binding, which only a socket-level test catches.
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Scene } from "@ember/core";
import {
  createBundle,
  escapeHtml,
  handleRequest,
  playerPageHtml,
  startPlayerServer,
} from "@ember/player";

const appSource = "export const started = true;";

function bundle() {
  const title = new Scene({ name: "title" });
  title.createEntity({ name: "hero" });
  return createBundle({
    id: "server-game",
    title: "Server <Game>",
    start: "title",
    scenes: { title },
    builtAt: "2026-01-01T00:00:00.000Z",
  });
}

const options = { bundle: bundle(), appSource };

Deno.test("the page embeds the game title and loads the app module", () => {
  const html = playerPageHtml(options.bundle);
  assertStringIncludes(html, "/app.js");
  assertStringIncludes(html, "Server &lt;Game&gt;");
});

Deno.test("the page is a full HTML document", () => {
  const html = playerPageHtml(options.bundle);
  assert(html.startsWith("<!doctype html>"));
  assertStringIncludes(html, "<html lang=\"en\">");
});

Deno.test("escapeHtml escapes every dangerous character", () => {
  assertEquals(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

Deno.test("escapeHtml leaves safe text alone", () => {
  assertEquals(escapeHtml("Ember Runner 2"), "Ember Runner 2");
});

Deno.test("escapeHtml handles an empty string", () => {
  assertEquals(escapeHtml(""), "");
});

Deno.test("GET / serves the page", async () => {
  const response = await handleRequest(new Request("http://x/"), options);
  assertEquals(response.status, 200);
  assertStringIncludes(response.headers.get("content-type") ?? "", "text/html");
  assertStringIncludes(await response.text(), "app.js");
});

Deno.test("the page is never cached", async () => {
  const response = await handleRequest(new Request("http://x/"), options);
  assertEquals(response.headers.get("cache-control"), "no-store");
});

Deno.test("GET /index.html serves the same page", async () => {
  const response = await handleRequest(new Request("http://x/index.html"), options);
  assertEquals(response.status, 200);
});

Deno.test("GET /app.js serves the bundled module with a JS content type", async () => {
  const response = await handleRequest(new Request("http://x/app.js"), options);
  assertEquals(response.headers.get("content-type"), "text/javascript; charset=utf-8");
  assertEquals(await response.text(), appSource);
});

Deno.test("GET /game.json returns the raw bundle", async () => {
  const response = await handleRequest(new Request("http://x/game.json"), options);
  const payload = await response.json();
  assertEquals(payload.game.id, "server-game");
  assertEquals(payload.scenes[0].name, "title");
});

Deno.test("GET /health reports readiness and scene names", async () => {
  const response = await handleRequest(new Request("http://x/health"), options);
  const payload = await response.json();
  assertEquals(payload.ok, true);
  assertEquals(payload.game.id, "server-game");
  assertEquals(payload.scenes, ["title"]);
});

Deno.test("GET /bundle.txt returns the human summary", async () => {
  const response = await handleRequest(new Request("http://x/bundle.txt"), options);
  assertStringIncludes(await response.text(), "Server <Game> v0.1.0");
});

Deno.test("an unknown path returns 404 plain text", async () => {
  const response = await handleRequest(new Request("http://x/nope"), options);
  assertEquals(response.status, 404);
  assertEquals(await response.text(), "not found");
});

Deno.test("paths are matched exactly, not by prefix", async () => {
  const response = await handleRequest(new Request("http://x/app.js.map"), options);
  assertEquals(response.status, 404);
});

Deno.test("query strings do not change routing", async () => {
  const response = await handleRequest(new Request("http://x/?debug=1"), options);
  assertEquals(response.status, 200);
});

// ---------------------------------------------------------------------------
// Real socket (regression: the exe crashed inside onListen before binding)
// ---------------------------------------------------------------------------

Deno.test("the server binds, answers HTTP and stops", async () => {
  const server = await startPlayerServer({ ...options, port: 0 });
  try {
    assert(server.port > 0);
    assertEquals(server.hostname, "127.0.0.1");
    assertStringIncludes(server.url, `:${server.port}`);

    const page = await fetch(`${server.url}/`);
    assertEquals(page.status, 200);
    assertStringIncludes(await page.text(), "app.js");

    const health = await fetch(`${server.url}/health`);
    assertEquals((await health.json()).game.id, "server-game");

    const module = await fetch(`${server.url}/app.js`);
    assertEquals(await module.text(), appSource);

    assert(server.requests >= 3);
  } finally {
    await server.stop();
  }
});

Deno.test("a stopped server refuses connections", async () => {
  const server = await startPlayerServer({ ...options, port: 0 });
  const url = server.url;
  await server.stop();
  let failed = false;
  try {
    await fetch(`${url}/health`);
  } catch {
    failed = true;
  }
  assert(failed, "fetch after stop must fail");
});

Deno.test("two servers can run at once on separate ports", async () => {
  const first = await startPlayerServer({ ...options, port: 0 });
  const second = await startPlayerServer({ ...options, port: 0 });
  try {
    assert(first.port !== second.port);
    assertEquals((await (await fetch(`${first.url}/health`)).json()).ok, true);
    assertEquals((await (await fetch(`${second.url}/health`)).json()).ok, true);
  } finally {
    await first.stop();
    await second.stop();
  }
});
