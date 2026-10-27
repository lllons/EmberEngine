/**
 * @ember/runtime/digest — canonical text and hashes used for determinism checks.
 */

import { assert, assertEquals } from "@std/assert";
import { Scene, Transform, vec2 } from "@ember/core";
import {
  fixed,
  hashText,
  sceneDigest,
  stableJson,
  worldDigest,
  worldDigestText,
} from "@ember/runtime";

Deno.test("fixed rounds to six decimals", () => {
  assertEquals(fixed(1), "1.000000");
  assertEquals(fixed(1.23456789), "1.234568");
  assertEquals(fixed(-0.0000004), "-0.000000");
});

Deno.test("fixed passes non-finite numbers through", () => {
  assertEquals(fixed(Number.NaN), "NaN");
  assertEquals(fixed(Number.POSITIVE_INFINITY), "Infinity");
});

Deno.test("stableJson sorts object keys", () => {
  assertEquals(stableJson({ b: 1, a: 2 }), '{"a":"2.000000","b":"1.000000"}');
});

Deno.test("stableJson keeps array order", () => {
  assertEquals(stableJson([2, 1]), '["2.000000","1.000000"]');
});

Deno.test("stableJson nests objects and rounds numbers", () => {
  assertEquals(stableJson({ v: { y: 0.5, x: 0.1 } }), '{"v":{"x":"0.100000","y":"0.500000"}}');
});

Deno.test("stableJson renders undefined explicitly", () => {
  assertEquals(stableJson(undefined), "undefined");
});

Deno.test("stableJson handles strings and booleans", () => {
  assertEquals(stableJson({ on: true, name: "hero" }), '{"name":"hero","on":true}');
});

Deno.test("hashText is an eight character hex string", () => {
  const hash = hashText("ember");
  assertEquals(hash.length, 8);
  assert(/^[0-9a-f]{8}$/.test(hash));
});

Deno.test("hashText is stable for the same input", () => {
  assertEquals(hashText("same text"), hashText("same text"));
});

Deno.test("hashText separates different inputs", () => {
  assert(hashText("a") !== hashText("b"));
  assert(hashText("") !== hashText(" "));
});

Deno.test("hashText hashes the empty string to the FNV offset basis", () => {
  assertEquals(hashText(""), "811c9dc5");
});

Deno.test("worldDigestText lists entities in creation order with their components", () => {
  const scene = new Scene();
  scene.createEntity({ name: "first", position: vec2(1, 2) });
  scene.createEntity({ name: "second", position: vec2(3, 4) });
  const lines = worldDigestText(scene.world).split("\n");
  assertEquals(lines.length, 2);
  assert(lines[0].startsWith("#1 "));
  assert(lines[1].startsWith("#2 "));
});

Deno.test("worldDigest is identical for identical scenes", () => {
  const build = () => {
    const scene = new Scene();
    scene.createEntity({ name: "player", position: vec2(10, 20) });
    return scene;
  };
  assertEquals(worldDigest(build().world), worldDigest(build().world));
});

Deno.test("worldDigest changes when a component changes", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ name: "player", position: vec2(10, 20) });
  const before = worldDigest(scene.world);
  scene.world.require(entity, Transform).position = vec2(11, 20);
  assert(worldDigest(scene.world) !== before);
});

Deno.test("worldDigest changes when an entity is added", () => {
  const scene = new Scene();
  scene.createEntity({ name: "a" });
  const before = worldDigest(scene.world);
  scene.createEntity({ name: "b" });
  assert(worldDigest(scene.world) !== before);
});

Deno.test("worldDigest ignores float noise below the fixed precision", () => {
  const first = new Scene();
  first.createEntity({ position: vec2(1.0000001, 0) });
  const second = new Scene();
  second.createEntity({ position: vec2(1.0000002, 0) });
  assertEquals(worldDigest(first.world), worldDigest(second.world));
});

Deno.test("an empty world has a digest", () => {
  assertEquals(worldDigest(new Scene().world), hashText(""));
});

Deno.test("sceneDigest includes the camera position", () => {
  const scene = new Scene();
  const before = sceneDigest(scene);
  scene.resources.camera.position = vec2(5, 0);
  assert(sceneDigest(scene) !== before);
});

Deno.test("sceneDigest includes the camera zoom", () => {
  const scene = new Scene();
  const before = sceneDigest(scene);
  scene.resources.camera.zoom = 2;
  assert(sceneDigest(scene) !== before);
});

Deno.test("sceneDigest includes the followed entity", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ name: "target" });
  const before = sceneDigest(scene);
  scene.resources.camera.follow = entity;
  assert(sceneDigest(scene) !== before);
});

Deno.test("sceneDigest includes the scene name", () => {
  const named = new Scene({ name: "level-1" });
  const other = new Scene({ name: "level-2" });
  assert(sceneDigest(named) !== sceneDigest(other));
});

Deno.test("two runs of the same scripted scene produce the same digest", () => {
  const build = () => {
    const scene = new Scene();
    const entity = scene.createEntity({ name: "mover" });
    return { scene, entity };
  };
  const a = build();
  const b = build();
  a.scene.world.require(a.entity, Transform).position = vec2(3, 4);
  b.scene.world.require(b.entity, Transform).position = vec2(3, 4);
  assertEquals(sceneDigest(a.scene), sceneDigest(b.scene));
});
