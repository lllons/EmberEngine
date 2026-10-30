#!/usr/bin/env -S deno run -A
/**
 * @ember/cli — the `ember` command.
 *
 * Owner: this file owns the engine's command-line surface:
 *
 *   ember info [game]                  describe a game (scenes, systems, scripts)
 *   ember scenes [game] [--write]      list (or bake) scene files
 *   ember play [game] [--headless s]   run the game (browser player or headless run)
 *   ember editor [game]                open the native editor window for a game
 *   ember studio [game]                open the browser studio editor for a game
 *   ember export [game] [--out dir|file] [--verify]
 *                                      build the .exe, optionally install it elsewhere
 *   ember test [game] [--seconds n]    headless play-through of every scene
 *
 * This file only parses arguments, prints and returns exit codes; the work is done by the
 * packages, which keeps every command testable in isolation.
 */

import { sceneToJson } from "@ember/core";
import { exportGame, placeExportedGame, resolveExportTarget, verifyExport } from "@ember/packager";
import { bundleFromJSON, headlessPlay, openInBrowser, startPlayerServer } from "@ember/player";
import {
  absolutePath,
  type GameDescriptor,
  listGameSceneFiles,
  type LoadedGame,
  loadGame,
  loadGameDescriptor,
  writeScene,
} from "@ember/gameloader";

export const DEFAULT_GAME = "games/ember-runner";

/** Re-exported so the editor and tests can talk about game folders by one type. */
export type { GameDescriptor };

export function usage(): string {
  return [
    "ember — a TypeScript 2D game engine",
    "",
    "usage: ember <command> [game] [options]",
    "",
    "commands:",
    "  info [game]                     show the game's scenes, systems and scripts",
    "  scenes [game] [--write]         list scene files, or bake them from level code",
    "  play [game] [--headless <s>]    run the game (browser player or headless run)",
    "  editor [game]                   open the native editor window",
    "  studio [game] [--port n]        open the browser studio editor",
    "  export [game] [--verify]        build dist/<game>.exe and optionally launch it",
    "  test [game] [--seconds <s>]     headless play-through of every scene",
    "",
    "options:",
    "  --game <path>   game folder (default: games/ember-runner)",
    "  --port <n>      port for the editor server",
    "  --no-open       do not open a browser",
    "  --headless <s>  simulate <s> seconds without a display",
    "  --out <path>    folder or .exe path to install the exported game into",
    "  --verify        run the exported executable after building it",
    "  --json          machine-readable output",
    "  --help          this message",
    "",
  ].join("\n");
}

export interface CliOptions {
  command: string;
  game: string;
  port?: number;
  open: boolean;
  headless: number | null;
  verify: boolean;
  /** Folder or `.exe` path the exported game is installed into (null keeps dist/). */
  out: string | null;
  json: boolean;
  write: boolean;
  seconds: number;
  help: boolean;
}

export function parseCliArgs(args: readonly string[]): CliOptions {
  const known = new Set([
    "info",
    "scenes",
    "play",
    "editor",
    "studio",
    "export",
    "test",
    "help",
  ]);
  const first = args[0];
  const options: CliOptions = {
    command: first && !first.startsWith("-") && known.has(first) ? first : "help",
    game: DEFAULT_GAME,
    open: true,
    headless: null,
    verify: false,
    out: null,
    json: false,
    write: false,
    seconds: 2,
    help: false,
  };
  const rest = options.command === "help" ? [...args] : args.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    switch (arg) {
      case "--game":
        options.game = rest[++i] ?? options.game;
        break;
      case "--port": {
        const port = Number.parseInt(rest[++i] ?? "", 10);
        if (!Number.isInteger(port)) throw new Error("--port expects a number");
        options.port = port;
        break;
      }
      case "--no-open":
        options.open = false;
        break;
      case "--headless": {
        const seconds = Number.parseFloat(rest[++i] ?? "");
        if (!Number.isFinite(seconds) || seconds <= 0) {
          throw new Error("--headless expects a positive number of seconds");
        }
        options.headless = seconds;
        break;
      }
      case "--seconds": {
        const seconds = Number.parseFloat(rest[++i] ?? "");
        if (!Number.isFinite(seconds) || seconds <= 0) {
          throw new Error("--seconds expects a positive number of seconds");
        }
        options.seconds = seconds;
        break;
      }
      case "--out":
        options.out = rest[++i] ?? null;
        if (options.out === null) throw new Error("--out expects a folder or file path");
        break;
      case "--verify":
        options.verify = true;
        break;
      case "--write":
        options.write = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        if (arg.startsWith("-")) throw new Error(`unknown option "${arg}"`);
        options.game = arg;
        break;
    }
  }
  return options;
}

/** Waits until the process is interrupted; used by the server-backed commands. */
function waitForInterrupt(): Promise<void> {
  return new Promise<void>(() => {});
}

// ---------------------------------------------------------------------------
// info
// ---------------------------------------------------------------------------

export async function commandInfo(options: CliOptions, log = console.log): Promise<number> {
  const loaded = await loadGame(options.game);
  const described = loaded.game.describe();
  if (options.json) {
    log(
      JSON.stringify(
        {
          ...described,
          folder: loaded.descriptor.directory,
          sceneSource: loaded.sceneSource,
          warnings: loaded.warnings,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  log(`${described.title} v${described.version} (${described.id})`);
  log(`folder:  ${loaded.descriptor.directory}`);
  log(
    `scenes:  ${described.scenes.length} from ${loaded.sceneSource} — ${
      described.scenes.join(", ")
    }`,
  );
  log(`start:   ${described.start}`);
  log(`systems: ${described.systems.join(", ")}`);
  log(`scripts: ${described.scripts.join(", ")}`);
  for (const warning of loaded.warnings) log(`warning: ${warning}`);
  return 0;
}

// ---------------------------------------------------------------------------
// scenes
// ---------------------------------------------------------------------------

export async function commandScenes(options: CliOptions, log = console.log): Promise<number> {
  const descriptor = await loadGameDescriptor(options.game);
  if (options.write) {
    const loaded = await loadGame(options.game);
    const written: string[] = [];
    let bytes = 0;
    for (const [name, scene] of loaded.scenes) {
      written.push(await writeScene(descriptor, name, scene));
      bytes += sceneToJson(scene).length;
    }
    log(
      `wrote ${written.length} scene file(s) to ${descriptor.scenesDirectory} (${bytes} bytes of JSON)`,
    );
    for (const path of written) log(`  ${path.replace(/\\/g, "/")}`);
    return 0;
  }
  const files = await listGameSceneFiles(descriptor);
  if (options.json) {
    log(
      JSON.stringify(
        {
          directory: descriptor.scenesDirectory,
          scenes: files.map((file) => file.name),
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (files.length === 0) {
    log(`no scene files in ${descriptor.scenesDirectory}`);
    log(`bake them from the level code with: ember scenes ${options.game} --write`);
    return 0;
  }
  log(`${files.length} scene file(s) in ${descriptor.scenesDirectory}:`);
  for (const file of files) {
    const bytes = (await Deno.stat(file.path)).size;
    log(`  ${file.name} (${bytes} bytes)`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// test (headless play-through of every scene)
// ---------------------------------------------------------------------------

export interface SceneProbe {
  scene: string;
  entities: number;
  draws: number;
  frames: number;
  time: number;
  problems: string[];
}

/** Simulates every scene of a game and reports anything that looks broken. */
export function probeGame(loaded: LoadedGame, seconds: number): SceneProbe[] {
  const probes: SceneProbe[] = [];
  for (const name of loaded.game.sceneNames()) {
    const session = loaded.game.createSession(name, { seed: "ember-cli-test" });
    const frames = Math.max(1, Math.round(seconds / session.fixedDt));
    for (let frame = 0; frame < frames; frame++) session.step(session.fixedDt);
    const drawList = session.drawList();
    const problems: string[] = [];
    if (session.entityCount === 0) problems.push("scene has no entities");
    if (drawList.commands.length === 0) problems.push("scene produced no draw commands");
    if (drawList.stats.drawn === 0) problems.push("every drawable was culled");
    probes.push({
      scene: name,
      entities: session.entityCount,
      draws: drawList.commands.length,
      frames,
      time: Number(session.time.toFixed(3)),
      problems,
    });
  }
  return probes;
}

export async function commandTest(options: CliOptions, log = console.log): Promise<number> {
  const loaded = await loadGame(options.game);
  const probes = probeGame(loaded, options.seconds);
  const failures = probes.filter((probe) => probe.problems.length > 0);
  if (options.json) {
    log(JSON.stringify({ game: loaded.descriptor.id, probes, failures: failures.length }, null, 2));
    return failures.length === 0 ? 0 : 1;
  }
  log(`${loaded.descriptor.title}: ${probes.length} scene(s), ${options.seconds}s each`);
  for (const probe of probes) {
    const suffix = probe.problems.length > 0 ? ` — PROBLEMS: ${probe.problems.join(", ")}` : "";
    log(
      `  ${probe.scene.padEnd(10)} entities=${String(probe.entities).padEnd(4)} ` +
        `draws=${String(probe.draws).padEnd(4)} frames=${probe.frames}${suffix}`,
    );
  }
  log(
    failures.length === 0
      ? "all scenes simulated cleanly"
      : `${failures.length} scene(s) had problems`,
  );
  return failures.length === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// play
// ---------------------------------------------------------------------------

/** Headless play through the same bundle/loader path an exported game uses. */
export async function playHeadless(
  loaded: LoadedGame,
  seconds: number,
): Promise<Record<string, unknown>> {
  const result = await exportGame({
    game: loaded.game,
    scenes: loaded.scenes,
    startScene: loaded.game.startScene,
    gameModulePath: loaded.descriptor.entryPath,
    gameDirectory: loaded.descriptor.directory,
    workspaceRoot: absolutePath("."),
    skipCompile: true,
  });
  const bundle = bundleFromJSON(await Deno.readTextFile(result.bundlePath));
  const headless = headlessPlay(bundle, loaded.module.createGame, seconds);
  return { ...headless, appBytes: result.appBytes, bundlePath: result.bundlePath };
}

export async function commandPlay(options: CliOptions, log = console.log): Promise<number> {
  const loaded = await loadGame(options.game);
  if (options.headless !== null) {
    const result = await playHeadless(loaded, options.headless);
    log(options.json ? JSON.stringify(result, null, 2) : describeHeadless(result));
    return 0;
  }

  // Browser play reuses the export pipeline's browser module, so what you play is what
  // `ember export` ships — only the compile step is skipped.
  const result = await exportGame({
    game: loaded.game,
    scenes: loaded.scenes,
    startScene: loaded.game.startScene,
    gameModulePath: loaded.descriptor.entryPath,
    gameDirectory: loaded.descriptor.directory,
    workspaceRoot: absolutePath("."),
    skipCompile: true,
    onStep: (step) => log(`  ${step.name.padEnd(9)} ${step.detail} (${step.ms.toFixed(0)}ms)`),
  });
  const bundle = bundleFromJSON(await Deno.readTextFile(result.bundlePath));
  const appSource = await Deno.readTextFile(result.appPath);
  const server = await startPlayerServer({ bundle, appSource, port: options.port ?? 0 });
  log(`${loaded.descriptor.title} is playable at ${server.url}`);
  log(`(build an executable with: ember export ${options.game} --verify)`);
  if (options.open) {
    const opened = await openInBrowser(server.url);
    if (!opened) log(`could not open a browser automatically — visit ${server.url}`);
  }
  log("press Ctrl+C to stop");
  await waitForInterrupt();
  return 0;
}

function describeHeadless(result: Record<string, unknown>): string {
  return [
    `scene:     ${result.scene}`,
    `frames:    ${result.frames}`,
    `sim time:  ${result.time}s`,
    `entities:  ${result.entityCount}`,
    `digest:    ${result.digest}`,
    `app bytes: ${result.appBytes}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

export async function commandExport(options: CliOptions, log = console.log): Promise<number> {
  const loaded = await loadGame(options.game);
  const result = await exportGame({
    game: loaded.game,
    scenes: loaded.scenes,
    startScene: loaded.game.startScene,
    gameModulePath: loaded.descriptor.entryPath,
    gameDirectory: loaded.descriptor.directory,
    workspaceRoot: absolutePath("."),
    onStep: (step) => log(`  ${step.name.padEnd(9)} ${step.detail} (${step.ms.toFixed(0)}ms)`),
  });
  log("");
  log(`executable: ${result.exePath ?? "(compile skipped)"}`);
  log(`bundle:     ${result.bundlePath} (${result.bundleBytes} bytes)`);
  log(`scenes:     ${result.scenes.join(", ")} (start: ${result.startScene})`);
  for (const warning of [...loaded.warnings, ...result.warnings]) log(`warning: ${warning}`);

  if (options.out && result.exePath) {
    const target = resolveExportTarget(options.out, {
      workspaceRoot: absolutePath("."),
      gameId: loaded.descriptor.id,
      fallback: result.exePath,
    });
    const installed = await placeExportedGame(result.exePath, target);
    log(`installed:  ${installed}`);
  }

  if (options.verify && result.exePath) {
    log("");
    log("verifying the executable…");
    const verification = await verifyExport(result.exePath, { expectScenes: result.scenes });
    for (const check of verification.checks) {
      log(`  ${check.ok ? "ok  " : "FAIL"} ${check.name}: ${check.detail}`);
    }
    return verification.ok ? 0 : 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// editor
// ---------------------------------------------------------------------------

export async function commandEditor(options: CliOptions, log = console.log): Promise<number> {
  const loaded = await loadGame(options.game);
  const files = await listGameSceneFiles(loaded.descriptor);
  log(`${loaded.descriptor.title} — native editor`);
  log(`folder:  ${loaded.descriptor.directory}`);
  log(`scenes:  ${loaded.game.sceneNames().join(", ")} (from ${loaded.sceneSource})`);
  log("opening the EmberEngine window; close it to return to the terminal");
  const { runNativeEditor } = await import("../editor/native/app.ts");
  const { EDITOR_EXAMPLES, EMPTY_PROJECT_FACTORY } = await import("../editor/examples.ts");
  await runNativeEditor({
    game: loaded.game,
    sceneDirectory: loaded.descriptor.scenesDirectory,
    examplesRoot: `${loaded.descriptor.directory}/examples`,
    examples: EDITOR_EXAMPLES,
    title: loaded.descriptor.title,
    savedScenes: files.map((file) => file.name),
    workspaceRoot: absolutePath("."),
    gameModulePath: loaded.descriptor.entryPath,
    factory: EMPTY_PROJECT_FACTORY,
  });
  return 0;
}

// ---------------------------------------------------------------------------
// studio (browser editor)
// ---------------------------------------------------------------------------

export async function commandStudio(options: CliOptions, log = console.log): Promise<number> {
  const loaded = await loadGame(options.game);
  const { startStudio } = await import("../studio/mod.ts");
  const studio = await startStudio({
    descriptor: loaded.descriptor,
    workspaceRoot: Deno.cwd(),
    sceneSource: loaded.sceneSource,
    port: options.port ?? 0,
    onLog: (line) => log(`  ${line}`),
  });
  log(`${loaded.descriptor.title} — Ember Studio`);
  log(`folder:  ${loaded.descriptor.directory}`);
  log(`scenes:  ${loaded.game.sceneNames().join(", ")} (from ${loaded.sceneSource})`);
  log(`serving at ${studio.url}`);
  if (options.open) {
    const opened = await openInBrowser(studio.url);
    log(opened ? "opened the default browser" : `open ${studio.url} in a browser`);
  }
  log("press Ctrl+C to stop");
  await new Promise<void>(() => {
    // The editor serves until interrupted; the window/browser tab is the UI.
  });
  return 0;
}

// ---------------------------------------------------------------------------
// entry
// ---------------------------------------------------------------------------

export async function runCli(args: readonly string[], log = console.log): Promise<number> {
  let options: CliOptions;
  try {
    options = parseCliArgs(args);
  } catch (error) {
    log(`error: ${(error as Error).message}`);
    log(usage());
    return 2;
  }
  if (options.help || options.command === "help") {
    log(usage());
    return 0;
  }
  try {
    switch (options.command) {
      case "info":
        return await commandInfo(options, log);
      case "scenes":
        return await commandScenes(options, log);
      case "play":
        return await commandPlay(options, log);
      case "editor":
        return await commandEditor(options, log);
      case "studio":
        return await commandStudio(options, log);
      case "export":
        return await commandExport(options, log);
      case "test":
        return await commandTest(options, log);
      default:
        log(`unknown command "${options.command}"`);
        log(usage());
        return 2;
    }
  } catch (error) {
    log(`error: ${(error as Error).message}`);
    return 1;
  }
}

if (import.meta.main) {
  Deno.exit(await runCli(Deno.args));
}
