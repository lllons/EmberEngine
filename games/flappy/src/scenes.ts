/**
 * games/flappy — scene authoring.
 *
 * Owner: this file owns the example's two scenes as code: the title card and the play
 * field. The engine's game loader uses `buildScenes()` when a game folder has no scene
 * files, so the example runs from source with nothing baked beside it.
 */

import { rect, RectShape, type Scene, Scene as SceneClass, Sprite, Theme, vec2 } from "@ember/core";
import { createBird, createGround, createText, createTitleTrigger } from "./entities.ts";
import { BIRD_X, BIRD_Y, GROUND_TOP, PLAY_SCENE, TITLE_SCENE, VIEWPORT } from "./names.ts";

/** Backdrop silhouettes: light structure behind the play field, never collidable. */
function addSkyline(scene: Scene): void {
  const bands = [
    { x: 40, w: 90, h: 150, color: Theme.panelDeep },
    { x: 150, w: 70, h: 220, color: Theme.panel },
    { x: 240, w: 110, h: 120, color: Theme.header },
    { x: 370, w: 80, h: 190, color: Theme.panel },
  ];
  for (const band of bands) {
    const entity = scene.createEntity({ name: "skyline", position: vec2(band.x, GROUND_TOP - band.h / 2) });
    scene.world.add(entity, RectShape, {
      width: band.w,
      height: band.h,
      color: band.color,
      layer: -20,
      filled: true,
      alpha: 1,
    });
  }
}

/** The title card: name, one instruction, best score. */
export function buildTitleScene(): Scene {
  const scene = new SceneClass({
    name: TITLE_SCENE,
    gravity: vec2(0, 0),
    background: Theme.background,
    viewport: VIEWPORT,
    camera: {
      position: vec2(VIEWPORT.width / 2, VIEWPORT.height / 2),
      zoom: 1,
      smoothing: 0,
      bounds: rect(0, 0, VIEWPORT.width, VIEWPORT.height),
    },
    metadata: { title: "Flappy Ember — title" },
  });

  createText(scene, "title", VIEWPORT.width / 2, 220, "FLAPPY", { size: 68, color: Theme.highlight });
  createText(scene, "title-accent", VIEWPORT.width / 2, 285, "EMBER", { size: 44, color: Theme.accent });
  createText(scene, "subtitle", VIEWPORT.width / 2, 345, "one button · endless pipes", {
    size: 15,
    color: Theme.muted,
  });

  const bird = scene.createEntity({ name: "title-bird", position: vec2(VIEWPORT.width / 2, 425) });
  scene.world.add(bird, Sprite, { texture: "bird", width: 68, height: 52, layer: 20 });

  createText(scene, "start", VIEWPORT.width / 2, 520, "SPACE / CLICK to flap", {
    size: 19,
    color: Theme.accent,
  });
  createText(scene, "best", VIEWPORT.width / 2, 570, "BEST 0", { size: 13, color: Theme.muted });
  createTitleTrigger(scene, VIEWPORT.width / 2, VIEWPORT.height / 2, PLAY_SCENE);
  return scene;
}

/** The play field: ground, bird, HUD and the game-over card. Pipes are spawned. */
export function buildPlayScene(): Scene {
  const scene = new SceneClass({
    name: PLAY_SCENE,
    gravity: vec2(0, 1250),
    background: Theme.background,
    viewport: VIEWPORT,
    camera: {
      position: vec2(VIEWPORT.width / 2, VIEWPORT.height / 2),
      zoom: 1,
      smoothing: 0,
      bounds: rect(0, 0, VIEWPORT.width, VIEWPORT.height),
    },
    metadata: { title: "Flappy Ember — play", groundTop: GROUND_TOP },
  });

  addSkyline(scene);
  createGround(scene, VIEWPORT.width / 2, 700, VIEWPORT.width, 80);
  createBird(scene, BIRD_X, BIRD_Y);

  createText(scene, "score", VIEWPORT.width / 2, 72, "0", { size: 46, color: Theme.highlight });
  createText(scene, "best", VIEWPORT.width / 2, 110, "BEST 0", { size: 12, color: Theme.muted });
  createText(scene, "hint", VIEWPORT.width / 2, 620, "SPACE / CLICK to flap", {
    size: 12,
    color: Theme.faint,
  });

  createText(scene, "overlay", VIEWPORT.width / 2, 300, "GAME OVER", {
    size: 38,
    color: Theme.accent,
    alpha: 0,
  });
  createText(scene, "overlay-detail", VIEWPORT.width / 2, 350, "", {
    size: 16,
    color: Theme.text,
    alpha: 0,
  });
  createText(scene, "overlay-prompt", VIEWPORT.width / 2, 390, "", {
    size: 12,
    color: Theme.muted,
    alpha: 0,
  });

  return scene;
}

/** Both scenes, fresh instances each call. */
export function buildScenes(): Map<string, Scene> {
  const scenes = new Map<string, Scene>();
  scenes.set(TITLE_SCENE, buildTitleScene());
  scenes.set(PLAY_SCENE, buildPlayScene());
  return scenes;
}

export function sceneNames(): string[] {
  return [TITLE_SCENE, PLAY_SCENE];
}
