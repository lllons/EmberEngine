/**
 * @ember/player/bundle — the exported-game payload.
 *
 * Owner: this file owns what travels inside an exported `.exe`: the game's identity, all of
 * its scenes, its (inlined) assets and the browser module source that runs it. The packager
 * writes it, the compiled player reads it, and the tests assert on its shape — one format,
 * one owner.
 */

import {
  type AssetManifest,
  ASSET_MANIFEST_FORMAT,
  createManifest,
  inlinedBytes,
} from "@ember/assets";
import {
  deserializeScene,
  type Scene,
  SCENE_FORMAT,
  type SerializedScene,
  serializeScene,
} from "@ember/core";

export const PLAYER_BUNDLE_FORMAT = "emberplayer";
export const PLAYER_BUNDLE_VERSION = 1;

export interface PlayerGameInfo {
  id: string;
  title: string;
  version: string;
  /** Scene the player starts in. */
  start: string;
  /** Default window size of the exported game. */
  viewport: { width: number; height: number };
}

export interface PlayerBundle {
  format: typeof PLAYER_BUNDLE_FORMAT;
  version: number;
  game: PlayerGameInfo;
  /** Every scene of the game, serialized with the engine's scene format. */
  scenes: SerializedScene[];
  /** Assets, already inlined as data URIs where needed. */
  manifest: AssetManifest;
  /** ISO timestamp of the export. */
  builtAt: string;
  /** Engine version the bundle was built with. */
  engine: string;
}

export interface CreateBundleOptions {
  id: string;
  title: string;
  version?: string;
  start: string;
  viewport?: { width: number; height: number };
  scenes: Record<string, Scene>;
  manifest?: AssetManifest;
  engine?: string;
  builtAt?: string;
}

/** Creates a bundle from live scenes (the exporter's job is to serialize them). */
export function createBundle(options: CreateBundleOptions): PlayerBundle {
  const scenes = Object.entries(options.scenes).map(([name, scene]) => {
    const file = serializeScene(scene);
    file.name = name;
    return file;
  });
  if (scenes.length === 0) throw new Error("a player bundle needs at least one scene");
  if (!scenes.some((scene) => scene.name === options.start)) {
    throw new Error(`start scene "${options.start}" is not part of the bundle`);
  }
  return {
    format: PLAYER_BUNDLE_FORMAT,
    version: PLAYER_BUNDLE_VERSION,
    game: {
      id: options.id,
      title: options.title,
      version: options.version ?? "0.1.0",
      start: options.start,
      viewport: options.viewport ?? { width: 960, height: 540 },
    },
    scenes,
    manifest: options.manifest ?? createManifest("."),
    builtAt: options.builtAt ?? new Date().toISOString(),
    engine: options.engine ?? "0.1.0",
  };
}

/** Scene names carried by the bundle. */
export function bundleSceneNames(bundle: PlayerBundle): string[] {
  return bundle.scenes.map((scene) => scene.name);
}

/** Rebuilds `Scene` objects from a bundle (used by headless play and by the browser host). */
export function scenesFromBundle(bundle: PlayerBundle): Map<string, Scene> {
  const scenes = new Map<string, Scene>();
  for (const serialized of bundle.scenes) {
    const scene = deserializeScene(serialized);
    scene.name = serialized.name;
    scenes.set(serialized.name, scene);
  }
  return scenes;
}

export interface BundleValidation {
  ok: boolean;
  problems: string[];
}

/** Structural check run by both the packager (before compiling) and the player (on load). */
export function validateBundle(data: unknown): BundleValidation {
  const problems: string[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, problems: ["bundle must be a JSON object"] };
  }
  const bundle = data as Partial<PlayerBundle>;
  if (bundle.format !== PLAYER_BUNDLE_FORMAT) {
    problems.push(`unexpected format "${String(bundle.format)}"`);
  }
  if (bundle.version !== PLAYER_BUNDLE_VERSION) {
    problems.push(`unsupported bundle version ${String(bundle.version)}`);
  }
  if (!bundle.game || typeof bundle.game.id !== "string") problems.push("missing game id");
  if (!Array.isArray(bundle.scenes) || bundle.scenes.length === 0) {
    problems.push("missing scenes");
  } else {
    for (const [index, scene] of bundle.scenes.entries()) {
      if ((scene as SerializedScene).format !== SCENE_FORMAT) {
        problems.push(`scene ${index} is not in ${SCENE_FORMAT} format`);
      }
    }
    const names = bundle.scenes.map((scene) => scene.name);
    if (bundle.game && !names.includes(bundle.game.start)) {
      problems.push(`start scene "${bundle.game.start}" is missing`);
    }
  }
  if (!bundle.manifest || (bundle.manifest as AssetManifest).format !== ASSET_MANIFEST_FORMAT) {
    problems.push("missing asset manifest");
  }
  return { ok: problems.length === 0, problems };
}

export function bundleToJSON(bundle: PlayerBundle): string {
  return JSON.stringify(bundle);
}

export function bundleFromJSON(text: string): PlayerBundle {
  const parsed = JSON.parse(text) as PlayerBundle;
  const validation = validateBundle(parsed);
  if (!validation.ok) {
    throw new Error(`invalid player bundle: ${validation.problems.join("; ")}`);
  }
  return parsed;
}

/** Human-readable bundle summary, printed by `ember export` and by the player. */
export function describeBundle(bundle: PlayerBundle): string {
  const sizes = inlinedBytes(bundle.manifest);
  return [
    `${bundle.game.title} v${bundle.game.version} (${bundle.game.id})`,
    `scenes: ${bundleSceneNames(bundle).join(", ")}`,
    `start: ${bundle.game.start}`,
    `viewport: ${bundle.game.viewport.width}x${bundle.game.viewport.height}`,
    `assets: ${bundle.manifest.entries.length} (${sizes} bytes inlined)`,
    `built: ${bundle.builtAt} with engine ${bundle.engine}`,
  ].join("\n");
}
