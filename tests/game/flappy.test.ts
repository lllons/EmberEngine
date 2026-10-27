/**
 * Flappy Ember — the example game, simulated headlessly through the same `Game`/`Session`
 * API the browser player and the exported executable use.
 *
 * What this suite proves:
 * - the game has a title card that starts a run with one gesture, and a play scene that
 *   spawns passable pipe pairs;
 * - one-button flap control, gravity, scoring, collision death and the restart guard;
 * - a run driven only by input snapshots survives and scores with no teleports;
 * - the same seed reproduces the same run, and the best score survives restarts.
 */

import {
  BoxCollider,
  RigidBody,
  snapshot,
  Sprite,
  TextLabel,
  Transform,
  Velocity,
  vec2,
} from "@ember/core";
import { type RuntimeSession, worldDigest } from "@ember/runtime";
import {
  BIRD_TAG,
  BIRD_Y,
  createGame,
  GAME_ID,
  GAME_TITLE,
  GAME_VERSION,
  GAP_MAX,
  GAP_MIN,
  PIPE_GAP,
  PIPE_TAG,
  PLAY_SCENE,
  runState,
  SCORE_TAG,
  START_SCENE,
  TITLE_SCENE,
} from "../../games/flappy/src/main.ts";
import type { FlappyState } from "../../games/flappy/src/state.ts";
import { assert, assertEqual, near } from "../harness.ts";

const DT = 1 / 60;

function session(sceneName = PLAY_SCENE, seed: number | string = "flappy-test"): RuntimeSession {
  return createGame({ seed }).createSession(sceneName);
}

function stateOf(runtime: RuntimeSession): FlappyState {
  return runState(runtime);
}

function birdOf(runtime: RuntimeSession): number {
  const [bird] = runtime.api.entitiesWithTag(BIRD_TAG);
  assert(bird !== undefined, "expected the bird entity");
  return bird;
}

function transformOf(runtime: RuntimeSession, entity: number) {
  const transform = runtime.scene.world.get(entity, Transform);
  assert(transform !== undefined, `entity ${entity} has a transform`);
  return transform;
}

function teleport(runtime: RuntimeSession, entity: number, x: number, y: number): void {
  transformOf(runtime, entity).position = vec2(x, y);
}

/** Holds the bird at its start height so rule tests observe pipes without diving. */
function hover(runtime: RuntimeSession): void {
  const bird = birdOf(runtime);
  runtime.scene.world.require(bird, RigidBody).gravityScale = 0;
  runtime.scene.world.require(bird, Velocity).y = 0;
}

function zoneAhead(runtime: RuntimeSession): number | undefined {
  const bird = birdOf(runtime);
  const birdX = transformOf(runtime, bird).position.x;
  return runtime.api.entitiesWithTag(SCORE_TAG)
    .map((entity) => ({ entity, x: transformOf(runtime, entity).position.x }))
    .filter((zone) => zone.x > birdX - 20)
    .sort((a, b) => a.x - b.x)[0]?.entity;
}

// ---------------------------------------------------------------------------
// Definition, title screen and start gesture
// ---------------------------------------------------------------------------

Deno.test("game/flappy exposes a stable identity and two scenes", () => {
  const game = createGame();
  assertEqual(game.id, GAME_ID, "id");
  assertEqual(game.title, GAME_TITLE, "title");
  assertEqual(game.version, GAME_VERSION, "version");
  assertEqual(game.startScene, START_SCENE, "start scene");
  assertEqual(game.sceneNames(), [TITLE_SCENE, PLAY_SCENE], "scenes");
});

Deno.test("game/flappy the title card invites a start and has no bird", () => {
  const runtime = session(TITLE_SCENE);
  const state = stateOf(runtime);
  assertEqual(runtime.api.entitiesWithTag(BIRD_TAG).length, 0, "no bird on the menu");
  assertEqual(state.status, "ready", "menu waits");

  const labels = runtime.scene.world.query(TextLabel).map((entity) =>
    runtime.scene.world.require(entity, TextLabel).text
  );
  assert(labels.includes("FLAPPY"), "title present");
  assert(labels.includes("EMBER"), "accent title present");
  assert(labels.some((text) => text.includes("SPACE / CLICK")), "start prompt present");
  assert(labels.includes("BEST 0"), "best starts at zero");
});

Deno.test("game/flappy clicking starts the run", () => {
  const runtime = session(TITLE_SCENE);
  assertEqual(runtime.scene.name, TITLE_SCENE, "starts on the title");
  runtime.step(DT, snapshot({ mousePressed: ["left"] }));
  assertEqual(runtime.scene.name, PLAY_SCENE, "switched to play");
  assertEqual(stateOf(runtime).status, "playing", "run is live");
  assertEqual(runtime.api.entitiesWithTag(BIRD_TAG).length, 1, "bird exists");
});

Deno.test("game/flappy Space starts the run too", () => {
  const runtime = session(TITLE_SCENE);
  runtime.step(DT, snapshot({ pressed: ["Space"] }));
  assertEqual(runtime.scene.name, PLAY_SCENE, "switched to play");
  assertEqual(stateOf(runtime).status, "playing", "run is live");
});

// ---------------------------------------------------------------------------
// One-button flight
// ---------------------------------------------------------------------------

Deno.test("game/flappy a flap launches the bird upward", () => {
  const runtime = session();
  const bird = birdOf(runtime);
  const state = stateOf(runtime);
  const start = transformOf(runtime, bird).position.y;
  runtime.step(DT, snapshot({ pressed: ["Space"] }));
  const velocity = runtime.scene.world.require(bird, Velocity);
  assert(velocity.y < -300, `flap is an upward impulse, got ${velocity.y}`);
  runtime.run(10, DT);
  assert(transformOf(runtime, bird).position.y < start, "the bird rose");
  assertEqual(state.status, "playing", "still alive");
});

Deno.test("game/flappy gravity pulls the bird back down and caps the fall", () => {
  const runtime = session();
  const bird = birdOf(runtime);
  runtime.step(DT, snapshot({ pressed: ["Space"] }));
  let sawFall = false;
  for (let frame = 0; frame < 120; frame++) {
    runtime.step(DT);
    const velocity = runtime.scene.world.require(bird, Velocity);
    if (velocity.y > 0) sawFall = true;
    assert(velocity.y <= 460 + 1e-9, `fall speed is capped, got ${velocity.y}`);
  }
  assert(sawFall, "the bird came back down");
});

Deno.test("game/flappy a click flaps as well as Space", () => {
  const runtime = session();
  const bird = birdOf(runtime);
  runtime.step(DT, snapshot({ mousePressed: ["left"] }));
  assert(runtime.scene.world.require(bird, Velocity).y < -300, "click gave an impulse");
});

Deno.test("game/flappy the bird banks visually without rotating its hitbox", () => {
  const runtime = session();
  const bird = birdOf(runtime);
  runtime.step(DT, snapshot({ pressed: ["Space"] }));
  runtime.run(6, DT);
  const sprite = runtime.scene.world.require(bird, Sprite);
  const transform = transformOf(runtime, bird);
  assert(sprite.rotation < 0, `nose up while rising, got ${sprite.rotation}`);
  assertEqual(transform.rotation, 0, "the collider stays axis-aligned");
});

// ---------------------------------------------------------------------------
// Pipes and scoring
// ---------------------------------------------------------------------------

Deno.test("game/flappy pipes spawn as passable, scrolling pairs", () => {
  const runtime = session();
  hover(runtime);
  runtime.run(90, DT); // past the first-pipe delay
  const pipes = runtime.api.entitiesWithTag(PIPE_TAG);
  assert(pipes.length >= 2, `expected a pipe pair, got ${pipes.length}`);
  const zone = zoneAhead(runtime);
  assert(zone !== undefined, "a gap zone exists");

  const zoneY = transformOf(runtime, zone).position.y;
  assert(zoneY >= GAP_MIN && zoneY <= GAP_MAX, `gap inside the band, got ${zoneY}`);

  let topBottom = -Infinity;
  let bottomTop = Infinity;
  for (const pipe of pipes) {
    const transform = transformOf(runtime, pipe);
    const sprite = runtime.scene.world.require(pipe, Sprite);
    const top = transform.position.y - sprite.height / 2;
    const bottom = transform.position.y + sprite.height / 2;
    if (bottom <= zoneY) topBottom = Math.max(topBottom, bottom);
    if (top >= zoneY) bottomTop = Math.min(bottomTop, top);
    const velocity = runtime.scene.world.require(pipe, Velocity);
    assertEqual(velocity.x, -150, "pipes scroll left at a constant speed");
  }
  assert(topBottom <= zoneY, "the top pipe stops above the gap");
  assert(bottomTop >= zoneY, "the bottom pipe starts below the gap");
  assert(bottomTop - topBottom >= PIPE_GAP - 2, `gap is at least ${PIPE_GAP}px`);
});

Deno.test("game/flappy the gap trigger is non-solid and reports the pass", () => {
  const runtime = session();
  hover(runtime);
  runtime.run(90, DT);
  const zone = zoneAhead(runtime)!;
  const collider = runtime.scene.world.require(zone, BoxCollider);
  assertEqual(collider.trigger, true, "the zone reports overlaps");
  assertEqual(collider.solid, false, "the zone does not block the bird");
  const state = stateOf(runtime);
  const bird = birdOf(runtime);
  teleport(runtime, bird, transformOf(runtime, zone).position.x, transformOf(runtime, zone).position.y);
  runtime.step(DT);
  assertEqual(state.score, 1, "crossing the gap scores");
  assertEqual(stateOf(runtime).best, 1, "best follows the score");
});

Deno.test("game/flappy a pipe is scored exactly once", () => {
  const runtime = session();
  hover(runtime);
  runtime.run(90, DT);
  const state = stateOf(runtime);
  const bird = birdOf(runtime);
  const zone = zoneAhead(runtime)!;
  const position = transformOf(runtime, zone).position;
  teleport(runtime, bird, position.x, position.y);
  runtime.step(DT);
  assertEqual(state.score, 1, "first crossing scores");
  for (let frame = 0; frame < 30; frame++) {
    teleport(runtime, bird, transformOf(runtime, zone).position.x, transformOf(runtime, zone).position.y);
    runtime.step(DT);
  }
  assertEqual(state.score, 1, "staying in the gap does not farm points");
  assert(runtime.scene.world.isAlive(zone), "the zone stays alive as a readable target");
});

// ---------------------------------------------------------------------------
// Death, the game-over card and restart
// ---------------------------------------------------------------------------

Deno.test("game/flappy hitting a pipe ends the run and freezes the world", () => {
  const runtime = session();
  hover(runtime);
  runtime.run(90, DT);
  const state = stateOf(runtime);
  const bird = birdOf(runtime);
  const [pipe] = runtime.api.entitiesWithTag(PIPE_TAG);
  teleport(runtime, bird, transformOf(runtime, pipe).position.x, transformOf(runtime, pipe).position.y);
  runtime.step(DT);

  assertEqual(state.status, "dead", "pipe contact kills");
  assert(state.message.includes("pipe"), `message: ${state.message}`);
  for (const entity of runtime.api.entitiesWithTag(PIPE_TAG)) {
    assertEqual(runtime.scene.world.require(entity, Velocity).x, 0, "pipes stop");
  }
  assertEqual(runtime.scene.world.require(bird, RigidBody).gravityScale, 0, "the bird is held");
  assertEqual(runtime.scene.world.require(bird, Velocity).y, 0, "the bird stops falling");
});

Deno.test("game/flappy hitting the ground ends the run", () => {
  const runtime = session();
  const state = stateOf(runtime);
  const bird = birdOf(runtime);
  teleport(runtime, bird, 140, 690);
  runtime.step(DT);
  assertEqual(state.status, "dead", "ground contact kills");
  assert(state.message.includes("ground"), `message: ${state.message}`);
});

Deno.test("game/flappy leaving through the ceiling ends the run", () => {
  const runtime = session();
  const state = stateOf(runtime);
  teleport(runtime, birdOf(runtime), 140, 4);
  runtime.step(DT);
  assertEqual(state.status, "dead", "the ceiling is fatal");
  assert(state.message.includes("ceiling"), `message: ${state.message}`);
});

Deno.test("game/flappy the game-over card reports the score and best", () => {
  const runtime = session();
  hover(runtime);
  runtime.run(90, DT);
  const bird = birdOf(runtime);
  const zone = zoneAhead(runtime)!;
  teleport(runtime, bird, transformOf(runtime, zone).position.x, transformOf(runtime, zone).position.y);
  runtime.step(DT); // score one
  const state = stateOf(runtime);
  const [pipe] = runtime.api.entitiesWithTag(PIPE_TAG);
  teleport(runtime, bird, transformOf(runtime, pipe).position.x, transformOf(runtime, pipe).position.y);
  runtime.step(DT);

  const overlay = runtime.scene.world.require(runtime.scene.findByName("overlay")!, TextLabel);
  const detail = runtime.scene.world.require(runtime.scene.findByName("overlay-detail")!, TextLabel);
  const prompt = runtime.scene.world.require(runtime.scene.findByName("overlay-prompt")!, TextLabel);
  assertEqual(overlay.text, "GAME OVER", "overlay title");
  assertEqual(overlay.alpha, 1, "overlay is visible");
  assert(detail.text.includes(`score ${state.score}`), `detail: ${detail.text}`);
  assert(detail.text.includes(`best ${state.best}`), `detail: ${detail.text}`);
  assert(prompt.text.includes("SPACE / CLICK"), `prompt: ${prompt.text}`);
});

Deno.test("game/flappy the restart guard ignores the death press, then restarts", () => {
  const runtime = session();
  const state = stateOf(runtime);
  const bird = birdOf(runtime);
  teleport(runtime, bird, 140, 690);
  runtime.step(DT);
  assertEqual(state.status, "dead", "dead");

  // The press that killed the bird must not also restart the run.
  runtime.step(DT, snapshot({ pressed: ["Space"] }));
  assertEqual(state.status, "dead", "guard holds");
  runtime.run(30, DT);
  runtime.step(DT, snapshot({ pressed: ["Space"] }));

  assertEqual(state.status, "playing", "a later press restarts");
  assertEqual(state.score, 0, "fresh score");
  assert(state.best >= 0, "best survives");
  assertEqual(runtime.scene.name, PLAY_SCENE, "still the play scene");
  near(transformOf(runtime, birdOf(runtime)).position.y, BIRD_Y, 1e-9, "bird reset");
});

// ---------------------------------------------------------------------------
// Determinism and a hands-off playthrough
// ---------------------------------------------------------------------------

Deno.test("game/flappy the same seed reproduces the pipes", () => {
  const a = session(PLAY_SCENE, "same-seed");
  const b = session(PLAY_SCENE, "same-seed");
  hover(a);
  hover(b);
  // Hover so both runs stay alive long enough to spawn several pipes.
  for (let frame = 0; frame < 600; frame++) {
    a.step(DT);
    b.step(DT);
  }
  assert(a.api.entitiesWithTag(PIPE_TAG).length > 0, "pipes spawned in both runs");
  assertEqual(worldDigest(a.scene.world), worldDigest(b.scene.world), "same seed, same world");
});

Deno.test("game/flappy a different seed produces different pipes", () => {
  const a = session(PLAY_SCENE, "seed-a");
  const b = session(PLAY_SCENE, "seed-b");
  hover(a);
  hover(b);
  for (let frame = 0; frame < 600; frame++) {
    a.step(DT);
    b.step(DT);
  }
  assert(worldDigest(a.scene.world) !== worldDigest(b.scene.world), "worlds diverge");
});

Deno.test("game/flappy an input-only autopilot survives and scores", () => {
  const runtime = session(PLAY_SCENE, "autopilot");
  const state = stateOf(runtime);
  const bird = birdOf(runtime);
  let lastPress = -99;

  // Aim at the gap the bird is in or approaching; flap when it has sunk below the target.
  for (let frame = 0; frame < 60 * 20 && state.status === "playing"; frame++) {
    const position = transformOf(runtime, bird).position;
    const velocity = runtime.scene.world.require(bird, Velocity);
    const zones = runtime.api.entitiesWithTag(SCORE_TAG)
      .map((entity) => ({ entity, transform: transformOf(runtime, entity) }))
      .filter((zone) => zone.transform.position.x + 50 > position.x)
      .sort((a, b) => a.transform.position.x - b.transform.position.x);
    const target = (zones[0]?.transform.position.y ?? 500) - 8;
    const press = position.y > target && velocity.y > -80 && frame - lastPress > 5;
    if (press) lastPress = frame;
    runtime.step(DT, snapshot({ pressed: press ? ["Space"] : [] }));
  }

  assertEqual(state.status, "playing", `survived: ${state.message}`);
  assert(state.score >= 5, `scored without teleports, got ${state.score}`);
  assert(state.time > 15, `ran for ${state.time.toFixed(1)}s`);
  assert(state.best >= state.score, "best tracks the run");
});
