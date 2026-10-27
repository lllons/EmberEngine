/**
 * games/flappy — the game module.
 *
 * Owner: this file owns the wiring. Everything that runs the game imports it: `ember play`,
 * `ember export`, the editor's Play mode and the tests. It exports exactly what a host
 * needs: the identity, `createGame`, the scene builder and the procedural textures.
 */

import type { Scene } from "@ember/core";
import { type Game, Game as GameClass, type RuntimeSession } from "@ember/runtime";
import {
  GAME_ID,
  GAME_TITLE,
  GAME_VERSION,
  PLAY_SCENE,
  START_SCENE,
  TITLE_SCENE,
} from "./names.ts";
import { buildScenes } from "./scenes.ts";
import { createFlappyScripts } from "./scripts.ts";
import { flappySystems } from "./systems.ts";
import { createRunState, GOTO_SCENE, RESTART, resetRun, RUN_STATE, runState } from "./state.ts";
import { textureSources } from "./textures.ts";

export { GAME_ID, GAME_TITLE, GAME_VERSION, START_SCENE, TITLE_SCENE, PLAY_SCENE };
export { buildScenes, sceneNames } from "./scenes.ts";
export { textureSources, textureNames } from "./textures.ts";
export { RUN_STATE, GOTO_SCENE, RESTART, createRunState, resetRun, runState } from "./state.ts";
export type { FlappyState, FlapStatus } from "./state.ts";
export { createFlappyScripts, BIRD_SCRIPT, TITLE_SCRIPT } from "./scripts.ts";
export {
  cleanupSystem,
  collisionDeathSystem,
  flappySystems,
  hudSystem,
  pipeSpawnerSystem,
  restartSystem,
  scoringSystem,
  timerSystem,
} from "./systems.ts";
export {
  BIRD_TAG,
  createBird,
  createGround,
  createPipePair,
  createText,
  createTitleTrigger,
  GROUND_TAG,
  PIPE_TAG,
  SCORE_TAG,
} from "./entities.ts";
export {
  BIRD_X,
  BIRD_Y,
  GAP_MAX,
  GAP_MIN,
  GROUND_TOP,
  PIPE_GAP,
  PIPE_INTERVAL,
  PIPE_SPEED,
  PIPE_WIDTH,
  VIEWPORT,
} from "./names.ts";

export interface CreateGameOptions {
  /** Scenes loaded from disk; when omitted the built-in scenes are used. */
  scenes?: Map<string, Scene>;
  start?: string;
  seed?: number | string;
}

/** Builds the game; passing `scenes` makes scene files (or a bundle) the source of truth. */
export function createGame(options: CreateGameOptions = {}): Game {
  const scenes = options.scenes ?? buildScenes();
  const sceneRecord: Record<string, Scene> = {};
  for (const [name, scene] of scenes) sceneRecord[name] = scene;

  const start = options.start ?? (sceneRecord[START_SCENE] ? START_SCENE : PLAY_SCENE);

  const game: Game = new GameClass({
    id: GAME_ID,
    title: GAME_TITLE,
    version: GAME_VERSION,
    scenes: sceneRecord,
    start,
    scripts: createFlappyScripts(),
    systems: flappySystems(),
    seed: options.seed ?? "flappy-ember",
    services: () => ({ [RUN_STATE]: createRunState() }),
    configure: (session: RuntimeSession) => {
      const state = runState(session);
      // Opening the play scene directly (CLI --scene, editor, tests) is a live run; the
      // title screen is the only place that waits for a start gesture.
      if (session.scene.name === PLAY_SCENE && state.status === "ready") state.status = "playing";

      const goto = (name: string) => {
        if (!game.hasScene(name)) {
          session.diagnostics.warn(`unknown scene "${name}"`, { from: session.scene.name });
          return;
        }
        resetRun(state);
        state.status = name === PLAY_SCENE ? "playing" : "ready";
        session.setScene(game.createScene(name));
        session.diagnostics.info("scene changed", { to: name });
      };

      session.provide(GOTO_SCENE, goto);
      session.provide(RESTART, () => {
        resetRun(state);
        session.setScene(game.createScene(PLAY_SCENE));
        session.diagnostics.info("run restarted");
      });

      session.events.on("flappy.dead", (payload) => {
        const details = payload as { score?: number; reason?: string };
        session.diagnostics.info("run ended", { score: details.score ?? 0, reason: details.reason ?? "" });
      });
      session.events.on("flappy.point", (payload) => {
        const details = payload as { score?: number };
        session.diagnostics.debug("pipe cleared", { score: details.score ?? 0 });
      });
    },
  });

  return game;
}

/** Default scene a fresh session sits on; the CLI prints it in `ember info`. */
export const DEFAULT_SCENE = START_SCENE;
