/**
 * `EmberEngine.exe` — the standalone native editor.
 *
 * A fresh launch opens an empty project. Examples (scripting playground, 3D showcase,
 * Ember Runner and Flappy Ember) are available from the Examples menu; authored scenes are
 * written under `projects/untitled/scenes`. No browser, server or webview is involved.
 *
 * Usage:
 *   EmberEngine.exe                         open the empty project
 *   EmberEngine.exe --game <dir>            open another game (source runs only)
 *   EmberEngine.exe --scenes <dir>          choose where authored scenes live
 *   EmberEngine.exe --debug                 keep the console window visible
 */

import { dirname, isAbsolute, join } from "node:path";
import { listGameSceneFiles, loadGame } from "@ember/gameloader";
import { EDITOR_EXAMPLES, EMPTY_PROJECT_FACTORY, createEmptyGame } from "./examples.ts";
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

/**
 * A new project lives under `projects/untitled` in the repository, or beside the compiled
 * executable. Example scenes are written separately under `examples/<id>/scenes` so the
 * empty project stays empty across launches.
 */
async function defaultProjectDirectory(): Promise<string> {
  const cwd = Deno.cwd();
  if (await isFile(join(cwd, "games", "ember-runner", "game.json"))) {
    return join(cwd, "projects", "untitled");
  }
  return join(dirname(Deno.execPath()), "projects", "untitled");
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
      examplesRoot: join(loaded.descriptor.directory, "examples"),
      examples: EDITOR_EXAMPLES,
      title: loaded.descriptor.title,
      savedScenes: files.map((file) => file.name),
      // The opened folder exports through its own module; the editor never rewrites it.
      workspaceRoot: Deno.cwd(),
      gameModulePath: loaded.descriptor.entryPath,
      factory: EMPTY_PROJECT_FACTORY,
    });
    return;
  }

  const projectDirectory = args.scenes
    ? dirname(resolvePath(args.scenes))
    : await defaultProjectDirectory();
  await runNativeEditor({
    game: createEmptyGame(),
    sceneDirectory: args.scenes ? resolvePath(args.scenes) : join(projectDirectory, "scenes"),
    examplesRoot: join(projectDirectory, "examples"),
    examples: EDITOR_EXAMPLES,
    title: "Untitled Project",
    workspaceRoot: projectDirectory,
    factory: EMPTY_PROJECT_FACTORY,
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
