/**
 * @ember/cli/game-loader — finding a game on disk and loading it.
 *
 * Owner: this file owns "where is the game and what is in it": the `game.json` descriptor,
 * the scene files, the entry module and the merged scene set. Every CLI command and the
 * editor server resolve games through here, so they agree on paths and on which scenes
 * (files or code) are the source of truth.
 */

import { SCENE_FILE_EXTENSION, type Scene, deserializeScene, sceneToJson, slugify } from "@ember/core";
import type { Game } from "@ember/runtime";

export interface GameDescriptor {
  /** Game folder, absolute. */
  directory: string;
  id: string;
  title: string;
  version: string;
  /** Absolute path of the module exporting `createGame`. */
  entryPath: string;
  /** Absolute path of the scene folder. */
  scenesDirectory: string;
  /** Scene a session should start in. */
  start: string;
  /** Where the descriptor was read from. */
  manifestPath: string;
}

export interface GameModule {
  createGame: (options?: { scenes?: Map<string, Scene>; start?: string }) => Game;
  buildScenes?: () => Map<string, Scene>;
  textureSources?: Record<string, unknown>;
  [key: string]: unknown;
}

export function fileUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return `file://${normalized.startsWith("/") ? "" : "/"}${encodeURI(normalized)}`;
}

export function absolutePath(path: string, cwd = Deno.cwd()): string {
  const normalized = path.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("/")) return normalized;
  return `${cwd.replace(/\\/g, "/").replace(/\/$/, "")}/${normalized}`;
}

/** Reads `game.json` from a game folder and resolves its paths. */
export async function loadGameDescriptor(directory: string): Promise<GameDescriptor> {
  const resolved = absolutePath(directory);
  const manifestPath = `${resolved}/game.json`;
  let raw: string;
  try {
    raw = await Deno.readTextFile(manifestPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`no game.json in ${resolved} — pass a game folder (see games/ember-runner)`);
    }
    throw error;
  }
  const parsed = JSON.parse(raw) as {
    id?: string;
    title?: string;
    version?: string;
    entry?: string;
    scenes?: string;
    start?: string;
  };
  const id = parsed.id ?? resolved.split("/").at(-1) ?? "game";
  if (!parsed.id) throw new Error(`${manifestPath} is missing an "id"`);
  if (!parsed.entry) throw new Error(`${manifestPath} is missing an "entry" (e.g. "src/main.ts")`);
  return {
    directory: resolved,
    id,
    title: parsed.title ?? id,
    version: parsed.version ?? "0.1.0",
    entryPath: absolutePath(parsed.entry, resolved),
    scenesDirectory: absolutePath(parsed.scenes ?? "scenes", resolved),
    start: parsed.start ?? "level-1",
    manifestPath,
  };
}

/** Imports the game module and checks it exposes what a host needs. */
export async function importGameModule(descriptor: GameDescriptor): Promise<GameModule> {
  const module = (await import(fileUrl(descriptor.entryPath))) as Partial<GameModule>;
  if (typeof module.createGame !== "function") {
    throw new Error(`${descriptor.entryPath} must export createGame()`);
  }
  return module as GameModule;
}

export interface SceneFileInfo {
  name: string;
  path: string;
}

/** `.emberscene` files in a game folder, sorted by name. */
export async function listGameSceneFiles(descriptor: GameDescriptor): Promise<SceneFileInfo[]> {
  const found: SceneFileInfo[] = [];
  try {
    for await (const entry of Deno.readDir(descriptor.scenesDirectory)) {
      if (entry.isFile && entry.name.endsWith(SCENE_FILE_EXTENSION)) {
        found.push({
          name: entry.name.slice(0, -SCENE_FILE_EXTENSION.length),
          path: `${descriptor.scenesDirectory}/${entry.name}`,
        });
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readScene(descriptor: GameDescriptor, name: string): Promise<Scene | null> {
  const files = await listGameSceneFiles(descriptor);
  const file = files.find((entry) => entry.name === name) ??
    files.find((entry) => entry.name === slugify(name));
  if (!file) return null;
  const text = await Deno.readTextFile(file.path);
  const scene = deserializeScene(JSON.parse(text));
  scene.name = file.name;
  return scene;
}

export async function writeScene(
  descriptor: GameDescriptor,
  name: string,
  scene: Scene,
): Promise<string> {
  await Deno.mkdir(descriptor.scenesDirectory, { recursive: true });
  const slug = slugify(name);
  scene.name = slug;
  const path = `${descriptor.scenesDirectory}/${slug}${SCENE_FILE_EXTENSION}`;
  await Deno.writeTextFile(path, sceneToJson(scene, { pretty: true }));
  return path;
}

export async function deleteScene(descriptor: GameDescriptor, name: string): Promise<boolean> {
  const files = await listGameSceneFiles(descriptor);
  const file = files.find((entry) => entry.name === slugify(name));
  if (!file) return false;
  await Deno.remove(file.path);
  return true;
}

export interface ResolvedScenes {
  scenes: Map<string, Scene>;
  /** "files" when scene files exist on disk, "code" when the module's builder was used. */
  source: "files" | "code";
  names: string[];
  warnings: string[];
}

/**
 * Resolves the scenes a host should use: on-disk scene files when present (the editor's
 * source of truth), otherwise the game module's own builder.
 */
export async function resolveScenes(
  descriptor: GameDescriptor,
  module: GameModule,
): Promise<ResolvedScenes> {
  const warnings: string[] = [];
  const files = await listGameSceneFiles(descriptor);
  if (files.length > 0) {
    const scenes = new Map<string, Scene>();
    for (const file of files) {
      try {
        const scene = deserializeScene(
          JSON.parse(await Deno.readTextFile(file.path)),
          { onWarning: (message) => warnings.push(`${file.name}: ${message}`) },
        );
        scene.name = file.name;
        scenes.set(file.name, scene);
      } catch (error) {
        warnings.push(`${file.name}: ${(error as Error).message}`);
      }
    }
    if (scenes.size > 0) {
      return { scenes, source: "files", names: [...scenes.keys()], warnings };
    }
  }
  if (typeof module.buildScenes === "function") {
    const scenes = module.buildScenes();
    return { scenes, source: "code", names: [...scenes.keys()], warnings };
  }
  throw new Error(
    `no scenes found: ${descriptor.scenesDirectory} is empty and ${descriptor.entryPath} has no buildScenes()`,
  );
}

export interface LoadedGame {
  descriptor: GameDescriptor;
  module: GameModule;
  scenes: Map<string, Scene>;
  sceneSource: "files" | "code";
  warnings: string[];
  /** Game instance wired with the resolved scenes. */
  game: Game;
}

/** The one entry point hosts use: descriptor + module + scenes + wired game. */
export async function loadGame(
  directory: string,
  options: { start?: string } = {},
): Promise<LoadedGame> {
  const descriptor = await loadGameDescriptor(directory);
  const module = await importGameModule(descriptor);
  const resolved = await resolveScenes(descriptor, module);
  const start = options.start && resolved.scenes.has(options.start)
    ? options.start
    : resolved.scenes.has(descriptor.start)
    ? descriptor.start
    : resolved.names[0];
  const game = module.createGame({ scenes: resolved.scenes, start });
  return {
    descriptor,
    module,
    scenes: resolved.scenes,
    sceneSource: resolved.source,
    warnings: resolved.warnings,
    game,
  };
}
