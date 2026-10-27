/**
 * @ember/runtime/digest — determinism digests.
 *
 * Owner: this file owns "is this simulation the same as before?" hashing. Tests assert that
 * two runs of the same scene with the same input produce the same digest, and the player's
 * headless mode prints one so an exported game can be compared against the editor's preview.
 */

import { componentByName, type Scene, type World } from "@ember/core";

/** Six decimals: plenty for gameplay, immune to float noise between hosts. */
export function fixed(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(6);
}

/** Canonical, ordered text description of every entity and component. */
export function worldDigestText(world: World): string {
  const lines: string[] = [];
  for (const entity of world.entities()) {
    const parts: string[] = [`#${entity}`];
    for (const name of world.componentsOf(entity)) {
      const type = componentByName(name);
      const value = type ? world.get(entity, type) : undefined;
      parts.push(`${name}=${stableJson(value)}`);
    }
    lines.push(parts.join(" "));
  }
  return lines.join("\n");
}

/** JSON with numbers rounded and object keys sorted, so key order never changes the digest. */
export function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "number") return fixed(item);
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(item as Record<string, unknown>).sort()) {
        sorted[key] = (item as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return item;
  });
}

/** FNV-1a over the canonical text — stable across hosts and engine versions. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function worldDigest(world: World): string {
  return hashText(worldDigestText(world));
}

/** Scene digest includes the camera, so follow/clamp bugs show up in the digest too. */
export function sceneDigest(scene: Scene): string {
  const camera = scene.resources.camera;
  const header = [
    scene.name,
    fixed(camera.position.x),
    fixed(camera.position.y),
    fixed(camera.zoom),
    String(camera.follow),
  ].join("|");
  return hashText(`${header}\n${worldDigestText(scene.world)}`);
}
