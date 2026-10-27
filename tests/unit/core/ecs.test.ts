/**
 * @ember/core/ecs — entity ids, component storage and the query surface.
 */

import { assert, assertEquals, assertNotEquals, assertThrows } from "@std/assert";
import {
  type ComponentType,
  World,
  cloneComponentData,
  componentByName,
  componentNames,
  defineComponent,
} from "@ember/core";

// A private component type per test file keeps the global registry collision-free.
const Health = defineComponent<{ current: number; max: number; tags: string[] }>(
  "TestHealth",
  () => ({ current: 10, max: 10, tags: [] }),
);
const Mana = defineComponent<{ value: number }>("TestMana", () => ({ value: 5 }));

Deno.test("defineComponent rejects invalid names", () => {
  assertThrows(() => defineComponent("has space", () => ({})), Error);
  assertThrows(() => defineComponent("1leading", () => ({})), Error);
  assertThrows(() => defineComponent("", () => ({})), Error);
});

Deno.test("defineComponent refuses duplicate registration", () => {
  assertThrows(() => defineComponent("TestHealth", () => ({})), Error);
});

Deno.test("defineComponent exposes the name and defaults", () => {
  assertEquals(Health.name, "TestHealth");
  assertEquals(Health.create(), { current: 10, max: 10, tags: [] });
  assertEquals(Health.create({ current: 3 }), { current: 3, max: 10, tags: [] });
});

Deno.test("component defaults are fresh objects every call", () => {
  const first = Health.create();
  first.tags.push("poisoned");
  assertEquals(Health.create().tags, []);
});

Deno.test("componentByName resolves registered names and misses safely", () => {
  assertEquals(componentByName("TestHealth"), Health);
  assertEquals(componentByName("NoSuchComponent"), undefined);
});

Deno.test("componentNames lists registered components sorted", () => {
  const names = componentNames();
  assertEquals([...names].sort(), names);
  assert(names.includes("TestHealth"));
  assert(names.includes("TestMana"));
});

Deno.test("World spawns unique ascending ids", () => {
  const world = new World();
  const ids = [world.spawn(), world.spawn(), world.spawn()];
  assertEquals(ids, [1, 2, 3]);
  assertEquals(new Set(ids).size, 3);
});

Deno.test("World adopts specific ids and continues from the highest", () => {
  const world = new World();
  assertEquals(world.adopt(7), 7);
  assertEquals(world.spawn(), 8);
});

Deno.test("World adopt rejects invalid and duplicate ids", () => {
  const world = new World();
  world.adopt(3);
  assertThrows(() => world.adopt(3), Error);
  assertThrows(() => world.adopt(0), Error);
  assertThrows(() => world.adopt(-2), Error);
  assertThrows(() => world.adopt(1.5), Error);
});

Deno.test("reserveId does not create an entity", () => {
  const world = new World();
  const reserved = world.reserveId();
  assertEquals(world.entityCount, 0);
  assert(!world.isAlive(reserved));
});

Deno.test("World tracks entity count through spawn and despawn", () => {
  const world = new World();
  const entity = world.spawn();
  world.spawn();
  assertEquals(world.entityCount, 2);
  assert(world.despawn(entity));
  assertEquals(world.entityCount, 1);
  assert(!world.isAlive(entity));
});

Deno.test("despawn returns false for unknown entities", () => {
  const world = new World();
  assertEquals(world.despawn(42), false);
});

Deno.test("despawn removes every component of the entity", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Health);
  world.add(entity, Mana);
  world.despawn(entity);
  assertEquals(world.get(entity, Health), undefined);
  assertEquals(world.stats().components, 0);
});

Deno.test("add applies defaults and overrides, and returns the stored value", () => {
  const world = new World();
  const entity = world.spawn();
  const added = world.add(entity, Health, { current: 4 });
  assertEquals(added.current, 4);
  assertEquals(world.get(entity, Health), added);
  assertEquals(world.require(entity, Health), added);
});

Deno.test("add on a dead entity throws", () => {
  const world = new World();
  assertThrows(() => world.add(99, Health), Error);
});

Deno.test("attach stores a caller-owned value verbatim", () => {
  const world = new World();
  const entity = world.spawn();
  const value = { current: 1, max: 2, tags: ["loaded"] };
  assertEquals(world.attach(entity, Health, value), value);
  assertEquals(world.get(entity, Health), value);
});

Deno.test("require throws for a missing component and names it", () => {
  const world = new World();
  const entity = world.spawn();
  const error = assertThrows(() => world.require(entity, Health), Error);
  assert(error.message.includes("TestHealth"), error.message);
});

Deno.test("has and hasAll report component presence", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Health);
  assert(world.has(entity, Health));
  assert(!world.has(entity, Mana));
  assert(!world.hasAll(entity, [Health, Mana]));
  world.add(entity, Mana);
  assert(world.hasAll(entity, [Health, Mana]));
  assert(world.hasAll(entity, []));
});

Deno.test("set merges a patch and returns the same object", () => {
  const world = new World();
  const entity = world.spawn();
  const before = world.add(entity, Health, { current: 5 });
  const after = world.set(entity, Health, { max: 20 });
  assertEquals(after, before);
  assertEquals(before, { current: 5, max: 20, tags: [] });
});

Deno.test("set on a missing component throws", () => {
  const world = new World();
  const entity = world.spawn();
  assertThrows(() => world.set(entity, Health, { current: 1 }), Error);
});

Deno.test("replace swaps the whole value and creates it when absent", () => {
  const world = new World();
  const entity = world.spawn();
  const replacement = { current: 2, max: 3, tags: ["x"] };
  assertEquals(world.replace(entity, Health, replacement), replacement);
  assertEquals(world.get(entity, Health), replacement);
});

Deno.test("remove deletes one component and reports success", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Health);
  assert(world.remove(entity, Health));
  assert(!world.remove(entity, Health));
  assert(!world.has(entity, Health));
});

Deno.test("query returns entities carrying every requested component, ascending", () => {
  const world = new World();
  const a = world.spawn();
  const b = world.spawn();
  const c = world.spawn();
  world.add(a, Health);
  world.add(c, Health);
  world.add(c, Mana);
  world.add(b, Mana);
  assertEquals(world.query(Health), [a, c]);
  assertEquals(world.query(Mana), [b, c]);
  assertEquals(world.query(Health, Mana), [c]);
  assertEquals(world.query(), [a, b, c]);
});

Deno.test("query with no matching entities returns an empty array", () => {
  const world = new World();
  assertEquals(world.query(Health), []);
});

Deno.test("entities lists live entities in ascending order regardless of creation order", () => {
  const world = new World();
  world.adopt(30);
  world.adopt(10);
  world.adopt(20);
  assertEquals(world.entities(), [10, 20, 30]);
});

Deno.test("componentsOf lists an entity's components alphabetically", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Mana);
  world.add(entity, Health);
  assertEquals(world.componentsOf(entity), ["TestHealth", "TestMana"]);
});

Deno.test("componentsOf is empty for an entity with no components", () => {
  const world = new World();
  assertEquals(world.componentsOf(world.spawn()), []);
});

Deno.test("entityEntries pairs ids with their component names", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Health);
  assertEquals(world.entityEntries(), [{ id: entity, components: ["TestHealth"] }]);
});

Deno.test("stats counts entities, components and types", () => {
  const world = new World();
  const a = world.spawn();
  const b = world.spawn();
  world.add(a, Health);
  world.add(a, Mana);
  world.add(b, Health);
  assertEquals(world.stats(), { entities: 2, components: 3, componentTypes: 2 });
});

Deno.test("each visits every queried entity in order with its index", () => {
  const world = new World();
  const a = world.spawn();
  const b = world.spawn();
  world.add(a, Health);
  world.add(b, Health);
  const visited: Array<[number, number]> = [];
  world.each([Health], (entity, index) => visited.push([entity, index]));
  assertEquals(visited, [[a, 0], [b, 1]]);
});

Deno.test("each with no matches visits nothing", () => {
  const world = new World();
  let calls = 0;
  world.each([Health], () => calls++);
  assertEquals(calls, 0);
});

Deno.test("clone deep-copies components and preserves ids", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Health, { current: 6 });
  const copy = world.clone();
  assertEquals(copy.entities(), world.entities());
  const original = world.require(entity, Health);
  const cloned = copy.require(entity, Health);
  assert(original !== cloned, "the clone must not share component objects with the original");
  cloned.tags.push("copied");
  assertEquals(original.tags, []);
});

Deno.test("clone is independent: mutations do not cross over", () => {
  const world = new World();
  const entity = world.spawn();
  world.add(entity, Health);
  const copy = world.clone();
  copy.add(copy.spawn(), Mana);
  assertEquals(world.entityCount, 1);
  assertEquals(copy.entityCount, 2);
  world.set(entity, Health, { current: 1 });
  assertEquals(copy.require(entity, Health).current, 10);
});

Deno.test("clear empties the world and restarts ids", () => {
  const world = new World();
  world.spawn();
  world.add(1, Health);
  world.clear();
  assertEquals(world.entityCount, 0);
  assertEquals(world.stats(), { entities: 0, components: 0, componentTypes: 0 });
  assertEquals(world.spawn(), 1);
});

Deno.test("component storage is flat: replacing a value does not clone it", () => {
  const world = new World();
  const entity = world.spawn();
  const value = Health.create();
  world.attach(entity, Health, value);
  value.current = 99;
  assertEquals(world.require(entity, Health).current, 99);
});

Deno.test("cloneComponentData deep-copies nested objects and arrays", () => {
  const source = { a: 1, nested: { list: [1, 2, { deep: true }] } };
  const copy = cloneComponentData(source);
  assertEquals(copy, source);
  copy.nested.list.push(4);
  assertEquals(source.nested.list.length, 3);
});

Deno.test("cloneComponentData passes primitives and arrays through safely", () => {
  assertEquals(cloneComponentData(5), 5);
  assertEquals(cloneComponentData("text"), "text");
  assertEquals(cloneComponentData(null), null);
  assertEquals(cloneComponentData([1, [2, 3]]), [1, [2, 3]]);
});

Deno.test("component storage survives many entities without id reuse", () => {
  const world = new World();
  const ids: number[] = [];
  for (let i = 0; i < 100; i++) ids.push(world.spawn());
  for (const id of ids) world.add(id, Health);
  for (const id of ids.slice(0, 50)) world.despawn(id);
  const remaining = world.query(Health);
  assertEquals(remaining.length, 50);
  for (const id of remaining) assertNotEquals(remaining.indexOf(id), -1);
  for (const id of ids.slice(50)) assert(world.isAlive(id));
});

Deno.test("a component type object is stable and shareable", () => {
  const type: ComponentType<{ value: number }> = Mana;
  const world = new World();
  const entity = world.spawn();
  assertEquals(world.add(entity, type, { value: 7 }).value, 7);
});
