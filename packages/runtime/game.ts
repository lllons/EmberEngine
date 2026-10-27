/**
 * @ember/runtime/game — the game definition and its wiring.
 *
 * Owner: this file owns "what a game is": an id, a title, a set of named scenes, the scripts
 * and systems it adds, and the services it provides. Editor, CLI, player and tests all build
 * a session through `Game.createSession`, so a game behaves identically in every host.
 */

import {
  createRng,
  type Diagnostics,
  type InputSnapshot,
  InputState,
  listSceneFiles,
  readSceneFile,
  type Rng,
  type Scene,
  type Size,
} from "@ember/core";
import { RuntimeHost, type RuntimeHostOptions } from "./host.ts";
import { defaultScripts, ScriptRegistry } from "./scripting.ts";
import { RuntimeSession, type System } from "./session.ts";
import { defaultSystems } from "./systems.ts";

export type SceneSource = Scene | (() => Scene);

export interface GameDefinition {
  /** Stable machine id, e.g. "ember-runner". */
  id: string;
  /** Human title shown by the editor and the exported player. */
  title: string;
  version?: string;
  /** Named scenes; a factory produces a fresh instance for each new session. */
  scenes?: Record<string, SceneSource>;
  /** Scene a session starts in; defaults to the first scene defined. */
  start?: string;
  scripts?: ScriptRegistry;
  /** Systems appended after the built-ins. */
  systems?: readonly System[];
  /** Services exposed to systems and scripts via `ctx.services`. */
  services?: () => Record<string, unknown>;
  /** Final hook after a session is built (add systems, provide services, subscribe). */
  configure?: (session: RuntimeSession) => void;
  seed?: number | string;
  /** Overrides every scene's configured viewport when set. */
  viewport?: Size;
}

export interface SessionOptions {
  seed?: number | string;
  diagnostics?: Diagnostics;
  input?: InputState | InputSnapshot;
  services?: Record<string, unknown>;
  /** Replaces the built-in systems entirely (tests) instead of appending to them. */
  systems?: readonly System[];
  scripts?: ScriptRegistry;
  rng?: Rng;
  fixedDt?: number;
}

export class Game {
  readonly definition: GameDefinition;
  private scenes = new Map<string, SceneSource>();
  private loadOrder: string[] = [];

  constructor(definition: GameDefinition) {
    if (!definition.id) throw new Error("game id must not be empty");
    this.definition = definition;
    for (const [name, scene] of Object.entries(definition.scenes ?? {})) {
      this.registerScene(name, scene);
    }
  }

  get id(): string {
    return this.definition.id;
  }

  get title(): string {
    return this.definition.title;
  }

  get version(): string {
    return this.definition.version ?? "0.1.0";
  }

  /** Name of the scene new sessions start in. */
  get startScene(): string {
    const start = this.definition.start;
    if (start && this.scenes.has(start)) return start;
    const first = this.loadOrder[0];
    if (!first) throw new Error(`game "${this.id}" defines no scenes`);
    return first;
  }

  registerScene(name: string, source: SceneSource): void {
    if (!name) throw new Error("scene name must not be empty");
    if (!this.scenes.has(name)) this.loadOrder.push(name);
    this.scenes.set(name, source);
  }

  removeScene(name: string): boolean {
    const removed = this.scenes.delete(name);
    if (removed) this.loadOrder = this.loadOrder.filter((item) => item !== name);
    return removed;
  }

  hasScene(name: string): boolean {
    return this.scenes.has(name);
  }

  sceneNames(): string[] {
    return [...this.loadOrder];
  }

  get sceneCount(): number {
    return this.scenes.size;
  }

  /** Builds a fresh `Scene` from the registered source (factories are called each time). */
  createScene(name: string): Scene {
    const source = this.scenes.get(name);
    if (!source) throw new Error(`game "${this.id}" has no scene "${name}"`);
    const scene = typeof source === "function" ? source() : source.clone();
    if (this.definition.viewport) scene.resources.viewport = { ...this.definition.viewport };
    return scene;
  }

  /** Merged script registry: the engine's default plus this game's additions. */
  scripts(): ScriptRegistry {
    const registry = new ScriptRegistry();
    registry.merge(defaultScripts);
    if (this.definition.scripts) registry.merge(this.definition.scripts);
    return registry;
  }

  /** Full system list: built-ins followed by the game's own systems. */
  systems(scripts: ScriptRegistry = this.scripts()): System[] {
    const builtins = defaultSystems({ scripts });
    return [...builtins, ...(this.definition.systems ?? [])];
  }

  createSession(sceneName = this.startScene, options: SessionOptions = {}): RuntimeSession {
    const services = {
      ...(this.definition.services?.() ?? {}),
      ...(options.services ?? {}),
    };
    const session = new RuntimeSession({
      scene: this.createScene(sceneName),
      systems: options.systems ?? this.systems(options.scripts ?? this.scripts()),
      input: options.input,
      seed: options.seed ?? this.definition.seed ?? 1,
      rng: options.rng ?? createRng(options.seed ?? this.definition.seed ?? 1),
      diagnostics: options.diagnostics,
      services,
      fixedDt: options.fixedDt,
    });
    this.definition.configure?.(session);
    session.diagnostics.info(`session started`, {
      game: this.id,
      scene: session.scene.name,
    });
    return session;
  }

  createHost(
    sceneName = this.startScene,
    options: SessionOptions & RuntimeHostOptions = {},
  ): RuntimeHost {
    const session = this.createSession(sceneName, options);
    return new RuntimeHost(session, {
      fixedDt: options.fixedDt,
      maxSteps: options.maxSteps,
      fpsWindow: options.fpsWindow,
    });
  }

  /**
   * Loads every `.emberscene` in a directory as a scene named after its file (without the
   * extension). Returns the loaded names in file order; files that cannot be parsed are
   * reported through `onWarning` and skipped, so one bad file never blocks the editor.
   */
  async loadSceneDirectory(
    directory: string,
    options: { onWarning?: (message: string) => void } = {},
  ): Promise<string[]> {
    const loaded: string[] = [];
    for (const path of await listSceneFiles(directory)) {
      const name = path.slice(path.replace(/\\/g, "/").lastIndexOf("/") + 1).replace(
        /\.emberscene$/,
        "",
      );
      try {
        const scene = await readSceneFile(path, { onWarning: options.onWarning });
        scene.name = name;
        this.registerScene(name, () => scene.clone());
        loaded.push(name);
      } catch (error) {
        options.onWarning?.(`skipped ${path}: ${(error as Error).message}`);
      }
    }
    return loaded;
  }

  describe(): {
    id: string;
    title: string;
    version: string;
    start: string | null;
    scenes: string[];
    systems: string[];
    scripts: string[];
  } {
    const scripts = this.scripts();
    return {
      id: this.id,
      title: this.title,
      version: this.version,
      start: this.sceneCount > 0 ? this.startScene : null,
      scenes: this.sceneNames(),
      systems: this.systems(scripts).map((system) => system.name),
      scripts: scripts.names(),
    };
  }
}

export function defineGame(definition: GameDefinition): Game {
  return new Game(definition);
}
