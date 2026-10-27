/**
 * @ember/core/serialization — the scene file format: round trips, migrations, validation.
 */

import { assert, assertEquals, assertNotEquals, assertThrows } from "@std/assert";
import {
  Colors,
  Lifetime,
  Name,
  Parent,
  SCENE_FORMAT,
  SCENE_FORMAT_VERSION,
  Scene,
  Sprite,
  Tag,
  Transform,
  Velocity,
  danglingParentReferences,
  deserializeScene,
  migrateSceneFile,
  roundTrips,
  sceneFromFileObject,
  sceneFromJson,
  sceneToJson,
  serializeScene,
  validateSceneFile,
  vec2,
} from "@ember/core";

function richScene(): Scene {
  const scene = new Scene({ name: "rich", background: "#123456", metadata: { author: "test" } });
  scene.resources.gravity = vec2(0, 2000);
  const player = scene.createEntity({ name: "player", position: vec2(10, 20), rotation: 0.5 });
  scene.world.add(player, Velocity, { x: 5, y: -5, angular: 2 });
  scene.world.add(player, Sprite, { texture: "player", frameCount: 4, frame: 2 });
  scene.world.add(player, Tag, { value: "player" });
  const coin = scene.createEntity({ name: "coin", position: vec2(100, 40) });
  scene.world.add(coin, Parent, { entity: player });
  scene.world.add(coin, Lifetime, { ttl: 3, remaining: 1.5 });
  scene.resources.camera.follow = player;
  return scene;
}

Deno.test("serializeScene produces the documented envelope", () => {
  const file = serializeScene(richScene());
  assertEquals(file.format, SCENE_FORMAT);
  assertEquals(file.version, SCENE_FORMAT_VERSION);
  assertEquals(file.name, "rich");
  assertEquals(Object.keys(file).sort(), [
    "entities",
    "format",
    "metadata",
    "name",
    "resources",
    "version",
  ]);
});

Deno.test("serializeScene keeps every entity and numbers them ascending", () => {
  const file = serializeScene(richScene());
  assertEquals(file.entities.map((entity) => entity.id), [1, 2]);
});

Deno.test("serializeScene copies component data instead of aliasing the world", () => {
  const scene = richScene();
  const file = serializeScene(scene);
  (file.entities[0].components.Transform as { position: { x: number } }).position.x = 999;
  assertEquals(scene.world.require(1, Transform).position.x, 10);
});

Deno.test("sceneToJson is valid JSON and pretty-prints by default", () => {
  const text = sceneToJson(richScene());
  assert(text.includes("\n"));
  assertEquals(JSON.parse(text).name, "rich");
});

Deno.test("sceneToJson supports compact output", () => {
  const text = sceneToJson(richScene(), { pretty: false });
  assert(!text.includes("\n"));
  assertEquals(JSON.parse(text).name, "rich");
});

Deno.test("scene round-trips through JSON byte for byte", () => {
  const scene = richScene();
  const restored = sceneFromJson(sceneToJson(scene));
  assertEquals(sceneToJson(restored), sceneToJson(scene));
  assert(roundTrips(scene));
});

Deno.test("round trip preserves entity ids, names and components", () => {
  const scene = richScene();
  const restored = sceneFromJson(sceneToJson(scene));
  assertEquals(restored.entityCount, 2);
  assertEquals(restored.world.require(1, Name).value, "player");
  assertEquals(restored.world.require(1, Sprite).frameCount, 4);
  assertEquals(restored.world.require(2, Parent).entity, 1);
  assertEquals(restored.world.require(2, Lifetime).remaining, 1.5);
  assertEquals(restored.resources.gravity, vec2(0, 2000));
  assertEquals(restored.resources.background, "#123456");
  assertEquals(restored.resources.camera.follow, 1);
  assertEquals(restored.metadata, { author: "test" });
});

Deno.test("round trip keeps the camera bound to the right entity", () => {
  const scene = richScene();
  const restored = sceneFromJson(sceneToJson(scene));
  assert(restored.resources.camera.follow !== null);
  assert(restored.world.isAlive(restored.resources.camera.follow!));
});

Deno.test("sceneFromJson rejects invalid JSON with a clear message", () => {
  const error = assertThrows(() => sceneFromJson("{not json"), Error);
  assert(error.message.includes("not valid JSON"), error.message);
});

Deno.test("deserializeScene rejects non-object input", () => {
  assertThrows(() => deserializeScene([]), Error);
  assertThrows(() => deserializeScene(null), Error);
  assertThrows(() => deserializeScene("scene"), Error);
});

Deno.test("deserializeScene warns about unknown components but loads the rest", () => {
  const warnings: string[] = [];
  const scene = deserializeScene({
    version: SCENE_FORMAT_VERSION,
    name: "unknown-component",
    resources: { gravity: vec2(0, 1), background: "#000000", viewport: { width: 10, height: 10 }, camera: {} },
    entities: [{ id: 1, components: { Transform: { position: vec2(0, 0), rotation: 0, scale: vec2(1, 1) }, Nope: { x: 1 } } }],
  }, { onWarning: (message) => warnings.push(message) });
  assertEquals(scene.entityCount, 1);
  assertEquals(scene.world.componentsOf(1), ["Transform"]);
  assert(warnings.some((message) => message.includes("Nope")), warnings.join(" | "));
});

Deno.test("deserializeScene removes a self-parent link with a warning", () => {
  const warnings: string[] = [];
  const scene = deserializeScene({
    version: SCENE_FORMAT_VERSION,
    name: "self-parent",
    resources: { gravity: vec2(0, 1), background: "#000000", viewport: { width: 10, height: 10 }, camera: {} },
    entities: [{ id: 1, components: { Parent: { entity: 1 } } }],
  }, { onWarning: (message) => warnings.push(message) });
  assertEquals(scene.world.get(1, Parent), undefined);
  assert(warnings.some((message) => message.includes("own parent")));
});

Deno.test("deserializeScene removes a dangling parent link with a warning", () => {
  const warnings: string[] = [];
  const scene = deserializeScene({
    version: SCENE_FORMAT_VERSION,
    name: "dangling",
    resources: { gravity: vec2(0, 1), background: "#000000", viewport: { width: 10, height: 10 }, camera: {} },
    entities: [{ id: 1, components: { Parent: { entity: 42 } } }],
  }, { onWarning: (message) => warnings.push(message) });
  assertEquals(scene.world.get(1, Parent), undefined);
  assert(warnings.some((message) => message.includes("missing parent")));
});

Deno.test("deserializeScene keeps valid parent links", () => {
  const scene = deserializeScene({
    version: SCENE_FORMAT_VERSION,
    name: "ok",
    resources: { gravity: vec2(0, 1), background: "#000000", viewport: { width: 10, height: 10 }, camera: {} },
    entities: [{ id: 1, components: {} }, { id: 2, components: { Parent: { entity: 1 } } }],
  });
  assertEquals(scene.world.require(2, Parent).entity, 1);
});

Deno.test("deserializeScene reports a duplicate id and keeps the first entity", () => {
  const warnings: string[] = [];
  const scene = deserializeScene({
    version: SCENE_FORMAT_VERSION,
    name: "dupes",
    resources: { gravity: vec2(0, 1), background: "#000000", viewport: { width: 10, height: 10 }, camera: {} },
    entities: [
      { id: 1, components: { Name: { value: "first" } } },
      { id: 1, components: { Name: { value: "second" } } },
    ],
  }, { onWarning: (message) => warnings.push(message) });
  assertEquals(scene.entityCount, 1);
  assertEquals(scene.world.require(1, Name).value, "first");
  assert(warnings.length > 0);
});

Deno.test("migrateSceneFile upgrades a v0 file and reports the source version", () => {
  const warnings: string[] = [];
  const result = migrateSceneFile({
    name: "old",
    entities: [{ id: 1, components: {} }],
  }, { onWarning: (message) => warnings.push(message) });
  assertEquals(result.migratedFrom, 0);
  assertEquals(result.file.version, SCENE_FORMAT_VERSION);
  assertEquals(result.file.format, SCENE_FORMAT);
  assertEquals(result.file.resources.viewport, { width: 960, height: 540 });
  assert(result.file.resources.camera !== undefined);
});

Deno.test("migrateSceneFile leaves a current file untouched", () => {
  const current = serializeScene(richScene());
  const result = migrateSceneFile(JSON.parse(JSON.stringify(current)));
  assertEquals(result.migratedFrom, null);
  assertEquals(result.file.name, "rich");
});

Deno.test("migrateSceneFile normalizes a non-string name", () => {
  const warnings: string[] = [];
  const result = migrateSceneFile({ name: 42, entities: [] }, { onWarning: (message) => warnings.push(message) });
  assertEquals(result.file.name, "untitled");
  assert(warnings.some((message) => message.includes("name")));
});

Deno.test("migrateSceneFile refuses a newer format version", () => {
  const error = assertThrows(
    () => migrateSceneFile({ version: SCENE_FORMAT_VERSION + 1, entities: [] }),
    Error,
  );
  assert(error.message.includes("newer"), error.message);
});

Deno.test("migrateSceneFile requires an entities array", () => {
  assertThrows(() => migrateSceneFile({ version: 1 }), Error);
  assertThrows(() => migrateSceneFile({ version: 1, entities: {} }), Error);
});

Deno.test("migrateSceneFile fills in missing ids from the array index", () => {
  const result = migrateSceneFile({ version: 1, entities: [{ components: {} }, { components: {} }] });
  assertEquals(result.file.entities.map((entity) => entity.id), [1, 2]);
});

Deno.test("validateSceneFile accepts a well-formed scene", () => {
  assertEquals(validateSceneFile(serializeScene(richScene())), []);
});

Deno.test("validateSceneFile reports a non-object payload", () => {
  assertEquals(validateSceneFile(7), ["scene file must be a JSON object"]);
  assertEquals(validateSceneFile("scene"), ["scene file must be a JSON object"]);
});

Deno.test("validateSceneFile reports an unexpected format tag", () => {
  const problems = validateSceneFile({ format: "unity", version: 1, entities: [] });
  assert(problems.some((problem) => problem.includes("unexpected format")));
});

Deno.test("validateSceneFile reports a newer version and a missing entities array", () => {
  const problems = validateSceneFile({ version: SCENE_FORMAT_VERSION + 5 });
  assert(problems.some((problem) => problem.includes("newer")));
  assert(problems.some((problem) => problem.includes("missing entities")));
});

Deno.test("validateSceneFile reports invalid, duplicate and non-integer ids", () => {
  const problems = validateSceneFile({
    version: 1,
    entities: [{ id: 0 }, { id: 2 }, { id: 2 }, { id: 1.5 }],
  });
  assert(problems.some((problem) => problem.includes("invalid id")), problems.join(" | "));
  assert(problems.some((problem) => problem.includes("duplicate entity id 2")));
});

Deno.test("validateSceneFile reports entity and component shape problems", () => {
  const problems = validateSceneFile({
    version: 1,
    entities: [null, { id: 1, components: { Unknown: {} } }, { id: 2, components: "nope" }, { id: 3, components: { Transform: 5 } }],
  });
  assert(problems.some((problem) => problem.includes("is not an object")));
  assert(problems.some((problem) => problem.includes("unknown component")));
  assert(problems.some((problem) => problem.includes("components must be an object")));
  assert(problems.some((problem) => problem.includes("must be an object")));
});

Deno.test("validateSceneFile reports an empty problem list for a bare valid file", () => {
  assertEquals(validateSceneFile({ version: 1, entities: [] }), []);
});

Deno.test("danglingParentReferences finds parents that are not in the file", () => {
  const file = serializeScene(richScene());
  assertEquals(danglingParentReferences(file), []);
  file.entities[1].components.Parent = { entity: 99 };
  assertEquals(danglingParentReferences(file), [2]);
});

Deno.test("danglingParentReferences ignores entities without parents", () => {
  assertEquals(danglingParentReferences({ entities: [{ id: 1, components: {} }] }), []);
});

Deno.test("sceneFromFileObject is a thin alias for deserializeScene", () => {
  const file = serializeScene(richScene());
  assertEquals(sceneFromFileObject(file).entityCount, 2);
});

Deno.test("a scene with no entities round-trips", () => {
  const scene = new Scene({ name: "empty" });
  const restored = sceneFromJson(sceneToJson(scene));
  assertEquals(restored.entityCount, 0);
  assertEquals(restored.name, "empty");
});

Deno.test("large scenes round-trip with identical bytes", () => {
  const scene = new Scene({ name: "big" });
  for (let i = 0; i < 250; i++) {
    const entity = scene.createEntity({ name: `entity-${i}`, position: vec2(i, -i) });
    scene.world.add(entity, Velocity, { x: i, y: -i, angular: i / 10 });
    if (i % 5 === 0) scene.world.add(entity, Tag, { value: i % 10 === 0 ? "tens" : "fives" });
  }
  const text = sceneToJson(scene);
  assertEquals(sceneToJson(deserializeScene(JSON.parse(text))), text);
});

Deno.test("serialization is stable across repeated round trips", () => {
  const scene = richScene();
  let text = sceneToJson(scene);
  for (let i = 0; i < 5; i++) text = sceneToJson(deserializeScene(JSON.parse(text)));
  assertEquals(text, sceneToJson(scene));
});

Deno.test("scene file bytes do not depend on float formatting surprises", () => {
  const scene = new Scene({ name: "floats" });
  const entity = scene.createEntity({ position: vec2(0.1 + 0.2, 1 / 3) });
  const text = sceneToJson(scene);
  const restored = sceneFromJson(text);
  assertEquals(restored.world.require(entity, Transform).position.x, 0.1 + 0.2);
});

Deno.test("deserializing twice from the same object yields independent scenes", () => {
  const file = serializeScene(richScene());
  const a = deserializeScene(file);
  const b = deserializeScene(file);
  a.world.set(1, Name, { value: "changed" });
  assertNotEquals(b.world.require(1, Name).value, "changed");
  assert(
    a.resources.gravity !== b.resources.gravity,
    "each load must own its own resource objects",
  );
  a.resources.gravity.y = 42;
  assertEquals(b.resources.gravity.y, 2000);
});

Deno.test("unknown metadata survives a round trip", () => {
  const scene = new Scene({ name: "meta", metadata: { tileset: { cols: 8, rows: 4 }, solid: [1, 3] } });
  const restored = sceneFromJson(sceneToJson(scene));
  assertEquals(restored.metadata, { tileset: { cols: 8, rows: 4 }, solid: [1, 3] });
});

Deno.test("background colours round-trip as written", () => {
  const scene = new Scene({ name: "background", background: Colors.ember });
  assertEquals(sceneFromJson(sceneToJson(scene)).resources.background, Colors.ember);
});
