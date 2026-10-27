/**
 * @ember/cli/cli — argument parsing and command routing for `ember`.
 *
 * Owner: this file owns the command surface. It resolves the workspace root, then hands
 * off to `@ember/packager` (bundle/export) and `@ember/player` (window host). No build
 * logic lives here.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The package barrels are being extended by a parallel player/packager pass; until the
// two implementations are merged, the CLI pins the modules it was verified against.
import { bundleGame } from "../packager/browser.ts";
import { exportGame } from "../packager/compile.ts";
import { resolveGame } from "../packager/manifest.ts";
import { servePlayer } from "../player/host.ts";

export interface CliIO {
  log(line: string): void;
  error(line: string): void;
}

const DEFAULT_IO: CliIO = {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
};

export const USAGE = `EmberEngine CLI

  ember editor <game-dir> [--scenes DIR]         open the native scene editor
  ember play <game-dir> [--port N] [--no-open]   run a game in a window
  ember export <game-dir> [--out DIR]            build a standalone .exe
  ember help                                     show this text

Examples:
  deno task editor
  ember editor games/ember-runner
  ember play games/ember-runner
  ember export games/ember-runner --out dist`;

/** Runs one CLI invocation. Returns the process exit code. */
export async function runCli(
  argv: readonly string[],
  io: CliIO = DEFAULT_IO,
  projectRoot: string = workspaceRoot(),
): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    io.log(USAGE);
    return 0;
  }

  const flags = parseFlags(rest);
  const gameDir = flags.positionals[0];
  if (!gameDir) {
    io.error(`ember ${command}: missing <game-dir>`);
    io.error(USAGE);
    return 1;
  }

  try {
    if (command === "editor") {
      const [{ listGameSceneFiles, loadGame }, { runNativeEditor }] = await Promise.all([
        import("@ember/gameloader"),
        import("../editor/native/app.ts"),
      ]);
      const loaded = await loadGame(join(projectRoot, gameDir));
      const files = await listGameSceneFiles(loaded.descriptor);
      await runNativeEditor({
        game: loaded.game,
        sceneDirectory: loaded.descriptor.scenesDirectory,
        title: loaded.descriptor.title,
        savedScenes: files.map((file) => file.name),
      });
      return 0;
    }

    const game = await resolveGame(join(projectRoot, gameDir));

    if (command === "play") {
      const outDir = join(projectRoot, "build", "play", game.manifest.name);
      const bundle = await bundleGame({ projectRoot, game, outDir });
      const host = servePlayer({
        title: game.manifest.title,
        width: game.manifest.width,
        height: game.manifest.height,
        js: bundle.js,
        port: flags.number("port") ?? 0,
        open: !flags.boolean("no-open"),
      });

      io.log(`GAME=${game.manifest.title} BUNDLE=${bundle.bytes} bytes`);
      io.log(`PLAYER_URL=${host.url}`);
      io.log("Press Ctrl+C to stop.");

      // Serve until the process is interrupted; the host owns the lifetime.
      await new Promise<void>(() => {});
      return 0;
    }

    if (command === "export") {
      const result = await exportGame({
        projectRoot,
        game,
        distDir: flags.value("out") ? join(projectRoot, flags.value("out") as string) : undefined,
      });
      io.log(`GAME=${game.manifest.title} BUNDLE=${result.bundleBytes} bytes`);
      io.log(`EXE=${result.exePath}`);
      io.log(
        `EXE_BYTES=${result.exeBytes} COMPILE_SECONDS=${result.compileSeconds}`,
      );
      return 0;
    }

    io.error(`ember: unknown command "${command}"`);
    io.error(USAGE);
    return 1;
  } catch (error) {
    io.error(`ember ${command}: ${(error as Error).message}`);
    return 1;
  }
}

interface Flags {
  positionals: string[];
  values: Map<string, string>;
  toggles: Set<string>;
  value(name: string): string | undefined;
  number(name: string): number | undefined;
  boolean(name: string): boolean;
}

function parseFlags(args: readonly string[]): Flags {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const toggles = new Set<string>();

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) {
      values.set(name, inline);
    } else if (args[index + 1] && !args[index + 1].startsWith("--")) {
      values.set(name, args[index + 1]);
      index += 1;
    } else {
      toggles.add(name);
    }
  }

  return {
    positionals,
    values,
    toggles,
    value: (name) => values.get(name),
    number: (name) => {
      const raw = values.get(name);
      if (raw === undefined) return undefined;
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        throw new Error(`--${name} must be a port number (0-65535), got "${raw}"`);
      }
      return parsed;
    },
    boolean: (name) => toggles.has(name) || values.get(name) === "true",
  };
}

/** Repository root, derived from this file so the CLI works from any cwd. */
export function workspaceRoot(): string {
  return dirname(dirname(dirname(fileURLToPath(import.meta.url))));
}
