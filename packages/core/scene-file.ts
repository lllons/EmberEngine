/**
 * @ember/core/scene-file — disk I/O for scenes.
 *
 * Split from `serialization.ts` so the format stays pure and unit-testable;
 * this is the only module that touches the file system for scene data.
 */

import { Scene } from "./scene.ts";
import {
  SCENE_FILE_EXTENSION,
  sceneFromJson,
  type SceneLoadOptions,
  sceneToJson,
} from "./serialization.ts";

/** Lowercase, dash-separated file-safe name. */
export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "untitled";
}

export function sceneFileName(name: string): string {
  const stripped = name.endsWith(SCENE_FILE_EXTENSION)
    ? name.slice(0, -SCENE_FILE_EXTENSION.length)
    : name;
  return `${slugify(stripped)}${SCENE_FILE_EXTENSION}`;
}

export async function ensureDir(path: string): Promise<void> {
  await Deno.mkdir(path, { recursive: true });
}

export async function readSceneFile(path: string, options: SceneLoadOptions = {}): Promise<Scene> {
  const text = await Deno.readTextFile(path);
  return sceneFromJson(text, options);
}

export async function writeSceneFile(path: string, scene: Scene): Promise<void> {
  const directory = path.replace(/[\\/][^\\/]*$/, "");
  if (directory && directory !== path) await ensureDir(directory);
  await Deno.writeTextFile(path, sceneToJson(scene, { pretty: true }));
}

export async function sceneExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/** `.emberscene` files in a directory, sorted by name. `[]` when it does not exist. */
export async function listSceneFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  try {
    for await (const entry of Deno.readDir(directory)) {
      if (entry.isFile && entry.name.endsWith(SCENE_FILE_EXTENSION)) {
        found.push(`${directory.replace(/[\\/]$/, "")}/${entry.name}`);
      }
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }
  return found.sort();
}
