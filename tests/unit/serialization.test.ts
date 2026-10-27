/** Scene file format: shape, round-trip stability, migration and validation. */

import {
  Colors,
  danglingParentReferences,
  deserializeScene,
  migrateSceneFile,
  Parent,
  RectShape,
  roundTrips,
  Scene,
  SCENE_FORMAT,
  SCENE_FORMAT_VERSION,
  sceneFromJson,
  sceneToJson,
  serializeScene,
  Sprite,
  Transform,
  validateSceneFile,
  vec2,
  Velocity,
} from "@ember/core";
import { assert, assertEqual, assertThrows, near, table } from "../harness.ts";

function sampleScene(): Scene {
  const scene = new Scene({
    name: "sample",
    metadata: { author: "tests" },
    viewport: { width: 320, height: 180 },
    gravity: vec2(0, 900),
    background: Colors.slate,
  });
  const hero = scene.createEntity({ name: "Hero", position: vec2(3, 4) });
  scene.world.add(hero, Sprite, { texture: "hero.png", width: 16, height: 16 });
  scene.world.add(hero, Velocity, { x: 1, y: 0 });
  const crate = scene.createEntity({ name: "Crate", position: vec2(40, 4) });
  scene.world.add(crate, RectShape, { width: 8, height: 8 });
  return scene;
}

table("serialization/serializeScene shape", [
  { label: "format tag", field: "format", expected: SCENE_FORMAT },
  { label: "version", field: "version", expected: SCENE_FORMAT_VERSION },
  { label: "name", field: "name", expected: "sample" },
  { label: "entity count", field: "entities", expected: 2 },
  { label: "metadata", field: "metadata", expected: { author: "tests" } },
] as const, (row) => {
  const file = serializeScene(sampleScene());
  const actual = row.field === "entities"
    ? file.entities.length
    : (file as unknown as Record<string, unknown>)[row.field];
  assertEqual(actual, row.expected, row.label);
});

Deno.test("serialization/resources are cloned, not aliased", () => {
  const scene = sampleScene();
  const file = serializeScene(scene);
  file.resources.gravity.y = -500;
  near(scene.resources.gravity.y, 900, 0, "serialized resources must be a copy");
  file.metadata.author = "mutated";
  assertEqual(scene.metadata.author, "tests", "metadata must be a copy");
});

Deno.test("serialization/entities are written in id order", () => {
  const file = serializeScene(sampleScene());
  assertEqual(file.entities.map((entity) => entity.id), [1, 2]);
});

Deno.test("serialization/component keys are alphabetical", () => {
  const file = serializeScene(sampleScene());
  const hero = file.entities[0];
  assertEqual(Object.keys(hero.components), ["Name", "Sprite", "Transform", "Velocity"]);
});

table("serialization/json output", [
  { label: "pretty has newlines", pretty: true, hasNewlines: true },
  { label: "compact is one line", pretty: false, hasNewlines: false },
] as const, (row) => {
  const json = sceneToJson(sampleScene(), { pretty: row.pretty });
  assertEqual(json.includes("\n"), row.hasNewlines, row.label);
  assert(json.startsWith("{"), "must be a JSON object");
});

Deno.test("serialization/json round-trips without drift", () => {
  const scene = sampleScene();
  const json = sceneToJson(scene);
  const restored = sceneFromJson(json);
  assertEqual(sceneToJson(restored), json, "second pass must match");
  assertEqual(restored.entityCount, 2, "entities");
  assertEqual(restored.name, "sample", "name");
  assertEqual(restored.resources.viewport, { width: 320, height: 180 }, "viewport");
  near(restored.resources.gravity.y, 900, 0, "gravity");
});

Deno.test("serialization/roundTrips accepts a scene with components", () => {
  assertEqual(roundTrips(sampleScene()), true, "roundTrips");
});

Deno.test("serialization/sceneFromJson rejects invalid JSON", () => {
  assertThrows(() => sceneFromJson("{oops"), /not valid JSON/);
});

table("serialization/migrateSceneFile rejects unusable input", [
  { label: "null", input: null, match: /JSON object/ },
  { label: "array", input: [], match: /JSON object/ },
  { label: "string", input: "scene", match: /JSON object/ },
  { label: "missing entities", input: { version: 1 }, match: /entities array/ },
  { label: "newer version", input: { version: 2, entities: [] }, match: /newer/ },
] as const, (row) => {
  assertThrows(() => migrateSceneFile(row.input), row.match, row.label);
});

Deno.test("serialization/v0 files get v1 resources", () => {
  const { file, migratedFrom } = migrateSceneFile({
    entities: [{ id: 1, components: { Transform: { position: vec2(0, 0) } } }],
  });
  assertEqual(migratedFrom, 0, "migratedFrom");
  assertEqual(file.version, SCENE_FORMAT_VERSION, "version");
  assertEqual(file.resources.viewport, { width: 960, height: 540 }, "default viewport");
  assertEqual(file.resources.gravity, { x: 0, y: 1400 }, "default gravity");
  assertEqual(file.name, "untitled", "default name");
});

Deno.test("serialization/current-version files report no migration", () => {
  const { migratedFrom } = migrateSceneFile({
    format: SCENE_FORMAT,
    version: SCENE_FORMAT_VERSION,
    name: "x",
    entities: [],
    resources: {},
    metadata: {},
  });
  assertEqual(migratedFrom, null, "migratedFrom");
});

Deno.test("serialization/duplicate ids are skipped with a warning", () => {
  const warnings: string[] = [];
  const scene = deserializeScene({
    version: 1,
    name: "dup",
    entities: [
      { id: 1, components: {} },
      { id: 1, components: {} },
      { id: 2, components: {} },
    ],
    resources: {},
    metadata: {},
  }, { onWarning: (message) => warnings.push(message) });
  assertEqual(scene.entityCount, 2, "only the first duplicate is adopted");
  assert(warnings.some((message) => /skipped entity/.test(message)), `warnings: ${warnings}`);
});

Deno.test("serialization/unknown components warn and are skipped", () => {
  const warnings: string[] = [];
  const scene = deserializeScene({
    version: 1,
    name: "unknown",
    entities: [{ id: 1, components: { NotARealComponent: { value: 1 }, Transform: { rotation: 1 } } }],
    resources: {},
    metadata: {},
  }, { onWarning: (message) => warnings.push(message) });
  assert(warnings.some((message) => /unknown component/.test(message)), `warnings: ${warnings}`);
  assertEqual(scene.world.componentsOf(1), ["Transform"], "only the known component is attached");
});

Deno.test("serialization/a self-parent link is removed", () => {
  const warnings: string[] = [];
  const scene = deserializeScene({
    version: 1,
    name: "self",
    entities: [{ id: 1, components: { Parent: { entity: 1 } } }],
    resources: {},
    metadata: {},
  }, { onWarning: (message) => warnings.push(message) });
  assertEqual(scene.world.has(1, Parent), false, "parent removed");
  assert(warnings.some((message) => /own parent/.test(message)), `warnings: ${warnings}`);
});

Deno.test("serialization/a missing parent link is removed", () => {
  const warnings: string[] = [];
  const scene = deserializeScene({
    version: 1,
    name: "dangling",
    entities: [{ id: 1, components: { Parent: { entity: 99 } } }],
    resources: {},
    metadata: {},
  }, { onWarning: (message) => warnings.push(message) });
  assertEqual(scene.world.has(1, Parent), false, "parent removed");
  assert(warnings.some((message) => /missing parent/.test(message)), `warnings: ${warnings}`);
});

Deno.test("serialization/a valid parent link survives", () => {
  const scene = deserializeScene({
    version: 1,
    name: "tree",
    entities: [
      { id: 1, components: {} },
      { id: 2, components: { Parent: { entity: 1 } } },
    ],
    resources: {},
    metadata: {},
  });
  assertEqual(scene.world.require(2, Parent).entity, 1, "parent kept");
});

table("serialization/validateSceneFile", [
  { label: "null", input: null, expected: ["scene file must be a JSON object"] },
  { label: "array", input: [], expected: ["scene file must be a JSON object"] },
  { label: "no entities", input: {}, expected: ["missing entities array"] },
  {
    label: "invalid id",
    input: { entities: [{ id: 0 }] },
    expected: ["entity at index 0 has an invalid id"],
  },
  {
    label: "duplicate id",
    input: { entities: [{ id: 1 }, { id: 1 }] },
    expected: ["duplicate entity id 1"],
  },
  {
    label: "unknown component",
    input: { entities: [{ id: 1, components: { Nope: {} } }] },
    expected: ['entity 1 has unknown component "Nope"'],
  },
  {
    label: "component not an object",
    input: { entities: [{ id: 1, components: { Transform: 5 } }] },
    expected: ['entity 1 component "Transform" must be an object'],
  },
  {
    label: "unexpected format",
    input: { format: "other", entities: [] },
    expected: ['unexpected format "other"'],
  },
  { label: "valid", input: { entities: [{ id: 1, components: { Transform: {} } }] }, expected: [] },
] as const, (row) => {
  assertEqual(validateSceneFile(row.input), [...row.expected], row.label);
});

table("serialization/danglingParentReferences", [
  {
    label: "missing parent is reported",
    input: { entities: [{ id: 1, components: { Parent: { entity: 9 } } }, { id: 2, components: {} }] },
    expected: [1],
  },
  {
    label: "valid parent is not reported",
    input: { entities: [{ id: 1, components: {} }, { id: 2, components: { Parent: { entity: 1 } } }] },
    expected: [],
  },
  { label: "no parents", input: { entities: [{ id: 1, components: {} }] }, expected: [] },
] as const, (row) => {
  const file = row.input as unknown as {
    entities: Array<{ id: number; components: Record<string, unknown> }>;
  };
  assertEqual(danglingParentReferences(file), [...row.expected], row.label);
});

Deno.test("serialization/deserialized scene keeps resources and viewport", () => {
  const scene = sampleScene();
  const restored = sceneFromJson(sceneToJson(scene));
  assertEqual(restored.resources.background, Colors.slate, "background");
  assertEqual(restored.resources.viewport.width, 320, "viewport width");
  assertEqual(restored.metadata, { author: "tests" }, "metadata");
});
