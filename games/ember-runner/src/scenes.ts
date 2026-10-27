/**
 * games/ember-runner — scene authoring.
 *
 * Owner: this file owns the game's levels *as code*. Two things use it:
 * - the exported game and headless runs, when no scene files are present;
 * - `ember scenes --write`, which bakes these into `games/ember-runner/scenes/*.emberscene`
 *   so the editor can open, edit and re-save them.
 *
 * Once baked, scene files are the source of truth: the editor loads them and the exporter
 * bundles what is on disk. Regenerating keeps the code path and the files in sync.
 */

import { Colors, rect, type Scene, Scene as SceneClass, type Size, Tag, Theme, vec2 } from "@ember/core";
import {
  createBackdrop,
  createEmber,
  createGate,
  createGround,
  createHazard,
  createHudLine,
  createPlayer,
  createText,
  createTitleTrigger,
  OVERLAY_BOTTOM,
} from "./entities.ts";
import { LEVEL_ONE, LEVEL_TWO, TITLE_SCENE } from "./names.ts";

export { LEVEL_ONE, LEVEL_TWO, START_SCENE, TITLE_SCENE } from "./names.ts";

export const GAME_ID = "ember-runner";
export const GAME_TITLE = "Ember Runner";
export const GAME_VERSION = "0.1.0";

export const VIEWPORT: Size = { width: 960, height: 540 };

/** Level geometry, shared between the scene builders, the tools and the tests. */
export interface LevelSpec {
  name: string;
  title: string;
  /** Level size in world units. */
  width: number;
  height: number;
  /** Y of the ground strip's centre line. */
  groundY: number;
  /** Solid platforms: [x, y, width, height] around the platform's centre. */
  platforms: Array<[number, number, number, number]>;
  /** Ember (coin) positions. */
  embers: Array<[number, number]>;
  /** Hazards: [x, y, patrolHalfWidth]. */
  hazards: Array<[number, number, number]>;
  /** Gate position. */
  gate: [number, number];
  /** Seconds the level allows before the run is lost. */
  timeLimit: number;
}

export const LEVEL_SPECS: LevelSpec[] = [
  {
    name: LEVEL_ONE,
    title: "Ember Runner — Ashes",
    width: 2400,
    height: 540,
    groundY: 500,
    platforms: [
      [220, 380, 220, 24],
      [540, 320, 200, 24],
      [880, 250, 220, 24],
      [1260, 320, 240, 24],
      [1620, 250, 220, 24],
      [1980, 330, 200, 24],
    ],
    embers: [
      [300, 340],
      [620, 280],
      [960, 210],
      [1360, 280],
      [1700, 210],
      [2050, 290],
      [1200, 430],
      [760, 430],
    ],
    hazards: [[520, 440, 60], [1080, 440, 80], [1560, 440, 70], [1900, 440, 90]],
    gate: [2270, 430],
    timeLimit: 90,
  },
  {
    name: LEVEL_TWO,
    title: "Ember Runner — Inferno",
    width: 3000,
    height: 540,
    groundY: 510,
    platforms: [
      [260, 390, 180, 24],
      [560, 320, 160, 24],
      [860, 250, 180, 24],
      [1180, 320, 200, 24],
      [1520, 260, 160, 24],
      [1840, 320, 220, 24],
      [2180, 250, 180, 24],
      [2500, 340, 200, 24],
    ],
    embers: [
      [320, 350],
      [620, 280],
      [930, 210],
      [1260, 280],
      [1580, 220],
      [1940, 280],
      [2250, 210],
      [2560, 300],
      [1400, 440],
      [2100, 440],
    ],
    hazards: [
      [480, 450, 70],
      [1020, 450, 90],
      [1440, 450, 80],
      [1760, 450, 100],
      [2320, 450, 80],
      [2700, 450, 90],
    ],
    gate: [2860, 440],
    timeLimit: 120,
  },
];

export function levelSpec(name: string): LevelSpec | undefined {
  return LEVEL_SPECS.find((spec) => spec.name === name);
}

/** Parallax bands behind the level so camera movement is readable. */
function addBackdrop(scene: Scene, spec: LevelSpec): number {
  const bands = [
    { color: Theme.panelDeep, y: 120, h: 240, step: 480 },
    { color: Theme.panel, y: 210, h: 180, step: 620 },
    { color: Theme.header, y: 320, h: 200, step: 760 },
  ];
  let created = 0;
  for (const [index, band] of bands.entries()) {
    for (let x = band.step / 2; x < spec.width; x += band.step) {
      createBackdrop(scene, x, band.y, band.step * 0.8, band.h, band.color, -20 + index);
      created++;
    }
  }
  return created;
}

/** Builds one level from its spec: ground, platforms, embers, hazards, gate and HUD. */
export function buildLevelScene(spec: LevelSpec): Scene {
  const scene = new SceneClass({
    name: spec.name,
    gravity: vec2(0, 1900),
    background: Colors.ink,
    viewport: VIEWPORT,
    camera: {
      position: vec2(VIEWPORT.width / 2, spec.groundY - 120),
      zoom: 1,
      smoothing: 0.14,
      bounds: rect(0, 0, spec.width, spec.height),
    },
    metadata: { title: spec.title, levelWidth: spec.width, timeLimit: spec.timeLimit },
  });

  addBackdrop(scene, spec);

  // Ground: a single long strip plus a solid wall at each end so the runner cannot leave.
  createGround(scene, spec.width / 2, spec.groundY, spec.width, 80);
  createGround(scene, 20, spec.groundY - 200, 40, 400, { texture: false });
  createGround(scene, spec.width - 20, spec.groundY - 200, 40, 400, { texture: false });

  for (const [x, y, w, h] of spec.platforms) createGround(scene, x, y, w, h);
  for (const [x, y] of spec.embers) createEmber(scene, x, y);
  for (const [x, y, patrol] of spec.hazards) {
    createHazard(scene, x, y, { patrol, speed: 80, direction: 1 });
  }
  createGate(scene, spec.gate[0], spec.gate[1]);

  const player = createPlayer(scene, 90, spec.groundY - 120);
  scene.resources.camera.follow = player;

  createHudLine(scene, "hud", VIEWPORT.width / 2, 28, "score 0", {
    size: 20,
    align: "center",
    color: Colors.gold,
  });
  const controls = createText(
    scene,
    "controls",
    VIEWPORT.width / 2,
    VIEWPORT.height - 22,
    "←/→ or A/D move · ↑/space jump · R restart",
    { size: 14, color: Colors.grey, layer: 1000 },
  );
  scene.world.add(controls, Tag, { value: OVERLAY_BOTTOM });

  return scene;
}

/** The title screen: frozen camera, instructions and a start trigger. */
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
      bounds: null,
    },
    metadata: { title: GAME_TITLE },
  });

  createBackdrop(scene, VIEWPORT.width / 2, 246, 620, 392, Theme.header, -10);
  createText(scene, "title", VIEWPORT.width / 2, 170, "EMBER RUNNER", {
    size: 54,
    color: Colors.ember,
    layer: 20,
  });
  createText(scene, "subtitle", VIEWPORT.width / 2, 230, "a tiny 2D platformer built with EmberEngine", {
    size: 18,
    color: Colors.grey,
    layer: 20,
  });
  createText(scene, "howto", VIEWPORT.width / 2, 320, "collect the embers · reach the gate · avoid the spikes", {
    size: 20,
    color: Colors.gold,
    layer: 20,
  });
  createText(scene, "start", VIEWPORT.width / 2, 400, "press ENTER (or click) to run", {
    size: 22,
    color: Colors.white,
    layer: 20,
  });
  createTitleTrigger(scene, VIEWPORT.width / 2, 400, LEVEL_ONE);
  return scene;
}

/** Every scene the game ships, fresh instances each call. */
export function buildScenes(): Map<string, Scene> {
  const scenes = new Map<string, Scene>();
  scenes.set(TITLE_SCENE, buildTitleScene());
  for (const spec of LEVEL_SPECS) scenes.set(spec.name, buildLevelScene(spec));
  return scenes;
}

/** Scene names the game ships, in the order the title screen presents them. */
export function sceneNames(): string[] {
  return [TITLE_SCENE, ...LEVEL_SPECS.map((spec) => spec.name)];
}

/** File name a baked scene uses on disk (`level-1` -> `level-1.emberscene`). */
export function sceneFileName(name: string): string {
  return `${name}.emberscene`;
}
