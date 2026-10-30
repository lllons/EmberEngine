/**
 * @ember/editor/examples — the empty start and the built-in example projects.
 */

import { assert, assertEquals } from "@std/assert";
import { pathToFileURL } from "node:url";
import { Script, Transform } from "@ember/core";
import {
  create3DGame,
  createEmptyGame,
  createScriptingGame,
  editorFactorySource,
  editorGameModuleSource,
  EDITOR_EXAMPLES,
  findExample,
} from "@ember/editor";
import { buildFrame } from "@ember/render3d";
import { RuntimeSession } from "@ember/runtime";

Deno.test("editor empty project has one blank scene", () => {
  const game = createEmptyGame();
  assertEquals(game.sceneNames(), ["untitled"]);
  assertEquals(game.createScene("untitled").world.entityCount, 0);
});

Deno.test("editor examples all open a real scene", () => {
  assert(EDITOR_EXAMPLES.length >= 3, "scripting, 3D and runner examples");
  for (const example of EDITOR_EXAMPLES) {
    const game = example.createGame();
    assert(game.hasScene(example.startScene), `${example.id} opens ${example.startScene}`);
    assert(game.sceneNames().length > 0, `${example.id} has scenes`);
  }
});

Deno.test("scripting example carries an inline script that runs", () => {
  const game = createScriptingGame();
  const scene = game.createScene("scripting-playground");
  const scripts = scene.world.query(Script);
  const inline = scripts.find((entity) => {
    const script = scene.world.get(entity, Script);
    return script !== undefined && script.source.trim().length > 0;
  });
  assert(inline !== undefined, "inline script entity exists");
  const before = scene.world.require(inline, Transform).rotation;
  const session = new RuntimeSession({
    scene,
    systems: game.systems(),
    fixedDt: 1 / 60,
  });
  session.step(1 / 60);
  session.step(1 / 60);
  assert(scene.world.require(inline, Transform).rotation > before, "inline script rotated the entity");
});

Deno.test("flappy example opens the real game, not a copy", () => {
  const example = findExample("flappy-ember");
  assert(example !== undefined, "the Examples menu offers Flappy Ember");
  assertEquals(example.startScene, "title");
  const game = example.createGame();
  assertEquals(game.sceneNames(), ["title", "play"]);
  const systems = game.systems().map((system) => system.name);
  assert(systems.includes("flappy.pipes"), `pipe spawner is registered (${systems.join(", ")})`);
  assert(game.scripts().names().includes("flappy.bird"), "the bird behaviour is registered");
  assert(game.hasScene("play"), "the run scene comes with it");
});

Deno.test("examples with textured sprites export through modules that have them", async () => {
  for (const id of ["ember-runner", "flappy-ember"]) {
    const example = findExample(id);
    assert(example !== undefined, `${id} is an example`);
    const textures = example.factory.textureExportName;
    assert(textures !== undefined, `${id} re-exports its textures`);
    const module = await import(example.factory.moduleUrl) as Record<string, unknown>;
    assertEquals(typeof module[example.factory.exportName], "function", `${id} exports its factory`);
    assertEquals(typeof module[textures], "object", `${id} exports its textures`);
  }
});

Deno.test("the generated export module carries the factory and the textures", async () => {
  const example = findExample("flappy-ember")!;
  const directory = "build/tmp/editor-example-module";
  await Deno.mkdir(directory, { recursive: true });
  const path = `${directory}/flappy-game.ts`;
  try {
    await Deno.writeTextFile(path, editorGameModuleSource(example.factory));
    const module = await import(pathToFileURL(path).href) as Record<string, unknown>;
    assertEquals(typeof module.createGame, "function");
    // The packager decides whether to ship textures by asking exactly this question.
    assert("textureSources" in module, "the packager finds the game's textures");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("a project without textures gets a module without them", () => {
  const source = editorGameModuleSource(editorFactorySource("createEmptyGame"));
  assert(!source.includes("textureSources"), "no texture re-export is invented");
  assert(source.includes("createGame"), "the factory is re-exported as createGame");
});

Deno.test("3D example emits triangle commands", () => {
  const game = create3DGame();
  const scene = game.createScene("3d-showcase");
  const frame = buildFrame(scene);
  assert(
    frame.commands.some((command) => command.kind === "triangle"),
    "mesh commands are present",
  );
});
