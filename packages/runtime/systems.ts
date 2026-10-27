/**
 * @ember/runtime/systems — the built-in systems.
 *
 * Owner: this file owns "what happens to entities each step" for everything generic:
 * animation, scripts, gravity, integration, collision, camera follow and lifetimes.
 * Game-specific rules live in the game folder (games/ember-runner/src), not here.
 *
 * Every system is a deterministic function of the scene, dt and input it reads, which is
 * why gameplay can be asserted step-by-step in headless tests.
 */

import {
  BoxCollider,
  colliderWorldRect,
  type Entity,
  Lifetime,
  type Rect,
  rectIntersection,
  RigidBody,
  type Rng,
  Script,
  Sprite,
  Transform,
  type Vec2,
  vec2,
  Velocity,
  type World,
} from "@ember/core";
import { type ScriptBehaviour, type ScriptContext, ScriptRegistry } from "./scripting.ts";
import type { CollisionRecord, System, SystemContext } from "./session.ts";
import { defineSystem, SystemOrder } from "./session.ts";

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

/** Advances sprite-sheet frames using `Sprite.framesPerSecond`. */
export function animationSystem(): System {
  return defineSystem("animation", (ctx) => {
    for (const entity of ctx.scene.world.query(Sprite)) {
      const sprite = ctx.scene.world.require(entity, Sprite);
      if (sprite.frameCount <= 1 || sprite.framesPerSecond <= 0) continue;
      if (sprite.alpha <= 0) continue;
      sprite.frame = (sprite.frame + ctx.dt * sprite.framesPerSecond) % sprite.frameCount;
      if (sprite.frame < 0) sprite.frame += sprite.frameCount;
    }
  }, SystemOrder.animation);
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

interface ScriptRuntime {
  behaviour: ScriptBehaviour;
  name: string;
  props: Record<string, unknown>;
  started: boolean;
}

export interface ScriptSystemOptions {
  registry?: ScriptRegistry;
  /** Called when a script name is missing from the registry (defaults to a diagnostics warn). */
  onMissing?: (entity: Entity, name: string, ctx: SystemContext) => void;
}

/**
 * Runs `Script` behaviours. Behaviours are instantiated per entity, started once, updated in
 * ascending entity order and torn down when their entity despawns.
 */
export function scriptSystem(options: ScriptSystemOptions = {}): System {
  const registry = options.registry ?? new ScriptRegistry();
  const running = new Map<Entity, ScriptRuntime>();

  return defineSystem("scripts", (ctx) => {
    const world = ctx.scene.world;
    const contextFor = (entity: Entity, props: Record<string, unknown>): ScriptContext => ({
      ...ctx,
      entity,
      props,
    });

    // 1. Tear down behaviours whose entity is gone.
    for (const [entity, runtime] of [...running]) {
      if (!world.isAlive(entity)) {
        runtime.behaviour.destroy?.(contextFor(entity, runtime.props));
        running.delete(entity);
      }
    }

    // 2. Start new scripts, or restart scripts whose name changed.
    for (const entity of world.query(Script)) {
      const component = world.require(entity, Script);
      const existing = running.get(entity);
      if (existing && existing.name === component.name) continue;
      if (existing) {
        existing.behaviour.destroy?.(contextFor(entity, existing.props));
        running.delete(entity);
      }
      if (component.name.length === 0) continue;
      const factory = registry.factory(component.name);
      if (!factory) {
        if (options.onMissing) options.onMissing(entity, component.name, ctx);
        else ctx.diagnostics.warn(`script "${component.name}" is not registered`, { entity });
        continue;
      }
      running.set(entity, {
        name: component.name,
        props: component.props,
        behaviour: factory(component.props, entity),
        started: false,
      });
    }

    // 3. Start once, then update, in ascending entity order.
    for (const entity of [...running.keys()].sort((a, b) => a - b)) {
      const runtime = running.get(entity);
      if (!runtime || !world.isAlive(entity)) continue;
      if (!runtime.started) {
        runtime.started = true;
        runtime.behaviour.start?.(contextFor(entity, runtime.props));
      }
      runtime.behaviour.update?.(contextFor(entity, runtime.props));
    }
  }, SystemOrder.script);
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

export interface GravitySystemOptions {
  /**
   * Extra downward acceleration applied to `Velocity` entities without a `RigidBody`.
   * Defaults to 0: only rigid bodies fall, so loose movers never drift unexpectedly.
   */
  looseFallback?: number;
}

/** Applies scene gravity to dynamic rigid bodies (and, optionally, body-less movers). */
export function gravitySystem(options: GravitySystemOptions = {}): System {
  return defineSystem("gravity", (ctx) => {
    const gravity = ctx.scene.resources.gravity;
    const looseFallback = options.looseFallback ?? 0;
    for (const entity of ctx.scene.world.query(Velocity)) {
      const body = ctx.scene.world.get(entity, RigidBody);
      const velocity = ctx.scene.world.require(entity, Velocity);
      if (body) {
        if (body.type !== "dynamic" || body.gravityScale === 0) continue;
        velocity.x += gravity.x * body.gravityScale * ctx.dt;
        velocity.y += gravity.y * body.gravityScale * ctx.dt;
      } else if (looseFallback !== 0) {
        velocity.y += looseFallback * ctx.dt;
      }
    }
  }, SystemOrder.gravity);
}

export interface VelocitySystemOptions {
  /** Hard cap when a `RigidBody` does not specify `maxSpeed`. */
  defaultMaxSpeed?: number;
}

/** Integrates `Velocity` into `Transform` and clamps speed. */
export function velocitySystem(options: VelocitySystemOptions = {}): System {
  return defineSystem("velocity", (ctx) => {
    const defaultMaxSpeed = options.defaultMaxSpeed ?? 4000;
    for (const entity of ctx.scene.world.query(Velocity)) {
      const velocity = ctx.scene.world.require(entity, Velocity);
      const transform = ctx.scene.world.get(entity, Transform);
      if (!transform) continue;
      const body = ctx.scene.world.get(entity, RigidBody);
      if (body && body.type === "static") continue;

      const maxSpeed = body && body.maxSpeed > 0 ? body.maxSpeed : defaultMaxSpeed;
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > maxSpeed) {
        const ratio = maxSpeed / speed;
        velocity.x *= ratio;
        velocity.y *= ratio;
      }

      transform.position.x += velocity.x * ctx.dt;
      transform.position.y += velocity.y * ctx.dt;
      if (velocity.angular !== 0) transform.rotation += velocity.angular * ctx.dt;
    }
  }, SystemOrder.velocity);
}

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

export interface CollisionSystemOptions {
  /** Restitution used when a body sets none. */
  defaultRestitution?: number;
  /** Report trigger overlaps as collisions but never resolve them (default true). */
  reportTriggers?: boolean;
}

/**
 * Axis-aligned box collision between every `BoxCollider` pair.
 *
 * Resolution rules:
 * - `static` and `kinematic` bodies never move; `dynamic` bodies absorb the full correction.
 * - Two dynamic bodies split the correction evenly.
 * - Landing on top of something sets `RigidBody.grounded` for the rest of the step.
 * - Triggers report a `CollisionRecord` and are never resolved.
 *
 * Pairs are visited in ascending (a, b) id order, so identical scenes resolve identically.
 */
export function collisionSystem(options: CollisionSystemOptions = {}): System {
  const defaultRestitution = options.defaultRestitution ?? 0;
  const reportTriggers = options.reportTriggers ?? true;

  return defineSystem("collision", (ctx) => {
    const world = ctx.scene.world;
    const entities = world.query(BoxCollider);

    for (const entity of world.query(RigidBody)) {
      const body = world.require(entity, RigidBody);
      if (body.type === "dynamic") body.grounded = false;
    }

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];
        const colliderA = world.require(a, BoxCollider);
        const colliderB = world.require(b, BoxCollider);
        if (!colliderA.solid || !colliderB.solid) continue;

        const rectA = colliderWorldRect(world, a);
        const rectB = colliderWorldRect(world, b);
        if (!rectA || !rectB) continue;
        const overlap = rectIntersection(rectA, rectB);
        if (!overlap) continue;

        const trigger = colliderA.trigger || colliderB.trigger;
        const separation = separationAxis(rectA, rectB);
        if (!trigger) resolveBody(world, a, b, separation, defaultRestitution);

        const record: CollisionRecord = {
          a,
          b,
          overlap,
          normal: separation.vector,
          trigger,
        };
        if (!trigger || reportTriggers) {
          ctx.diagnostics.increment(trigger ? "triggerOverlaps" : "collisions");
          ctx.collisions.push(record);
          ctx.queue.push("collision", record);
        }
      }
    }
  }, SystemOrder.collision);
}

/** Moves/zeroes velocities for one contact pair. */
function resolveBody(
  world: World,
  a: Entity,
  b: Entity,
  separation: Separation,
  defaultRestitution: number,
): void {
  const dynamicA = isDynamic(world, a);
  const dynamicB = isDynamic(world, b);
  if (!dynamicA && !dynamicB) return;

  const splitEvenly = dynamicA && dynamicB;
  const shareA = splitEvenly ? separation.depth / 2 : dynamicA ? separation.depth : 0;
  const shareB = splitEvenly ? separation.depth / 2 : dynamicB ? separation.depth : 0;
  const pushA = separation.sign;
  const pushB = -separation.sign;

  if (shareA > 0) moveBy(world, a, separation.axis, pushA * shareA);
  if (shareB > 0) moveBy(world, b, separation.axis, pushB * shareB);

  // Nothing may be grounded by a horizontal push; only a body lifted upwards is.
  if (separation.axis === "y") {
    if (shareA > 0 && pushA === -1) markGrounded(world, a);
    if (shareB > 0 && pushB === -1) markGrounded(world, b);
  }

  for (const [entity, direction] of [[a, pushA], [b, pushB]] as Array<[Entity, number]>) {
    const body = world.get(entity, RigidBody);
    const velocity = world.get(entity, Velocity);
    if (!body || !velocity || body.type !== "dynamic") continue;
    const restitution = body.restitution || defaultRestitution;
    if (separation.axis === "x" && Math.sign(velocity.x) === -direction) {
      velocity.x = -velocity.x * restitution;
    }
    if (separation.axis === "y" && Math.sign(velocity.y) === -direction) {
      velocity.y = -velocity.y * restitution;
    }
  }
}

function markGrounded(world: World, entity: Entity): void {
  const body = world.get(entity, RigidBody);
  if (!body || body.type !== "dynamic") return;
  body.grounded = true;
  const velocity = world.get(entity, Velocity);
  if (velocity) velocity.x *= 1 - Math.min(1, Math.max(0, body.friction));
}

function moveBy(world: World, entity: Entity, axis: "x" | "y", amount: number): void {
  const transform = world.get(entity, Transform);
  if (!transform) return;
  if (axis === "x") transform.position.x += amount;
  else transform.position.y += amount;
}

function isDynamic(world: World, entity: Entity): boolean {
  const body = world.get(entity, RigidBody);
  return !body || body.type === "dynamic";
}

export interface Separation {
  axis: "x" | "y";
  depth: number;
  /** Direction `a` must move along `axis` to separate from `b`. */
  sign: number;
  vector: Vec2;
}

/**
 * Least-penetration axis between two overlapping rects.
 * `sign` is the direction `a` moves along `axis` to get out of `b`.
 */
export function separationAxis(a: Rect, b: Rect): Separation {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const centerA = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const centerB = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (overlapX < overlapY) {
    const sign = centerA.x >= centerB.x ? 1 : -1;
    return { axis: "x", depth: overlapX, sign, vector: vec2(sign, 0) };
  }
  const sign = centerA.y >= centerB.y ? 1 : -1;
  return { axis: "y", depth: overlapY, sign, vector: vec2(0, sign) };
}

// ---------------------------------------------------------------------------
// Camera and lifetimes
// ---------------------------------------------------------------------------

/** Drives camera follow smoothing and bounds clamping from the scene's camera settings. */
export function cameraSystem(): System {
  return defineSystem("camera", (ctx) => {
    ctx.camera.update(ctx.scene, ctx.dt);
  }, SystemOrder.camera);
}

/** Counts `Lifetime` down and despawns entities whose timer runs out. */
export function lifetimeSystem(): System {
  return defineSystem("lifetime", (ctx) => {
    const world = ctx.scene.world;
    for (const entity of world.query(Lifetime)) {
      const lifetime = world.require(entity, Lifetime);
      if (lifetime.remaining <= 0 && lifetime.ttl > 0) lifetime.remaining = lifetime.ttl;
      if (lifetime.remaining <= 0) continue;
      lifetime.remaining -= ctx.dt;
      if (lifetime.remaining <= 0) {
        ctx.api.despawn(entity);
        ctx.diagnostics.increment("lifetimesExpired");
      }
    }
  }, SystemOrder.lifetime);
}

// ---------------------------------------------------------------------------
// Defaults and helpers
// ---------------------------------------------------------------------------

export interface DefaultSystemsOptions {
  scripts?: ScriptRegistry;
  /** Turn individual built-ins off; everything else stays on. */
  disable?: readonly (
    | "animation"
    | "scripts"
    | "gravity"
    | "velocity"
    | "collision"
    | "camera"
    | "lifetime"
  )[];
  collision?: CollisionSystemOptions;
  gravity?: GravitySystemOptions;
  velocity?: VelocitySystemOptions;
}

/** The stock system set, in phase order. Games append their own systems to this list. */
export function defaultSystems(options: DefaultSystemsOptions = {}): System[] {
  const disabled = new Set(options.disable ?? []);
  const systems: System[] = [];
  if (!disabled.has("animation")) systems.push(animationSystem());
  if (!disabled.has("scripts")) {
    systems.push(scriptSystem({ registry: options.scripts ?? new ScriptRegistry() }));
  }
  if (!disabled.has("gravity")) systems.push(gravitySystem(options.gravity));
  if (!disabled.has("velocity")) systems.push(velocitySystem(options.velocity));
  if (!disabled.has("collision")) systems.push(collisionSystem(options.collision));
  if (!disabled.has("camera")) systems.push(cameraSystem());
  if (!disabled.has("lifetime")) systems.push(lifetimeSystem());
  return systems;
}

/** Random point inside `area` from the session RNG (never `Math.random()`). */
export function randomPointInRect(rng: Rng, area: Rect): Vec2 {
  return vec2(rng.float(area.x, area.x + area.w), rng.float(area.y, area.y + area.h));
}
