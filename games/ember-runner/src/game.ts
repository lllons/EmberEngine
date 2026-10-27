/**
 * Ember Runner — the game.
 *
 * Owner: this file owns the level and the wiring. Rules live in `systems.ts`; motion,
 * gravity, collision and camera follow come from the engine. Everything here is data, so
 * the level can be moved into an `.emberscene` file later without touching the rules.
 */

import {
  BoxCollider,
  CircleShape,
  Colors,
  type Entity,
  RectShape,
  RigidBody,
  Scene,
  Tag,
  TextLabel,
  vec2,
  Velocity,
} from "@ember/core";
import { defineGame, type Game } from "@ember/runtime";
import { EMBER_TAG, HINT_TAG, HUD_TAG, PLAYER_TAG, runnerSystems, TUNING } from "./systems.ts";

const VIEWPORT = { width: 960, height: 540 };
const WORLD_WIDTH = 2400;
const GROUND_TOP = 470;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Solid platforms, laid out so every jump is reachable with `TUNING.jumpSpeed`. */
const PLATFORMS: Box[] = [
  { x: 640, y: 390, w: 180, h: 22 },
  { x: 900, y: 330, w: 190, h: 22 },
  { x: 1180, y: 380, w: 180, h: 22 },
  { x: 1440, y: 300, w: 200, h: 22 },
  { x: 1720, y: 370, w: 180, h: 22 },
  { x: 2000, y: 320, w: 220, h: 22 },
];

/** Embers to collect: ground-level ones plus one above every platform. */
const EMBERS: Array<[number, number]> = [
  [520, 380],
  [640, 330],
  [900, 270],
  [1180, 320],
  [1440, 240],
  [1720, 310],
  [2000, 260],
  [2260, 400],
];

/** Hills and a low sun, purely visual; they give the camera something to pan across. */
const SCENERY: Box[] = [
  { x: 300, y: 360, w: 520, h: 200 },
  { x: 1150, y: 320, w: 700, h: 240 },
  { x: 2000, y: 380, w: 620, h: 180 },
];

export function createGame(): Game {
  return defineGame({
    id: "ember-runner",
    title: "Ember Runner",
    viewport: VIEWPORT,
    start: "level",
    scenes: { level: () => buildLevel() },
    systems: runnerSystems(),
    seed: 20261027,
  });
}

/** One fresh level: a ground plane, platforms, embers, a player and the HUD. */
function buildLevel(): Scene {
  const scene = new Scene({
    name: "level",
    viewport: VIEWPORT,
    background: Colors.ink,
    gravity: vec2(0, 1900),
    camera: {
      position: vec2(VIEWPORT.width / 2, VIEWPORT.height / 2),
      zoom: 1,
      smoothing: 0.18,
      bounds: { x: 0, y: 0, w: WORLD_WIDTH, h: VIEWPORT.height },
      follow: null,
    },
  });

  addScenery(scene);
  addSolid(scene, { x: WORLD_WIDTH / 2, y: GROUND_TOP + 35, w: WORLD_WIDTH, h: 70 }, Colors.slateLight);

  // Walls keep the player inside the level without being visible.
  addSolid(scene, { x: -20, y: GROUND_TOP / 2, w: 40, h: GROUND_TOP + 200 }, Colors.ink, false);
  addSolid(
    scene,
    { x: WORLD_WIDTH + 20, y: GROUND_TOP / 2, w: 40, h: GROUND_TOP + 200 },
    Colors.ink,
    false,
  );

  for (const platform of PLATFORMS) {
    addSolid(scene, platform, Colors.slateLight);
  }

  const player = addPlayer(scene);
  scene.resources.camera.follow = player;

  const coinBase: Record<string, number> = {};
  for (const [x, y] of EMBERS) {
    const ember = addEmber(scene, x, y);
    coinBase[String(ember)] = y;
  }

  scene.metadata = {
    ...scene.metadata,
    totalEmbers: EMBERS.length,
    coinBase,
    worldWidth: WORLD_WIDTH,
    groundTop: GROUND_TOP,
  };

  addText(scene, HUD_TAG, { text: "", size: 18, color: Colors.gold, layer: 1000 });
  addText(scene, HINT_TAG, {
    text: "← → move   ·   SPACE jump",
    size: 13,
    color: Colors.grey,
    layer: 1000,
  });

  return scene;
}

function addScenery(scene: Scene): void {
  for (const [index, hill] of SCENERY.entries()) {
    const entity = scene.createEntity({
      name: `Hill ${index + 1}`,
      position: vec2(hill.x, hill.y),
    });
    scene.world.add(entity, RectShape, {
      width: hill.w,
      height: hill.h,
      color: index % 2 === 0 ? Colors.slate : "#151b28",
      layer: -50,
      filled: true,
      alpha: 0.9,
    });
  }

  const sun = scene.createEntity({ name: "Sun", position: vec2(2050, 130) });
  scene.world.add(sun, CircleShape, {
    radius: 64,
    color: Colors.gold,
    layer: -45,
    filled: true,
    alpha: 0.14,
  });
}

/** Visible, solid body. `visible: false` gives an invisible wall. */
function addSolid(scene: Scene, box: Box, color: string, visible = true): Entity {
  const entity = scene.createEntity({ name: "Solid", position: vec2(box.x, box.y) });
  if (visible) {
    scene.world.add(entity, RectShape, {
      width: box.w,
      height: box.h,
      color,
      layer: 0,
      filled: true,
    });
  }
  scene.world.add(entity, BoxCollider, {
    width: box.w,
    height: box.h,
    offset: vec2(0, 0),
    solid: true,
    trigger: false,
    enabled: true,
  });
  scene.world.add(entity, RigidBody, { type: "static", gravityScale: 0, maxSpeed: 0 });
  return entity;
}

function addPlayer(scene: Scene): Entity {
  const player = scene.createEntity({
    name: "Player",
    position: vec2(TUNING.startX, TUNING.startY),
  });
  scene.world.add(player, RectShape, {
    width: 34,
    height: 34,
    color: Colors.ember,
    layer: 10,
    filled: true,
  });
  scene.world.add(player, BoxCollider, {
    width: 34,
    height: 34,
    offset: vec2(0, 0),
    solid: true,
    trigger: false,
    enabled: true,
  });
  scene.world.add(player, RigidBody, {
    type: "dynamic",
    gravityScale: 1,
    friction: 0.2,
    maxSpeed: 1600,
    restitution: 0,
  });
  scene.world.add(player, Velocity, { x: 0, y: 0, angular: 0 });
  scene.world.add(player, Tag, { value: PLAYER_TAG });
  return player;
}

function addEmber(scene: Scene, x: number, y: number): Entity {
  const ember = scene.createEntity({ name: "Ember", position: vec2(x, y) });
  scene.world.add(ember, CircleShape, {
    radius: 9,
    color: Colors.gold,
    layer: 5,
    filled: true,
  });
  scene.world.add(ember, BoxCollider, {
    width: 22,
    height: 22,
    offset: vec2(0, 0),
    solid: true,
    trigger: true,
    enabled: true,
  });
  scene.world.add(ember, Tag, { value: EMBER_TAG });
  return ember;
}

/** HUD text; the HUD system moves it to the top-left of the visible area every step. */
function addText(
  scene: Scene,
  tag: string,
  options: { text: string; size: number; color: string; layer: number },
): Entity {
  const entity = scene.createEntity({ name: tag, position: vec2(0, 0) });
  scene.world.add(entity, TextLabel, {
    text: options.text,
    size: options.size,
    color: options.color,
    align: "left",
    baseline: "top",
    layer: options.layer,
    alpha: 1,
  });
  scene.world.add(entity, Tag, { value: tag });
  return entity;
}
