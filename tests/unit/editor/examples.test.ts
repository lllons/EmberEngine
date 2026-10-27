/**
 * @ember/editor/examples — the empty start and the built-in example projects.
 */

import { assert, assertEquals } from "@std/assert";
import { Script, Transform } from "@ember/core";
import { EDITOR_EXAMPLES, create3DGame, createEmptyGame, createScriptingGame } from "@ember/editor";
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

Deno.test("3D example emits triangle commands", () => {
  const game = create3DGame();
  const scene = game.createScene("3d-showcase");
  const frame = buildFrame(scene);
  assert(
    frame.commands.some((command) => command.kind === "triangle"),
    "mesh commands are present",
  );
});
