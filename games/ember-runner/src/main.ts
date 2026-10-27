/**
 * games/ember-runner — the game module.
 *
 * Owner: this file owns the game's wiring. Everything that runs the game imports it:
 * the CLI (`ember play`, `ember export`), the editor's Play mode, the exported executable
 * and the tests. It exports exactly three things they need: the id/title, `createGame` and
 * the procedural texture set.
 */

import { type Scene } from "@ember/core";
import { type Game, Game as GameClass, type RuntimeSession } from "@ember/runtime";
import { GAME_ID, GAME_TITLE, GAME_VERSION, LEVEL_ONE, LEVEL_SPECS, START_SCENE, TITLE_SCENE, buildScenes } from "./scenes.ts";
import { createRunnerScripts } from "./scripts.ts";
import { GOTO_SCENE, RESTART, RUN_STATE, createRunState, resetRun, runState } from "./state.ts";
import { cleanupSystem, runnerSystems, spawnerSystem } from "./systems.ts";
import { textureSources } from "./textures.ts";

export { GAME_ID, GAME_TITLE, GAME_VERSION, START_SCENE, TITLE_SCENE, LEVEL_ONE };
export { LEVEL_SPECS, buildLevelScene, buildScenes, levelSpec, sceneNames } from "./scenes.ts";
export { textureSources, textureNames } from "./textures.ts";
export { RUN_STATE, GOTO_SCENE, RESTART, createRunState, resetRun, runState } from "./state.ts";
export type { RunState, RunStatus } from "./state.ts";
export { runnerSystems, spawnerSystem, cleanupSystem } from "./systems.ts";
export { createRunnerScripts, PLAYER_SCRIPT, PICKUP_SCRIPT, HAZARD_SCRIPT, GOAL_SCRIPT, HUD_SCRIPT, TITLE_SCRIPT } from "./scripts.ts";
export {
  createEmber,
  createGate,
  createGround,
  createHazard,
  createHudLine,
  createPlayer,
  createText,
  COIN_TAG,
  GOAL_TAG,
  HAZARD_TAG,
  PLAYER_TAG,
} from "./entities.ts";

export interface CreateGameOptions {
  /** Scenes loaded from disk; when omitted the built-in levels are used. */
  scenes?: Map<string, Scene>;
  /** Scene to start in (defaults to `level-1`). */
  start?: string;
  seed?: number | string;
}

/**
 * Builds the game. Passing `scenes` (as the editor, the exporter and `ember play` do) makes
 * the on-disk scene files the source of truth; omitting them uses the built-in levels.
 */
export function createGame(options: CreateGameOptions = {}): Game {
  const scenes = options.scenes ?? buildScenes();
  const sceneRecord: Record<string, Scene> = {};
  for (const [name, scene] of scenes) sceneRecord[name] = scene;

  const scripts = createRunnerScripts();
  const start = options.start ?? (sceneRecord[START_SCENE] ? START_SCENE : TITLE_SCENE);

  const game: Game = new GameClass({
    id: GAME_ID,
    title: GAME_TITLE,
    version: GAME_VERSION,
    scenes: sceneRecord,
    start,
    scripts,
    systems: [...runnerSystems(), cleanupSystem({ x: -200, y: -400, w: 3400, h: 1200 })],
    seed: options.seed ?? "ember-runner",
    services: () => ({ [RUN_STATE]: createRunState() }),
    configure: (session: RuntimeSession) => {
      const state = runState(session);

      // Scene transitions: a script/system asks for a scene by name, the game loads it.
      const goto = (name: string) => {
        if (!game.hasScene(name)) {
          session.diagnostics.warn(`unknown scene "${name}"`, { from: session.scene.name });
          return;
        }
        state.attempts += 1;
        resetRun(state);
        session.setScene(game.createScene(name));
        session.diagnostics.info(`scene changed`, { to: name, attempt: state.attempts });
      };

      session.provide(GOTO_SCENE, goto);
      session.provide(RESTART, () => {
        state.attempts += 1;
        resetRun(state);
        session.setScene(game.createScene(session.scene.name));
        session.diagnostics.info("run restarted", { attempt: state.attempts });
      });

      // Keep a small in-session event log; the editor's console panel reads these records.
      for (const type of ["runner.pickup", "runner.hit", "runner.won", "runner.jump", "collision"]) {
        session.events.on(type, (payload) => {
          session.diagnostics.debug(`event ${type}`, { payload: summarise(payload) });
        });
      }
      session.events.on("runner.pickup", (payload) => {
        const points = (payload as { points?: number }).points ?? 0;
        session.diagnostics.info(`ember collected`, { points });
      });
      session.events.on("runner.won", () => session.diagnostics.info("gate reached"));
      session.events.on("runner.hit", (payload) => {
        session.diagnostics.warn("hazard hit", { lives: (payload as { lives?: number }).lives ?? 0 });
      });
    },
  });

  // The title screen uses the same systems, so a stray spawn never appears before play.
  void TITLE_SCENE;
  return game;
}

function summarise(payload: unknown): string {
  if (!payload || typeof payload !== "object") return String(payload);
  const entries = Object.entries(payload as Record<string, unknown>).slice(0, 4);
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(" ");
}

/** Default scene a new session uses; the CLI prints it in `ember info`. */
export const DEFAULT_SCENE = START_SCENE;
