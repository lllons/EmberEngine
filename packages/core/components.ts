/**
 * @ember/core/components — the built-in component vocabulary.
 *
 * Owner: this file owns "what fields an entity can have". `render2d` and `render3d`
 * interpret the visual components, runtime systems interpret the motion/collision ones,
 * and the editor inspector renders editors for them generically from their data shape.
 *
 * Every component value is plain JSON: no functions, no class instances, no cycles.
 */

import { type Color, Colors } from "./color.ts";
import { defineComponent, type Entity, type World } from "./ecs.ts";
import {
  add,
  type Rect,
  rectTranslate,
  rotateVec,
  sub,
  type Transform2D,
  transform2d,
  transformBounds,
  transformPoint,
  vec2,
} from "./math.ts";
import {
  type Mat4,
  mat4FromTransform3D,
  mat4Multiply,
  type Transform3DState,
  vec3,
} from "./math3d.ts";

/** Position/rotation/scale. Required by every renderable entity. */
export const Transform = defineComponent<
  { position: { x: number; y: number }; rotation: number; scale: { x: number; y: number } }
>(
  "Transform",
  () => ({ position: vec2(0, 0), rotation: 0, scale: vec2(1, 1) }),
);

/** Display name; the editor hierarchy shows this instead of the entity id. */
export const Name = defineComponent<{ value: string }>("Name", () => ({ value: "" }));

/** Optional parent entity, for grouping and inherited visibility. */
export const Parent = defineComponent<{ entity: Entity }>("Parent", () => ({ entity: 0 }));

/** Hides the entity and its rendering without destroying it. */
export const Visibility = defineComponent<{ visible: boolean }>("Visibility", () => ({
  visible: true,
}));

/** Textured quad. `texture` is an asset key resolved by the asset pipeline. */
export const Sprite = defineComponent<{
  texture: string;
  width: number;
  height: number;
  tint: Color;
  alpha: number;
  layer: number;
  flipX: boolean;
  /** When > 0, animates across a horizontal strip of `frameCount` frames. */
  frameCount: number;
  framesPerSecond: number;
  frame: number;
}>("Sprite", () => ({
  texture: "",
  width: 32,
  height: 32,
  tint: Colors.white,
  alpha: 1,
  layer: 0,
  flipX: false,
  frameCount: 1,
  framesPerSecond: 8,
  frame: 0,
}));

/** Solid or outlined axis-aligned rectangle, centred on the transform. */
export const RectShape = defineComponent<{
  width: number;
  height: number;
  color: Color;
  layer: number;
  filled: boolean;
  strokeWidth: number;
  alpha: number;
}>("RectShape", () => ({
  width: 32,
  height: 32,
  color: Colors.white,
  layer: 0,
  filled: true,
  strokeWidth: 1,
  alpha: 1,
}));

export const CircleShape = defineComponent<{
  radius: number;
  color: Color;
  layer: number;
  filled: boolean;
  strokeWidth: number;
  alpha: number;
}>("CircleShape", () => ({
  radius: 16,
  color: Colors.white,
  layer: 0,
  filled: true,
  strokeWidth: 1,
  alpha: 1,
}));

export const TextLabel = defineComponent<{
  text: string;
  size: number;
  color: Color;
  align: "left" | "center" | "right";
  baseline: "top" | "middle" | "bottom";
  layer: number;
  alpha: number;
}>("TextLabel", () => ({
  text: "",
  size: 16,
  color: Colors.white,
  align: "left",
  baseline: "top",
  layer: 10,
  alpha: 1,
}));

/**
 * 3D position/rotation/scale, read by `@ember/render3d`. Independent of `Transform`:
 * an entity with both is rendered by both pipelines, at the same 2D and 3D positions.
 */
export const Transform3D = defineComponent<Transform3DState>("Transform3D", () => ({
  position: vec3(0, 0, 0),
  rotation: vec3(0, 0, 0),
  scale: vec3(1, 1, 1),
}));

/**
 * Solid mesh instance. `mesh` names an entry in the render3d mesh registry (`cube`,
 * `quad`, `pyramid`, `triangle`, or one registered by a game). The transform's scale is
 * the mesh's size in world units, because built-in meshes are unit-sized.
 */
export const MeshRenderer = defineComponent<{
  mesh: string;
  color: Color;
  alpha: number;
  layer: number;
  doubleSided: boolean;
  wireframe: boolean;
}>("MeshRenderer", () => ({
  mesh: "cube",
  color: Colors.sky,
  alpha: 1,
  layer: 0,
  doubleSided: false,
  wireframe: false,
}));

/** Linear and angular velocity in world units per second. */
export const Velocity = defineComponent<{ x: number; y: number; angular: number }>(
  "Velocity",
  () => ({ x: 0, y: 0, angular: 0 }),
);

export type BodyType = "dynamic" | "static" | "kinematic";

/** Motion integration parameters. `static` bodies never move and block `dynamic` ones. */
export const RigidBody = defineComponent<{
  type: BodyType;
  gravityScale: number;
  friction: number;
  maxSpeed: number;
  restitution: number;
  grounded: boolean;
}>("RigidBody", () => ({
  type: "dynamic",
  gravityScale: 1,
  friction: 0.2,
  maxSpeed: 1200,
  restitution: 0,
  grounded: false,
}));

/** Collision box, centred on the transform unless `offset` says otherwise. */
export const BoxCollider = defineComponent<{
  width: number;
  height: number;
  offset: { x: number; y: number };
  /** Solid colliders stop dynamic bodies; triggers only report overlaps. */
  solid: boolean;
  trigger: boolean;
  enabled: boolean;
}>("BoxCollider", () => ({
  width: 32,
  height: 32,
  offset: vec2(0, 0),
  solid: true,
  trigger: false,
  enabled: true,
}));

/**
 * Behaviour reference. `name` resolves through a `ScriptRegistry` in the runtime;
 * `props` are the script's serialized configuration, so scripts survive save/load.
 */
export const Script = defineComponent<{ name: string; props: Record<string, unknown> }>(
  "Script",
  () => ({ name: "", props: {} }),
);

/** Self-destruct timer in seconds. `remaining < 0` means "never expires". */
export const Lifetime = defineComponent<{ ttl: number; remaining: number }>("Lifetime", () => ({
  ttl: 0,
  remaining: 0,
}));

/** Free-form label other systems can query ("enemy", "coin", "checkpoint"). */
export const Tag = defineComponent<{ value: string }>("Tag", () => ({ value: "" }));

// ---------------------------------------------------------------------------
// Helpers shared by systems, the editor and games
// ---------------------------------------------------------------------------

/** Reads a transform component as the math-layer transform type. */
export function toTransform2D(value: {
  position: { x: number; y: number };
  rotation: number;
  scale: { x: number; y: number };
}): Transform2D {
  return transform2d(value.position, value.rotation, value.scale);
}

/** Local-space box of a collider, centred on the entity's origin. */
export function colliderLocalRect(collider: {
  width: number;
  height: number;
  offset: { x: number; y: number };
}): Rect {
  return {
    x: collider.offset.x - collider.width / 2,
    y: collider.offset.y - collider.height / 2,
    w: collider.width,
    h: collider.height,
  };
}

/**
 * Living parent of an entity, following one level of the `Parent` link.
 * A self-loop or a dead target counts as "no parent", so callers never need to guard.
 */
export function parentOf(world: World, entity: Entity): Entity | undefined {
  const parent = world.get(entity, Parent);
  if (!parent || parent.entity === entity) return undefined;
  return world.isAlive(parent.entity) ? parent.entity : undefined;
}

/**
 * Walks the `Parent` chain and folds each ancestor transform into one world transform.
 * Cycles and dead parents terminate the walk, so unsafe scene data can never hang the engine.
 */
export function worldTransform(world: World, entity: Entity): Transform2D | undefined {
  const own = world.get(entity, Transform);
  if (!own) return undefined;
  let result = toTransform2D(own);
  const seen = new Set<Entity>([entity]);
  let parent = parentOf(world, entity);
  while (parent !== undefined && !seen.has(parent)) {
    seen.add(parent);
    const parentTransform = world.get(parent, Transform);
    if (parentTransform) {
      const scaled = {
        x: result.position.x * parentTransform.scale.x,
        y: result.position.y * parentTransform.scale.y,
      };
      result = {
        position: add(parentTransform.position, rotateVec(scaled, parentTransform.rotation)),
        rotation: result.rotation + parentTransform.rotation,
        scale: {
          x: result.scale.x * parentTransform.scale.x,
          y: result.scale.y * parentTransform.scale.y,
        },
      };
    }
    parent = parentOf(world, parent);
  }
  return result;
}

/** False when the entity or any ancestor sets `Visibility.visible = false`. */
export function isVisibleInHierarchy(world: World, entity: Entity): boolean {
  if (world.get(entity, Visibility)?.visible === false) return false;
  const seen = new Set<Entity>([entity]);
  let parent = parentOf(world, entity);
  while (parent !== undefined && !seen.has(parent)) {
    seen.add(parent);
    if (world.get(parent, Visibility)?.visible === false) return false;
    parent = parentOf(world, parent);
  }
  return true;
}

/** Reads a Transform3D component as the math-layer state type. */
export function toTransform3DState(value: Transform3DState): Transform3DState {
  return {
    position: { ...value.position },
    rotation: { ...value.rotation },
    scale: { ...value.scale },
  };
}

/**
 * World-space model matrix for a 3D entity, folding in every ancestor that also has a
 * `Transform3D`. Ancestors that only carry the 2D `Transform` do not affect 3D placement.
 * Cycles and dead parents terminate the walk.
 */
export function worldTransform3D(world: World, entity: Entity): Mat4 | undefined {
  const own = world.get(entity, Transform3D);
  if (!own) return undefined;
  let matrix = mat4FromTransform3D(toTransform3DState(own));
  const seen = new Set<Entity>([entity]);
  let parent = parentOf(world, entity);
  while (parent !== undefined && !seen.has(parent)) {
    seen.add(parent);
    const parentTransform = world.get(parent, Transform3D);
    if (parentTransform) {
      matrix = mat4Multiply(
        mat4FromTransform3D(toTransform3DState(parentTransform)),
        matrix,
      );
    }
    parent = parentOf(world, parent);
  }
  return matrix;
}

/**
 * World-space axis-aligned box of an entity's collider, honouring parent transforms.
 * Rotation is folded into the bounding box rather than the box's orientation.
 */
export function colliderWorldRect(world: World, entity: Entity): Rect | undefined {
  const collider = world.get(entity, BoxCollider);
  if (!collider || !collider.enabled) return undefined;
  const transform = worldTransform(world, entity);
  if (!transform) return undefined;
  const bounds = transformBounds(transform, { width: collider.width, height: collider.height });
  const center = transformPoint(transform, collider.offset);
  return rectTranslate(bounds, sub(center, transform.position));
}
