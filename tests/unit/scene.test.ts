/** Scene: defaults, entity helpers, cloning and the editor-facing summaries. */

import {
  BoxCollider,
  CircleShape,
  Colors,
  type Entity,
  Name,
  RectShape,
  Scene,
  Tag,
  Transform,
  vec2,
} from "@ember/core";
import { assert, assertEqual, near, table, vecNear } from "../harness.ts";

table("scene/defaults", [
  { label: "name", field: "name", expected: "untitled" },
  { label: "viewport width", field: "width", expected: 960 },
  { label: "viewport height", field: "height", expected: 540 },
  { label: "gravity x", field: "gravityX", expected: 0 },
  { label: "gravity y", field: "gravityY", expected: 1400 },
  { label: "background", field: "background", expected: Colors.ink },
  { label: "camera x", field: "cameraX", expected: 480 },
  { label: "camera y", field: "cameraY", expected: 270 },
  { label: "camera zoom", field: "zoom", expected: 1 },
  { label: "camera smoothing", field: "smoothing", expected: 0.12 },
] as const, (row) => {
  const scene = new Scene();
  const value = {
    name: scene.name,
    width: scene.resources.viewport.width,
    height: scene.resources.viewport.height,
    gravityX: scene.resources.gravity.x,
    gravityY: scene.resources.gravity.y,
    background: scene.resources.background,
    cameraX: scene.resources.camera.position.x,
    cameraY: scene.resources.camera.position.y,
    zoom: scene.resources.camera.zoom,
    smoothing: scene.resources.camera.smoothing,
  }[row.field];
  assertEqual(value, row.expected, row.label);
});

Deno.test("scene/defaults leave camera bounds and follow unset", () => {
  const scene = new Scene();
  assertEqual(scene.resources.camera.bounds, null, "bounds");
  assertEqual(scene.resources.camera.follow, null, "follow");
  assertEqual(scene.metadata, {}, "metadata");
  assertEqual(scene.entityCount, 0, "entityCount");
});

Deno.test("scene/create mirrors the constructor", () => {
  const scene = Scene.create({ name: "level-2" });
  assert(scene instanceof Scene, "Scene.create returns a Scene");
  assertEqual(scene.name, "level-2", "name");
});

table("scene/init overrides", [
  { label: "name", init: { name: "boss-arena" }, check: (s: Scene) => s.name, expected: "boss-arena" },
  {
    label: "viewport",
    init: { viewport: { width: 320, height: 180 } },
    check: (s: Scene) => s.resources.viewport,
    expected: { width: 320, height: 180 },
  },
  {
    label: "gravity",
    init: { gravity: vec2(0, -100) },
    check: (s: Scene) => s.resources.gravity,
    expected: { x: 0, y: -100 },
  },
  {
    label: "background",
    init: { background: Colors.slate },
    check: (s: Scene) => s.resources.background,
    expected: Colors.slate,
  },
  {
    label: "camera zoom only keeps other defaults",
    init: { camera: { zoom: 2 } },
    check: (s: Scene) => s.resources.camera.zoom,
    expected: 2,
  },
  {
    label: "camera bounds",
    init: { camera: { bounds: { x: 0, y: 0, w: 100, h: 50 } } },
    check: (s: Scene) => s.resources.camera.bounds,
    expected: { x: 0, y: 0, w: 100, h: 50 },
  },
  {
    label: "metadata",
    init: { metadata: { author: "test" } },
    check: (s: Scene) => s.metadata,
    expected: { author: "test" },
  },
] as const, (row) => {
  const scene = new Scene(row.init);
  assertEqual(row.check(scene), row.expected, row.label);
});

Deno.test("scene/createEntity always adds a transform", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ position: vec2(5, 6), rotation: 0.5, scale: vec2(2, 3) });
  const transform = scene.world.require(entity, Transform);
  vecNear(transform.position, vec2(5, 6), 1e-12, "position");
  near(transform.rotation, 0.5, 1e-12, "rotation");
  vecNear(transform.scale, vec2(2, 3), 1e-12, "scale");
  assertEqual(scene.world.get(entity, Name), undefined, "no name unless provided");
});

Deno.test("scene/createEntity adds a name only when given", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ name: "Player" });
  assertEqual(scene.world.require(entity, Name).value, "Player", "name");
  assertEqual(scene.findByName("Player"), entity, "findByName");
});

Deno.test("scene/duplicateEntity copies components into a new id", () => {
  const scene = new Scene();
  const source = scene.createEntity({ name: "Crate", position: vec2(1, 2) });
  scene.world.add(source, RectShape, { width: 10, height: 20, color: Colors.gold });
  scene.world.add(source, Tag, { value: "crate" });
  const copy = scene.duplicateEntity(source);
  assert(copy !== null && copy !== source, "new entity id");
  assertEqual(scene.world.componentsOf(copy!), scene.world.componentsOf(source), "same components");
  assertEqual(scene.world.require(copy!, RectShape), scene.world.require(source, RectShape), "values");
  scene.world.require(copy!, RectShape).width = 99;
  near(scene.world.require(source, RectShape).width, 10, 0, "copies must be independent");
});

Deno.test("scene/duplicateEntity returns null for a dead entity", () => {
  const scene = new Scene();
  assertEqual(scene.duplicateEntity(1234), null, "dead entity");
});

Deno.test("scene/findByName finds the first match and nothing else", () => {
  const scene = new Scene();
  const first = scene.createEntity({ name: "Gem" });
  scene.createEntity({ name: "Gem" });
  scene.createEntity({ name: "Other" });
  assertEqual(scene.findByName("Gem"), first, "first match");
  assertEqual(scene.findByName("Missing"), undefined, "missing name");
});

table("scene/labelOf", [
  { label: "named entity", name: "Player", expected: "Player" },
  { label: "empty name falls back", name: "", expected: "entity-1" },
] as const, (row) => {
  const scene = new Scene();
  const entity = scene.createEntity(row.name === "" ? {} : { name: row.name });
  if (row.name === "") scene.world.add(entity, Name, { value: "" });
  assertEqual(scene.labelOf(entity), row.expected, row.label);
});

Deno.test("scene/worldPosition reads the transform", () => {
  const scene = new Scene();
  const entity = scene.createEntity({ position: vec2(4, -2) });
  vecNear(scene.worldPosition(entity)!, vec2(4, -2), 0, "position");
});

Deno.test("scene/worldPosition is undefined without a transform", () => {
  const scene = new Scene();
  const entity = scene.world.spawn();
  assertEqual(scene.worldPosition(entity), undefined, "no transform");
});

Deno.test("scene/clone is independent", () => {
  const scene = new Scene({ name: "original", metadata: { level: 1 } });
  const entity = scene.createEntity({ name: "Hero", position: vec2(1, 1) });
  scene.world.add(entity, CircleShape, { radius: 4 });
  const copy = scene.clone();
  assertEqual(copy.name, "original", "name");
  assertEqual(copy.entityCount, 1, "entities");
  assertEqual(copy.metadata, { level: 1 }, "metadata");
  copy.world.require(entity, Transform).position.x = 50;
  copy.resources.camera.position.x = 999;
  near(scene.world.require(entity, Transform).position.x, 1, 0, "world data must be copied");
  near(scene.resources.camera.position.x, 480, 0, "resources must be copied");
});

Deno.test("scene/toJSON summarises the scene", () => {
  const scene = new Scene({ name: "summary" });
  scene.createEntity();
  scene.createEntity();
  const json = scene.toJSON();
  assertEqual(json.name, "summary", "name");
  assertEqual(json.entities, 2, "entities");
  assertEqual(typeof json.resources, "object", "resources");
});

Deno.test("scene/components can coexist on one entity", () => {
  const scene = new Scene();
  const entity = scene.createEntity();
  scene.world.add(entity, RectShape, { width: 4, height: 4 });
  scene.world.add(entity, BoxCollider, { width: 4, height: 4 });
  const names = scene.world.componentsOf(entity);
  assert(names.length === 3, `expected Transform + 2 components, got ${names}`);
  const entity2: Entity = scene.createEntity();
  assert(entity2 !== entity, "distinct ids");
});
