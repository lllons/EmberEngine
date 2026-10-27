/**
 * @ember/core/serialization — THE scene file format.
 *
 * Owner: this file and only this file knows how a scene is persisted. Everything
 * else works with `Scene` objects. Pure: no file system access (see `scene-file.ts`).
 *
 * Format (`.emberscene`, JSON, UTF-8):
 * {
 *   "format": "emberscene",
 *   "version": 1,
 *   "name": "level-1",
 *   "resources": { gravity, background, viewport, camera, camera3d },
 *   "entities": [ { "id": 1, "components": { "Transform": {...} } } ],
 *   "metadata": {}
 * }
 */

import { defaultResources, Scene, type SceneInit, type SceneResources } from "./scene.ts";
import { cloneComponentData, componentByName, type Entity } from "./ecs.ts";

export const SCENE_FORMAT = "emberscene";
export const SCENE_FILE_EXTENSION = ".emberscene";
export const SCENE_FORMAT_VERSION = 1;

export interface SerializedEntity {
  id: Entity;
  components: Record<string, unknown>;
}

export interface SerializedScene {
  format: typeof SCENE_FORMAT;
  version: number;
  name: string;
  resources: SceneResources;
  entities: SerializedEntity[];
  metadata: Record<string, unknown>;
}

export interface SceneLoadOptions {
  /** Called for each recoverable problem (unknown component, dangling parent, ...). */
  onWarning?: (message: string) => void;
}

export function serializeScene(scene: Scene): SerializedScene {
  const entities: SerializedEntity[] = [];
  for (const id of scene.world.entities()) {
    const components: Record<string, unknown> = {};
    for (const name of scene.world.componentsOf(id)) {
      const type = componentByName(name);
      if (!type) continue;
      const value = scene.world.get(id, type);
      if (value === undefined) continue;
      components[name] = cloneComponentData(value);
    }
    entities.push({ id, components });
  }
  return {
    format: SCENE_FORMAT,
    version: SCENE_FORMAT_VERSION,
    name: scene.name,
    resources: structuredClone(scene.resources),
    entities,
    metadata: structuredClone(scene.metadata),
  };
}

export function sceneToJson(scene: Scene, options: { pretty?: boolean } = {}): string {
  const file = serializeScene(scene);
  return options.pretty === false ? JSON.stringify(file) : JSON.stringify(file, null, 2);
}

export function sceneFromJson(text: string, options: SceneLoadOptions = {}): Scene {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`scene file is not valid JSON: ${(error as Error).message}`);
  }
  return deserializeScene(parsed, options);
}

export function deserializeScene(data: unknown, options: SceneLoadOptions = {}): Scene {
  const { file, migratedFrom } = migrateSceneFile(data, options);
  const init: SceneInit = {
    name: file.name,
    gravity: file.resources.gravity,
    background: file.resources.background,
    viewport: file.resources.viewport,
    camera: file.resources.camera,
    camera3d: file.resources.camera3d,
    metadata: file.metadata,
  };
  const scene = new Scene(init);
  if (migratedFrom !== null) {
    options.onWarning?.(`migrated scene from format version ${migratedFrom} to ${file.version}`);
  }

  // Pass 1: entities and components.
  for (const serialized of file.entities) {
    let entity: Entity;
    try {
      entity = scene.world.adopt(serialized.id);
    } catch (error) {
      options.onWarning?.(`skipped entity: ${(error as Error).message}`);
      continue;
    }
    for (const [name, value] of Object.entries(serialized.components)) {
      const type = componentByName(name);
      if (!type) {
        options.onWarning?.(`entity ${entity} has unknown component "${name}"`);
        continue;
      }
      // Deep copy: a loaded scene must never alias the file object it came from, or two
      // scenes loaded from the same payload would silently share component data.
      scene.world.attach(entity, type, cloneComponentData(value) as object);
    }
  }

  // Pass 2: validate cross-entity references (parent pointers).
  const parentType = componentByName("Parent");
  if (parentType) {
    for (const entity of scene.world.entities()) {
      const parent = scene.world.get(entity, parentType) as { entity: Entity } | undefined;
      if (!parent) continue;
      const target = parent.entity;
      if (target === entity) {
        options.onWarning?.(`entity ${entity} is its own parent; link removed`);
        scene.world.remove(entity, parentType);
      } else if (target === 0 || !scene.world.isAlive(target)) {
        options.onWarning?.(`entity ${entity} references missing parent ${target}; link removed`);
        scene.world.remove(entity, parentType);
      }
    }
  }

  return scene;
}

export interface MigrationResult {
  file: SerializedScene;
  /** Version the input was written in, or null when it was already current. */
  migratedFrom: number | null;
}

/**
 * Upgrades an older scene file to the current format version.
 * Throws when the file is unrecognizable or written by a newer engine.
 */
export function migrateSceneFile(
  data: unknown,
  options: SceneLoadOptions = {},
): MigrationResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("scene file must be a JSON object");
  }
  const raw = data as Record<string, unknown>;
  const declaredVersion = typeof raw.version === "number" ? raw.version : 0;

  if (declaredVersion > SCENE_FORMAT_VERSION) {
    throw new Error(
      `scene file version ${declaredVersion} is newer than supported version ${SCENE_FORMAT_VERSION}`,
    );
  }

  if (!Array.isArray(raw.entities)) {
    throw new Error("scene file is missing an entities array");
  }

  // v0 -> v1: pre-format files had no `format`, no resources block and no viewport.
  if (declaredVersion < 1) {
    const resources = (raw.resources ?? {}) as Partial<SceneResources>;
    const defaults = defaultResources({
      viewport: resources.viewport,
      gravity: resources.gravity,
      background: resources.background,
    });
    raw.resources = {
      gravity: resources.gravity ?? defaults.gravity,
      background: resources.background ?? defaults.background,
      viewport: resources.viewport ?? defaults.viewport,
      camera: {
        ...defaults.camera,
        ...(resources.camera ?? {}),
      },
      camera3d: {
        ...defaults.camera3d,
        ...(resources.camera3d ?? {}),
      },
    };
    if (raw.name !== undefined && typeof raw.name !== "string") {
      options.onWarning?.('scene name was not a string; replaced with "untitled"');
      raw.name = "untitled";
    }
  }

  const normalized: SerializedScene = {
    format: SCENE_FORMAT,
    version: SCENE_FORMAT_VERSION,
    name: typeof raw.name === "string" ? raw.name : "untitled",
    resources: raw.resources as SceneResources,
    entities: (raw.entities as unknown[]).map((entry, index) => {
      const item = entry as Record<string, unknown>;
      const id = typeof item.id === "number" ? item.id : index + 1;
      const components = (item.components ?? {}) as Record<string, unknown>;
      return { id, components };
    }),
    metadata: (raw.metadata ?? {}) as Record<string, unknown>,
  };

  return {
    file: normalized,
    migratedFrom: declaredVersion === SCENE_FORMAT_VERSION ? null : declaredVersion,
  };
}

/** Structural problems in a scene file, as human-readable strings (empty = valid). */
export function validateSceneFile(data: unknown): string[] {
  const problems: string[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["scene file must be a JSON object"];
  }
  const raw = data as Record<string, unknown>;
  if (raw.format !== undefined && raw.format !== SCENE_FORMAT) {
    problems.push(`unexpected format "${String(raw.format)}"`);
  }
  if (typeof raw.version === "number" && raw.version > SCENE_FORMAT_VERSION) {
    problems.push(`version ${raw.version} is newer than supported (${SCENE_FORMAT_VERSION})`);
  }
  if (!Array.isArray(raw.entities)) {
    problems.push("missing entities array");
    return problems;
  }
  const seen = new Set<number>();
  for (const [index, entry] of (raw.entities as unknown[]).entries()) {
    if (!entry || typeof entry !== "object") {
      problems.push(`entity at index ${index} is not an object`);
      continue;
    }
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "number" || !Number.isInteger(item.id) || item.id < 1) {
      problems.push(`entity at index ${index} has an invalid id`);
    } else if (seen.has(item.id)) {
      problems.push(`duplicate entity id ${item.id}`);
    } else {
      seen.add(item.id);
    }
    if (item.components !== undefined) {
      if (
        !item.components || typeof item.components !== "object" || Array.isArray(item.components)
      ) {
        problems.push(`entity ${String(item.id)} components must be an object`);
        continue;
      }
      for (const [name, value] of Object.entries(item.components as Record<string, unknown>)) {
        if (!componentByName(name)) {
          problems.push(`entity ${String(item.id)} has unknown component "${name}"`);
        }
        if (!value || typeof value !== "object") {
          problems.push(`entity ${String(item.id)} component "${name}" must be an object`);
        }
      }
    }
  }
  return problems;
}

/** Entity ids referenced by a Parent component that are not present in the file. */
export function danglingParentReferences(file: { entities: SerializedEntity[] }): number[] {
  const ids = new Set(file.entities.map((entity) => entity.id));
  const dangling: number[] = [];
  for (const entity of file.entities) {
    const parent = entity.components.Parent as { entity?: number } | undefined;
    if (parent && typeof parent.entity === "number" && !ids.has(parent.entity)) {
      dangling.push(entity.id);
    }
  }
  return dangling;
}

/** Round-trip check used by tests and by the editor before writing to disk. */
export function roundTrips(scene: Scene): boolean {
  const restored = deserializeScene(JSON.parse(sceneToJson(scene)));
  return sceneToJson(restored) === sceneToJson(scene);
}

/** Convenience for tests and tools: build a scene from a raw file object. */
export function sceneFromFileObject(data: unknown, options: SceneLoadOptions = {}): Scene {
  return deserializeScene(data, options);
}
