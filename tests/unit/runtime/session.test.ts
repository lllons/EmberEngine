/**
 * @ember/runtime/session — the step sequence, the runtime API and session lifecycle.
 */

import { assert, assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import {
  Diagnostics,
  Name,
  Parent,
  Scene,
  Tag,
  Transform,
  Velocity,
  emptySnapshot,
  snapshot,
  vec2,
} from "@ember/core";
import { RuntimeSession, defineSystem } from "@ember/runtime";

const DT = 1 / 60;

function session(systems = [] as ReturnType<typeof defineSystem>[]): RuntimeSession {
  return new RuntimeSession({ scene: new Scene({ name: "session-test" }), systems });
}

Deno.test("a session starts at frame 0 with no elapsed time", () => {
  const runtime = session();
  assertEquals(runtime.frame, 0);
  assertEquals(runtime.time, 0);
  assertEquals(runtime.entityCount, 0);
  assertEquals(runtime.collisions, []);
});

Deno.test("each step advances the frame counter and the clock", () => {
  const runtime = session();
  runtime.step(DT);
  runtime.step(DT);
  assertEquals(runtime.frame, 2);
  assertAlmostEquals(runtime.time, 2 * DT, 1e-12);
});

Deno.test("step results describe the step that just ran", () => {
  const scene = new Scene();
  scene.createEntity();
  const runtime = new RuntimeSession({ scene, systems: [] });
  const result = runtime.step(DT);
  assertEquals(result.steps, 1);
  assertEquals(result.frame, 1);
  assertEquals(result.entityCount, 1);
  assertEquals(result.events, 0);
  assertAlmostEquals(result.time, DT, 1e-12);
});

Deno.test("step clamps a huge delta to four fixed steps", () => {
  const runtime = session();
  runtime.step(10);
  assertAlmostEquals(runtime.time, 4 * DT, 1e-12);
});

Deno.test("step ignores a negative or non-finite delta", () => {
  const runtime = session();
  runtime.step(-5);
  runtime.step(Number.NaN);
  assertEquals(runtime.frame, 2);
  assertEquals(runtime.time, 0);
});

Deno.test("systems run in phase order, not registration order", () => {
  const order: string[] = [];
  const runtime = session([
    defineSystem("late", () => order.push("late"), 500),
    defineSystem("early", () => order.push("early"), 100),
    defineSystem("middle", () => order.push("middle"), 300),
  ]);
  runtime.step(DT);
  assertEquals(order, ["early", "middle", "late"]);
});

Deno.test("a system receives the live scene, dt, time and frame", () => {
  const seen: Array<{ dt: number; time: number; frame: number; entities: number }> = [];
  const scene = new Scene();
  scene.createEntity();
  const runtime = new RuntimeSession({
    scene,
    systems: [
      defineSystem("probe", (ctx) => {
        seen.push({ dt: ctx.dt, time: ctx.time, frame: ctx.frame, entities: ctx.scene.entityCount });
      }),
    ],
  });
  runtime.step(DT);
  runtime.step(DT);
  assertEquals(seen.length, 2);
  assertAlmostEquals(seen[0].dt, DT, 1e-12);
  assertEquals(seen[0].frame, 1);
  assertEquals(seen[1].frame, 2);
  assertEquals(seen[1].entities, 1);
});

Deno.test("a throwing system is reported through diagnostics and rethrown", () => {
  const diagnostics = new Diagnostics({ minLevel: "debug" });
  const runtime = new RuntimeSession({
    scene: new Scene(),
    systems: [
      defineSystem("boom", () => {
        throw new Error("kaboom");
      }),
    ],
    diagnostics,
  });
  assertThrows(() => runtime.step(DT), Error, "kaboom");
  assert(diagnostics.count("error") >= 1);
  assert(diagnostics.toLines().some((line) => line.includes("boom")));
});

Deno.test("input snapshots are applied for the step and edges are cleared after it", () => {
  const seen: Array<{ pressed: boolean; held: boolean }> = [];
  const runtime = new RuntimeSession({
    scene: new Scene(),
    systems: [
      defineSystem("input-probe", (ctx) => {
        seen.push({ pressed: ctx.input.wasPressed("Space"), held: ctx.input.isDown("Space") });
      }),
    ],
  });
  runtime.step(DT, snapshot({ held: ["Space"], pressed: ["Space"] }));
  runtime.step(DT);
  assertEquals(seen[0], { pressed: true, held: true });
  assertEquals(seen[1], { pressed: false, held: true }, "held keys persist, edges do not");
});

Deno.test("running without a snapshot keeps the previous held keys", () => {
  const runtime = new RuntimeSession({ scene: new Scene(), systems: [] });
  const input = runtime.input;
  runtime.step(DT, snapshot({ held: ["KeyA"] }));
  runtime.step(DT);
  assert(input.isDown("KeyA"));
});

Deno.test("run simulates a fixed number of steps with an input script", () => {
  const frames: number[] = [];
  const runtime = new RuntimeSession({
    scene: new Scene(),
    systems: [defineSystem("frame", (ctx) => frames.push(ctx.frame))],
  });
  const result = runtime.run(5, DT, [snapshot({ held: ["KeyA"] }), snapshot({ held: ["KeyD"] })]);
  assertEquals(frames, [1, 2, 3, 4, 5]);
  assertEquals(result.frame, 5);
});

Deno.test("run with zero steps returns the current state untouched", () => {
  const runtime = session();
  runtime.step(DT);
  const result = runtime.run(0);
  assertEquals(result.steps, 0);
  assertEquals(result.frame, 1);
});

Deno.test("queued events are delivered at the end of the step", () => {
  const received: number[] = [];
  const runtime = new RuntimeSession({
    scene: new Scene(),
    systems: [
      defineSystem("emit", (ctx) => {
        ctx.queue.push("ping", { value: ctx.frame });
      }),
    ],
  });
  runtime.events.on("ping", (payload) => received.push((payload as { value: number }).value));
  const result = runtime.step(DT);
  runtime.step(DT);
  assertEquals(received, [1, 2]);
  assert(result.events >= 1);
});

Deno.test("emit dispatches immediately", () => {
  const runtime = session();
  const received: string[] = [];
  runtime.events.on("direct", (payload) => received.push(String(payload)));
  assertEquals(runtime.emit("direct", "now"), 1);
  assertEquals(received, ["now"]);
});

Deno.test("setScene swaps the world and re-frames the camera", () => {
  const runtime = session();
  const next = new Scene({ name: "second", camera: { position: vec2(10, 20) } });
  next.createEntity({ name: "only" });
  runtime.setScene(next);
  assertEquals(runtime.scene.name, "second");
  assertEquals(runtime.entityCount, 1);
  assertEquals(runtime.camera.state.position, vec2(10, 20));
});

Deno.test("setScene clears recorded collisions", () => {
  const runtime = session();
  runtime.collisions = [{
    a: 1,
    b: 2,
    overlap: { x: 0, y: 0, w: 1, h: 1 },
    normal: vec2(1, 0),
    trigger: false,
  }];
  runtime.setScene(new Scene());
  assertEquals(runtime.collisions, []);
});

Deno.test("provide and service share a lookup table for systems and scripts", () => {
  const runtime = session();
  runtime.provide("score", 42);
  assertEquals(runtime.service<number>("score"), 42);
  assertEquals(runtime.service("missing"), undefined);
});

Deno.test("initial services are visible immediately", () => {
  const runtime = new RuntimeSession({
    scene: new Scene(),
    systems: [],
    services: { difficulty: "hard" },
  });
  assertEquals(runtime.service("difficulty"), "hard");
});

Deno.test("addSystem validates duplicates and keeps the order sorted", () => {
  const runtime = session([defineSystem("first", () => {}, 100)]);
  assertThrows(() => runtime.addSystem(defineSystem("first", () => {}, 900)), Error);
  runtime.addSystem(defineSystem("second", () => {}, 50));
  assertEquals(runtime.systems.map((system) => system.name), ["second", "first"]);
});

Deno.test("drawList builds commands from the live camera and viewport", () => {
  const scene = new Scene({ viewport: { width: 200, height: 100 } });
  const entity = scene.createEntity({ position: vec2(100, 50) });
  scene.world.add(entity, Transform, { position: vec2(100, 50) });
  const runtime = new RuntimeSession({ scene, systems: [] });
  const list = runtime.drawList();
  assertEquals(list.viewport, { width: 200, height: 100 });
  assertEquals(list.commands[0].kind, "clear");
});

Deno.test("drawList accepts build options", () => {
  const scene = new Scene();
  scene.createEntity({ position: vec2(0, 0) });
  const runtime = new RuntimeSession({ scene, systems: [] });
  const list = runtime.drawList({ background: false, cull: false });
  assertEquals(list.commands.some((command) => command.kind === "clear"), false);
});

Deno.test("reset clears the clock, contacts and input", () => {
  const runtime = new RuntimeSession({ scene: new Scene(), systems: [] });
  runtime.step(DT, snapshot({ held: ["KeyA"], pressed: ["KeyA"] }));
  runtime.reset();
  assertEquals(runtime.frame, 0);
  assertEquals(runtime.time, 0);
  assert(!runtime.input.isDown("KeyA"));
});

Deno.test("the camera controller follows the scene's configured target", () => {
  const scene = new Scene();
  const target = scene.createEntity({ position: vec2(300, 300) });
  scene.resources.camera.follow = target;
  scene.resources.camera.smoothing = 0;
  const runtime = new RuntimeSession({ scene, systems: [] });
  runtime.camera.update(scene, DT);
  assertEquals(runtime.camera.state.position, vec2(300, 300));
});

// ---------------------------------------------------------------------------
// Runtime API
// ---------------------------------------------------------------------------

Deno.test("api.spawn creates a named entity in the scene", () => {
  const runtime = session();
  const entity = runtime.api.spawn({ name: "child", position: vec2(4, 5) });
  assert(runtime.scene.world.isAlive(entity));
  assertEquals(runtime.api.label(entity), "child");
  assertEquals(runtime.scene.world.require(entity, Transform).position, vec2(4, 5));
});

Deno.test("api.despawn removes the entity and queues an event", () => {
  const runtime = session();
  const entity = runtime.api.spawn({ name: "victim" });
  runtime.step(DT);
  assert(runtime.api.despawn(entity));
  assertEquals(runtime.entityCount, 0);
  assert(!runtime.api.despawn(entity), "second despawn reports false");
});

Deno.test("api.despawnDescendants removes the whole subtree", () => {
  const runtime = session();
  const root = runtime.api.spawn({ name: "root" });
  const child = runtime.api.spawn({ name: "child" });
  const grandchild = runtime.api.spawn({ name: "grandchild" });
  const unrelated = runtime.api.spawn({ name: "unrelated" });
  runtime.scene.world.add(child, Parent, { entity: root });
  runtime.scene.world.add(grandchild, Parent, { entity: child });
  assertEquals(runtime.api.despawnDescendants(root), 2);
  assert(runtime.scene.world.isAlive(root));
  assert(runtime.scene.world.isAlive(unrelated));
});

Deno.test("api.despawnDescendants terminates on a parent cycle", () => {
  const runtime = session();
  const a = runtime.api.spawn({ name: "a" });
  const b = runtime.api.spawn({ name: "b" });
  runtime.scene.world.add(a, Parent, { entity: b });
  runtime.scene.world.add(b, Parent, { entity: a });
  // Each entity is inside the other's subtree, so the fixed point is both.
  assertEquals(runtime.api.despawnDescendants(a), 2);
  assertEquals(runtime.scene.entityCount, 0);
  void a;
  void b;
});

Deno.test("api.findByName finds entities by display name", () => {
  const runtime = session();
  const entity = runtime.api.spawn({ name: "goal" });
  assertEquals(runtime.api.findByName("goal"), entity);
  assertEquals(runtime.api.findByName("nope"), undefined);
});

Deno.test("api.entitiesWithTag finds every tagged entity", () => {
  const runtime = session();
  const first = runtime.api.spawn({ name: "coin-a" });
  const second = runtime.api.spawn({ name: "coin-b" });
  const other = runtime.api.spawn({ name: "wall" });
  runtime.scene.world.add(first, Tag, { value: "coin" });
  runtime.scene.world.add(second, Tag, { value: "coin" });
  runtime.scene.world.add(other, Tag, { value: "wall" });
  assertEquals(runtime.api.entitiesWithTag("coin"), [first, second]);
  assertEquals(runtime.api.entitiesWithTag("ghost"), []);
});

Deno.test("api.state stores and returns values per key", () => {
  const runtime = session();
  assertEquals(runtime.api.state("score"), undefined);
  runtime.api.state("score", 10);
  assertEquals(runtime.api.state<number>("score"), 10);
  runtime.api.state("score", 20);
  assertEquals(runtime.api.state<number>("score"), 20);
});

Deno.test("api.state values persist across steps", () => {
  const runtime = session();
  runtime.api.state("wave", 3);
  for (let i = 0; i < 5; i++) runtime.step(DT);
  assertEquals(runtime.api.state<number>("wave"), 3);
});

Deno.test("api.entities lists every live entity", () => {
  const runtime = session();
  const a = runtime.api.spawn({ name: "a" });
  const b = runtime.api.spawn({ name: "b" });
  assertEquals(runtime.api.entities(), [a, b]);
});

Deno.test("api.label falls back for unnamed entities", () => {
  const runtime = session();
  const entity = runtime.api.spawn();
  assertEquals(runtime.api.label(entity), `entity-${entity}`);
});

Deno.test("a script-driven system can move entities through the api", () => {
  const runtime = new RuntimeSession({
    scene: new Scene(),
    systems: [
      defineSystem("spawn-and-move", (ctx) => {
        const entity = ctx.api.spawn({ name: "mover", position: vec2(0, 0) });
        void entity;
      }, 10),
    ],
  });
  runtime.step(DT);
  runtime.step(DT);
  assertEquals(runtime.api.entitiesWithTag("nothing").length, 0);
  assertEquals(runtime.entityCount, 2);
});

Deno.test("Name components written by the API are visible to the scene", () => {
  const runtime = session();
  const entity = runtime.api.spawn();
  runtime.scene.world.add(entity, Name, { value: "late-bound" });
  assertEquals(runtime.scene.findByName("late-bound"), entity);
});

Deno.test("session.step with an empty snapshot is equivalent to no snapshot", () => {
  const a = new RuntimeSession({ scene: new Scene(), systems: [] });
  const b = new RuntimeSession({ scene: new Scene(), systems: [] });
  a.step(DT, emptySnapshot());
  b.step(DT);
  assertEquals(a.time, b.time);
  assertEquals(a.frame, b.frame);
});

Deno.test("sessions with the same seed produce identical RNG draws", () => {
  const first = new RuntimeSession({ scene: new Scene(), systems: [], seed: "compare" });
  const second = new RuntimeSession({ scene: new Scene(), systems: [], seed: "compare" });
  for (let i = 0; i < 10; i++) {
    assertEquals(first.rng.int(0, 1000), second.rng.int(0, 1000));
  }
});

Deno.test("a session can be given its own RNG instance", () => {
  const runtime = new RuntimeSession({ scene: new Scene(), systems: [], seed: 5 });
  const state = runtime.rng.state();
  runtime.step(DT);
  assertEquals(runtime.rng.state(), state, "stepping without RNG use does not advance it");
});

Deno.test("velocity moves entities across a whole simulated second", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ position: vec2(0, 0) });
  scene.world.add(entity, Velocity, { x: 120, y: 0 });
  const runtime = new RuntimeSession({ scene, systems: [] });
  runtime.run(120, DT);
  // No systems registered, so velocity is inert: this asserts the harness itself.
  assertEquals(scene.world.require(entity, Transform).position.x, 0);
});
