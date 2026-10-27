/**
 * @ember/editor/examples — the editor's starting project and built-in examples.
 *
 * A fresh editor is intentionally empty: one scene, no entities, and a small library of
 * editor scripts. Examples are complete `Game` instances opened from the Examples menu;
 * they never leak into the empty project unless the user saves a scene.
 */

import {
  CircleShape,
  Colors,
  MeshRenderer,
  Name,
  RectShape,
  Scene,
  Script,
  Theme,
  Transform,
  Transform3D,
  TextLabel,
  vec2,
  vec3,
} from "@ember/core";
import { Game, numberProp, ScriptRegistry, type ScriptBehaviour } from "@ember/runtime";
import { createGame as createRunnerGame } from "../../games/ember-runner/src/main.ts";

export interface EditorExample {
  id: string;
  title: string;
  description: string;
  /** Scene the example opens in. */
  startScene: string;
  createGame(): Game;
}

const VIEWPORT = { width: 960, height: 540 };

/** A blank scene with a usable 2D camera and default 3D camera. */
export function createEmptyScene(name = "untitled"): Scene {
  return new Scene({
    name,
    background: Colors.ink,
    viewport: { ...VIEWPORT },
    camera: {
      position: vec2(VIEWPORT.width / 2, VIEWPORT.height / 2),
      zoom: 1,
      smoothing: 0,
      bounds: null,
    },
    camera3d: {
      position: vec3(0, 130, 560),
      target: vec3(0, 0, 0),
      fov: Math.PI / 3,
    },
  });
}

/** Built-in behaviours available by name in every empty/editor project. */
export function createEditorScripts(): ScriptRegistry {
  const registry = new ScriptRegistry();

  registry.override("editor.spin", (props): ScriptBehaviour => {
    const speed = numberProp(props, "radiansPerSecond", 1.2);
    return {
      update(ctx) {
        const transform = ctx.scene.world.get(ctx.entity, Transform);
        if (transform) transform.rotation += speed * ctx.dt;
      },
    };
  });

  registry.override("editor.bob", (props): ScriptBehaviour => {
    const amplitude = numberProp(props, "amplitude", 16);
    const speed = numberProp(props, "speed", 2);
    let baseY: number | null = null;
    return {
      start(ctx) {
        baseY = ctx.scene.world.get(ctx.entity, Transform)?.position.y ?? null;
      },
      update(ctx) {
        const transform = ctx.scene.world.get(ctx.entity, Transform);
        if (transform && baseY !== null) {
          transform.position.y = baseY + Math.sin(ctx.time * speed) * amplitude;
        }
      },
    };
  });

  registry.override("editor.orbit", (props): ScriptBehaviour => {
    const radius = numberProp(props, "radius", 80);
    const speed = numberProp(props, "speed", 0.8);
    let centerX = 0;
    let centerY = 0;
    return {
      start(ctx) {
        const transform = ctx.scene.world.get(ctx.entity, Transform);
        centerX = (transform?.position.x ?? 0) - radius;
        centerY = transform?.position.y ?? 0;
      },
      update(ctx) {
        const transform = ctx.scene.world.get(ctx.entity, Transform);
        if (!transform) return;
        const angle = ctx.time * speed;
        transform.position.x = centerX + Math.cos(angle) * radius;
        transform.position.y = centerY + Math.sin(angle) * radius;
      },
    };
  });

  registry.override("editor.spin3d", (props): ScriptBehaviour => {
    const speed = numberProp(props, "radiansPerSecond", 0.8);
    return {
      update(ctx) {
        const transform = ctx.scene.world.get(ctx.entity, Transform3D);
        if (!transform) return;
        transform.rotation.y += speed * ctx.dt;
        transform.rotation.x += speed * 0.35 * ctx.dt;
      },
    };
  });

  return registry;
}

function blankGame(title: string, scene: Scene): Game {
  return new Game({
    id: "untitled",
    title,
    version: "0.1.0",
    scenes: { [scene.name]: () => scene.clone() },
    start: scene.name,
    scripts: createEditorScripts(),
    seed: title,
  });
}

export function createEmptyGame(): Game {
  return blankGame("Untitled Project", createEmptyScene());
}

/** A 2D + 3D scene showing inline scripts, registered scripts and mesh rendering. */
export function createScriptingGame(): Game {
  const scene = new Scene({
    name: "scripting-playground",
    background: Theme.background,
    viewport: { ...VIEWPORT },
    camera: {
      position: vec2(VIEWPORT.width / 2, VIEWPORT.height / 2),
      zoom: 1,
      smoothing: 0,
      bounds: null,
    },
    camera3d: {
      position: vec3(0, 145, 520),
      target: vec3(0, 0, 0),
      fov: Math.PI / 3,
    },
    metadata: { example: "scripting" },
  });

  // A 3D cube slowly turns behind the 2D elements.
  const cube = scene.world.spawn();
  scene.world.add(cube, Name, { value: "3D Cube" });
  scene.world.add(cube, Transform3D, {
    position: vec3(0, 0, 0),
    scale: vec3(118, 118, 118),
  });
  scene.world.add(cube, MeshRenderer, { mesh: "cube", color: Colors.sky, layer: -5 });
  scene.world.add(cube, Script, { name: "editor.spin3d", props: { radiansPerSecond: 0.55 } });

  const title = scene.createEntity({ name: "Title", position: vec2(480, 56) });
  scene.world.add(title, TextLabel, {
    text: "SCRIPTING PLAYGROUND",
    size: 25,
    color: Colors.gold,
    align: "center",
    layer: 40,
  });

  const hint = scene.createEntity({ name: "Hint", position: vec2(480, 92) });
  scene.world.add(hint, TextLabel, {
    text: "select the square or circle · edit the Script component · Play",
    size: 13,
    color: Colors.grey,
    align: "center",
    layer: 40,
  });

  // Inline source: this behaviour lives in the scene file, not in a compiled game module.
  const square = scene.createEntity({ name: "Inline spinner", position: vec2(370, 335) });
  scene.world.add(square, RectShape, {
    width: 150,
    height: 96,
    color: Colors.ember,
    layer: 5,
  });
  scene.world.add(square, Script, {
    name: "inline.spin",
    props: { speed: 1.8 },
    source: `({
  update(ctx) {
    const transform = ctx.scene.world.get(ctx.entity, Transform);
    const speed = numberProp(ctx.props, "speed", 1);
    if (transform) transform.rotation += speed * ctx.dt;
  }
})`,
  });

  const circle = scene.createEntity({ name: "Orbiting dot", position: vec2(690, 335) });
  scene.world.add(circle, CircleShape, {
    radius: 28,
    color: Colors.gold,
    layer: 6,
  });
  scene.world.add(circle, Script, {
    name: "editor.orbit",
    props: { radius: 72, speed: 1.1 },
  });

  const cubeLabel = scene.createEntity({ name: "Cube label", position: vec2(480, 445) });
  scene.world.add(cubeLabel, TextLabel, {
    text: "inline JavaScript · registered behaviours · 3D mesh",
    size: 14,
    color: Colors.sky,
    align: "center",
    layer: 40,
  });

  return new Game({
    id: "scripting-playground",
    title: "Scripting Playground",
    scenes: { [scene.name]: () => scene.clone() },
    start: scene.name,
    scripts: createEditorScripts(),
    seed: "scripting-playground",
  });
}

/** A scene with several meshes and a movable 3D camera. */
export function create3DGame(): Game {
  const scene = new Scene({
    name: "3d-showcase",
    background: Theme.background,
    viewport: { ...VIEWPORT },
    camera: {
      position: vec2(480, 270),
      zoom: 1,
      smoothing: 0,
      bounds: null,
    },
    camera3d: {
      position: vec3(0, 150, 600),
      target: vec3(0, 0, 0),
      fov: Math.PI / 3,
    },
    metadata: { example: "3d" },
  });

  const title = scene.createEntity({ name: "Title", position: vec2(480, 44) });
  scene.world.add(title, TextLabel, {
    text: "3D SHOWCASE",
    size: 24,
    color: Colors.sky,
    align: "center",
    layer: 20,
  });

  const pieces: Array<[string, string, ReturnType<typeof vec3>, ReturnType<typeof vec3>, string]> = [
    ["Cube A", "cube", vec3(-120, 0, 0), vec3(110, 110, 110), Colors.ember],
    ["Cube B", "cube", vec3(0, 60, -40), vec3(80, 80, 80), Colors.gold],
    ["Cube C", "cube", vec3(125, -10, 20), vec3(100, 100, 100), Colors.sky],
    ["Pyramid", "pyramid", vec3(0, -55, 90), vec3(100, 100, 100), Colors.grass],
    ["Triangle", "triangle", vec3(150, 70, -100), vec3(75, 75, 75), Colors.hazard],
  ];
  for (const [name, mesh, position, scale, color] of pieces) {
    const entity = scene.world.spawn();
    scene.world.add(entity, Name, { value: name });
    scene.world.add(entity, Transform3D, { position, scale });
    scene.world.add(entity, MeshRenderer, { mesh, color });
  }

  const cube = scene.world.query(Transform3D)[0];
  if (cube !== undefined) {
    scene.world.add(cube, Script, { name: "editor.spin3d", props: { radiansPerSecond: 0.5 } });
  }

  return new Game({
    id: "3d-showcase",
    title: "3D Showcase",
    scenes: { [scene.name]: () => scene.clone() },
    start: scene.name,
    scripts: createEditorScripts(),
    seed: "3d-showcase",
  });
}

/** The shipped platformer, opened as a full example project. */
export function createRunnerExampleGame(): Game {
  return createRunnerGame({ start: "title" });
}

export const EDITOR_EXAMPLES: readonly EditorExample[] = [
  {
    id: "scripting-playground",
    title: "Scripting Playground",
    description: "2D shapes + a 3D cube, inline JavaScript and registered behaviours",
    startScene: "scripting-playground",
    createGame: createScriptingGame,
  },
  {
    id: "3d-showcase",
    title: "3D Showcase",
    description: "Five meshes, painter-sorted triangles and a 3D camera",
    startScene: "3d-showcase",
    createGame: create3DGame,
  },
  {
    id: "ember-runner",
    title: "Ember Runner",
    description: "The complete 2D platformer: scenes, scripts, systems and services",
    startScene: "title",
    createGame: createRunnerExampleGame,
  },
];

// ---------------------------------------------------------------------------
// Example assets helpers (used by the editor menu and tests)
// ---------------------------------------------------------------------------

export function findExample(id: string): EditorExample | undefined {
  return EDITOR_EXAMPLES.find((example) => example.id === id);
}
