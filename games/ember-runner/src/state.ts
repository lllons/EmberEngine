/**
 * games/ember-runner — run state.
 *
 * Owner: this file owns the game's mutable state and the service keys it is reached
 * through. Systems, scripts, the HUD and the tests all read the same object, so "what is
 * the score?" has exactly one answer per session.
 */

import type { RuntimeSession } from "@ember/runtime";

export type RunStatus = "playing" | "dead" | "won";

export interface RunState {
  status: RunStatus;
  score: number;
  coins: number;
  lives: number;
  /** Seconds survived in the current attempt. */
  time: number;
  /** Highest score reached in this process (persists across restarts). */
  best: number;
  /** How many times the level has been restarted. */
  attempts: number;
  /** Hazards that touched the player this attempt. */
  hits: number;
  message: string;
}

/** Service key used to reach the run state from systems and scripts. */
export const RUN_STATE = "runState";
/** Service key: `(sceneName: string) => void` — load another scene. */
export const GOTO_SCENE = "gotoScene";
/** Service key: `() => void` — restart the current scene and reset the run. */
export const RESTART = "restart";

export function createRunState(): RunState {
  return {
    status: "playing",
    score: 0,
    coins: 0,
    lives: 3,
    time: 0,
    best: 0,
    attempts: 1,
    hits: 0,
    message: "collect the embers, reach the gate",
  };
}

/** The session's run state, created on first use. */
export function runState(session: RuntimeSession): RunState {
  const existing = session.service<RunState>(RUN_STATE);
  if (existing) return existing;
  const state = createRunState();
  session.provide(RUN_STATE, state);
  return state;
}

/** Resets a run in place (keeps `best` and bumps the attempt counter). */
export function resetRun(state: RunState): void {
  state.best = Math.max(state.best, state.score);
  state.status = "playing";
  state.score = 0;
  state.coins = 0;
  state.lives = 3;
  state.time = 0;
  state.hits = 0;
  state.message = "collect the embers, reach the gate";
}

/** Adds score and remembers the best run. */
export function award(state: RunState, points: number): void {
  state.score += points;
  state.best = Math.max(state.best, state.score);
}

/** One-line status for the HUD and for test failures. */
export function describeRun(state: RunState): string {
  return `${state.status} score=${state.score} coins=${state.coins} lives=${state.lives} ` +
    `time=${state.time.toFixed(1)}s best=${state.best}`;
}
