/**
 * @ember/packager/manifest — reading `game.json`.
 *
 * Owner: this file owns what a game directory declares. The CLI, the browser bundler and
 * the exporter all read games through it, so a new manifest field lands in one place.
 */

import { join, resolve } from "node:path";

export interface GameManifest {
  /** Stable id, used for build directories and the executable name. */
  name: string;
  title: string;
  width: number;
  height: number;
  /** Entry module, relative to the game directory. Defaults to `src/game.ts`. */
  entry: string;
  description: string;
}

export const GAME_MANIFEST_FILE = "game.json";
export const DEFAULT_GAME_ENTRY = "src/game.ts";

/** Absolute game directory plus its validated manifest and resolved entry path. */
export interface ResolvedGame {
  directory: string;
  manifest: GameManifest;
  entryPath: string;
}

export async function resolveGame(gameDirectory: string): Promise<ResolvedGame> {
  const directory = await Deno.realPath(resolve(gameDirectory));
  const manifestPath = join(directory, GAME_MANIFEST_FILE);

  let raw: string;
  try {
    raw = await Deno.readTextFile(manifestPath);
  } catch {
    throw new Error(`no ${GAME_MANIFEST_FILE} in ${directory}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${manifestPath} is not valid JSON: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${manifestPath} must contain a JSON object`);
  }  const data = parsed as Record<string, unknown>;
  // `id` is the current key; `name` is accepted so older manifests keep loading.
  const name = typeof data.id === "string" ? requireString(data, "id", manifestPath) : requireString(data, "name", manifestPath);
  const title = typeof data.title === "string" && data.title.length > 0 ? data.title : name;
  const viewport = (data.viewport ?? {}) as Record<string, unknown>;
  const width = requireDimension(viewport.width ?? data.width, "viewport.width", manifestPath);
  const height = requireDimension(viewport.height ?? data.height, "viewport.height", manifestPath);
  const entry = typeof data.entry === "string" && data.entry.length > 0 ? data.entry : DEFAULT_GAME_ENTRY;

  const entryPath = join(directory, entry);
  const entryInfo = await Deno.stat(entryPath).catch(() => null);
  if (!entryInfo?.isFile) {
    throw new Error(`${manifestPath} points at "${entry}", which does not exist`);
  }

  return {
    directory,
    manifest: {
      name: slug(name),
      title,
      width,
      height,
      entry,
      description: typeof data.description === "string" ? data.description : "",
    },
    entryPath,
  };
}

/** File-safe name for build outputs: lowercase, dash separated. */
export function slug(name: string): string {
  const value = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return value.length > 0 ? value : "game";
}

/** `file:///C:/x/y.ts` style URL, so generated entries can import an absolute path. */
export function toFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const absolute = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `file://${encodeURI(absolute)}`;
}

function requireString(data: Record<string, unknown>, key: string, source: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${source} needs a non-empty "${key}" string`);
  }
  return value.trim();
}

function requireDimension(value: unknown, key: string, source: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${source} needs a positive "${key}" number`);
  }
  return Math.floor(value);
}
