/**
 * games/flappy — entity templates.
 *
 * Owner: this file owns what a bird, a pipe pair, the ground and a HUD label *are*. The
 * scene builders, the pipe spawner and the tests all use these templates, so a pipe
 * spawned mid-run is exactly the pipe a scene author would place by hand.
 */

import {
  BoxCollider,
  type Entity,
  RigidBody,
  type Scene,
  Script,
  Sprite,
  Tag,
  TextLabel,
  Theme,
  Velocity,
  vec2,
} from "@ember/core";
import { BIRD_SCRIPT, TITLE_SCRIPT } from "./scripts.ts";
import { PIPE_WIDTH } from "./names.ts";

export const BIRD_TAG = "bird";
export const PIPE_TAG = "pipe";
export const SCORE_TAG = "score-zone";
export const GROUND_TAG = "ground";

export interface BirdOptions {
  /** Upward speed applied by one flap, in px/s. */
  flap?: number;
  /** Terminal fall speed, in px/s. */
  maxFall?: number;
}

/** The player: a dynamic body with a box, a sprite and the flap script. */
export function createBird(scene: Scene, x: number, y: number, options: BirdOptions = {}): Entity {
  const entity = scene.createEntity({ name: "bird", position: vec2(x, y) });
  const world = scene.world;
  world.add(entity, Sprite, { texture: "bird", width: 34, height: 26, layer: 20 });
  world.add(entity, RigidBody, {
    type: "dynamic",
    gravityScale: 1,
    friction: 0,
    // The engine clamps after integration, so maxSpeed is what actually holds terminal
    // velocity; the script's clamp alone is a frame too early.
    maxSpeed: options.maxFall ?? 460,
    restitution: 0,
    grounded: false,
  });
  world.add(entity, Velocity, { x: 0, y: 0, angular: 0 });
  world.add(entity, BoxCollider, { width: 28, height: 22, solid: true, trigger: false });
  world.add(entity, Script, {
    name: BIRD_SCRIPT,
    props: { flap: options.flap ?? 380, maxFall: options.maxFall ?? 460 },
  });
  world.add(entity, Tag, { value: BIRD_TAG });
  return entity;
}

export interface PipePair {
  top: Entity;
  bottom: Entity;
  /** Trigger volume in the gap; the scoring system consumes it. */
  zone: Entity;
}

/**
 * One obstacle: a top pipe, a bottom pipe and an invisible trigger across the gap. The
 * pipes are kinematic so they scroll at a constant speed, unaffected by collisions, while
 * the bird (dynamic) is stopped by them.
 */
export function createPipePair(
  scene: Scene,
  x: number,
  gapCenter: number,
  gap: number,
  options: { speed?: number; floor?: number } = {},
): PipePair {
  const speed = options.speed ?? 150;
  const floor = options.floor ?? 660;
  const gapTop = Math.max(20, gapCenter - gap / 2);
  const gapBottom = Math.min(floor - 20, gapCenter + gap / 2);

  const shaft = (name: string, centerY: number, height: number): Entity => {
    const entity = scene.createEntity({ name, position: vec2(x, centerY) });
    const world = scene.world;
    world.add(entity, Sprite, { texture: "pipe", width: PIPE_WIDTH, height, layer: 10 });
    world.add(entity, RigidBody, {
      type: "kinematic",
      gravityScale: 0,
      maxSpeed: 600,
      friction: 0,
      restitution: 0,
    });
    world.add(entity, Velocity, { x: -speed, y: 0, angular: 0 });
    world.add(entity, BoxCollider, {
      width: PIPE_WIDTH,
      height,
      solid: true,
      trigger: false,
    });
    world.add(entity, Tag, { value: PIPE_TAG });
    return entity;
  };

  const top = shaft("pipe-top", gapTop / 2, gapTop);
  const bottom = shaft("pipe-bottom", (gapBottom + floor) / 2, floor - gapBottom);

  const zone = scene.createEntity({ name: "pipe-gap", position: vec2(x, gapCenter) });
  const world = scene.world;
  world.add(zone, RigidBody, { type: "kinematic", gravityScale: 0, maxSpeed: 600, friction: 0 });
  world.add(zone, Velocity, { x: -speed, y: 0, angular: 0 });
  // A score zone: reports the pass, never blocks it.
  world.add(zone, BoxCollider, { width: 6, height: Math.max(16, gap - 16), solid: false, trigger: true });
  world.add(zone, Tag, { value: SCORE_TAG });

  return { top, bottom, zone };
}

/** A solid ground/ceiling strip. */
export function createGround(
  scene: Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { texture?: boolean } = {},
): Entity {
  const entity = scene.createEntity({ name: "ground", position: vec2(x, y) });
  const world = scene.world;
  if (options.texture ?? true) {
    world.add(entity, Sprite, { texture: "ground", width, height, layer: 5 });
  }
  world.add(entity, RigidBody, { type: "static", gravityScale: 0, friction: 0, maxSpeed: 0 });
  world.add(entity, BoxCollider, { width, height, solid: true, trigger: false });
  world.add(entity, Tag, { value: GROUND_TAG });
  return entity;
}

/** A centred piece of text; HUD labels are found by name from the HUD system. */
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
    alpha?: number;
  } = {},
): Entity {
  const entity = scene.createEntity({ name, position: vec2(x, y) });
  scene.world.add(entity, TextLabel, {
    text,
    size: options.size ?? 18,
    color: options.color ?? Theme.text,
    align: options.align ?? "center",
    baseline: options.baseline ?? "middle",
    layer: options.layer ?? 1000,
    alpha: options.alpha ?? 1,
  });
  return entity;
}

/** An invisible input catcher that starts the game on a tap, click, Space or Enter. */
export function createTitleTrigger(scene: Scene, x: number, y: number, target: string): Entity {
  const entity = scene.createEntity({ name: "start-trigger", position: vec2(x, y) });
  scene.world.add(entity, Script, { name: TITLE_SCRIPT, props: { target } });
  return entity;
}
