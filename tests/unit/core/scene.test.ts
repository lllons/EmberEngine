/**
 * @ember/core/scene — scene resources, entity creation and cloning.
 */

import { assert, assertEquals, assertNotEquals } from "@std/assert";
import {
  Colors,
  DEFAULT_VIEWPORT,
  Name,
  Scene,
  Sprite,
  Transform,
  defaultResources,
  vec2,
} from "@ember/core";

Deno.test("Scene defaults: name, gravity, background, viewport and camera", () => {
  const scene = new Scene();
  assertEquals(scene.name, "untitled");
  assertEquals(scene.resources.background, Colors.ink);
  assertEquals(scene.resources.viewport, DEFAULT_VIEWPORT);
  assertEquals(scene.resources.gravity, vec2(0, 1400));
  assertEquals(scene.resources.camera.follow, null);
  assertEquals(scene.resources.camera.bounds, null);
  assertEquals(scene.entityCount, 0);
});

Deno.test("Scene.create is equivalent to the constructor", () => {
  const scene = Scene.create({ name: "level-x", gravity: vec2(0, 10) });
  assertEquals(scene.name, "level-x");
  assertEquals(scene.resources.gravity, vec2(0, 10));
});

Deno.test("defaultResources centres the camera in the viewport", () => {
  const resources = defaultResources({ viewport: { width: 800, height: 600 } });
  assertEquals(resources.camera.position, vec2(400, 300));
  assertEquals(resources.viewport, { width: 800, height: 600 });
});

Deno.test("defaultResources copies caller-provided vectors", () => {
  const gravity = vec2(1, 2);
  const resources = defaultResources({ gravity });
  gravity.x = 99;
  assertEquals(resources.gravity, vec2(1, 2));
});

Deno.test("defaultResources copies the camera bounds", () => {
  const bounds = { x: 0, y: 0, w: 100, h: 100 };
  const resources = defaultResources({ camera: { bounds } });
  bounds.w = 5;
  assertEquals(resources.camera.bounds, { x: 0, y: 0, w: 100, h: 100 });
});

Deno.test("Scene resources are independent between scenes", () => {
  const a = new Scene();
  const b = new Scene();
  a.resources.gravity.x = 50;
  assertNotEquals(b.resources.gravity.x, 50);
});

Deno.test("createEntity adds a Transform and optional Name", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ name: "box", position: vec2(5, 6) });
  assertEquals(scene.world.require(entity, Transform).position, vec2(5, 6));
  assertEquals(scene.world.require(entity, Name).value, "box");
  assertEquals(scene.entityCount, 1);
});

Deno.test("createEntity without a name omits the Name component", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  assertEquals(scene.world.get(entity, Name), undefined);
  assertEquals(scene.labelOf(entity), `entity-${entity}`);
});

Deno.test("createEntity copies position and scale inputs", () => {
  const scene = new Scene();
  const position = vec2(1, 2);
  const entity = scene.createEntity({ position, scale: vec2(2, 2) });
  position.x = 99;
  const transform = scene.world.require(entity, Transform);
  assertEquals(transform.position, vec2(1, 2));
  assertEquals(transform.scale, vec2(2, 2));
});

Deno.test("createEntity accepts rotation and scale", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ rotation: 1.5, scale: vec2(3, 4) });
  const transform = scene.world.require(entity, Transform);
  assertEquals(transform.rotation, 1.5);
  assertEquals(transform.scale, vec2(3, 4));
});

Deno.test("duplicateEntity copies every component into a new id", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ name: "original", position: vec2(3, 4) });
  scene.world.add(entity, Sprite, { texture: "coin", frameCount: 3 });
  const copy = scene.duplicateEntity(entity)!;
  assertNotEquals(copy, entity);
  assertEquals(scene.world.require(copy, Name).value, "original");
  assertEquals(scene.world.require(copy, Sprite).texture, "coin");
  assertEquals(scene.world.require(copy, Sprite).frameCount, 3);
});

Deno.test("duplicateEntity deep-copies component data", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ name: "original" });
  scene.world.require(entity, Transform).position.x = 10;
  const copy = scene.duplicateEntity(entity)!;
  scene.world.require(copy, Transform).position.x = 999;
  assertEquals(scene.world.require(entity, Transform).position.x, 10);
});

Deno.test("duplicateEntity returns null for missing entities", () => {
  const scene = new Scene();
  assertEquals(scene.duplicateEntity(999), null);
});

Deno.test("findByName returns the first matching entity", () => {
  const scene = new Scene();
  scene.createEntity({ name: "first" });
  const second = scene.createEntity({ name: "second" });
  assertEquals(scene.findByName("second"), second);
  assertEquals(scene.findByName("missing"), undefined);
});

Deno.test("labelOf falls back to the entity id and prefers a non-empty name", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ name: "" });
  assertEquals(scene.labelOf(entity), `entity-${entity}`);
  scene.world.set(entity, Name, { value: "named" });
  assertEquals(scene.labelOf(entity), "named");
});

Deno.test("worldPosition reports the transform position", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ position: vec2(9, 10) });
  assertEquals(scene.worldPosition(entity), vec2(9, 10));
  assertEquals(scene.worldPosition(999), undefined);
});

Deno.test("clone copies resources, metadata and entities", () => {
  const scene = new Scene({ name: "original", metadata: { tag: "keep" } });
  scene.resources.gravity = vec2(0, 99);
  scene.createEntity({ name: "kept" });
  const copy = scene.clone();
  assertEquals(copy.name, "original");
  assertEquals(copy.resources.gravity, vec2(0, 99));
  assertEquals(copy.metadata, { tag: "keep" });
  assertEquals(copy.entityCount, 1);
  assertEquals(copy.findByName("kept"), scene.findByName("kept"));
});

Deno.test("clone is deep: mutating the copy leaves the original alone", () => {
  const scene = new Scene();
  scene.createEntity({ name: "kept", position: vec2(1, 1) });
  const copy = scene.clone();
  copy.resources.gravity.y = 12345;
  copy.world.require(copy.findByName("kept")!, Transform).position.x = 42;
  assertEquals(scene.resources.gravity.y, 1400);
  assertEquals(scene.world.require(scene.findByName("kept")!, Transform).position.x, 1);
});

Deno.test("toJSON summarizes the scene without leaking component data", () => {
  const scene = new Scene({ name: "summary" });
  scene.createEntity({ name: "one" });
  const json = scene.toJSON();
  assertEquals(json.name, "summary");
  assertEquals(json.entities, 1);
  assertEquals(Object.keys(json).sort(), ["entities", "name", "resources"]);
});

Deno.test("scenes can hold many entities and stay queryable", () => {
  const scene = new Scene();
  for (let i = 0; i < 50; i++) scene.createEntity({ name: `e${i}`, position: vec2(i, 0) });
  assertEquals(scene.entityCount, 50);
  assertEquals(scene.world.query(Transform).length, 50);
  assertEquals(scene.labelOf(scene.findByName("e49")!), "e49");
});
