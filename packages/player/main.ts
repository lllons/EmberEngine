/**
 * @ember/player/main — the entry point compiled into an exported game.
 *
 * Owner: this file owns the exported game's command line and its run modes:
 *   (default)  serve the game on loopback and open the default browser
 *   --headless <seconds>  simulate without a display and print a determinism digest
 *   --json     print the bundle summary and exit
 *   --help     print usage
 *
 * The generated entry for a game passes the game's own `createGame` so headless runs and
 * tests use exactly the systems, scripts and services the browser build uses.
 */

import type { Scene } from "@ember/core";
import { type Game, sceneDigest } from "@ember/runtime";
import { type PlayerBundle, describeBundle, scenesFromBundle, validateBundle } from "./bundle.ts";
import { startPlayerServer } from "./server.ts";

export interface PlayerFlags {
  /** Seconds to simulate headlessly, or null to serve the game. */
  headless: number | null;
  port: number;
  open: boolean;
  json: boolean;
  help: boolean;
}

export function parsePlayerFlags(args: readonly string[]): PlayerFlags {
  const flags: PlayerFlags = { headless: null, port: 0, open: true, json: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--headless":
      case "-h": {
        const value = args[i + 1];
        if (value === undefined || value.startsWith("-")) {
          throw new Error("--headless needs a number of seconds");
        }
        flags.headless = Number.parseFloat(value);
        if (!Number.isFinite(flags.headless) || flags.headless <= 0) {
          throw new Error(`--headless expects a positive number of seconds, got "${value}"`);
        }
        i++;
        break;
      }
      case "--port": {
        const value = args[i + 1];
        const port = Number.parseInt(value ?? "", 10);
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
          throw new Error(`--port expects a port number, got "${value ?? ""}"`);
        }
        flags.port = port;
        i++;
        break;
      }
      case "--no-open":
        flags.open = false;
        break;
      case "--json":
        flags.json = true;
        break;
      case "--help":
        flags.help = true;
        break;
      default:
        throw new Error(`unknown option "${arg}"`);
    }
  }
  return flags;
}

export function playerUsage(title: string): string {
  return [
    `${title} — Ember player`,
    "",
    "usage: <game>.exe [options]",
    "",
    "  --headless <seconds>  simulate without a display and print a digest",
    "  --port <n>            port for the local server (0 chooses a free one)",
    "  --no-open             do not open the default browser",
    "  --json                print the embedded bundle summary as JSON",
    "  --help                show this message",
  ].join("\n");
}

export interface PlayerRunOptions {
  bundle: PlayerBundle;
  /** Browser module source embedded in the executable. */
  appSource: string;
  /** The game's factory; required for `--headless`. */
  createGame?: (options: { scenes: Map<string, Scene> }) => Game;
  args?: readonly string[];
  log?: (line: string) => void;
  /** Opens a URL; injectable so tests never launch a browser. */
  openUrl?: (url: string) => Promise<boolean>;
  /** Tests set this to false to avoid the process waiting for Ctrl+C. */
  waitForExit?: boolean;
}

export interface HeadlessResult {
  game: string;
  scene: string;
  seconds: number;
  frames: number;
  time: number;
  entityCount: number;
  digest: string;
}

/** Runs a game without a display: real systems, real fixed steps, no window. */
export function headlessPlay(
  bundle: PlayerBundle,
  createGame: (options: { scenes: Map<string, Scene> }) => Game,
  seconds: number,
): HeadlessResult {
  const scenes = scenesFromBundle(bundle);
  const game = createGame({ scenes });
  const sceneName = bundle.game.start;
  const host = game.createHost(sceneName, { seed: 1 });
  host.simulate(seconds);
  const session = host.session;
  return {
    game: bundle.game.id,
    scene: session.scene.name,
    seconds,
    frames: session.frame,
    time: session.time,
    entityCount: session.entityCount,
    digest: sceneDigest(session.scene),
  };
}

/** The exported game's `main`. Returns the process exit code. */
export async function runPlayer(options: PlayerRunOptions): Promise<number> {
  const log = options.log ?? ((line: string) => console.log(line));
  let flags: PlayerFlags;
  try {
    flags = parsePlayerFlags(options.args ?? []);
  } catch (error) {
    log(`error: ${(error as Error).message}`);
    log(playerUsage(options.bundle.game.title));
    return 2;
  }

  if (flags.help) {
    log(playerUsage(options.bundle.game.title));
    return 0;
  }

  const validation = validateBundle(options.bundle);
  if (!validation.ok) {
    log(`error: the embedded game bundle is invalid: ${validation.problems.join("; ")}`);
    return 3;
  }

  if (flags.json) {
    log(JSON.stringify({
      ...options.bundle.game,
      scenes: options.bundle.scenes.map((scene) => scene.name),
      assets: options.bundle.manifest.entries.length,
      builtAt: options.bundle.builtAt,
    }, null, 2));
    return 0;
  }

  if (flags.headless !== null) {
    if (!options.createGame) {
      log("error: this build has no headless game factory");
      return 2;
    }
    try {
      const result = headlessPlay(options.bundle, options.createGame, flags.headless);
      log(JSON.stringify(result, null, 2));
      return 0;
    } catch (error) {
      log(`error: headless run failed: ${(error as Error).message}`);
      return 4;
    }
  }

  const server = await startPlayerServer({
    bundle: options.bundle,
    appSource: options.appSource,
    port: flags.port,
  });
  log(describeBundle(options.bundle));
  log("");
  log(`serving at ${server.url}`);
  if (flags.open) {
    const opened = await (options.openUrl ?? openInBrowser)(server.url);
    log(opened ? "opened the default browser" : `could not open a browser — visit ${server.url}`);
  } else {
    log(`open ${server.url} in a browser`);
  }
  log("press Ctrl+C to stop");

  if (options.waitForExit ?? true) {
    await new Promise<void>(() => {
      // Intentionally never resolves: the server runs until the process is interrupted.
    });
  }
  return 0;
}

/** The platform's "open this URL" command. */
export function browserCommand(url: string): { command: string; args: string[] } {
  switch (Deno.build.os) {
    case "windows":
      return { command: "cmd", args: ["/c", "start", "", url] };
    case "darwin":
      return { command: "open", args: [url] };
    default:
      return { command: "xdg-open", args: [url] };
  }
}

/** Best-effort default-browser launch, per platform. Never throws. */
export async function openInBrowser(url: string): Promise<boolean> {
  const { command, args } = browserCommand(url);
  try {
    const child = new Deno.Command(command, {
      args,
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).spawn();
    child.unref();
    return true;
  } catch {
    return false;
  }
}
