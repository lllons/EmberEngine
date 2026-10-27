/**
 * @ember/player/bundle — the payload that travels inside an exported game.
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import { Scene, Transform, vec2 } from "@ember/core";
import { createManifest } from "@ember/assets";
import {
  PLAYER_BUNDLE_FORMAT,
  PLAYER_BUNDLE_VERSION,
  bundleFromJSON,
  bundleSceneNames,
  bundleToJSON,
  createBundle,
  describeBundle,
  scenesFromBundle,
  validateBundle,
} from "@ember/player";

function scenes(): Record<string, Scene> {
  return {
    title: new Scene({ name: "title" }),
    "level-1": (() => {
      const scene = new Scene({ name: "level-1" });
      scene.createEntity({ name: "player", position: vec2(16, 32) });
      scene.createEntity({ name: "coin", position: vec2(48, 32) });
      return scene;
    })(),
  };
}

function bundle() {
  return createBundle({
    id: "test-game",
    title: "Test Game",
    start: "title",
    scenes: scenes(),
    builtAt: "2026-01-01T00:00:00.000Z",
  });
}

Deno.test("createBundle stamps the format and version", () => {
  const created = bundle();
  assertEquals(created.format, PLAYER_BUNDLE_FORMAT);
  assertEquals(created.version, PLAYER_BUNDLE_VERSION);
});

Deno.test("createBundle records the game identity and start scene", () => {
  const created = bundle();
  assertEquals(created.game.id, "test-game");
  assertEquals(created.game.title, "Test Game");
  assertEquals(created.game.version, "0.1.0");
  assertEquals(created.game.start, "title");
});

Deno.test("createBundle defaults the viewport", () => {
  assertEquals(bundle().game.viewport, { width: 960, height: 540 });
});

Deno.test("createBundle keeps an explicit viewport", () => {
  const created = createBundle({
    id: "x",
    title: "X",
    start: "a",
    viewport: { width: 320, height: 180 },
    scenes: { a: new Scene() },
  });
  assertEquals(created.game.viewport, { width: 320, height: 180 });
});

Deno.test("createBundle stores one serialized scene per input scene", () => {
  const created = bundle();
  assertEquals(bundleSceneNames(created), ["title", "level-1"]);
  assertEquals(created.scenes.every((scene) => typeof scene.format === "string"), true);
});

Deno.test("createBundle rejects an empty scene set", () => {
  assertThrows(
    () => createBundle({ id: "x", title: "X", start: "a", scenes: {} }),
    Error,
    "at least one scene",
  );
});

Deno.test("createBundle rejects a start scene that is not included", () => {
  assertThrows(
    () =>
      createBundle({
        id: "x",
        title: "X",
        start: "missing",
        scenes: { a: new Scene() },
      }),
    Error,
    "start scene",
  );
});

Deno.test("createBundle defaults the asset manifest to an empty one", () => {
  assertEquals(bundle().manifest.entries, []);
});

Deno.test("createBundle accepts an explicit manifest", () => {
  const manifest = createManifest("/game");
  const created = createBundle({
    id: "x",
    title: "X",
    start: "a",
    scenes: { a: new Scene() },
    manifest,
  });
  assertEquals(created.manifest, manifest);
});

Deno.test("createBundle keeps the supplied build timestamp", () => {
  assertEquals(bundle().builtAt, "2026-01-01T00:00:00.000Z");
});

Deno.test("scenesFromBundle rebuilds playable scenes", () => {
  const rebuilt = scenesFromBundle(bundle());
  assertEquals([...rebuilt.keys()], ["title", "level-1"]);
  assertEquals(rebuilt.get("level-1")!.entityCount, 2);
});

Deno.test("scenesFromBundle preserves positions and names", () => {
  const level = scenesFromBundle(bundle()).get("level-1")!;
  const player = level.findByName("player")!;
  assertEquals(level.world.require(player, Transform).position, vec2(16, 32));
});

Deno.test("a rebuilt bundle is a fresh world each time", () => {
  const created = bundle();
  const first = scenesFromBundle(created).get("level-1")!;
  const second = scenesFromBundle(created).get("level-1")!;
  assert(first !== second);
  assert(first.world !== second.world);
});

Deno.test("bundleToJSON and bundleFromJSON round-trip", () => {
  const created = bundle();
  const restored = bundleFromJSON(bundleToJSON(created));
  assertEquals(restored.game.id, created.game.id);
  assertEquals(bundleSceneNames(restored), bundleSceneNames(created));
});

Deno.test("bundleFromJSON rejects text that is not JSON", () => {
  assertThrows(() => bundleFromJSON("{ nope"), Error);
});

Deno.test("bundleFromJSON rejects a foreign payload", () => {
  assertThrows(() => bundleFromJSON("{}"), Error, "invalid player bundle");
});

Deno.test("validateBundle accepts a well-formed bundle", () => {
  assertEquals(validateBundle(bundle()), { ok: true, problems: [] });
});

Deno.test("validateBundle rejects non-objects", () => {
  for (const value of [null, 42, "x", []]) {
    const result = validateBundle(value);
    assertEquals(result.ok, false);
    assert(result.problems.length > 0);
  }
});

Deno.test("validateBundle reports a wrong format", () => {
  const result = validateBundle({ ...bundle(), format: "other" });
  assertEquals(result.ok, false);
  assert(result.problems.some((problem) => problem.includes("format")));
});

Deno.test("validateBundle reports an unsupported version", () => {
  const result = validateBundle({ ...bundle(), version: 99 });
  assert(result.problems.some((problem) => problem.includes("version")));
});

Deno.test("validateBundle reports a missing game id", () => {
  const broken = { ...bundle(), game: { ...bundle().game, id: undefined } };
  const result = validateBundle(broken);
  assert(result.problems.some((problem) => problem.includes("game id")));
});

Deno.test("validateBundle reports missing or empty scenes", () => {
  assert(validateBundle({ ...bundle(), scenes: [] }).problems.some((p) => p.includes("scenes")));
  assert(validateBundle({ ...bundle(), scenes: undefined }).problems.some((p) => p.includes("scenes")));
});

Deno.test("validateBundle reports a scene in the wrong format", () => {
  const created = bundle();
  const broken = {
    ...created,
    scenes: [{ ...created.scenes[0], format: "other" }, ...created.scenes.slice(1)],
  };
  assert(validateBundle(broken).problems.some((problem) => problem.includes("format")));
});

Deno.test("validateBundle reports a missing start scene", () => {
  const created = bundle();
  const broken = { ...created, game: { ...created.game, start: "ghost" } };
  assert(validateBundle(broken).problems.some((problem) => problem.includes("start scene")));
});

Deno.test("validateBundle reports a missing asset manifest", () => {
  const result = validateBundle({ ...bundle(), manifest: undefined });
  assert(result.problems.some((problem) => problem.includes("manifest")));
});

Deno.test("validateBundle collects several problems at once", () => {
  const result = validateBundle({ format: "x", version: 2, scenes: [] });
  assert(result.problems.length >= 4);
});

Deno.test("describeBundle summarises the game in human terms", () => {
  const text = describeBundle(bundle());
  assert(text.includes("Test Game v0.1.0 (test-game)"));
  assert(text.includes("scenes: title, level-1"));
  assert(text.includes("start: title"));
  assert(text.includes("viewport: 960x540"));
});

Deno.test("describeBundle mentions the asset count", () => {
  assert(describeBundle(bundle()).includes("assets: 0"));
});
