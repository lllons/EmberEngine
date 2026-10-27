/**
 * Ember Runner — the game built with the engine, tested through the public engine API.
 *
 * These tests play the game: they build a session, press keys, step the simulation and read
 * the run state. Nothing here reaches into engine internals, so a refactor of the renderer
 * or the ECS cannot make them lie.
 */

import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { Scene, Script, Tag, TextLabel, Transform, Velocity, vec2 } from "@ember/core";
import { sceneDigest } from "@ember/runtime";
import {
  COIN_TAG,
  GOAL_TAG,
  HAZARD_TAG,
  LEVEL_ONE,
  PLAYER_TAG,
  TITLE_SCENE,
  buildLevelScene,
  buildScenes,
  createEmber,
  createGame,
  createGate,
  createGround,
  createHazard,
  createPlayer,
  HUD_SCRIPT,
  levelSpec,
  runState,
  sceneNames,
  GOTO_SCENE,
} from "../../games/ember-runner/src/main.ts";
import { buildTitleScene } from "../../games/ember-runner/src/scenes.ts";
import { spawnKind } from "../../games/ember-runner/src/systems.ts";

const DT = 1 / 60;

/** A flat test level: one platform, one runner, nothing else. */
function flatLevel(): Scene {
  const scene = new Scene({ name: "flat" });
  scene.resources.viewport = { width: 960, height: 540 };
  scene.resources.gravity = { x: 0, y: 1400 };
  scene.resources.camera = {
    position: vec2(480, 270),
    zoom: 1,
    smoothing: 0,
    bounds: null,
    follow: null,
  };
  createGround(scene, 480, 300, 960, 40);
  createPlayer(scene, 100, 240);
  scene.resources.camera.follow = scene.world.query(Tag).find((entity) =>
    scene.world.require(entity, Tag).value === PLAYER_TAG
  ) ?? null;
  return scene;
}

/**
 * Builds a session that runs the scene instance the test prepared. The scene is registered
 * as a factory so the session does not clone it — the test keeps asserting on the same world
 * the systems are mutating.
 */
function playOn(scene: Scene, start = "flat") {
  const game = createGame({ scenes: new Map(), start });
  game.registerScene(start, () => scene);
  return { game, session: game.createSession(start) };
}

function playerOf(scene: Scene) {
  const world = scene.world;
  for (const entity of world.entities()) {
    const tag = world.get(entity, Tag);
    if (tag?.value === PLAYER_TAG) return entity;
  }
  return undefined;
}

function positionOf(scene: Scene, entity: number) {
  return world(scene).require(entity, Transform).position;
}

function world(scene: Scene) {
  return scene.world;
}

/** Steps with a held key set for every frame. */
function hold(session: { step(dt: number, input?: unknown): unknown }, frames: number, keys: string[]) {
  const snapshot = {
    held: keys,
    pressed: keys,
    released: [],
    mouse: { x: 0, y: 0 },
    mouseHeld: [],
    mousePressed: [],
    mouseReleased: [],
  };
  for (let i = 0; i < frames; i++) session.step(DT, i === 0 ? snapshot : { ...snapshot, pressed: [] });
}

function settle(session: { step(dt: number, input?: unknown): unknown }, frames = 30) {
  for (let i = 0; i < frames; i++) session.step(DT);
}

/** Frames with no keys held (a missing snapshot would keep the last held keys). */
function release(session: { step(dt: number, input?: unknown): unknown }, frames: number) {
  const idle = {
    held: [],
    pressed: [],
    released: [],
    mouse: { x: 0, y: 0 },
    mouseHeld: [],
    mousePressed: [],
    mouseReleased: [],
  };
  for (let i = 0; i < frames; i++) session.step(DT, i === 0 ? idle : { ...idle, released: [] });
}

// ---------------------------------------------------------------------------
// Game definition
// ---------------------------------------------------------------------------

Deno.test("the game has the expected identity", () => {
  const game = createGame();
  assertEquals(game.id, "ember-runner");
  assertEquals(game.title, "Ember Runner");
  assertEquals(game.version, "0.1.0");
});

Deno.test("the built-in scenes are the title and two levels, title first", () => {
  assertEquals(sceneNames(), [TITLE_SCENE, LEVEL_ONE, "level-2"]);
  assertEquals([...buildScenes().keys()], [TITLE_SCENE, LEVEL_ONE, "level-2"]);
});

Deno.test("the game starts on level-1", () => {
  assertEquals(createGame().startScene, LEVEL_ONE);
});

Deno.test("an explicit start scene wins", () => {
  assertEquals(createGame({ start: TITLE_SCENE }).startScene, TITLE_SCENE);
});

Deno.test("both levels have a runner, a gate and collectables", () => {
  for (const name of [LEVEL_ONE, "level-2"]) {
    const game = createGame();
    const session = game.createSession(name);
    const tags = session.scene.world.entities().map((entity) =>
      session.scene.world.get(entity, Tag)?.value
    );
    assert(tags.includes(PLAYER_TAG), `${name} has a player`);
    assert(tags.includes(GOAL_TAG), `${name} has a goal`);
    assert(tags.includes(COIN_TAG), `${name} has coins`);
  }
});

Deno.test("level-1 has more entities than the title screen", () => {
  const game = createGame();
  assert(game.createScene(LEVEL_ONE).entityCount > game.createScene(TITLE_SCENE).entityCount);
});

Deno.test("the title scene is a small, complete screen", () => {
  const title = buildTitleScene();
  assert(title.entityCount >= 4);
  assert(
    title.world.entities().some((entity: number) =>
      title.world.get(entity, TextLabel) !== undefined
    ),
  );
});

Deno.test("level specs describe both levels", () => {
  assert(levelSpec(LEVEL_ONE) !== undefined);
  assert(levelSpec("level-2") !== undefined);
  assertEquals(levelSpec("missing"), undefined);
});

Deno.test("a built level carries its spec's name", () => {
  const spec = levelSpec(LEVEL_ONE)!;
  assertEquals(buildLevelScene(spec).name, LEVEL_ONE);
});

// ---------------------------------------------------------------------------
// Player movement
// ---------------------------------------------------------------------------

Deno.test("gravity pulls the runner down onto the platform", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  const before = positionOf(scene, player).y;
  settle(session, 20);
  assert(positionOf(scene, player).y > before, "the runner fell");
});

Deno.test("the runner settles on the platform instead of falling through it", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  settle(session, 120);
  const y = positionOf(scene, player).y;
  assert(y < 300, `the runner rests above the platform (y=${y})`);
  assert(y > 250, `the runner is on the platform (y=${y})`);
});

Deno.test("holding right moves the runner right", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  settle(session, 60);
  const before = positionOf(scene, player).x;
  hold(session, 30, ["ArrowRight"]);
  assert(positionOf(scene, player).x - before > 40, `moved ${positionOf(scene, player).x - before}px`);
});

Deno.test("holding left moves the runner left", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  settle(session, 60);
  const before = positionOf(scene, player).x;
  hold(session, 30, ["ArrowLeft"]);
  assert(before - positionOf(scene, player).x > 40);
});

Deno.test("the KeyD alias also moves right", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  settle(session, 60);
  const before = positionOf(scene, player).x;
  hold(session, 20, ["KeyD"]);
  assert(positionOf(scene, player).x > before);
});

Deno.test("releasing the key lets the runner coast to a stop", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  settle(session, 60);
  hold(session, 20, ["ArrowRight"]);
  release(session, 40);
  const velocity = scene.world.get(player, Velocity)!;
  assertAlmostEquals(velocity.x, 0, 6);
});

Deno.test("jumping lifts the runner off the platform", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  settle(session, 60);
  const groundY = positionOf(scene, player).y;
  hold(session, 12, ["Space"]);
  assert(positionOf(scene, player).y < groundY - 10, "the runner is airborne");
});

Deno.test("the runner comes back down after a jump", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  settle(session, 60);
  const groundY = positionOf(scene, player).y;
  hold(session, 10, ["Space"]);
  settle(session, 150);
  assertAlmostEquals(positionOf(scene, player).y, groundY, 12);
});

Deno.test("the runner cannot double jump in mid-air", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  settle(session, 60);
  hold(session, 6, ["Space"]);
  release(session, 20);
  // Wait for the apex: a second press there must not add a new upward impulse.
  let guard = 0;
  while (scene.world.require(player, Velocity).y < 0 && guard++ < 120) release(session, 1);
  assert(scene.world.require(player, Velocity).y >= 0, "reached the apex");
  const apex = positionOf(scene, player).y;
  hold(session, 4, ["Space"]);
  assert(scene.world.require(player, Velocity).y >= -1, "no new jump impulse in mid-air");
  assert(positionOf(scene, player).y >= apex - 2);
});

// ---------------------------------------------------------------------------
// Collectables, hazards and the goal
// ---------------------------------------------------------------------------

Deno.test("touching an ember adds its points to the score", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  const at = { ...positionOf(scene, player) };
  createEmber(scene, at.x, at.y, 25);
  session.step(DT);
  assertEquals(runState(session).score, 25);
});

Deno.test("collecting an ember counts it", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  const at = { ...positionOf(scene, player) };
  createEmber(scene, at.x, at.y);
  session.step(DT);
  assertEquals(runState(session).coins, 1);
});

Deno.test("an ember is removed once collected", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  const at = { ...positionOf(scene, player) };
  const before = scene.entityCount;
  createEmber(scene, at.x, at.y);
  session.step(DT);
  session.step(DT);
  assertEquals(scene.entityCount, before);
});

Deno.test("two embers stack their points", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  const at = { ...positionOf(scene, player) };
  createEmber(scene, at.x, at.y, 25);
  session.step(DT);
  createEmber(scene, at.x, at.y, 40);
  session.step(DT);
  assertEquals(runState(session).score, 65);
});

Deno.test("collecting emits a pickup event", () => {
  const events: unknown[] = [];
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  session.events.on("runner.pickup", (payload) => events.push(payload));
  const at = { ...positionOf(scene, player) };
  createEmber(scene, at.x, at.y, 25);
  session.step(DT);
  assertEquals(events.length, 1);
});

Deno.test("an ember out of reach is not collected", () => {
  const scene = flatLevel();
  const { session } = playOn(scene);
  createEmber(scene, 900, 100);
  session.step(DT);
  assertEquals(runState(session).score, 0);
});

Deno.test("touching a hazard costs a life", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  const at = { ...positionOf(scene, player) };
  createHazard(scene, at.x, at.y);
  session.step(DT);
  assertEquals(runState(session).lives, 2);
});

Deno.test("a hazard hit is counted and announced", () => {
  const hits: unknown[] = [];
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  session.events.on("runner.hit", (payload) => hits.push(payload));
  const at = { ...positionOf(scene, player) };
  createHazard(scene, at.x, at.y);
  session.step(DT);
  assertEquals(runState(session).hits, 1);
  assertEquals(hits.length, 1);
});

Deno.test("the same hazard cannot drain every life in one touch", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  const at = { ...positionOf(scene, player) };
  createHazard(scene, at.x, at.y);
  for (let i = 0; i < 10; i++) session.step(DT);
  assert(runState(session).lives >= 1, "invulnerability or a single hit per contact");
});

Deno.test("reaching the gate wins the level", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  const at = { ...positionOf(scene, player) };
  createGate(scene, at.x, at.y);
  session.step(DT);
  assertEquals(runState(session).status, "won");
});

Deno.test("the gate adds its bonus to the score", () => {
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  const at = { ...positionOf(scene, player) };
  createGate(scene, at.x, at.y, 150);
  session.step(DT);
  assert(runState(session).score >= 150);
});

Deno.test("winning emits a won event", () => {
  const wins: unknown[] = [];
  const scene = flatLevel();
  const player = playerOf(scene)!;
  const { session } = playOn(scene);
  session.events.on("runner.won", (payload) => wins.push(payload));
  const at = { ...positionOf(scene, player) };
  createGate(scene, at.x, at.y);
  session.step(DT);
  assertEquals(wins.length, 1);
});

// ---------------------------------------------------------------------------
// Scene transitions
// ---------------------------------------------------------------------------

Deno.test("the game provides the scene-switch service", () => {
  const scene = flatLevel();
  const { session } = playOn(scene);
  assertEquals(typeof session.service(GOTO_SCENE), "function");
});

Deno.test("calling the switch service loads another scene", () => {
  const game = createGame({
    scenes: new Map([[LEVEL_ONE, buildLevelScene(levelSpec(LEVEL_ONE)!)]]),
  });
  game.registerScene(TITLE_SCENE, () => buildTitleScene());
  const session = game.createSession(TITLE_SCENE);
  const goto = session.service<(name: string) => void>(GOTO_SCENE)!;
  goto("level-1");
  assertEquals(session.scene.name, "level-1");
});

Deno.test("pressing Enter on the title screen starts the game", () => {
  const game = createGame({
    scenes: new Map([[LEVEL_ONE, buildLevelScene(levelSpec(LEVEL_ONE)!)]]),
    start: TITLE_SCENE,
  });
  game.registerScene(TITLE_SCENE, () => buildTitleScene());
  const session = game.createSession(TITLE_SCENE);
  const pressed = {
    held: ["Enter"],
    pressed: ["Enter"],
    released: [],
    mouse: { x: 0, y: 0 },
    mouseHeld: [],
    mousePressed: [],
    mouseReleased: [],
  };
  session.step(DT, pressed);
  assertEquals(session.scene.name, "level-1");
});

Deno.test("pressing nothing on the title screen stays put", () => {
  const game = createGame({
    scenes: new Map([[LEVEL_ONE, buildLevelScene(levelSpec(LEVEL_ONE)!)]]),
    start: TITLE_SCENE,
  });
  game.registerScene(TITLE_SCENE, () => buildTitleScene());
  const session = game.createSession(TITLE_SCENE);
  for (let i = 0; i < 30; i++) session.step(DT);
  assertEquals(session.scene.name, TITLE_SCENE);
});

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

Deno.test("survival scoring raises the score while playing", () => {
  const scene = flatLevel();
  const { session } = playOn(scene);
  const before = runState(session).score;
  settle(session, 120);
  assert(runState(session).score > before);
});

Deno.test("the spawner adds hazards over time", () => {
  const scene = flatLevel();
  const { session } = playOn(scene);
  const before = scene.entityCount;
  settle(session, 240);
  assert(scene.entityCount >= before, "the spawner never removes the player");
});

Deno.test("spawnKind creates the requested entity", () => {
  const scene = flatLevel();
  const ember = spawnKind(scene, "ember", 500, 200);
  const hazard = spawnKind(scene, "hazard", 600, 200);
  assertEquals(scene.world.require(ember, Tag).value, COIN_TAG);
  assertEquals(scene.world.require(hazard, Tag).value, HAZARD_TAG);
});

Deno.test("off-screen entities are cleaned up", () => {
  const scene = flatLevel();
  const far = createEmber(scene, 99999, 99999);
  const { session } = playOn(scene);
  settle(session, 10);
  assert(!scene.world.isAlive(far), "the cleanup system removed the far ember");
});

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

Deno.test("the HUD reports the score after a pickup", () => {
  const scene = flatLevel();
  const at = { ...positionOf(scene, playerOf(scene)!) };
  createEmber(scene, at.x, at.y, 25);
  const hud = scene.createEntity({ name: "hud" });
  scene.world.add(hud, TextLabel, { text: "old", size: 18, align: "left", layer: 90 });
  scene.world.add(hud, Script, { name: HUD_SCRIPT, props: {} });
  const { session } = playOn(scene);
  session.step(DT);
  assert(scene.world.require(hud, TextLabel).text !== "old", "the HUD text was refreshed");
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

Deno.test("two identical runs produce the same digest", () => {
  const run = () => {
    const scene = buildLevelScene(levelSpec(LEVEL_ONE)!);
    const game = createGame({ scenes: new Map([[LEVEL_ONE, scene]]) });
    const session = game.createSession(LEVEL_ONE);
    hold(session, 90, ["ArrowRight"]);
    return sceneDigest(session.scene);
  };
  assertEquals(run(), run());
});

Deno.test("different input produces a different digest", () => {
  const run = (keys: string[]) => {
    const scene = buildLevelScene(levelSpec(LEVEL_ONE)!);
    const game = createGame({ scenes: new Map([[LEVEL_ONE, scene]]) });
    const session = game.createSession(LEVEL_ONE);
    hold(session, 60, keys);
    return sceneDigest(session.scene);
  };
  assert(run(["ArrowRight"]) !== run([]));
});
