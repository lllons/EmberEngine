/** ECS: identity, storage, queries, cloning and data ownership. */

import {
  cloneComponentData,
  componentByName,
  componentNames,
  defineComponent,
  type ComponentType,
  World,
} from "@ember/core";
import { assert, assertEqual, assertThrows, near, table } from "../harness.ts";

let componentCounter = 0;

/** Unique component per call: the registry is process-global by design. */
function freshComponent<T extends object>(defaults: () => T): ComponentType<T> {
  componentCounter += 1;
  return defineComponent<T>(`AuditComponent${componentCounter}`, defaults);
}

const Position = freshComponent(() => ({ x: 0, y: 0 }));
const Velocity = freshComponent(() => ({ x: 0, y: 0 }));
const Label = freshComponent(() => ({ text: "" }));
const Nested = freshComponent(() => ({ tags: [] as string[], meta: { depth: 1 } }));

table("ecs/spawn", [
  { label: "first id is 1", count: 1, first: 1 },
  { label: "ids increase by one", count: 5, first: 1 },
  { label: "two entities", count: 2, first: 1 },
] as const, (row) => {
  const world = new World();
  const ids = Array.from({ length: row.count }, () => world.spawn());
  assertEqual(ids[0], row.first, "first id");
  assertEqual(new Set(ids).size, row.count, "ids are unique");
  assertEqual(world.entityCount, row.count, "entityCount");
});

Deno.test("ecs/spawn keeps allocating after despawn (ids are never reused)", () => {
  const world = new World();
  const first = world.spawn();
  world.despawn(first);
  const second = world.spawn();
  assertEqual(second, first + 1, "next id");
  assert(!world.isAlive(first), "despawned id must stay dead");
});

table("ecs/adopt validation", [
  { label: "zero id", id: 0 },
  { label: "negative id", id: -3 },
  { label: "fractional id", id: 1.5 },
  { label: "NaN id", id: Number.NaN },
] as const, (row) => {
  const world = new World();
  assertThrows(() => world.adopt(row.id), /invalid entity id/, row.label);
});

Deno.test("ecs/adopt registers the id and advances the allocator", () => {
  const world = new World();
  assertEqual(world.adopt(10), 10, "adopt returns the id");
  assert(world.isAlive(10), "adopted entity is alive");
  assertEqual(world.spawn(), 11, "spawn continues after the adopted id");
  assertThrows(() => world.adopt(11), /already exists/);
});

Deno.test("ecs/reserveId allocates without creating an entity", () => {
  const world = new World();
  assertEqual(world.reserveId(), 1, "reserved id");
  assert(!world.isAlive(1), "reservation must not create an entity");
  assertEqual(world.spawn(), 2, "spawn uses the next id");
});

table("ecs/despawn", [
  { label: "existing entity", create: true, expected: true },
  { label: "unknown entity", create: false, expected: false },
] as const, (row) => {
  const world = new World();
  const target = row.create ? world.spawn() : 99;
  assertEqual(world.despawn(target), row.expected, row.label);
  assert(!world.isAlive(target), "entity is dead after despawn");
  assertEqual(world.despawn(target), false, "second despawn reports false");
});

Deno.test("ecs/despawn removes every component", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Position);
  world.add(entity, Velocity);
  world.despawn(entity);
  assertEqual(world.componentsOf(entity), [], "componentsOf");
  assertEqual(world.stats().components, 0, "no components left behind");
  assertEqual(world.get(entity, Position), undefined, "get");
});

table("ecs/add applies defaults then init", [
  {
    label: "defaults only",
    init: undefined as Partial<{ x: number; y: number }> | undefined,
    expected: { x: 0, y: 0 },
  },
  { label: "partial init", init: { x: 3 }, expected: { x: 3, y: 0 } },
  { label: "full init", init: { x: -1, y: 2 }, expected: { x: -1, y: 2 } },
] as const, (row) => {
  const world = new World();
  const entity = world.spawn();
  const value = world.add(entity, Position, row.init);
  assertEqual(value, row.expected, row.label);
  assertEqual(world.get(entity, Position), row.expected, "stored value");
});

Deno.test("ecs/add on a dead entity throws", () => {
  const world = new World();
  assertThrows(() => world.add(42, Position), /not alive/);
});

Deno.test("ecs/get is type-directed and independent per type", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Position, { x: 1, y: 2 });
  world.add(entity, Label, { text: "hi" });
  assertEqual(world.get(entity, Position), { x: 1, y: 2 }, "position");
  assertEqual(world.get(entity, Label), { text: "hi" }, "label");
  assertEqual(world.get(entity, Velocity), undefined, "absent component");
});

Deno.test("ecs/require throws when the component is missing", () => {
  const world = new World();
  const entity = world.spawn();
  assertThrows(() => world.require(entity, Velocity), /has no .* component/);
  world.add(entity, Velocity, { x: 5 });
  assertEqual(world.require(entity, Velocity).x, 5, "require returns the value");
});

table("ecs/has and hasAll", [
  { label: "both present", add: [true, true], hasAll: true },
  { label: "one missing", add: [true, false], hasAll: false },
  { label: "none present", add: [false, false], hasAll: false },
] as const, (row) => {
  const world = new World();
  const entity = world.spawn();
  if (row.add[0]) world.add(entity, Position);
  if (row.add[1]) world.add(entity, Velocity);
  assertEqual(world.has(entity, Position), row.add[0], "has first");
  assertEqual(world.has(entity, Velocity), row.add[1], "has second");
  assertEqual(world.hasAll(entity, [Position, Velocity]), row.hasAll, "hasAll");
});

Deno.test("ecs/set merges into the stored object", () => {
  const world = new World();
  const entity = world.spawn();
  const original = world.add(entity, Position, { x: 1, y: 2 });
  const updated = world.set(entity, Position, { y: 9 });
  assertEqual(updated, { x: 1, y: 9 }, "merged value");
  assert(updated === original, "set must mutate in place");
});

Deno.test("ecs/set requires an existing component", () => {
  const world = new World();
  const entity = world.spawn();
  assertThrows(() => world.set(entity, Position, { x: 1 }), /has no/);
});

Deno.test("ecs/replace stores a value and creates the component when absent", () => {
  const world = new World();
  const entity = world.spawn();
  const value = { x: 7, y: 8 };
  world.replace(entity, Position, value);
  assert(world.get(entity, Position) === value, "replace must store the given object");
});

table("ecs/remove", [
  { label: "present component", add: true, expected: true },
  { label: "absent component", add: false, expected: false },
] as const, (row) => {
  const world = new World();
  const entity = world.spawn();
  if (row.add) world.add(entity, Position);
  assertEqual(world.remove(entity, Position), row.expected, row.label);
  assertEqual(world.has(entity, Position), false, "component is gone");
});

Deno.test("ecs/query returns entities with every listed component, ascending", () => {
  const world = new World();
  const both = world.spawn();
  const onlyFirst = world.spawn();
  const onlySecond = world.spawn();
  world.add(both, Position);
  world.add(both, Velocity);
  world.add(onlyFirst, Position);
  world.add(onlySecond, Velocity);
  assertEqual(world.query(Position), [both, onlyFirst], "single component");
  assertEqual(world.query(Position, Velocity), [both], "both components");
  assertEqual(world.query(Velocity, Position), [both], "order of types is irrelevant");
});

Deno.test("ecs/entities are sorted regardless of spawn/despawn order", () => {
  const world = new World();
  const ids = [world.spawn(), world.spawn(), world.spawn(), world.spawn()];
  world.despawn(ids[1]);
  assertEqual(world.entities(), [ids[0], ids[2], ids[3]], "entities");
});

Deno.test("ecs/componentsOf is alphabetical and only includes present types", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Velocity);
  world.add(entity, Label);
  world.add(entity, Position);
  assertEqual(world.componentsOf(entity), [Label.name, Position.name, Velocity.name].sort());
});

Deno.test("ecs/entityEntries pairs ids with components", () => {
  const world = new World();
  const a = world.spawn();
  const b = world.spawn();
  world.add(a, Position);
  world.add(b, Velocity);
  assertEqual(world.entityEntries(), [
    { id: a, components: [Position.name] },
    { id: b, components: [Velocity.name] },
  ]);
});

Deno.test("ecs/stats counts entities and components", () => {
  const world = new World();
  const a = world.spawn();
  const b = world.spawn();
  world.add(a, Position);
  world.add(a, Velocity);
  world.add(b, Position);
  assertEqual(world.stats(), { entities: 2, components: 3, componentTypes: 2 });
});

Deno.test("ecs/each visits in query order with indices", () => {
  const world = new World();
  const a = world.spawn();
  const b = world.spawn();
  world.add(a, Position);
  world.add(b, Position);
  const visited: Array<[number, number]> = [];
  world.each([Position], (entity, index) => visited.push([entity, index]));
  assertEqual(visited, [[a, 0], [b, 1]]);
});

Deno.test("ecs/clear resets entities, components and the allocator", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Position);
  world.clear();
  assertEqual(world.entityCount, 0, "entityCount");
  assertEqual(world.stats().components, 0, "components");
  assertEqual(world.spawn(), 1, "ids restart at 1");
});

Deno.test("ecs/clone copies ids and deeply copies component data", () => {
  const world = new World();
  const entity = world.spawn();
  const source = world.add(entity, Nested, { tags: ["a"], meta: { depth: 3 } });
  const copy = world.clone();
  assertEqual(copy.entities(), world.entities(), "ids");
  const cloned = copy.get(entity, Nested);
  assert(cloned !== undefined, "clone has the component");
  assert(cloned !== source, "component value must be a new object");
  cloned.tags.push("b");
  cloned.meta.depth = 99;
  assertEqual(source.tags, ["a"], "original tags untouched");
  near(source.meta.depth, 3, 0, "original meta untouched");
});

Deno.test("ecs/clone preserves the id allocator", () => {
  const world = new World();
  world.spawn();
  world.spawn();
  const copy = world.clone();
  assertEqual(copy.spawn(), 3, "clone continues the id sequence");
});

Deno.test("ecs/clone keeps independent registries of live entities", () => {
  const world = new World();
  const entity = world.spawn();
  const copy = world.clone();
  copy.despawn(entity);
  assert(world.isAlive(entity), "despawning in the clone must not touch the original");
  world.despawn(entity);
  assert(!copy.isAlive(entity), "clone stays consistent");
});

table("ecs/defineComponent name validation", [
  { label: "empty name", name: "" },
  { label: "leading digit", name: "1Position" },
  { label: "dash", name: "my-component" },
  { label: "space", name: "my component" },
  { label: "unicode", name: "Pösition" },
] as const, (row) => {
  assertThrows(() => defineComponent(row.name, () => ({})), /alphanumeric/, row.label);
});

Deno.test("ecs/defineComponent rejects a duplicate name", () => {
  defineComponent("DuplicateProbe", () => ({ value: 1 }));
  assertThrows(() => defineComponent("DuplicateProbe", () => ({ value: 2 })), /already defined/);
});

Deno.test("ecs/defineComponent registers for lookup by name", () => {
  const type = freshComponent(() => ({ value: 42 }));
  assert(componentByName(type.name) === type, "componentByName returns the same type");
  const created = type.create({ value: 7 });
  assertEqual(created, { value: 7 }, "create applies init");
  const defaults = type.create();
  assertEqual(defaults, { value: 42 }, "create applies defaults");
  assert(created !== defaults, "create returns a fresh object each time");
});

Deno.test("ecs/componentNames is sorted and contains registrations", () => {
  const type = freshComponent(() => ({ value: 0 }));
  const names = componentNames();
  assert(names.includes(type.name), "new component is listed");
  assertEqual(names, [...names].sort(), "names are sorted");
  assertEqual(componentByName("DefinitelyNotARegisteredComponent"), undefined, "unknown lookup");
});

table("ecs/cloneComponentData", [
  {
    label: "nested objects are copied",
    input: { a: { b: { c: 1 } } },
  },
  {
    label: "arrays are copied",
    input: { list: [1, 2, [3, 4]] },
  },
  {
    label: "mixed graph",
    input: { position: { x: 1, y: 2 }, tags: ["a", "b"], active: true },
  },
] as const, (row) => {
  const before = JSON.stringify(row.input);
  const copy = cloneComponentData(row.input);
  assertEqual(JSON.stringify(copy), before, "structural equality");
  assert(copy !== row.input, "top-level object must be new");
  (copy as Record<string, unknown>).mutated = true;
  assertEqual(JSON.stringify(row.input), before, "input must not change when the copy is edited");
});

Deno.test("ecs/cloneComponentData returns primitives unchanged", () => {
  assertEqual(cloneComponentData(5), 5, "number");
  assertEqual(cloneComponentData("text"), "text", "string");
  assertEqual(cloneComponentData(null), null, "null");
  assertEqual(cloneComponentData(true), true, "boolean");
});
