/**
 * @ember/core/components — the built-in vocabulary, hierarchy helpers and collider maths.
 */

import { assert, assertAlmostEquals, assertEquals, assertNotEquals } from "@std/assert";
import {
  BoxCollider,
  CircleShape,
  Colors,
  Lifetime,
  Name,
  Parent,
  RectShape,
  RigidBody,
  Script,
  Scene,
  Sprite,
  Tag,
  TextLabel,
  Transform,
  Velocity,
  Visibility,
  World,
  colliderLocalRect,
  colliderWorldRect,
  isVisibleInHierarchy,
  parentOf,
  toTransform2D,
  worldTransform,
} from "@ember/core";

function sceneWithEntity(): { scene: Scene; entity: number } {
  const scene = new Scene({ name: "components-test" });
  return { scene, entity: scene.createEntity({ name: "subject" }) };
}

Deno.test("Transform defaults to the origin with unit scale", () => {
  assertEquals(Transform.create(), { position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } });
});

Deno.test("Name defaults to an empty string", () => {
  assertEquals(Name.create(), { value: "" });
});

Deno.test("Tag defaults to an empty string", () => {
  assertEquals(Tag.create(), { value: "" });
});

Deno.test("Visibility defaults to visible", () => {
  assertEquals(Visibility.create(), { visible: true });
  assertEquals(Visibility.create({ visible: false }).visible, false);
});

Deno.test("Parent defaults to entity 0, meaning none", () => {
  assertEquals(Parent.create(), { entity: 0 });
});

Deno.test("Sprite defaults are a 32px unstretched white quad on layer 0", () => {
  const sprite = Sprite.create();
  assertEquals(sprite.width, 32);
  assertEquals(sprite.height, 32);
  assertEquals(sprite.tint, Colors.white);
  assertEquals(sprite.alpha, 1);
  assertEquals(sprite.layer, 0);
  assertEquals(sprite.frameCount, 1);
  assertEquals(sprite.flipX, false);
});

Deno.test("Sprite accepts overrides including animation frames", () => {
  const sprite = Sprite.create({ texture: "coin", frameCount: 4, framesPerSecond: 12 });
  assertEquals(sprite.texture, "coin");
  assertEquals(sprite.frameCount, 4);
  assertEquals(sprite.framesPerSecond, 12);
});

Deno.test("RectShape defaults to a filled 32x32 white box", () => {
  const shape = RectShape.create();
  assertEquals([shape.width, shape.height, shape.filled, shape.color], [32, 32, true, Colors.white]);
});

Deno.test("CircleShape defaults to a filled 16 radius circle", () => {
  const circle = CircleShape.create();
  assertEquals(circle.radius, 16);
  assertEquals(circle.filled, true);
  assertEquals(circle.strokeWidth, 1);
});

Deno.test("TextLabel defaults to left-aligned top-baseline text", () => {
  const label = TextLabel.create();
  assertEquals(label.align, "left");
  assertEquals(label.baseline, "top");
  assertEquals(label.size, 16);
  assertEquals(label.layer, 10);
});

Deno.test("Velocity defaults to rest", () => {
  assertEquals(Velocity.create(), { x: 0, y: 0, angular: 0 });
});

Deno.test("RigidBody defaults to a dynamic, gravity-scaled body", () => {
  const body = RigidBody.create();
  assertEquals(body.type, "dynamic");
  assertEquals(body.gravityScale, 1);
  assertEquals(body.grounded, false);
  assert(body.maxSpeed > 0);
});

Deno.test("BoxCollider defaults to a solid, enabled 32x32 box", () => {
  const collider = BoxCollider.create();
  assertEquals([collider.width, collider.height, collider.solid, collider.trigger, collider.enabled], [
    32,
    32,
    true,
    false,
    true,
  ]);
});

Deno.test("Script defaults to no behaviour", () => {
  const script = Script.create();
  assertEquals(script.name, "");
  assertEquals(script.props, {});
});

Deno.test("Lifetime defaults to an unset timer", () => {
  assertEquals(Lifetime.create(), { ttl: 0, remaining: 0 });
});

Deno.test("toTransform2D converts a component value", () => {
  const converted = toTransform2D({ position: { x: 3, y: 4 }, rotation: 1, scale: { x: 2, y: 2 } });
  assertEquals(converted, { position: { x: 3, y: 4 }, rotation: 1, scale: { x: 2, y: 2 } });
});

Deno.test("colliderLocalRect centres the box on the origin when the offset is zero", () => {
  assertEquals(colliderLocalRect({ width: 10, height: 6, offset: { x: 0, y: 0 } }), {
    x: -5,
    y: -3,
    w: 10,
    h: 6,
  });
});

Deno.test("colliderLocalRect honours the offset", () => {
  assertEquals(colliderLocalRect({ width: 10, height: 6, offset: { x: 2, y: -1 } }), {
    x: -3,
    y: -4,
    w: 10,
    h: 6,
  });
});

Deno.test("parentOf follows one Parent link", () => {
  const { scene, entity } = sceneWithEntity();
  const parent = scene.createEntity({ name: "parent" });
  scene.world.add(entity, Parent, { entity: parent });
  assertEquals(parentOf(scene.world, entity), parent);
});

Deno.test("parentOf ignores dead and self parents", () => {
  const { scene, entity } = sceneWithEntity();
  scene.world.add(entity, Parent, { entity: 999 });
  assertEquals(parentOf(scene.world, entity), undefined);
  scene.world.set(entity, Parent, { entity });
  assertEquals(parentOf(scene.world, entity), undefined);
});

Deno.test("worldTransform composes a two-level parent chain", () => {
  const { scene, entity } = sceneWithEntity();
  const parent = scene.createEntity({ name: "parent", position: { x: 100, y: 0 } });
  scene.world.add(entity, Parent, { entity: parent });
  scene.world.set(entity, Transform, { position: { x: 10, y: 5 } });
  const composed = worldTransform(scene.world, entity)!;
  assertEquals(composed.position, { x: 110, y: 5 });
});

Deno.test("worldTransform multiplies parent scale into the child transform", () => {
  const { scene, entity } = sceneWithEntity();
  const parent = scene.createEntity({ name: "parent" });
  scene.world.set(parent, Transform, { position: { x: 0, y: 0 }, rotation: 0, scale: { x: 2, y: 3 } });
  scene.world.add(entity, Parent, { entity: parent });
  scene.world.set(entity, Transform, { position: { x: 10, y: 10 }, rotation: 0.5, scale: { x: 0.5, y: 0.5 } });
  const composed = worldTransform(scene.world, entity)!;
  assertEquals(composed.position, { x: 20, y: 30 });
  assertAlmostEquals(composed.rotation, 0.5, 1e-9);
  assertEquals(composed.scale, { x: 1, y: 1.5 });
});

Deno.test("worldTransform rotates the child's offset by the parent's rotation", () => {
  const { scene, entity } = sceneWithEntity();
  const parent = scene.createEntity({ name: "parent" });
  scene.world.set(parent, Transform, {
    position: { x: 0, y: 0 },
    rotation: Math.PI / 2,
    scale: { x: 1, y: 1 },
  });
  scene.world.add(entity, Parent, { entity: parent });
  scene.world.set(entity, Transform, { position: { x: 10, y: 0 } });
  const composed = worldTransform(scene.world, entity)!;
  assertAlmostEquals(composed.position.x, 0, 1e-9);
  assertAlmostEquals(composed.position.y, 10, 1e-9);
});

Deno.test("worldTransform terminates on a parent cycle", () => {
  const { scene, entity } = sceneWithEntity();
  const other = scene.createEntity({ name: "other" });
  scene.world.add(entity, Parent, { entity: other });
  scene.world.add(other, Parent, { entity });
  const composed = worldTransform(scene.world, entity);
  assert(composed !== undefined);
  assert(Number.isFinite(composed!.position.x));
  assert(Number.isFinite(composed!.position.y));
});

Deno.test("worldTransform returns undefined without a Transform", () => {
  const world = new World();
  const entity = world.spawn();
  assertEquals(worldTransform(world, entity), undefined);
});

Deno.test("worldTransform equals the local transform with no parent", () => {
  const { scene, entity } = sceneWithEntity();
  scene.world.set(entity, Transform, { position: { x: 7, y: 8 }, rotation: 1, scale: { x: 2, y: 2 } });
  assertEquals(worldTransform(scene.world, entity), {
    position: { x: 7, y: 8 },
    rotation: 1,
    scale: { x: 2, y: 2 },
  });
});

Deno.test("isVisibleInHierarchy respects the entity's own flag", () => {
  const { scene, entity } = sceneWithEntity();
  assert(isVisibleInHierarchy(scene.world, entity));
  scene.world.add(entity, Visibility, { visible: false });
  assert(!isVisibleInHierarchy(scene.world, entity));
});

Deno.test("isVisibleInHierarchy inherits a hidden parent", () => {
  const { scene, entity } = sceneWithEntity();
  const parent = scene.createEntity({ name: "parent" });
  scene.createEntity;
  scene.world.add(entity, Parent, { entity: parent });
  scene.world.add(parent, Visibility, { visible: false });
  assert(!isVisibleInHierarchy(scene.world, entity));
});

Deno.test("isVisibleInHierarchy survives a parent cycle", () => {
  const { scene, entity } = sceneWithEntity();
  const other = scene.createEntity({ name: "other" });
  scene.world.add(entity, Parent, { entity: other });
  scene.world.add(other, Parent, { entity });
  assert(isVisibleInHierarchy(scene.world, entity));
});

Deno.test("colliderWorldRect centres the box on the entity", () => {
  const { scene, entity } = sceneWithEntity();
  scene.world.set(entity, Transform, { position: { x: 100, y: 50 } });
  scene.world.add(entity, BoxCollider, { width: 20, height: 10 });
  assertEquals(colliderWorldRect(scene.world, entity), { x: 90, y: 45, w: 20, h: 10 });
});

Deno.test("colliderWorldRect applies scale and offset", () => {
  const { scene, entity } = sceneWithEntity();
  scene.world.set(entity, Transform, { position: { x: 0, y: 0 }, scale: { x: 2, y: 2 } });
  scene.world.add(entity, BoxCollider, { width: 10, height: 10, offset: { x: 5, y: 0 } });
  const rect = colliderWorldRect(scene.world, entity)!;
  assertEquals(rect.w, 20);
  assertEquals(rect.x, 0);
});

Deno.test("colliderWorldRect includes parent transforms", () => {
  const { scene, entity } = sceneWithEntity();
  const parent = scene.createEntity({ name: "parent", position: { x: 200, y: 0 } });
  scene.world.add(entity, Parent, { entity: parent });
  scene.world.add(entity, BoxCollider, { width: 10, height: 10 });
  assertEquals(colliderWorldRect(scene.world, entity), { x: 195, y: -5, w: 10, h: 10 });
});

Deno.test("colliderWorldRect returns undefined for disabled colliders", () => {
  const { scene, entity } = sceneWithEntity();
  scene.world.add(entity, BoxCollider, { enabled: false });
  assertEquals(colliderWorldRect(scene.world, entity), undefined);
});

Deno.test("colliderWorldRect returns undefined without a collider", () => {
  const { scene, entity } = sceneWithEntity();
  assertEquals(colliderWorldRect(scene.world, entity), undefined);
});

Deno.test("every built-in component default is JSON-serializable", () => {
  const types = [
    Transform,
    Name,
    Parent,
    Visibility,
    Sprite,
    RectShape,
    CircleShape,
    TextLabel,
    Velocity,
    RigidBody,
    BoxCollider,
    Script,
    Tag,
    Lifetime,
  ];
  for (const type of types) {
    const value = type.create();
    const copy = JSON.parse(JSON.stringify(value));
    assertEquals(copy, value, `${type.name} did not survive a JSON round trip`);
    assertNotEquals(value, undefined);
  }
});
