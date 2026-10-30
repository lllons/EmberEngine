/**
 * @ember/runtime/systems — the built-in step behaviour, asserted step by step.
 */

import { assert, assertAlmostEquals, assertEquals, assertNotEquals } from "@std/assert";
import {
  BoxCollider,
  Diagnostics,
  Lifetime,
  Name,
  rect,
  RigidBody,
  Scene,
  Script,
  Sprite as SpriteComponent,
  Tag,
  Transform,
  vec2,
  Velocity,
  World,
} from "@ember/core";
import {
  animationSystem,
  cameraSystem,
  type CollisionRecord,
  collisionSystem,
  defaultSystems,
  defineSystem,
  gravitySystem,
  lifetimeSystem,
  randomPointInRect,
  RuntimeSession,
  ScriptRegistry,
  scriptSystem,
  separationAxis,
  sortSystems,
  velocitySystem,
} from "@ember/runtime";

const DT = 1 / 60;

/** A world with one dynamic box named "body" and optional extra entities. */
function gravityScene(): Scene {
  const scene = new Scene({ name: "gravity", gravity: vec2(0, 600) });
  const body = scene.createEntity({ name: "body" });
  scene.world.add(body, Velocity, { x: 0, y: 0 });
  return scene;
}

Deno.test("sortSystems orders by phase then name", () => {
  const a = defineSystem("zzz", () => {}, 10);
  const b = defineSystem("aaa", () => {}, 10);
  const c = defineSystem("mmm", () => {}, -5);
  assertEquals(sortSystems([a, b, c]).map((system) => system.name), ["mmm", "aaa", "zzz"]);
});

Deno.test("defineSystem rejects an empty name", () => {
  let threw = false;
  try {
    defineSystem("", () => {});
  } catch {
    threw = true;
  }
  assert(threw);
});

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

Deno.test("animation advances sprite frames at framesPerSecond", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, SpriteComponent, { frameCount: 4, framesPerSecond: 8, frame: 0 });
  // fixedDt 0.25 lifts the per-step clamp so a frame can be advanced in one 0.125s step.
  const session = new RuntimeSession({ scene, systems: [animationSystem()], fixedDt: 0.25 });
  // 8 frames per second: 0.125s advances exactly one frame.
  session.step(0.125);
  assertAlmostEquals(scene.world.require(entity, SpriteComponent).frame, 1, 1e-9);
  session.step(0.125);
  assertAlmostEquals(scene.world.require(entity, SpriteComponent).frame, 2, 1e-9);
  session.step(0.25);
  assertAlmostEquals(scene.world.require(entity, SpriteComponent).frame, 4 % 4, 1e-9);
});

Deno.test("animation wraps frames instead of overflowing the strip", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, SpriteComponent, { frameCount: 3, framesPerSecond: 10 });
  const session = new RuntimeSession({ scene, systems: [animationSystem()] });
  for (let i = 0; i < 20; i++) session.step(1 / 60);
  const frame = scene.world.require(entity, SpriteComponent).frame;
  assert(frame >= 0 && frame < 3, `frame out of range: ${frame}`);
});

Deno.test("animation leaves single-frame sprites alone", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, SpriteComponent, { frameCount: 1, frame: 0 });
  const session = new RuntimeSession({ scene, systems: [animationSystem()] });
  for (let i = 0; i < 60; i++) session.step(1 / 60);
  assertEquals(scene.world.require(entity, SpriteComponent).frame, 0);
});

Deno.test("animation ignores sprites with zero fps", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, SpriteComponent, { frameCount: 4, framesPerSecond: 0 });
  const session = new RuntimeSession({ scene, systems: [animationSystem()] });
  for (let i = 0; i < 60; i++) session.step(1 / 60);
  assertEquals(scene.world.require(entity, SpriteComponent).frame, 0);
});

Deno.test("animation skips invisible sprites (alpha 0)", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, SpriteComponent, { frameCount: 4, framesPerSecond: 10, alpha: 0 });
  const session = new RuntimeSession({ scene, systems: [animationSystem()] });
  for (let i = 0; i < 60; i++) session.step(1 / 60);
  assertEquals(scene.world.require(entity, SpriteComponent).frame, 0);
});

// ---------------------------------------------------------------------------
// Gravity and velocity
// ---------------------------------------------------------------------------

Deno.test("gravity accelerates a dynamic body over time", () => {
  const scene = gravityScene();
  const body = scene.createEntity();
  scene.world.add(body, Velocity, { x: 0, y: 0 });
  scene.world.add(body, RigidBody, { type: "dynamic" });
  const session = new RuntimeSession({ scene, systems: [gravitySystem()] });
  session.step(DT);
  assertAlmostEquals(scene.world.require(body, Velocity).y, 10, 1e-6);
  session.step(DT);
  assertAlmostEquals(scene.world.require(body, Velocity).y, 20, 1e-6);
});

Deno.test("gravity respects gravityScale", () => {
  const scene = new Scene({ gravity: vec2(0, 600) });
  const entity = scene.createEntity();
  scene.world.add(entity, Velocity, { x: 0, y: 0 });
  scene.world.add(entity, RigidBody, { gravityScale: 0.5 });
  new RuntimeSession({ scene, systems: [gravitySystem()] }).step(DT);
  assertAlmostEquals(scene.world.require(entity, Velocity).y, 5, 1e-6);
});

Deno.test("gravity ignores static and kinematic bodies", () => {
  const scene = new Scene({ gravity: vec2(0, 600) });
  for (const type of ["static", "kinematic"] as const) {
    const entity = scene.createEntity({ name: type });
    scene.world.add(entity, Velocity, { x: 0, y: 0 });
    scene.world.add(entity, RigidBody, { type });
  }
  new RuntimeSession({ scene, systems: [gravitySystem()] }).step(DT);
  for (const entity of scene.world.query(Velocity)) {
    assertEquals(scene.world.require(entity, Velocity).y, 0);
  }
});

Deno.test("gravity with no gravityScale movement leaves horizontal velocity untouched", () => {
  const scene = new Scene({ gravity: vec2(0, 600) });
  const entity = scene.createEntity();
  scene.world.add(entity, Velocity, { x: 30, y: 0 });
  scene.world.add(entity, RigidBody, {});
  new RuntimeSession({ scene, systems: [gravitySystem()] }).step(DT);
  assertEquals(scene.world.require(entity, Velocity).x, 30);
});

Deno.test("gravity can accelerate bodies that have no RigidBody", () => {
  const scene = new Scene({ gravity: vec2(0, 100) });
  const entity = scene.createEntity();
  scene.world.add(entity, Velocity, { x: 0, y: 0 });
  const session = new RuntimeSession({ scene, systems: [gravitySystem({ looseFallback: 60 })] });
  session.step(DT);
  assertAlmostEquals(scene.world.require(entity, Velocity).y, 1, 1e-6);
});

Deno.test("bodies without a RigidBody do not fall by default", () => {
  const scene = new Scene({ gravity: vec2(0, 600) });
  const entity = scene.createEntity();
  scene.world.add(entity, Velocity, { x: 0, y: 0 });
  new RuntimeSession({ scene, systems: [gravitySystem()] }).step(DT);
  assertEquals(scene.world.require(entity, Velocity).y, 0);
});

Deno.test("velocity integrates into the transform", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ position: vec2(0, 0) });
  scene.world.add(entity, Velocity, { x: 60, y: -30 });
  const session = new RuntimeSession({ scene, systems: [velocitySystem()] });
  for (let i = 0; i < 30; i++) session.step(1 / 60);
  const transform = scene.world.require(entity, Transform);
  assertAlmostEquals(transform.position.x, 30, 1e-6);
  assertAlmostEquals(transform.position.y, -15, 1e-6);
});

Deno.test("velocity integrates angular motion into the rotation", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Velocity, { x: 0, y: 0, angular: 2 });
  const session = new RuntimeSession({ scene, systems: [velocitySystem()] });
  for (let i = 0; i < 30; i++) session.step(1 / 60);
  assertAlmostEquals(scene.world.require(entity, Transform).rotation, 1, 1e-6);
});

Deno.test("velocity clamps speed to the body's maxSpeed", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ position: vec2(0, 0) });
  scene.world.add(entity, Velocity, { x: 10000, y: 0 });
  scene.world.add(entity, RigidBody, { maxSpeed: 100 });
  const session = new RuntimeSession({ scene, systems: [velocitySystem()] });
  for (let i = 0; i < 60; i++) session.step(1 / 60);
  const velocity = scene.world.require(entity, Velocity);
  assertAlmostEquals(Math.hypot(velocity.x, velocity.y), 100, 1e-6);
  assertAlmostEquals(scene.world.require(entity, Transform).position.x, 100, 1e-3);
});

Deno.test("velocity clamps to the default cap when the body sets none", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Velocity, { x: 99999, y: 0 });
  scene.world.add(entity, RigidBody, { maxSpeed: 0 });
  const session = new RuntimeSession({ scene, systems: [velocitySystem({ defaultMaxSpeed: 50 })] });
  session.step(1 / 60);
  assertAlmostEquals(scene.world.require(entity, Velocity).x, 50, 1e-6);
});

Deno.test("velocity never moves static bodies", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ position: vec2(5, 5) });
  scene.world.add(entity, Velocity, { x: 100, y: 100 });
  scene.world.add(entity, RigidBody, { type: "static" });
  const session = new RuntimeSession({ scene, systems: [velocitySystem()] });
  for (let i = 0; i < 60; i++) session.step(1 / 60);
  assertEquals(scene.world.require(entity, Transform).position, vec2(5, 5));
});

Deno.test("velocity skips entities without a transform", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Velocity, { x: 10, y: 10 });
  const scene = new Scene({ name: "no-transform" }, world);
  const session = new RuntimeSession({ scene, systems: [velocitySystem()] });
  for (let i = 0; i < 10; i++) session.step(1 / 60);
  assertEquals(world.get(entity, Transform), undefined);
});

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

function collisionScene(): {
  scene: Scene;
  mover: number;
  ground: number;
} {
  const scene = new Scene({ name: "collision", gravity: vec2(0, 600) });
  const ground = scene.createEntity({ name: "ground", position: vec2(0, 100) });
  scene.world.add(ground, RigidBody, { type: "static", gravityScale: 0 });
  scene.world.add(ground, BoxCollider, { width: 400, height: 20 });
  const mover = scene.createEntity({ name: "mover", position: vec2(0, 0) });
  scene.world.add(mover, RigidBody, { type: "dynamic" });
  scene.world.add(mover, Velocity, { x: 0, y: 0 });
  scene.world.add(mover, BoxCollider, { width: 20, height: 20 });
  return { scene, mover, ground };
}

Deno.test("separationAxis picks the shallow axis", () => {
  const axis = separationAxis(rect(0, 0, 10, 10), rect(5, 1, 10, 10));
  assertEquals(axis.axis, "x");
  assertEquals(axis.depth, 5);
  assertEquals(axis.sign, -1);
});

Deno.test("separationAxis picks y for vertical overlap", () => {
  const axis = separationAxis(rect(0, 0, 10, 10), rect(1, 5, 10, 10));
  assertEquals(axis.axis, "y");
  assertEquals(axis.depth, 5);
  assertEquals(axis.sign, -1);
});

Deno.test("separationAxis direction points away from the other rect", () => {
  assertEquals(separationAxis(rect(0, 0, 10, 10), rect(20, 0, 10, 10)).sign, -1);
  assertEquals(separationAxis(rect(20, 0, 10, 10), rect(0, 0, 10, 10)).sign, 1);
});

Deno.test("a falling body lands on the ground and stops", () => {
  const { scene, mover, ground } = collisionScene();
  const session = new RuntimeSession({
    scene,
    systems: [gravitySystem(), velocitySystem(), collisionSystem()],
  });
  for (let i = 0; i < 200; i++) session.step(DT);
  const transform = scene.world.require(mover, Transform);
  const velocity = scene.world.require(mover, Velocity);
  const groundTop = scene.world.require(ground, Transform).position.y - 10;
  assert(
    transform.position.y < groundTop + 12,
    `body sank into the ground: ${transform.position.y}`,
  );
  assert(Math.abs(velocity.y) < 60, `body never settled: vy=${velocity.y}`);
});

Deno.test("a body resting on the ground reports grounded", () => {
  const { scene, mover } = collisionScene();
  const session = new RuntimeSession({
    scene,
    systems: [gravitySystem(), velocitySystem(), collisionSystem()],
  });
  for (let i = 0; i < 120; i++) session.step(DT);
  assert(scene.world.require(mover, RigidBody).grounded, "expected grounded after landing");
});

Deno.test("grounded is cleared when a body leaves the ground", () => {
  const { scene, mover } = collisionScene();
  const session = new RuntimeSession({
    scene,
    systems: [gravitySystem(), velocitySystem(), collisionSystem()],
  });
  for (let i = 0; i < 120; i++) session.step(DT);
  assert(scene.world.require(mover, RigidBody).grounded);
  scene.world.require(mover, Velocity).y = -800;
  session.step(DT);
  assert(!scene.world.require(mover, RigidBody).grounded);
});

Deno.test("collision records a contact for the pair", () => {
  const { scene, mover, ground } = collisionScene();
  const session = new RuntimeSession({
    scene,
    systems: [gravitySystem(), velocitySystem(), collisionSystem()],
  });
  // A resting body only overlaps on the frames it is pushed back, so collect across steps.
  const seen: CollisionRecord[] = [];
  for (let i = 0; i < 200; i++) {
    session.step(DT);
    seen.push(...session.collisions);
  }
  assert(seen.length > 0, "expected a recorded contact");
  const record = seen[0];
  assertEquals([record.a, record.b].includes(mover), true);
  assertEquals([record.a, record.b].includes(ground), true);
  assertEquals(record.trigger, false);
  assert(record.overlap.w > 0 && record.overlap.h > 0, "overlap rect should have area");
});

Deno.test("api.collisions exposes the contacts of the current step", () => {
  const { scene } = collisionScene();
  const session = new RuntimeSession({
    scene,
    systems: [gravitySystem(), velocitySystem(), collisionSystem()],
  });
  let observed = 0;
  for (let i = 0; i < 200; i++) {
    session.step(DT);
    observed += session.api.collisions().length;
  }
  assert(observed > 0, "api.collisions() should report contacts");
  assertEquals(session.api.collisions().length, session.collisions.length);
});

Deno.test("the collision system emits collision events on the queue", () => {
  const { scene } = collisionScene();
  const diagnostics = new Diagnostics();
  const session = new RuntimeSession({
    scene,
    systems: [gravitySystem(), velocitySystem(), collisionSystem()],
    diagnostics,
  });
  let seen = 0;
  session.events.on("collision", () => seen++);
  for (let i = 0; i < 200; i++) session.step(DT);
  assert(seen > 0, "expected collision events");
  assert(diagnostics.getCounter("collisions") > 0);
});

Deno.test("static bodies are never pushed by a collision", () => {
  const { scene, ground } = collisionScene();
  const session = new RuntimeSession({
    scene,
    systems: [gravitySystem(), velocitySystem(), collisionSystem()],
  });
  for (let i = 0; i < 200; i++) session.step(DT);
  assertEquals(scene.world.require(ground, Transform).position.y, 100);
});

Deno.test("a dynamic body pushed into a wall is separated along x", () => {
  const scene = new Scene({ name: "wall", gravity: vec2(0, 0) });
  const wall = scene.createEntity({ name: "wall", position: vec2(100, 0) });
  scene.world.add(wall, RigidBody, { type: "static" });
  scene.world.add(wall, BoxCollider, { width: 20, height: 200 });
  const mover = scene.createEntity({ name: "mover", position: vec2(85, 0) });
  scene.world.add(mover, RigidBody, { type: "dynamic" });
  scene.world.add(mover, BoxCollider, { width: 20, height: 20 });
  const session = new RuntimeSession({ scene, systems: [collisionSystem()] });
  session.step(DT);
  const position = scene.world.require(mover, Transform).position;
  assert(position.x <= 80 + 1e-6, `body should be pushed out of the wall, got x=${position.x}`);
  assertEquals(position.y, 0, "separation should be along x only");
});

Deno.test("two dynamic bodies split the correction evenly", () => {
  const scene = new Scene({ name: "pair", gravity: vec2(0, 0) });
  const a = scene.createEntity({ name: "a", position: vec2(0, 0) });
  const b = scene.createEntity({ name: "b", position: vec2(10, 0) });
  for (const entity of [a, b]) {
    scene.world.add(entity, RigidBody, { type: "dynamic" });
    scene.world.add(entity, BoxCollider, { width: 20, height: 20 });
  }
  new RuntimeSession({ scene, systems: [collisionSystem()] }).step(DT);
  const ax = scene.world.require(a, Transform).position.x;
  const bx = scene.world.require(b, Transform).position.x;
  assertAlmostEquals(ax, -5, 1e-6);
  assertAlmostEquals(bx, 15, 1e-6);
});

Deno.test("triggers are reported but never resolved", () => {
  const scene = new Scene({ name: "trigger", gravity: vec2(0, 0) });
  const zone = scene.createEntity({ name: "zone", position: vec2(0, 0) });
  scene.world.add(zone, BoxCollider, { width: 40, height: 40, trigger: true, solid: true });
  const mover = scene.createEntity({ name: "mover", position: vec2(0, 0) });
  scene.world.add(mover, RigidBody, { type: "dynamic" });
  scene.world.add(mover, BoxCollider, { width: 20, height: 20 });
  const session = new RuntimeSession({ scene, systems: [collisionSystem()] });
  session.step(DT);
  assertEquals(scene.world.require(mover, Transform).position, vec2(0, 0));
  assertEquals(session.collisions.length, 1);
  assertEquals(session.collisions[0].trigger, true);
  assertEquals(session.collisions[0].a, zone, "pairs are visited lowest id first");
  assertEquals(scene.world.require(mover, RigidBody).grounded, false, "a trigger never grounds");
});

Deno.test("a non-solid trigger still reports an overlap", () => {
  const scene = new Scene({ name: "pass-through", gravity: vec2(0, 0) });
  const zone = scene.createEntity({ name: "zone", position: vec2(0, 0) });
  // The shape a score zone uses: reports the pass, never blocks it.
  scene.world.add(zone, BoxCollider, { width: 40, height: 40, trigger: true, solid: false });
  const bird = scene.createEntity({ name: "bird", position: vec2(0, 0) });
  scene.world.add(bird, RigidBody, { type: "dynamic" });
  scene.world.add(bird, Velocity, { x: 50, y: 0 });
  scene.world.add(bird, BoxCollider, { width: 20, height: 20 });

  const session = new RuntimeSession({ scene, systems: [collisionSystem()] });
  session.step(DT);

  assertEquals(session.collisions.length, 1);
  assertEquals(session.collisions[0].trigger, true);
  assertEquals(scene.world.require(bird, Transform).position, vec2(0, 0), "the bird is not pushed");
  assertEquals(scene.world.require(bird, RigidBody).grounded, false);
  assertAlmostEquals(scene.world.require(bird, Velocity).x, 50, 1e-12, "velocity survives");
});

Deno.test("a non-solid trigger ignores non-interactive scenery", () => {
  const scene = new Scene({ name: "scenery", gravity: vec2(0, 0) });
  const zone = scene.createEntity({ name: "zone", position: vec2(0, 0) });
  scene.world.add(zone, BoxCollider, { width: 40, height: 40, trigger: true });
  const scenery = scene.createEntity({ name: "scenery", position: vec2(0, 0) });
  scene.world.add(scenery, BoxCollider, { width: 40, height: 40, solid: false });
  const session = new RuntimeSession({ scene, systems: [collisionSystem()] });
  session.step(DT);
  assertEquals(session.collisions.length, 0);
});

Deno.test("trigger reporting can be silenced", () => {
  const scene = new Scene({ name: "quiet-trigger", gravity: vec2(0, 0) });
  const zone = scene.createEntity({ name: "zone", position: vec2(0, 0) });
  scene.world.add(zone, BoxCollider, { width: 40, height: 40, trigger: true });
  const mover = scene.createEntity({ name: "mover", position: vec2(0, 0) });
  scene.world.add(mover, BoxCollider, { width: 20, height: 20 });
  const session = new RuntimeSession({
    scene,
    systems: [collisionSystem({ reportTriggers: false })],
  });
  session.step(DT);
  assertEquals(session.collisions.length, 0);
});

Deno.test("non-solid colliders are ignored entirely", () => {
  const scene = new Scene({ name: "ghost", gravity: vec2(0, 0) });
  const ghost = scene.createEntity({ name: "ghost", position: vec2(0, 0) });
  scene.world.add(ghost, BoxCollider, { width: 40, height: 40, solid: false });
  const mover = scene.createEntity({ name: "mover", position: vec2(0, 0) });
  scene.world.add(mover, BoxCollider, { width: 20, height: 20 });
  const session = new RuntimeSession({ scene, systems: [collisionSystem()] });
  session.step(DT);
  assertEquals(session.collisions.length, 0);
});

Deno.test("disabled colliders do not collide", () => {
  const scene = new Scene({ name: "disabled", gravity: vec2(0, 0) });
  const a = scene.createEntity({ position: vec2(0, 0) });
  scene.world.add(a, BoxCollider, { width: 40, height: 40, enabled: false });
  const b = scene.createEntity({ position: vec2(0, 0) });
  scene.world.add(b, BoxCollider, { width: 20, height: 20 });
  const session = new RuntimeSession({ scene, systems: [collisionSystem()] });
  session.step(DT);
  assertEquals(session.collisions.length, 0);
});

Deno.test("restitution bounces a falling body", () => {
  const scene = new Scene({ name: "bounce", gravity: vec2(0, 0) });
  const ground = scene.createEntity({ name: "ground", position: vec2(0, 100) });
  scene.world.add(ground, RigidBody, { type: "static" });
  scene.world.add(ground, BoxCollider, { width: 200, height: 20 });
  const ball = scene.createEntity({ name: "ball", position: vec2(0, 80) });
  scene.world.add(ball, RigidBody, { type: "dynamic", restitution: 0.5 });
  scene.world.add(ball, Velocity, { x: 0, y: 300 });
  scene.world.add(ball, BoxCollider, { width: 20, height: 20 });
  const session = new RuntimeSession({ scene, systems: [velocitySystem(), collisionSystem()] });
  session.step(DT);
  assert(scene.world.require(ball, Velocity).y < 0, "expected an upward bounce");
});

Deno.test("collision resolution is order-independent for a fixed scene", () => {
  const build = () => collisionScene().scene;
  const first = new RuntimeSession({
    scene: build(),
    systems: [gravitySystem(), velocitySystem(), collisionSystem()],
  });
  const second = new RuntimeSession({
    scene: build(),
    systems: [gravitySystem(), velocitySystem(), collisionSystem()],
  });
  for (let i = 0; i < 200; i++) {
    first.step(DT);
    second.step(DT);
  }
  assertEquals(
    JSON.stringify(first.scene.world.require(2, Transform)),
    JSON.stringify(second.scene.world.require(2, Transform)),
  );
});

Deno.test("bodies that fall past everything keep falling", () => {
  const scene = new Scene({ gravity: vec2(0, 600) });
  const entity = scene.createEntity({ position: vec2(0, 0) });
  scene.world.add(entity, RigidBody, { type: "dynamic" });
  scene.world.add(entity, Velocity, { x: 0, y: 0 });
  scene.world.add(entity, BoxCollider, { width: 10, height: 10 });
  const session = new RuntimeSession({
    scene,
    systems: [gravitySystem(), velocitySystem(), collisionSystem()],
  });
  for (let i = 0; i < 60; i++) session.step(DT);
  assert(scene.world.require(entity, Transform).position.y > 100);
});

// ---------------------------------------------------------------------------
// Lifetime and camera
// ---------------------------------------------------------------------------

Deno.test("lifetime counts down and despawns at zero", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ name: "spark" });
  // Two and a half fixed steps of life: alive after one and two, gone after three.
  scene.world.add(entity, Lifetime, { ttl: 2.5 * DT, remaining: 0 });
  const session = new RuntimeSession({ scene, systems: [lifetimeSystem()] });
  session.step(DT);
  assert(scene.world.isAlive(entity), "still alive after one step");
  session.step(DT);
  assert(scene.world.isAlive(entity), "still alive after the second step");
  session.step(DT);
  assert(!scene.world.isAlive(entity), "expired after the third step");
});

Deno.test("lifetime despawn raises a despawned event", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Lifetime, { ttl: 0.01, remaining: 0 });
  const session = new RuntimeSession({ scene, systems: [lifetimeSystem()] });
  let despawned = 0;
  session.events.on("despawned", () => despawned++);
  session.step(0.02);
  assertEquals(despawned, 1);
});

Deno.test("lifetime with ttl 0 never expires", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Lifetime, { ttl: 0, remaining: 0 });
  const session = new RuntimeSession({ scene, systems: [lifetimeSystem()] });
  for (let i = 0; i < 100; i++) session.step(DT);
  assert(scene.world.isAlive(entity));
});

Deno.test("lifetime counts an expired entity once", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Lifetime, { ttl: 0.01, remaining: 0 });
  const diagnostics = new Diagnostics();
  const session = new RuntimeSession({ scene, systems: [lifetimeSystem()], diagnostics });
  session.step(0.02);
  session.step(0.02);
  assertEquals(diagnostics.getCounter("lifetimesExpired"), 1);
});

Deno.test("camera system follows the scene's target", () => {
  const scene = new Scene({ viewport: { width: 800, height: 600 } });
  const target = scene.createEntity({ position: vec2(2000, 900) });
  scene.resources.camera.smoothing = 0;
  scene.resources.camera.follow = target;
  const session = new RuntimeSession({ scene, systems: [cameraSystem()] });
  session.step(DT);
  assertEquals(session.camera.state.position, vec2(2000, 900));
});

Deno.test("camera system respects scene bounds", () => {
  const scene = new Scene({ viewport: { width: 800, height: 600 } });
  scene.resources.camera.bounds = rect(0, 0, 1000, 700);
  scene.resources.camera.smoothing = 0;
  const target = scene.createEntity({ position: vec2(9999, 9999) });
  scene.resources.camera.follow = target;
  const session = new RuntimeSession({ scene, systems: [cameraSystem()] });
  session.step(DT);
  assertEquals(session.camera.state.position, vec2(600, 400));
});

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

Deno.test("script system starts behaviours once", () => {
  let starts = 0;
  let updates = 0;
  const registry = new ScriptRegistry().define("count", () => ({
    start: () => starts++,
    update: () => updates++,
  }));
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { name: "count", props: {} });
  const session = new RuntimeSession({ scene, systems: [scriptSystem({ registry })] });
  session.step(DT);
  session.step(DT);
  session.step(DT);
  assertEquals(starts, 1);
  assertEquals(updates, 3);
});

Deno.test("script system forgets behaviours when the session switches scenes", () => {
  let menuUpdates = 0;
  let levelUpdates = 0;
  const registry = new ScriptRegistry()
    .define("menu", () => ({ update: () => menuUpdates++ }))
    .define("level", () => ({ update: () => levelUpdates++ }));
  const menu = new Scene({ name: "menu" });
  const trigger = menu.createEntity();
  menu.world.add(trigger, Script, { name: "menu" });
  const level = new Scene({ name: "level" });
  const other = level.createEntity();
  // Entity ids are per world, so these two share an id: the case that leaked state.
  assertEquals(trigger, other);
  const scripted = level.createEntity();
  level.world.add(scripted, Script, { name: "level" });

  const session = new RuntimeSession({ scene: menu, systems: [scriptSystem({ registry })] });
  session.step(DT);
  session.setScene(level);
  session.step(DT);
  session.step(DT);

  assertEquals(menuUpdates, 1);
  assertEquals(levelUpdates, 2);
});

Deno.test("script system passes the entity and props to behaviours", () => {
  let seenEntity = 0;
  let seenProps: Record<string, unknown> = {};
  const registry = new ScriptRegistry().define("inspect", (props, entity) => {
    seenEntity = 0;
    seenProps = props;
    void entity;
    return {
      update: (ctx) => {
        seenEntity = ctx.entity;
      },
    };
  });
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { name: "inspect", props: { speed: 42 } });
  const session = new RuntimeSession({ scene, systems: [scriptSystem({ registry })] });
  session.step(DT);
  assertEquals(seenEntity, entity);
  assertEquals(seenProps, { speed: 42 });
});

Deno.test("scripts can read input, RNG and services from the context", () => {
  const registry = new ScriptRegistry().define("probe", () => {
    const seen: Record<string, unknown> = {};
    return {
      update: (ctx) => {
        seen.dt = ctx.dt;
        seen.frame = ctx.frame;
        seen.service = ctx.services.answer;
        seen.rng = ctx.rng.int(0, 10);
        seen.down = ctx.input.isDown("Space");
        seen.time = ctx.time;
      },
    };
  });
  const scene = new Scene();
  scene.createEntity().toString();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { name: "probe" });
  const session = new RuntimeSession({
    scene,
    systems: [scriptSystem({ registry })],
    services: { answer: 42 },
  });
  session.step(DT, {
    held: ["Space"],
    pressed: [],
    released: [],
    mouse: { x: 0, y: 0 },
    mouseHeld: [],
    mousePressed: [],
    mouseReleased: [],
  });
  // The probe throws if any field were missing; reaching here means it read them all.
  assert(true);
});

Deno.test("script update receives a positive dt", () => {
  let observedDt = 0;
  const registry = new ScriptRegistry().define(
    "dt",
    () => ({ update: (ctx) => observedDt = ctx.dt }),
  );
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { name: "dt" });
  new RuntimeSession({ scene, systems: [scriptSystem({ registry })] }).step(DT);
  assertAlmostEquals(observedDt, DT, 1e-12);
});

Deno.test("script system calls destroy when the entity despawns", () => {
  let destroyed = 0;
  const registry = new ScriptRegistry().define("dying", () => ({ destroy: () => destroyed++ }));
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { name: "dying" });
  const session = new RuntimeSession({ scene, systems: [scriptSystem({ registry })] });
  session.step(DT);
  scene.world.despawn(entity);
  session.step(DT);
  assertEquals(destroyed, 1);
});

Deno.test("changing a script name restarts the behaviour", () => {
  let firstStarts = 0;
  let secondStarts = 0;
  let firstDestroyed = 0;
  const registry = new ScriptRegistry()
    .define("one", () => ({ start: () => firstStarts++, destroy: () => firstDestroyed++ }))
    .define("two", () => ({ start: () => secondStarts++ }));
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { name: "one" });
  const session = new RuntimeSession({ scene, systems: [scriptSystem({ registry })] });
  session.step(DT);
  scene.world.set(entity, Script, { name: "two" });
  session.step(DT);
  assertEquals([firstStarts, secondStarts, firstDestroyed], [1, 1, 1]);
});

Deno.test("unknown scripts warn once per entity and do not throw", () => {
  const diagnostics = new Diagnostics({ minLevel: "warn" });
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { name: "missing" });
  const session = new RuntimeSession({
    scene,
    systems: [scriptSystem({ registry: new ScriptRegistry() })],
    diagnostics,
  });
  session.step(DT);
  session.step(DT);
  assert(diagnostics.count("warn") >= 1);
});

Deno.test("script onMissing handler can take over reporting", () => {
  const missing: string[] = [];
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { name: "ghost" });
  const session = new RuntimeSession({
    scene,
    systems: [
      scriptSystem({ registry: new ScriptRegistry(), onMissing: (_e, name) => missing.push(name) }),
    ],
  });
  session.step(DT);
  assertEquals(missing, ["ghost"]);
});

Deno.test("scripts with an empty name are ignored", () => {
  let starts = 0;
  const registry = new ScriptRegistry().define("never", () => ({ start: () => starts++ }));
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { name: "" });
  new RuntimeSession({ scene, systems: [scriptSystem({ registry })] }).step(DT);
  assertEquals(starts, 0);
});

Deno.test("inline script source runs with the component API", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, {
    source: `({
      update(ctx) {
        const t = ctx.scene.world.get(ctx.entity, Transform);
        const speed = numberProp(ctx.props, "speed", 60);
        if (t) t.position.x += speed * ctx.dt;
      }
    })`,
    props: { speed: 120 },
  });
  const session = new RuntimeSession({ scene, systems: [scriptSystem()] });
  session.step(DT);
  assertAlmostEquals(scene.world.require(entity, Transform).position.x, 2, 1e-9);
});

Deno.test("inline script can be a bare update function", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, {
    source: `function (ctx) {
      const t = ctx.scene.world.get(ctx.entity, Transform);
      if (t) t.rotation += ctx.dt;
    }`,
  });
  new RuntimeSession({ scene, systems: [scriptSystem()] }).step(DT);
  assertAlmostEquals(scene.world.require(entity, Transform).rotation, DT, 1e-12);
});

Deno.test("inline script syntax errors are diagnosed without throwing", () => {
  const diagnostics = new Diagnostics({ minLevel: "error" });
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { source: "({ update( {" });
  const session = new RuntimeSession({
    scene,
    systems: [scriptSystem()],
    diagnostics,
  });
  session.step(DT);
  session.step(DT);
  assertEquals(diagnostics.count("error"), 1, "reported once");
});

Deno.test("an inline script that throws is disabled and can recover when edited", () => {
  const diagnostics = new Diagnostics({ minLevel: "error" });
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { source: "({ update() { throw new Error('boom'); } })" });
  const session = new RuntimeSession({ scene, systems: [scriptSystem()], diagnostics });
  session.step(DT);
  session.step(DT);
  assertEquals(diagnostics.count("error"), 1, "one failure report");
  scene.world.set(entity, Script, {
    source: `({ update(ctx) {
      const t = ctx.scene.world.get(ctx.entity, Transform);
      if (t) t.position.y = 42;
    } })`,
  });
  session.step(DT);
  assertEquals(scene.world.require(entity, Transform).position.y, 42);
});

Deno.test("editing inline source restarts the behaviour", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, {
    source: `({ update(ctx) {
      const t = ctx.scene.world.get(ctx.entity, Transform);
      if (t) t.position.x += 1;
    } })`,
  });
  const session = new RuntimeSession({ scene, systems: [scriptSystem()] });
  session.step(DT);
  assertEquals(scene.world.require(entity, Transform).position.x, 1);
  scene.world.set(entity, Script, {
    source: `({ update(ctx) {
      const t = ctx.scene.world.get(ctx.entity, Transform);
      if (t) t.position.y += 1;
    } })`,
  });
  session.step(DT);
  assertEquals(scene.world.require(entity, Transform).position.x, 1, "old behaviour stopped");
  assertEquals(scene.world.require(entity, Transform).position.y, 1, "new behaviour started");
});

Deno.test("scripts update in ascending entity order", () => {
  const order: number[] = [];
  const registry = new ScriptRegistry().define("log", (_props, entity) => ({
    update: () => order.push(entity),
  }));
  const scene = new Scene();
  const first = scene.createEntity();
  const second = scene.createEntity();
  scene.world.add(second, Script, { name: "log" });
  scene.world.add(first, Script, { name: "log" });
  new RuntimeSession({ scene, systems: [scriptSystem({ registry })] }).step(DT);
  assertEquals(order, [first, second]);
});

Deno.test("a script can spawn and despawn through the api", () => {
  const registry = new ScriptRegistry().define("spawner", () => {
    let spawned = 0;
    return {
      update: (ctx) => {
        if (spawned > 0) return;
        spawned = ctx.api.spawn({ name: "child", position: vec2(5, 5) });
      },
    };
  });
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, Script, { name: "spawner" });
  const session = new RuntimeSession({ scene, systems: [scriptSystem({ registry })] });
  session.step(DT);
  assertEquals(session.entityCount, 2);
  assertEquals(scene.labelOf(scene.world.entities()[1]), "child");
});

// ---------------------------------------------------------------------------
// System composition helpers
// ---------------------------------------------------------------------------

Deno.test("defaultSystems includes every built-in in phase order", () => {
  const names = defaultSystems({ scripts: new ScriptRegistry() }).map((system) => system.name);
  assertEquals(names, [
    "animation",
    "scripts",
    "gravity",
    "velocity",
    "collision",
    "camera",
    "lifetime",
  ]);
});

Deno.test("defaultSystems can disable individual systems", () => {
  const names = defaultSystems({
    scripts: new ScriptRegistry(),
    disable: ["gravity", "camera"],
  }).map((system) => system.name);
  assertEquals(names.includes("gravity"), false);
  assertEquals(names.includes("camera"), false);
  assertEquals(names.includes("velocity"), true);
});

Deno.test("defaultSystems returns fresh systems each call", () => {
  const first = defaultSystems({ scripts: new ScriptRegistry() });
  const second = defaultSystems({ scripts: new ScriptRegistry() });
  assertNotEquals(first[0], second[0]);
});

Deno.test("randomPointInRect stays inside the rect and is deterministic per seed", () => {
  const area = rect(10, 20, 100, 50);
  const a = new RuntimeSession({ scene: new Scene(), systems: [], seed: "points" });
  const b = new RuntimeSession({ scene: new Scene(), systems: [], seed: "points" });
  for (let i = 0; i < 50; i++) {
    const point = randomPointInRect(a.rng, area);
    assert(point.x >= 10 && point.x <= 110, `x out of bounds: ${point.x}`);
    assert(point.y >= 20 && point.y <= 70, `y out of bounds: ${point.y}`);
    assertEquals(point, randomPointInRect(b.rng, area));
  }
});

Deno.test("systems may be defined with an order and read the phase constants", () => {
  const system = defineSystem("custom", () => {}, 500);
  assertEquals(system.order, 500);
  assertEquals(typeof system.update, "function");
});

Deno.test("a later phase can read what an earlier phase wrote", () => {
  const scene = new Scene({ gravity: vec2(0, 600) });
  const entity = scene.createEntity();
  scene.world.add(entity, Velocity, { x: 0, y: 0 });
  scene.world.add(entity, RigidBody, { type: "dynamic" });
  const observed: number[] = [];
  const session = new RuntimeSession({
    scene,
    systems: [
      gravitySystem(),
      defineSystem(
        "observer",
        (ctx) => observed.push(ctx.scene.world.require(entity, Velocity).y),
        300,
      ),
    ],
  });
  session.step(DT);
  assertAlmostEquals(observed[0], 10, 1e-6);
});

Deno.test("Name and Tag helpers are unaffected by the step", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ name: "keep" });
  scene.world.add(entity, Tag, { value: "important" });
  const session = new RuntimeSession({
    scene,
    systems: defaultSystems({ scripts: new ScriptRegistry() }),
  });
  for (let i = 0; i < 10; i++) session.step(DT);
  assertEquals(scene.world.require(entity, Name).value, "keep");
  assertEquals(session.api.entitiesWithTag("important"), [entity]);
});
