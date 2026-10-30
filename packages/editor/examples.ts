/**
 * @ember/editor/examples — the editor's starting project and built-in examples.
 *
 * A fresh editor is intentionally empty: one scene, no entities, and a small library of
 * editor scripts. Examples are complete `Game` instances opened from the Examples menu;
 * they never leak into the empty project unless the user saves a scene.
 *
 * The menu offers the scripting playground, the 3D showcase and the two shipped games
 * (Ember Runner and Flappy Ember), each of which opens as an editable project whose scenes
 * are written under `examples/<id>/scenes`.
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
import type { TextureSources } from "@ember/assets";
import { Game, numberProp, ScriptRegistry, type ScriptBehaviour } from "@ember/runtime";
import {
  createGame as createRunnerGame,
  textureSources as runnerTextures,
} from "../../games/ember-runner/src/main.ts";
import {
  createGame as createFlappyGame,
  textureSources as flappyTextures,
} from "../../games/flappy/src/main.ts";

/** Absolute URL of this module, so generated exporters can import the factories by URL. */
export const EXAMPLES_MODULE_URL = import.meta.url;

/** The runner game's own module, used when the runner example is exported. */
export const RUNNER_MODULE_URL = new URL("../../games/ember-runner/src/main.ts", import.meta.url)
  .href;

/** The Flappy game's own module, used when the Flappy example is exported. */
export const FLAPPY_MODULE_URL = new URL("../../games/flappy/src/main.ts", import.meta.url).href;

/**
 * Scenes to build a game from. The editor passes the scenes it has loaded; when they are
 * omitted (tests, `EmberEngine.exe` opening an example directly) the example's own scene
 * code is used.
 */
export interface EditorGameOptions {
  scenes?: Map<string, Scene>;
  start?: string;
}

/** Where an exported project re-exports its game factory from. */
export interface EditorFactorySource {
  /** Module holding the factory (a `file:` URL). */
  moduleUrl: string;
  /** Name the factory is exported under in that module. */
  exportName: string;
  /**
   * Name of the module's procedural texture export (`textureSources`), when it has one.
   * A game with textures exported through the editor's generated module needs them: without
   * the re-export the packager finds no textures and every sprite falls back to a placeholder.
   */
  textureExportName?: string;
}

/** The factory source for a project that only exists inside the editor. */
export function editorFactorySource(exportName: string): EditorFactorySource {
  return { moduleUrl: EXAMPLES_MODULE_URL, exportName };
}

export interface EditorExample {
  id: string;
  title: string;
  description: string;
  /** Scene the example opens in. */
  startScene: string;
  createGame(options?: EditorGameOptions): Game;
  /** Module an exported copy of this example re-exports its game factory from. */
  factory: EditorFactorySource;
  /**
   * Procedural textures the example's sprites are drawn with. The editor rasterises them
   * (`@ember/assets` + the software canvas factory), so the viewport shows the game's real
   * artwork instead of placeholder boxes. Examples without textures draw plain shapes.
   */
  textures?: TextureSources;
}

/**
 * Scene sources for a game built from the editor's loaded scenes, or from the example's own
 * scene code when none were handed in. Every scene is wrapped in a factory so two sessions
 * of the same game never share one instance.
 */
function sceneSources(
  scenes: Map<string, Scene> | undefined,
  fallback: Record<string, Scene>,
): Record<string, () => Scene> {
  const entries: Array<[string, Scene]> = scenes && scenes.size > 0
    ? [...scenes]
    : Object.entries(fallback);
  const sources: Record<string, () => Scene> = {};
  for (const [name, scene] of entries) sources[name] = () => scene.clone();
  return sources;
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

function blankGame(title: string, scene: Scene, options: EditorGameOptions = {}): Game {
  const scenes = sceneSources(options.scenes, { [scene.name]: scene });
  return new Game({
    id: "untitled",
    title,
    version: "0.1.0",
    scenes,
    start: options.start && scenes[options.start] ? options.start : Object.keys(scenes)[0],
    scripts: createEditorScripts(),
    seed: title,
  });
}

export function createEmptyGame(options: EditorGameOptions = {}): Game {
  return blankGame("Untitled Project", createEmptyScene(), options);
}

/** A 2D + 3D scene showing inline scripts, registered scripts and mesh rendering. */
export function createScriptingGame(options: EditorGameOptions = {}): Game {
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
    scenes: sceneSources(options.scenes, { [scene.name]: scene }),
    start: options.start ?? scene.name,
    scripts: createEditorScripts(),
    seed: "scripting-playground",
  });
}

/** A scene with several meshes and a movable 3D camera. */
export function create3DGame(options: EditorGameOptions = {}): Game {
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
    scenes: sceneSources(options.scenes, { [scene.name]: scene }),
    start: options.start ?? scene.name,
    scripts: createEditorScripts(),
    seed: "3d-showcase",
  });
}

/** The shipped platformer, opened as a full example project. */
export function createRunnerExampleGame(options: EditorGameOptions = {}): Game {
  return createRunnerGame({ scenes: options.scenes, start: options.start ?? "title" });
}

/** The shipped one-button arcade game, opened as a full example project. */
export function createFlappyExampleGame(options: EditorGameOptions = {}): Game {
  return createFlappyGame({ scenes: options.scenes, start: options.start ?? "title" });
}

export const EDITOR_EXAMPLES: readonly EditorExample[] = [
  {
    id: "scripting-playground",
    title: "Scripting Playground",
    description: "2D shapes + a 3D cube, inline JavaScript and registered behaviours",
    startScene: "scripting-playground",
    createGame: createScriptingGame,
    factory: editorFactorySource("createScriptingGame"),
  },
  {
    id: "3d-showcase",
    title: "3D Showcase",
    description: "Five meshes, painter-sorted triangles and a 3D camera",
    startScene: "3d-showcase",
    createGame: create3DGame,
    factory: editorFactorySource("create3DGame"),
  },
  {
    id: "ember-runner",
    title: "Ember Runner",
    description: "The complete 2D platformer: scenes, scripts, systems and services",
    startScene: "title",
    createGame: createRunnerExampleGame,
    textures: runnerTextures,
    // The runner keeps its own module: exporting it must ship the real game, not a shim.
    factory: {
      moduleUrl: RUNNER_MODULE_URL,
      exportName: "createGame",
      textureExportName: "textureSources",
    },
  },
  {
    id: "flappy-ember",
    title: "Flappy Ember",
    description: "One-button arcade: texture sprites, a score trigger and a pipe spawner",
    startScene: "title",
    createGame: createFlappyExampleGame,
    textures: flappyTextures,
    // Like the runner, Flappy ships its own module, and its sprites need its textures.
    factory: {
      moduleUrl: FLAPPY_MODULE_URL,
      exportName: "createGame",
      textureExportName: "textureSources",
    },
  },
];

/** The factory source of the empty project the editor opens on a fresh launch. */
export const EMPTY_PROJECT_FACTORY: EditorFactorySource = editorFactorySource("createEmptyGame");

// ---------------------------------------------------------------------------
// Example assets helpers (used by the editor menu and tests)
// ---------------------------------------------------------------------------

export function findExample(id: string): EditorExample | undefined {
  return EDITOR_EXAMPLES.find((example) => example.id === id);
}
