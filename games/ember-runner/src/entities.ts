/**
 * games/ember-runner — entity templates.
 *
 * Owner: this file owns what a player, ground block, ember, hazard, gate or HUD line *is*.
 * Scene builders and the runtime spawner both use these templates, so an ember placed by
 * hand in a scene file and one spawned mid-run are guaranteed to be the same thing.
 */

import {
  BoxCollider,
  CircleShape,
  Lifetime,
  Name,
  RectShape,
  RigidBody,
  Script,
  Scene,
  Sprite,
  Tag,
  TextLabel,
  Velocity,
  Colors,
  type Entity,
  vec2,
} from "@ember/core";
import {
  GOAL_SCRIPT,
  HAZARD_SCRIPT,
  HUD_SCRIPT,
  PICKUP_SCRIPT,
  PLAYER_SCRIPT,
  TITLE_SCRIPT,
} from "./scripts.ts";


export const PLAYER_TAG = "player";
export const COIN_TAG = "coin";
export const HAZARD_TAG = "hazard";
export const GOAL_TAG = "goal";

/** Tags the overlay system uses to pin text to the camera instead of the world. */
export const OVERLAY_TOP = "overlay:top";
export const OVERLAY_BOTTOM = "overlay:bottom";

export interface PlayerOptions {
  speed?: number;
  jump?: number;
  lives?: number;
}

/** The runner: sprite, box, dynamic body and the player script. */
export function createPlayer(scene: Scene, x: number, y: number, options: PlayerOptions = {}): Entity {
  const entity = scene.createEntity({ name: "runner", position: vec2(x, y) });
  const world = scene.world;
  world.add(entity, Sprite, {
    texture: "player",
    width: 28,
    height: 36,
    layer: 20,
    frameCount: 4,
    framesPerSecond: 8,
    frame: 0,
  });
  world.add(entity, RigidBody, {
    type: "dynamic",
    gravityScale: 1,
    // The runtime applies a body's friction on *every* grounded contact step, so any
    // non-zero value caps the runner far below its scripted speed. Stopping is the player
    // script's job (it damps to zero when no direction key is held).
    friction: 0,
    // Must stay above the script's jump impulse (780), otherwise the launch is clamped and
    // the platforms the levels are built around become unreachable.
    maxSpeed: 1600,
    restitution: 0,
    grounded: false,
  });
  world.add(entity, Velocity, { x: 0, y: 0, angular: 0 });
  world.add(entity, BoxCollider, { width: 26, height: 34, solid: true, trigger: false });
  world.add(entity, Script, {
    name: PLAYER_SCRIPT,
    props: { speed: options.speed ?? 260, jump: options.jump ?? 780, coyote: 0.12 },
  });
  world.add(entity, Tag, { value: PLAYER_TAG });
  return entity;
}

/** A solid platform. `solid: false` makes it scenery the player falls through. */
export function createGround(
  scene: Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { texture?: boolean; solid?: boolean } = {},
): Entity {
  const entity = scene.createEntity({ name: "ground", position: vec2(x, y) });
  const world = scene.world;
  if (options.texture ?? true) {
    world.add(entity, Sprite, {
      texture: "ground",
      width,
      height,
      layer: 5,
      frameCount: 1,
    });
  } else {
    world.add(entity, RectShape, { width, height, color: Colors.slate, layer: 5 });
  }
  world.add(entity, RigidBody, { type: "static", gravityScale: 0, friction: 0.4, maxSpeed: 0 });
  if (options.solid ?? true) {
    world.add(entity, BoxCollider, { width, height, solid: true, trigger: false });
  }
  return entity;
}

/** A collectable ember (coin). */
export function createEmber(scene: Scene, x: number, y: number, points = 25): Entity {
  const entity = scene.createEntity({ name: "ember", position: vec2(x, y) });
  const world = scene.world;
  world.add(entity, Sprite, {
    texture: "coin",
    width: 18,
    height: 18,
    layer: 12,
    frameCount: 4,
    framesPerSecond: 6,
  });
  world.add(entity, Velocity, { x: 0, y: 0 });
  world.add(entity, BoxCollider, { width: 18, height: 18, solid: true, trigger: true });
  world.add(entity, Script, { name: PICKUP_SCRIPT, props: { points, bounce: 0.5 } });
  world.add(entity, Tag, { value: COIN_TAG });
  return entity;
}

/** A hazard: a patrolling spike block that costs a life on contact. */
export function createHazard(
  scene: Scene,
  x: number,
  y: number,
  options: { patrol?: number; speed?: number; direction?: number } = {},
): Entity {
  const entity = scene.createEntity({ name: "hazard", position: vec2(x, y) });
  const world = scene.world;
  world.add(entity, Sprite, { texture: "hazard", width: 26, height: 26, layer: 12 });
  world.add(entity, RigidBody, {
    type: "kinematic",
    gravityScale: 0,
    maxSpeed: 400,
    friction: 0,
  });
  world.add(entity, Velocity, { x: 0, y: 0 });
  world.add(entity, BoxCollider, { width: 24, height: 24, solid: true, trigger: true });
  world.add(entity, Script, {
    name: HAZARD_SCRIPT,
    props: { patrol: options.patrol ?? 0, speed: options.speed ?? 90, direction: options.direction ?? 1 },
  });
  world.add(entity, Tag, { value: HAZARD_TAG });
  return entity;
}

/** The exit gate. */
export function createGate(scene: Scene, x: number, y: number, bonus = 150): Entity {
  const entity = scene.createEntity({ name: "gate", position: vec2(x, y) });
  const world = scene.world;
  world.add(entity, Sprite, { texture: "goal", width: 48, height: 96, layer: 8 });
  world.add(entity, BoxCollider, { width: 48, height: 96, solid: true, trigger: true });
  world.add(entity, Script, { name: GOAL_SCRIPT, props: { bonus } });
  world.add(entity, Tag, { value: GOAL_TAG });
  return entity;
}

/** A HUD line: a screen-anchored text label updated by the HUD script. */
export function createHudLine(
  scene: Scene,
  name: string,
  x: number,
  y: number,
  text: string,
  options: { size?: number; align?: "left" | "center" | "right"; color?: string } = {},
): Entity {
  const entity = scene.createEntity({ name, position: vec2(x, y) });
  const world = scene.world;
  world.add(entity, TextLabel, {
    text,
    size: options.size ?? 18,
    color: options.color ?? Colors.gold,
    align: options.align ?? "left",
    baseline: "middle",
    layer: 1000,
  });
  world.add(entity, Script, { name: HUD_SCRIPT, props: { line: name } });
  world.add(entity, Tag, { value: OVERLAY_TOP });
  return entity;
}

/** A static piece of on-screen text (title card, instructions, death message). */
export function createText(
  scene: Scene,
  name: string,
  x: number,
  y: number,
  text: string,
  options: {
    size?: number;
    color?: string;
    align?: "left" | "center" | "right";
    baseline?: "top" | "middle" | "bottom";
    layer?: number;
  } = {},
): Entity {
  const entity = scene.createEntity({ name, position: vec2(x, y) });
  scene.world.add(entity, TextLabel, {
    text,
    size: options.size ?? 20,
    color: options.color ?? Colors.white,
    align: options.align ?? "center",
    baseline: options.baseline ?? "middle",
    layer: options.layer ?? 900,
  });
  return entity;
}

/** A decorative backdrop bar (parallax layer). */
export function createBackdrop(
  scene: Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  layer = -10,
): Entity {
  const entity = scene.createEntity({ name: "backdrop", position: vec2(x, y) });
  scene.world.add(entity, RectShape, { width, height, color, layer });
  return entity;
}

/** Title-screen behaviour carrier: the whole scene listens for "start". */
export function createTitleTrigger(scene: Scene, x: number, y: number, target: string): Entity {
  const entity = scene.createEntity({ name: "start-trigger", position: vec2(x, y) });
  scene.world.add(entity, Script, { name: TITLE_SCRIPT, props: { target } });
  return entity;
}

/** A one-shot effect entity (e.g. a pickup burst) that removes itself after `seconds`. */
export function createEffect(
  scene: Scene,
  x: number,
  y: number,
  options: { radius?: number; seconds?: number; color?: string } = {},
): Entity {
  const entity = scene.createEntity({ name: "effect", position: vec2(x, y) });
  const world = scene.world;
  world.add(entity, CircleShape, {
    radius: options.radius ?? 10,
    color: options.color ?? Colors.gold,
    layer: 40,
  });
  world.add(entity, Velocity, { x: 0, y: -60 });
  world.attach(entity, Lifetime, { ttl: options.seconds ?? 0.4, remaining: 0 });
  world.add(entity, Name, { value: "effect" });
  return entity;
}

/** Components a template expects, used by the editor's inspector hints. */
export const TEMPLATE_COMPONENTS = {
  player: ["Transform", "Sprite", "RigidBody", "Velocity", "BoxCollider", "Script", "Tag"],
  ground: ["Transform", "Sprite", "RigidBody", "BoxCollider"],
  ember: ["Transform", "Sprite", "Velocity", "BoxCollider", "Script", "Tag"],
  hazard: ["Transform", "Sprite", "RigidBody", "Velocity", "BoxCollider", "Script", "Tag"],
  gate: ["Transform", "Sprite", "BoxCollider", "Script", "Tag"],
} as const;
