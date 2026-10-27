/**
 * @ember/mcp/tools — the engine actions an agent can call from chat.
 *
 * Owner: this file owns the *tool surface* of the MCP server. Every tool maps onto the
 * same packages the editor and CLI use (`@ember/gameloader`, `@ember/core`,
 * `@ember/runtime`, `@ember/packager`), so an agent editing a scene and a human editing it
 * in the native editor are talking to one engine, not two implementations.
 *
 * Tools deliberately return JSON-friendly data and act on `.emberscene` files, which keeps
 * the chat-facing API small and makes every change reviewable in git.
 */

import {
  type Color,
  componentByName,
  componentNames,
  type Entity,
  Scene,
  sceneToJson,
  type Size,
  type Vec2,
} from "@ember/core";
import {
  absolutePath,
  type GameDescriptor,
  listGameSceneFiles,
  loadGame,
  loadGameDescriptor,
  readScene,
  writeScene,
} from "@ember/gameloader";
import { exportGame, placeExportedGame, resolveExportTarget, verifyExport } from "@ember/packager";
import { compileInlineScript, sceneDigest } from "@ember/runtime";

export const DEFAULT_GAME = "games/ember-runner";

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  /** Structured payload; the server renders it as pretty JSON text for the model. */
  data: unknown;
  /** Set when the tool failed in a way the agent should see (bad args, missing scene…). */
  isError?: boolean;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;

export interface Tool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

const stringSchema = (description: string) => ({ type: "string", description });

const gameProperty = stringSchema(
  `Game folder containing game.json (default: ${DEFAULT_GAME}, or EMBER_GAME).`,
);

function gameArgument(args: Record<string, unknown>): string {
  const fromArgs = typeof args.game === "string" && args.game.trim() ? args.game.trim() : null;
  const fromEnv = Deno.env.get("EMBER_GAME");
  return fromArgs ?? fromEnv ?? DEFAULT_GAME;
}

function text(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberArg(args: Record<string, unknown>, key: string, fallback?: number): number {
  const value = args[key];
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    throw new Error(`"${key}" is required and must be a number`);
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`"${key}" must be a number`);
  return parsed;
}

function recordArg(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`"${key}" must be an object`);
  }
  return value as Record<string, unknown>;
}

function vec2Arg(value: unknown, key: string): Vec2 | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`"${key}" must be { x, y }`);
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.x !== "number" || typeof raw.y !== "number") {
    throw new Error(`"${key}" must have numeric x and y`);
  }
  return { x: raw.x, y: raw.y };
}

async function descriptorFor(args: Record<string, unknown>): Promise<GameDescriptor> {
  try {
    return await loadGameDescriptor(gameArgument(args));
  } catch (error) {
    throw new Error(
      `${(error as Error).message}\nHint: start the agent in the engine workspace (the folder with game.json), or pass "game".`,
    );
  }
}

/** Reads a scene file, or explains which scenes do exist. */
async function editableScene(
  descriptor: GameDescriptor,
  name: string,
): Promise<{ scene: Scene; existed: boolean }> {
  const scene = await readScene(descriptor, name);
  if (scene) return { scene, existed: true };
  const files = await listGameSceneFiles(descriptor);
  const available = files.map((file) => file.name);
  if (available.length === 0) {
    return { scene: new Scene({ name }), existed: false };
  }
  throw new Error(
    `no scene "${name}" in ${descriptor.scenesDirectory}` +
      (available.length ? ` — available: ${available.join(", ")}` : ""),
  );
}

function resolveEntity(scene: Scene, selector: unknown): Entity {
  if (typeof selector === "number") {
    if (!scene.world.isAlive(selector)) throw new Error(`entity ${selector} does not exist`);
    return selector;
  }
  if (typeof selector === "string" && selector.trim()) {
    const byName = scene.findByName(selector.trim());
    if (byName !== undefined) return byName;
    const asNumber = Number(selector);
    if (Number.isInteger(asNumber) && scene.world.isAlive(asNumber)) return asNumber;
    const labels = scene.world.entities().map((entity) => scene.labelOf(entity));
    throw new Error(
      `no entity named "${selector}"` +
        (labels.length ? ` — available: ${labels.join(", ")}` : " (the scene is empty)"),
    );
  }
  throw new Error('"entity" must be an entity id (number) or a name (string)');
}

function applyComponents(
  scene: Scene,
  entity: Entity,
  components: Record<string, unknown> | undefined,
): string[] {
  if (!components) return [];
  const changed: string[] = [];
  for (const [name, patch] of Object.entries(components)) {
    const type = componentByName(name);
    if (!type) {
      throw new Error(
        `unknown component "${name}" — known components: ${componentNames().join(", ")}`,
      );
    }
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error(`component "${name}" must be an object of fields`);
    }
    if (scene.world.has(entity, type)) scene.world.set(entity, type, patch as object);
    else scene.world.add(entity, type, patch as object);
    changed.push(name);
  }
  return changed;
}

function entitySummary(scene: Scene, entity: Entity): Record<string, unknown> {
  const components: Record<string, unknown> = {};
  for (const name of scene.world.componentsOf(entity)) {
    const type = componentByName(name);
    if (!type) continue;
    components[name] = scene.world.get(entity, type);
  }
  return { id: entity, name: scene.labelOf(entity), components };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function createEngineTools(): Tool[] {
  const tools: Tool[] = [];

  tools.push({
    definition: {
      name: "engine_info",
      title: "Describe the game",
      description:
        "Describe the EmberEngine game in this workspace: folder, scenes, start scene, registered systems and scripts. Call this first to learn what exists before editing.",
      inputSchema: {
        type: "object",
        properties: { game: gameProperty },
        additionalProperties: false,
      },
    },
    handler: async (args) => {
      const gamePath = gameArgument(args);
      const loaded = await loadGame(gamePath);
      const described = loaded.game.describe();
      return {
        data: {
          ...described,
          folder: loaded.descriptor.directory,
          scenesDirectory: loaded.descriptor.scenesDirectory,
          sceneSource: loaded.sceneSource,
          warnings: loaded.warnings,
        },
      };
    },
  });

  tools.push({
    definition: {
      name: "component_catalog",
      title: "List components and their defaults",
      description:
        "List every component an entity can have, with its default field values. Use this to write correct component names and fields for entity_add/entity_update.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    handler: () => {
      const components: Record<string, unknown> = {};
      for (const name of componentNames()) {
        const type = componentByName(name);
        if (type) components[name] = type.create();
      }
      return {
        data: {
          components,
          notes: [
            "Entities always have Transform; scene.createEntity also adds Name when a name is given.",
            "Script components: { name, props, source } — `source` is inline JavaScript and wins over `name`.",
          ],
        },
      };
    },
  });

  tools.push({
    definition: {
      name: "scene_list",
      title: "List scenes",
      description:
        "List the game's .emberscene files with entity counts, plus the directory they live in.",
      inputSchema: {
        type: "object",
        properties: { game: gameProperty },
        additionalProperties: false,
      },
    },
    handler: async (args) => {
      const descriptor = await descriptorFor(args);
      const files = await listGameSceneFiles(descriptor);
      const scenes: Array<Record<string, unknown>> = [];
      for (const file of files) {
        let entities = 0;
        let problems: string[] = [];
        try {
          const scene = await readScene(descriptor, file.name);
          entities = scene?.entityCount ?? 0;
        } catch (error) {
          problems = [(error as Error).message];
        }
        scenes.push({
          name: file.name,
          path: file.path,
          bytes: (await Deno.stat(file.path)).size,
          entities,
          ...(problems.length ? { problems } : {}),
        });
      }
      return { data: { directory: descriptor.scenesDirectory, scenes } };
    },
  });

  tools.push({
    definition: {
      name: "scene_read",
      title: "Read a scene",
      description:
        "Read one scene as its .emberscene JSON: resources (background, gravity, viewport, cameras) and entities with their components. Filter with `entity` (id or name) to keep the response small.",
      inputSchema: {
        type: "object",
        properties: {
          scene: stringSchema("Scene name (the .emberscene file name without extension)."),
          entity: {
            description: "Optional entity id or name to return only that entity.",
            type: ["number", "string"],
          },
          game: gameProperty,
        },
        required: ["scene"],
        additionalProperties: false,
      },
    },
    handler: async (args) => {
      const descriptor = await descriptorFor(args);
      const name = text(args, "scene");
      if (!name) throw new Error('"scene" is required');
      const scene = await readScene(descriptor, name);
      if (!scene) {
        const files = await listGameSceneFiles(descriptor);
        throw new Error(
          `no scene "${name}" — available: ${files.map((file) => file.name).join(", ") || "none"}`,
        );
      }
      const parsed = JSON.parse(sceneToJson(scene)) as Record<string, unknown>;
      if (args.entity !== undefined) {
        const entity = resolveEntity(scene, args.entity);
        const filter = new Set([entity]);
        const entities = (parsed.entities as Array<{ id: number }>).filter((entry) =>
          filter.has(entry.id)
        );
        return { data: { ...parsed, entities, entityCount: scene.entityCount } };
      }
      return { data: { ...parsed, entityCount: scene.entityCount, path: `${descriptor.scenesDirectory}/${scene.name}.emberscene` } };
    },
  });

  tools.push({
    definition: {
      name: "scene_create",
      title: "Create a scene",
      description:
        "Create (or with overwrite, replace) an .emberscene file. Optionally seed entities, each with a name, position and components. Returns the written scene.",
      inputSchema: {
        type: "object",
        properties: {
          scene: stringSchema("New scene name, e.g. level-3."),
          overwrite: { type: "boolean", description: "Replace the file if it exists." },
          background: stringSchema("Background colour, e.g. #050505."),
          gravity: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
          viewport: {
            type: "object",
            properties: { width: { type: "number" }, height: { type: "number" } },
          },
          entities: {
            type: "array",
            description:
              "Entities to add: { name?, position?: {x,y}, rotation?, scale?: {x,y}, components?: {Component: fields} }.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
                rotation: { type: "number" },
                scale: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
                components: { type: "object" },
              },
              additionalProperties: false,
            },
          },
          game: gameProperty,
        },
        required: ["scene"],
        additionalProperties: false,
      },
    },
    handler: async (args) => {
      const descriptor = await descriptorFor(args);
      const name = text(args, "scene");
      if (!name) throw new Error('"scene" is required');
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
        throw new Error('"scene" must be alphanumeric with dashes, dots or underscores');
      }
      const overwrite = args.overwrite === true;
      const existing = await readScene(descriptor, name);
      if (existing && !overwrite) {
        throw new Error(`scene "${name}" already exists — pass overwrite: true to replace it`);
      }
      const scene = new Scene({
        name,
        background: text(args, "background") as Color | undefined,
        gravity: vec2Arg(args.gravity, "gravity"),
        viewport: recordArg(args, "viewport") as Size | undefined,
      });
      const created: number[] = [];
      for (const raw of Array.isArray(args.entities) ? args.entities : []) {
        if (!raw || typeof raw !== "object") throw new Error('"entities" entries must be objects');
        const entry = raw as Record<string, unknown>;
        const entity = scene.createEntity({
          name: typeof entry.name === "string" ? entry.name : undefined,
          position: vec2Arg(entry.position, "position"),
          rotation: typeof entry.rotation === "number" ? entry.rotation : undefined,
          scale: vec2Arg(entry.scale, "scale"),
        });
        applyComponents(scene, entity, recordArg(entry, "components"));
        created.push(entity);
      }
      const path = await writeScene(descriptor, name, scene);
      return {
        data: {
          scene: name,
          path,
          entities: created.length,
          sceneJson: JSON.parse(sceneToJson(scene)),
        },
      };
    },
  });

  tools.push({
    definition: {
      name: "entity_add",
      title: "Add an entity",
      description:
        "Add an entity to a scene file and save it. Components are merged over their defaults, e.g. components: { RectShape: { width: 64, height: 64, color: \"#ff7a2f\" } }.",
      inputSchema: {
        type: "object",
        properties: {
          scene: stringSchema("Scene name to edit."),
          name: stringSchema("Display name for the new entity."),
          position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
          rotation: { type: "number" },
          scale: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
          components: {
            type: "object",
            description: "Component name -> fields to merge over the component defaults.",
          },
          game: gameProperty,
        },
        required: ["scene"],
        additionalProperties: false,
      },
    },
    handler: async (args) => {
      const descriptor = await descriptorFor(args);
      const name = text(args, "scene");
      if (!name) throw new Error('"scene" is required');
      const { scene } = await editableScene(descriptor, name);
      const entity = scene.createEntity({
        name: typeof args.name === "string" ? args.name : undefined,
        position: vec2Arg(args.position, "position"),
        rotation: typeof args.rotation === "number" ? args.rotation : undefined,
        scale: vec2Arg(args.scale, "scale"),
      });
      const components = applyComponents(scene, entity, recordArg(args, "components"));
      const path = await writeScene(descriptor, name, scene);
      return { data: { scene: name, path, entity: entitySummary(scene, entity), components } };
    },
  });

  tools.push({
    definition: {
      name: "entity_update",
      title: "Update an entity",
      description:
        "Rename an entity and/or merge component fields into it. Examples: { entity: \"Player\", name: \"Runner\" }, { entity: 3, components: { Transform: { position: { x: 120, y: 380 } } } }.",
      inputSchema: {
        type: "object",
        properties: {
          scene: stringSchema("Scene name to edit."),
          entity: {
            description: "Entity id (number) or name (string).",
            type: ["number", "string"],
          },
          name: stringSchema("New display name."),
          components: {
            type: "object",
            description: "Component name -> fields to merge into the existing component.",
          },
          game: gameProperty,
        },
        required: ["scene", "entity"],
        additionalProperties: false,
      },
    },
    handler: async (args) => {
      const descriptor = await descriptorFor(args);
      const sceneName = text(args, "scene");
      if (!sceneName) throw new Error('"scene" is required');
      const scene = await readScene(descriptor, sceneName);
      if (!scene) throw new Error(`no scene "${sceneName}"`);
      const entity = resolveEntity(scene, args.entity);
      if (typeof args.name === "string" && args.name.trim()) {
        const name = args.name.trim();
        const type = componentByName("Name");
        if (type && scene.world.has(entity, type)) scene.world.set(entity, type, { value: name });
        else applyComponents(scene, entity, { Name: { value: name } });
      }
      const components = applyComponents(scene, entity, recordArg(args, "components"));
      const path = await writeScene(descriptor, sceneName, scene);
      return { data: { scene: sceneName, path, entity: entitySummary(scene, entity), updated: components } };
    },
  });

  tools.push({
    definition: {
      name: "entity_delete",
      title: "Delete an entity",
      description: "Delete an entity (by id or name) from a scene file and save it.",
      inputSchema: {
        type: "object",
        properties: {
          scene: stringSchema("Scene name to edit."),
          entity: {
            description: "Entity id (number) or name (string).",
            type: ["number", "string"],
          },
          game: gameProperty,
        },
        required: ["scene", "entity"],
        additionalProperties: false,
      },
    },
    handler: async (args) => {
      const descriptor = await descriptorFor(args);
      const sceneName = text(args, "scene");
      if (!sceneName) throw new Error('"scene" is required');
      const scene = await readScene(descriptor, sceneName);
      if (!scene) throw new Error(`no scene "${sceneName}"`);
      const entity = resolveEntity(scene, args.entity);
      const label = scene.labelOf(entity);
      scene.world.despawn(entity);
      const path = await writeScene(descriptor, sceneName, scene);
      return { data: { scene: sceneName, path, deleted: { id: entity, name: label }, entities: scene.entityCount } };
    },
  });

  tools.push({
    definition: {
      name: "simulate",
      title: "Simulate a scene headlessly",
      description:
        "Run a scene through the real engine systems and scripts for N seconds with optional held keys, then report the digest, entity count, draw count and any warnings/errors. Use it to check that a change actually behaves.",
      inputSchema: {
        type: "object",
        properties: {
          scene: stringSchema("Scene to simulate (default: the game's start scene)."),
          seconds: { type: "number", description: "Simulated seconds (default 2, max 120)." },
          seed: {
            description: "Deterministic seed, number or string (default 'mcp').",
            type: ["number", "string"],
          },
          keys: {
            type: "array",
            items: { type: "string" },
            description: 'Held keys, e.g. ["ArrowRight", "Space"].',
          },
          game: gameProperty,
        },
        additionalProperties: false,
      },
    },
    handler: async (args) => {
      const loaded = await loadGame(gameArgument(args));
      const sceneName = text(args, "scene") ?? loaded.game.startScene;
      if (!loaded.game.hasScene(sceneName)) {
        throw new Error(
          `no scene "${sceneName}" — available: ${loaded.game.sceneNames().join(", ")}`,
        );
      }
      const seconds = Math.min(120, Math.max(0.05, numberArg(args, "seconds", 2)));
      const seed = (args.seed as number | string | undefined) ?? "mcp";
      const keys = Array.isArray(args.keys)
        ? args.keys.filter((key): key is string => typeof key === "string")
        : [];
      const session = loaded.game.createSession(sceneName, { seed });
      const frames = Math.max(1, Math.round(seconds / session.fixedDt));
      const before = { digest: sceneDigest(session.scene), entities: session.entityCount };
      const pressedOnly = {
        held: keys,
        pressed: keys,
        released: [],
        mouse: { x: 0, y: 0 },
        mouseHeld: [],
        mousePressed: [],
        mouseReleased: [],
      };
      const held = { ...pressedOnly, pressed: [], mousePressed: [] };
      for (let frame = 0; frame < frames; frame++) {
        session.step(session.fixedDt, frame === 0 && keys.length > 0 ? pressedOnly : held);
      }
      const drawList = session.drawList();
      const interesting = session.diagnostics.records.filter((record) =>
        record.level === "warn" || record.level === "error"
      );
      return {
        data: {
          game: loaded.descriptor.id,
          scene: sceneName,
          seconds,
          frames,
          seed,
          keys,
          before,
          after: {
            digest: sceneDigest(session.scene),
            entities: session.entityCount,
            draws: drawList.commands.length,
            culled: drawList.stats.culled,
            time: Number(session.time.toFixed(3)),
          },
          counters: Object.fromEntries(session.diagnostics.counters),
          logs: interesting.slice(-40).map((record) => ({
            level: record.level,
            message: record.message,
            data: record.data,
          })),
          chained: before.digest !== sceneDigest(session.scene),
        },
      };
    },
  });

  tools.push({
    definition: {
      name: "script_check",
      title: "Check inline script source",
      description:
        "Compile inline JavaScript (the Script component's `source`) without running it and report syntax errors. Source must be an expression evaluating to { start?, update?, destroy? } or a bare function.",
      inputSchema: {
        type: "object",
        properties: {
          source: stringSchema("Inline script source to validate."),
        },
        required: ["source"],
        additionalProperties: false,
      },
    },
    handler: (args) => {
      const source = typeof args.source === "string" ? args.source : "";
      if (!source.trim()) throw new Error('"source" must be a non-empty string');
      try {
        const behaviour = compileInlineScript(source);
        return {
          data: {
            ok: true,
            hooks: ["start", "update", "destroy"].filter((hook) =>
              typeof (behaviour as Record<string, unknown>)[hook] === "function"
            ),
          },
        };
      } catch (error) {
        return { data: { ok: false, error: (error as Error).message }, isError: true };
      }
    },
  });

  tools.push({
    definition: {
      name: "export_game",
      title: "Export the game",
      description:
        "Build the game's standalone .exe with the real export pipeline, optionally installing it to a folder/file and verifying the executable runs.",
      inputSchema: {
        type: "object",
        properties: {
          game: gameProperty,
          out: stringSchema("Folder or .exe path to install the build into (default: dist/)."),
          verify: { type: "boolean", description: "Run the built executable to verify it." },
        },
        additionalProperties: false,
      },
    },
    handler: async (args) => {
      const loaded = await loadGame(gameArgument(args));
      const workspaceRoot = absolutePath(".");
      const result = await exportGame({
        game: loaded.game,
        scenes: loaded.scenes,
        startScene: loaded.game.startScene,
        gameModulePath: loaded.descriptor.entryPath,
        gameDirectory: loaded.descriptor.directory,
        workspaceRoot,
      });
      let installed: string | null = null;
      const out = text(args, "out");
      if (out && result.exePath) {
        const target = resolveExportTarget(out, {
          workspaceRoot,
          gameId: loaded.descriptor.id,
          fallback: result.exePath,
        });
        installed = await placeExportedGame(result.exePath, target);
      }
      let verification: Awaited<ReturnType<typeof verifyExport>> | null = null;
      if (args.verify === true && result.exePath) {
        verification = await verifyExport(result.exePath, { expectScenes: result.scenes });
      }
      return {
        data: {
          game: loaded.descriptor.id,
          exePath: result.exePath,
          installed,
          exeBytes: result.exeBytes,
          scenes: result.scenes,
          startScene: result.startScene,
          warnings: [...loaded.warnings, ...result.warnings],
          verification,
        },
      };
    },
  });

  return tools;
}

/** Name → tool lookup used by the server's `tools/call` handler. */
export function toolMap(tools: readonly Tool[]): Map<string, Tool> {
  return new Map(tools.map((tool) => [tool.definition.name, tool]));
}
