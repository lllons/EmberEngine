/**
 * Integration: game folder -> export pipeline -> player payload -> player server -> play.
 *
 * This is the path an exported `.exe` takes, minus the final `deno compile`: the packager
 * builds the bundle, the player restores it, serves it and runs it headlessly. A regression
 * here is a broken export.
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { loadGame } from "@ember/gameloader";
import { exportGame } from "@ember/packager";
import {
  bundleFromJSON,
  bundleSceneNames,
  handleRequest,
  headlessPlay,
  startPlayerServer,
  validateBundle,
} from "@ember/player";
import { createGame } from "../../games/ember-runner/src/main.ts";

const workspaceRoot = Deno.cwd();
const gameDirectory = `${workspaceRoot}/games/ember-runner`;

Deno.test("the export pipeline builds a complete player payload", async () => {
  const loaded = await loadGame(gameDirectory);
  const result = await exportGame({
    game: loaded.game,
    scenes: loaded.scenes,
    startScene: loaded.descriptor.start,
    gameModulePath: loaded.descriptor.entryPath ??
      `${gameDirectory}/src/main.ts`,
    gameDirectory,
    workspaceRoot,
    skipCompile: true,
  });

  assertEquals(result.gameId, "ember-runner");
  assertEquals(result.startScene, "title");
  assert(result.scenes.length >= 3, `exported ${result.scenes.length} scenes`);
  assert(result.bundleBytes > 1000);
  assert(result.appBytes > 1000, "the browser module was bundled");
  assert(result.exePath === null, "--fast stops before compiling");
  assertEquals(result.warnings, []);
});

Deno.test("the exported bundle validates and names its scenes", async () => {
  const loaded = await loadGame(gameDirectory);
  const result = await exportGame({
    game: loaded.game,
    scenes: loaded.scenes,
    startScene: loaded.descriptor.start,
    gameModulePath: `${gameDirectory}/src/main.ts`,
    gameDirectory,
    workspaceRoot,
    skipCompile: true,
  });
  const text = await Deno.readTextFile(result.bundlePath);
  const bundle = bundleFromJSON(text);
  assertEquals(validateBundle(bundle).ok, true);
  const names = bundleSceneNames(bundle);
  assert(names.includes("title"));
  assert(names.includes("level-1"));
  assertEquals(bundle.game.start, "title");
});

Deno.test("the exported bundle restores into playable scenes", async () => {
  const loaded = await loadGame(gameDirectory);
  const result = await exportGame({
    game: loaded.game,
    scenes: loaded.scenes,
    startScene: loaded.descriptor.start,
    gameModulePath: `${gameDirectory}/src/main.ts`,
    gameDirectory,
    workspaceRoot,
    skipCompile: true,
  });
  const bundle = bundleFromJSON(await Deno.readTextFile(result.bundlePath));
  const headless = headlessPlay(bundle, createGame, 1);
  assertEquals(headless.game, "ember-runner");
  assertEquals(headless.scene, "title");
  assertEquals(headless.frames, 60);
  assert(headless.entityCount > 0);
  assert(/^[0-9a-f]{8}$/.test(headless.digest));
});

Deno.test("headless play is deterministic for the same bundle", async () => {
  const loaded = await loadGame(gameDirectory);
  const result = await exportGame({
    game: loaded.game,
    scenes: loaded.scenes,
    startScene: loaded.descriptor.start,
    gameModulePath: `${gameDirectory}/src/main.ts`,
    gameDirectory,
    workspaceRoot,
    skipCompile: true,
  });
  const bundle = bundleFromJSON(await Deno.readTextFile(result.bundlePath));
  const first = headlessPlay(bundle, createGame, 2);
  const second = headlessPlay(bundle, createGame, 2);
  assertEquals(first.digest, second.digest);
  assertEquals(first.frames, second.frames);
});

Deno.test("the player page serves the exported game over HTTP", async () => {
  const loaded = await loadGame(gameDirectory);
  const result = await exportGame({
    game: loaded.game,
    scenes: loaded.scenes,
    startScene: loaded.descriptor.start,
    gameModulePath: `${gameDirectory}/src/main.ts`,
    gameDirectory,
    workspaceRoot,
    skipCompile: true,
  });
  const bundle = bundleFromJSON(await Deno.readTextFile(result.bundlePath));
  const appSource = await Deno.readTextFile(result.appPath);
  assertStringIncludes(appSource, "createGame");

  const server = await startPlayerServer({ bundle, appSource, port: 0 });
  try {
    const page = await fetch(`${server.url}/`);
    assertEquals(page.status, 200);
    const html = await page.text();
    assertStringIncludes(html, "Ember Runner");
    assertStringIncludes(html, "/app.js");

    const servedBundle = await (await fetch(`${server.url}/game.json`)).json();
    assertEquals(servedBundle.game.start, "title");
    assertEquals(validateBundle(servedBundle).ok, true);

    const module = await (await fetch(`${server.url}/app.js`)).text();
    assertEquals(module.length, appSource.length);

    const health = await (await fetch(`${server.url}/health`)).json();
    assertEquals(health.ok, true);
    assertEquals(health.game.id, "ember-runner");
  } finally {
    await server.stop();
  }
});

Deno.test("the in-memory page handler serves the same routes as the socket", async () => {
  const loaded = await loadGame(gameDirectory);
  const result = await exportGame({
    game: loaded.game,
    scenes: loaded.scenes,
    startScene: loaded.descriptor.start,
    gameModulePath: `${gameDirectory}/src/main.ts`,
    gameDirectory,
    workspaceRoot,
    skipCompile: true,
  });
  const bundle = bundleFromJSON(await Deno.readTextFile(result.bundlePath));
  const appSource = await Deno.readTextFile(result.appPath);
  const response = await handleRequest(new Request("http://player/"), { bundle, appSource });
  assertEquals(response.status, 200);
  const html = await response.text();
  // The canvas is created by the bundled app, so the page only has to load it.
  assertStringIncludes(html, '<script type="module" src="/app.js"></script>');
  assertStringIncludes(html, "Ember Runner");
});
