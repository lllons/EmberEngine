/**
 * `EmberEngine.exe` — the standalone native editor.
 *
 * The compiled binary embeds the sample game (Ember Runner) so it starts with real scenes,
 * loads any authored `scenes/*.emberscene` files next to the project, and saves edits there.
 * No browser, server or webview is involved.
 *
 * Usage:
 *   EmberEngine.exe                         open the built-in project
 *   EmberEngine.exe --game <dir>            open another game (source runs only)
 *   EmberEngine.exe --scenes <dir>          choose where authored scenes live
 *   EmberEngine.exe --debug                 keep the console window visible
 */

import { dirname, isAbsolute, join } from "node:path";
import { listGameSceneFiles, loadGame } from "@ember/gameloader";
import { createGame } from "../../games/ember-runner/src/main.ts";
import { runNativeEditor } from "./native/app.ts";

interface LaunchArgs {
  game?: string;
  scenes?: string;
  debug: boolean;
}

function parseArgs(argv: readonly string[]): LaunchArgs {
  const args: LaunchArgs = { debug: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--debug") {
      args.debug = true;
      continue;
    }
    if (arg === "--game" || arg.startsWith("--game=")) {
      args.game = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[++index];
      continue;
    }
    if (arg === "--scenes" || arg.startsWith("--scenes=")) {
      args.scenes = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[++index];
    }
  }
  return args;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isFile;
  } catch {
    return false;
  }
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : join(Deno.cwd(), path);
}

/** Authored scenes live with the sample game when run from the repo, else beside the exe. */
async function defaultSceneDirectory(): Promise<string> {
  const cwd = Deno.cwd();
  if (await isFile(join(cwd, "games", "ember-runner", "game.json"))) {
    return join(cwd, "games", "ember-runner", "scenes");
  }
  return join(dirname(Deno.execPath()), "scenes");
}

async function launch(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  try {
    Deno.env.set("EMBER_DEBUG", args.debug ? "1" : "0");
  } catch {
    // Env permission is optional; the console is simply left as-is.
  }

  if (args.game) {
    const loaded = await loadGame(resolvePath(args.game));
    const files = await listGameSceneFiles(loaded.descriptor);
    await runNativeEditor({
      game: loaded.game,
      sceneDirectory: loaded.descriptor.scenesDirectory,
      title: loaded.descriptor.title,
      savedScenes: files.map((file) => file.name),
    });
    return;
  }

  await runNativeEditor({
    game: createGame(),
    sceneDirectory: args.scenes ? resolvePath(args.scenes) : await defaultSceneDirectory(),
    title: "Ember Runner",
  });
}

if (import.meta.main) {
  try {
    await launch(Deno.args);
    Deno.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    try {
      await Deno.writeTextFile(join(Deno.cwd(), "ember-editor-error.log"), message);
    } catch {
      // Nothing else to do if even the log cannot be written.
    }
    Deno.exit(1);
  }
}
