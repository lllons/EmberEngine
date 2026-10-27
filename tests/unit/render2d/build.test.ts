/**
 * @ember/render2d/build — scene to draw commands, the heart of the 2D pipeline.
 */

import { assert, assertEquals, assertAlmostEquals } from "@std/assert";
import {
  BoxCollider,
  CircleShape,
  Parent,
  RectShape,
  Scene,
  Sprite,
  TextLabel,
  Visibility,
  Transform,
  World,
  vec2,
} from "@ember/core";
import {
  buildDrawList,
  buildEntityCommands,
  commandHistogram,
  drawListViewRect,
  pickEntitiesAtPoint,
  pickEntityAtPoint,
  type RectCommand,
  type SpriteCommand,
  type TextCommand,
} from "@ember/render2d";

const viewport = { width: 800, height: 600 };

function sceneWithCamera(): Scene {
  const scene = new Scene({ name: "build-test", viewport });
  scene.resources.camera.position = vec2(400, 300);
  scene.resources.camera.zoom = 1;
  return scene;
}

Deno.test("buildDrawList emits the background clear first", () => {
  const scene = sceneWithCamera();
  scene.resources.background = "#123456";
  const list = buildDrawList(scene);
  assertEquals(list.commands[0], { kind: "clear", color: "#123456" });
});

Deno.test("buildDrawList can omit the background", () => {
  const scene = sceneWithCamera();
  scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(1, RectShape, { width: 10, height: 10 });
  const list = buildDrawList(scene, { background: false });
  assert(list.commands.every((command) => command.kind !== "clear"));
});

Deno.test("buildDrawList converts a rect shape into a screen-space command", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, RectShape, { width: 40, height: 20, color: "#abc123" });
  const list = buildDrawList(scene);
  const rect = list.commands.find((command) => command.kind === "rect") as RectCommand;
  assertEquals([rect.x, rect.y, rect.w, rect.h], [400, 300, 40, 20]);
  assertEquals(rect.color, "#abc123");
  assertEquals(rect.entity, entity);
});

Deno.test("buildDrawList scales shapes by the camera zoom", () => {
  const scene = sceneWithCamera();
  scene.resources.camera.zoom = 2;
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, RectShape, { width: 40, height: 20 });
  const rect = buildDrawList(scene).commands.find((command) => command.kind === "rect") as RectCommand;
  assertEquals([rect.w, rect.h], [80, 40]);
});

Deno.test("buildDrawList applies the entity's own scale", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300), scale: vec2(3, 0.5) });
  scene.world.add(entity, RectShape, { width: 10, height: 10 });
  const rect = buildDrawList(scene).commands.find((command) => command.kind === "rect") as RectCommand;
  assertEquals([rect.w, rect.h], [30, 5]);
  assertEquals(scene.world.require(entity, RectShape).width, 10, "the scene must not be mutated");
});

Deno.test("buildDrawList places a world entity at the right screen position", () => {
  const scene = sceneWithCamera();
  scene.resources.camera.position = vec2(0, 0);
  const entity = scene.createEntity({ position: vec2(0, 0) });
  scene.world.add(entity, CircleShape, { radius: 5 });
  const circle = buildDrawList(scene).commands.find((command) => command.kind === "circle");
  assertEquals(circle && { x: circle.x, y: circle.y }, { x: 400, y: 300 });
});

Deno.test("buildDrawList emits one command per visual component", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, RectShape, { width: 10, height: 10 });
  scene.world.add(entity, CircleShape, { radius: 4 });
  scene.world.add(entity, TextLabel, { text: "hi" });
  scene.world.add(entity, Sprite, { texture: "player", width: 8, height: 8 });
  const histogram = commandHistogram(buildDrawList(scene).commands);
  assertEquals(histogram, { clear: 1, rect: 1, circle: 1, text: 1, sprite: 1 });
});

Deno.test("buildDrawList skips entities without a Transform", () => {
  const scene = sceneWithCamera();
  const entity = scene.world.spawn();
  scene.world.add(entity, RectShape, { width: 10, height: 10 });
  const list = buildDrawList(scene);
  assertEquals(list.stats.considered, 0);
  assertEquals(list.commands.length, 1);
});

Deno.test("buildDrawList skips invisible entities", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, RectShape, { width: 10, height: 10 });
  scene.world.add(entity, Visibility, { visible: false });
  assertEquals(buildDrawList(scene).stats.drawn, 0);
});

Deno.test("buildDrawList hides children of a hidden parent", () => {
  const scene = sceneWithCamera();
  const parent = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(parent, Visibility, { visible: false });
  const child = scene.createEntity({ position: vec2(0, 0) });
  scene.world.add(child, Parent, { entity: parent });
  scene.world.add(child, RectShape, { width: 10, height: 10 });
  assertEquals(buildDrawList(scene).stats.drawn, 0);
});

Deno.test("buildDrawList positions children through parent transforms", () => {
  const scene = sceneWithCamera();
  const parent = scene.createEntity({ position: vec2(1000, 100) });
  const child = scene.createEntity({ position: vec2(50, 50) });
  scene.world.add(child, Parent, { entity: parent });
  scene.world.add(child, RectShape, { width: 10, height: 10 });
  // Culling off: the child intentionally sits outside this small viewport.
  const list = buildDrawList(scene, { cull: false });
  const rect = list.commands.find((command) => command.kind === "rect") as RectCommand;
  // World position (1050, 150) with the camera at (400, 300) and zoom 1.
  assertEquals([rect.x, rect.y], [1050, 150]);
});

Deno.test("buildDrawList skips sprites and shapes with zero alpha", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, RectShape, { alpha: 0 });
  scene.world.add(entity, CircleShape, { alpha: 0 });
  scene.world.add(entity, Sprite, { alpha: 0, texture: "x" });
  assertEquals(buildDrawList(scene).stats.drawn, 0);
});

Deno.test("buildDrawList skips empty text labels", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, TextLabel, { text: "" });
  assertEquals(buildDrawList(scene).stats.drawn, 0);
});

Deno.test("buildDrawList sorts commands by layer then entity id", () => {
  const scene = sceneWithCamera();
  const high = scene.createEntity({ name: "high", position: vec2(400, 300) });
  scene.world.add(high, RectShape, { layer: 10, width: 10, height: 10 });
  const low = scene.createEntity({ name: "low", position: vec2(400, 300) });
  scene.world.add(low, RectShape, { layer: -5, width: 10, height: 10 });
  const sameLayerA = scene.createEntity({ name: "a", position: vec2(400, 300) });
  scene.world.add(sameLayerA, RectShape, { layer: 0, width: 10, height: 10 });
  const sameLayerB = scene.createEntity({ name: "b", position: vec2(400, 300) });
  scene.world.add(sameLayerB, RectShape, { layer: 0, width: 10, height: 10 });

  const entities = buildDrawList(scene).commands
    .filter((command) => command.kind === "rect")
    .map((command) => command.entity);
  assertEquals(entities, [low, sameLayerA, sameLayerB, high]);
});

Deno.test("buildDrawList is deterministic across repeated builds", () => {
  const scene = sceneWithCamera();
  for (let i = 0; i < 20; i++) {
    const entity = scene.createEntity({ position: vec2(i * 10, 100) });
    scene.world.add(entity, RectShape, { layer: i % 3, width: 5, height: 5 });
  }
  assertEquals(
    JSON.stringify(buildDrawList(scene).commands),
    JSON.stringify(buildDrawList(scene).commands),
  );
});

Deno.test("buildDrawList culls shapes outside the view", () => {
  const scene = sceneWithCamera();
  const offscreen = scene.createEntity({ position: vec2(-500, -500) });
  scene.world.add(offscreen, RectShape, { width: 10, height: 10 });
  const onscreen = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(onscreen, RectShape, { width: 10, height: 10 });
  const list = buildDrawList(scene);
  assertEquals(list.stats.drawn, 1);
  assertEquals(list.stats.culled, 1);
  assertEquals(list.commands.length, 2);
});

Deno.test("buildDrawList can disable culling", () => {
  const scene = sceneWithCamera();
  const offscreen = scene.createEntity({ position: vec2(-5000, -5000) });
  scene.world.add(offscreen, RectShape, { width: 10, height: 10 });
  const list = buildDrawList(scene, { cull: false });
  assertEquals(list.stats.culled, 0);
  assertEquals(list.stats.drawn, 1);
});

Deno.test("buildDrawList culls partially visible shapes only when fully outside", () => {
  const scene = sceneWithCamera();
  const edge = scene.createEntity({ position: vec2(-10, 300) });
  scene.world.add(edge, RectShape, { width: 40, height: 10 });
  assertEquals(buildDrawList(scene).stats.drawn, 1);
});

Deno.test("buildDrawList counts considered entities that draw something", () => {
  const scene = sceneWithCamera();
  const first = scene.createEntity({ position: vec2(100, 100) });
  scene.world.add(first, RectShape, { width: 5, height: 5 });
  scene.createEntity({ position: vec2(0, 0) });
  const stats = buildDrawList(scene).stats;
  assertEquals(stats.considered, 1);
  assertEquals(stats.drawn, 1);
});

Deno.test("sprite commands carry texture, uv, tint and flip", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, Sprite, {
    texture: "coin",
    width: 18,
    height: 18,
    tint: "#ff0000",
    flipX: true,
    frameCount: 4,
    frame: 2,
  });
  const sprite = buildDrawList(scene).commands.find((command) => command.kind === "sprite") as SpriteCommand;
  assertEquals(sprite.texture, "coin");
  assertEquals(sprite.tint, "#ff0000");
  assertEquals(sprite.flipX, true);
  assertAlmostEquals(sprite.uv.u0, 0.5, 1e-9);
  assertAlmostEquals(sprite.uv.u1, 0.75, 1e-9);
});

Deno.test("sprite frames wrap around instead of falling off the strip", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, Sprite, { texture: "coin", frameCount: 4, frame: 6 });
  const sprite = buildDrawList(scene).commands.find((command) => command.kind === "sprite") as SpriteCommand;
  assertAlmostEquals(sprite.uv.u0, 0.5, 1e-9);
});

Deno.test("a single-frame sprite uses the whole texture", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, Sprite, { texture: "player" });
  const sprite = buildDrawList(scene).commands.find((command) => command.kind === "sprite") as SpriteCommand;
  assertEquals(sprite.uv, { u0: 0, v0: 0, u1: 1, v1: 1 });
});

Deno.test("text commands scale their font size with zoom", () => {
  const scene = sceneWithCamera();
  scene.resources.camera.zoom = 1.5;
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, TextLabel, { text: "score", size: 20 });
  const text = buildDrawList(scene).commands.find((command) => command.kind === "text") as TextCommand;
  assertEquals(text.size, 30);
});

Deno.test("text commands preserve alignment and baseline", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, TextLabel, { text: "hi", align: "right", baseline: "bottom" });
  const text = buildDrawList(scene).commands.find((command) => command.kind === "text") as TextCommand;
  assertEquals([text.align, text.baseline], ["right", "bottom"]);
});

Deno.test("debug colliders add outline rects on a high layer", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, BoxCollider, { width: 20, height: 20 });
  const list = buildDrawList(scene, { debugColliders: true });
  const outline = list.commands.filter((command) => command.kind === "rect") as RectCommand[];
  assertEquals(outline.length, 1);
  assertEquals(outline[0].filled, false);
  assertEquals(outline[0].layer, 900);
});

Deno.test("debug colliders mark triggers differently from solid colliders", () => {
  const scene = sceneWithCamera();
  const solid = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(solid, BoxCollider, { width: 20, height: 20 });
  const trigger = scene.createEntity({ position: vec2(200, 200) });
  scene.world.add(trigger, BoxCollider, { width: 20, height: 20, trigger: true });
  const colors = (buildDrawList(scene, { debugColliders: true }).commands as RectCommand[])
    .filter((command) => command.filled === false)
    .map((command) => command.color);
  assertEquals(new Set(colors).size, 2);
});

Deno.test("buildEntityCommands returns an empty list for unknown entities", () => {
  const scene = sceneWithCamera();
  assertEquals(buildEntityCommands(scene, 12345, scene.resources.camera, viewport), []);
});

Deno.test("buildEntityCommands uses the supplied camera and viewport", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(0, 0) });
  scene.world.add(entity, RectShape, { width: 10, height: 10 });
  const commands = buildEntityCommands(scene, entity, { ...scene.resources.camera, position: vec2(0, 0) }, viewport);
  assertEquals(commands.length, 1);
  assertEquals((commands[0] as RectCommand).x, 400);
});

Deno.test("pickEntityAtPoint finds the entity under the cursor", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, RectShape, { width: 100, height: 100 });
  const list = buildDrawList(scene);
  assertEquals(pickEntityAtPoint(list, vec2(400, 300)), entity);
  assertEquals(pickEntityAtPoint(list, vec2(100, 100)), null);
});

Deno.test("pickEntityAtPoint prefers the topmost (last drawn) command", () => {
  const scene = sceneWithCamera();
  const lower = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(lower, RectShape, { width: 100, height: 100, layer: 0 });
  const upper = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(upper, RectShape, { width: 100, height: 100, layer: 5 });
  assertEquals(pickEntityAtPoint(buildDrawList(scene), vec2(400, 300)), upper);
});

Deno.test("pickEntitiesAtPoint returns every hit, topmost first, without duplicates", () => {
  const scene = sceneWithCamera();
  const lower = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(lower, RectShape, { width: 100, height: 100, layer: 0 });
  scene.world.add(lower, CircleShape, { radius: 20, layer: 0 });
  const upper = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(upper, RectShape, { width: 10, height: 10, layer: 5 });
  const hits = pickEntitiesAtPoint(buildDrawList(scene), vec2(400, 300));
  assertEquals(hits, [upper, lower]);
});

Deno.test("pickEntitiesAtPoint returns an empty list on empty space", () => {
  const scene = sceneWithCamera();
  assertEquals(pickEntitiesAtPoint(buildDrawList(scene), vec2(1, 1)), []);
});

Deno.test("pickEntityAtPoint ignores the background clear command", () => {
  const scene = sceneWithCamera();
  assertEquals(pickEntityAtPoint(buildDrawList(scene), vec2(10, 10)), null);
});

Deno.test("drawListViewRect reports the visible world rect", () => {
  const scene = sceneWithCamera();
  const list = buildDrawList(scene);
  assertEquals(drawListViewRect(list), { x: 0, y: 0, w: 800, h: 600 });
});

Deno.test("the draw list carries the camera and viewport it was built with", () => {
  const scene = sceneWithCamera();
  const list = buildDrawList(scene);
  assertEquals(list.viewport, viewport);
  assertEquals(list.camera.position, vec2(400, 300));
});

Deno.test("an explicit viewport overrides the scene's", () => {
  const scene = sceneWithCamera();
  scene.resources.camera.position = vec2(0, 0);
  const entity = scene.createEntity({ position: vec2(0, 0) });
  scene.world.add(entity, RectShape, { width: 10, height: 10 });
  const list = buildDrawList(scene, { viewport: { width: 100, height: 100 } });
  const rect = list.commands.find((command) => command.kind === "rect") as RectCommand;
  assertEquals([rect.x, rect.y], [50, 50]);
  assertEquals(list.viewport, { width: 100, height: 100 });
});

Deno.test("commands are plain JSON data with no functions or cycles", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ position: vec2(400, 300) });
  scene.world.add(entity, RectShape, { width: 10, height: 10 });
  scene.world.add(entity, Sprite, { texture: "x", frameCount: 2 });
  scene.world.add(entity, TextLabel, { text: "label" });
  const list = buildDrawList(scene);
  const roundTripped = JSON.parse(JSON.stringify(list.commands));
  assertEquals(roundTripped, list.commands);
});

Deno.test("buildDrawList handles a wide world without losing entities", () => {
  const scene = sceneWithCamera();
  for (let i = 0; i < 300; i++) {
    const entity = scene.createEntity({ position: vec2(i * 4, 50) });
    scene.world.add(entity, RectShape, { width: 2, height: 2 });
  }
  const list = buildDrawList(scene, { cull: false });
  assertEquals(list.stats.drawn, 300);
  assertEquals(list.commands.length, 301);
});

Deno.test("entities without any visual component contribute nothing", () => {
  const scene = sceneWithCamera();
  const entity = scene.createEntity({ name: "empty" });
  scene.world.add(entity, Visibility, { visible: true });
  const list = buildDrawList(scene);
  assertEquals(list.commands.length, 1);
  assertEquals(list.stats.considered, 0);
});

Deno.test("buildDrawList works on a bare world with no scene resources tweaks", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Transform, { position: vec2(10, 10) });
  world.add(entity, BoxCollider, { width: 10, height: 10 });
  const scene = new Scene({ name: "bare" }, world);
  const list = buildDrawList(scene, { debugColliders: true });
  assertEquals(list.commands.length, 2);
  assertEquals(list.commands[0].kind, "clear");
  assertEquals(list.commands[1].kind, "rect");
});
