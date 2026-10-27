/**
 * games/flappy — run state.
 *
 * Owner: this file owns the score, the best score and whether the bird is alive. Systems,
 * scripts, the HUD and the tests read the same object through the session service, so
 * "what is my score?" has exactly one answer per session.
 */

import type { RuntimeSession } from "@ember/runtime";

export type FlapStatus = "ready" | "playing" | "dead";

export interface FlappyState {
  status: FlapStatus;
  score: number;
  /** Highest score in this process; survives restarts and scene changes. */
  best: number;
  /** Seconds the current run has been alive. */
  time: number;
  /** Seconds since the last death; the restart guard. */
  deadFor: number;
  /** Short reason shown on the game-over card. */
  message: string;
}

export const RUN_STATE = "flappyRun";
/** Service key: `(sceneName: string) => void` — load another scene. */
export const GOTO_SCENE = "flappyGoto";
/** Service key: `() => void` — start a fresh run in the play scene. */
export const RESTART = "flappyRestart";

export function createRunState(): FlappyState {
  return {
    status: "ready",
    score: 0,
    best: 0,
    time: 0,
    deadFor: 0,
    message: "tap to flap",
  };
}

/** The session's run state, created on first use. */
export function runState(session: RuntimeSession): FlappyState {
  const existing = session.service<FlappyState>(RUN_STATE);
  if (existing) return existing;
  const state = createRunState();
  session.provide(RUN_STATE, state);
  return state;
}

/** Resets a run in place; `best` deliberately survives. */
export function resetRun(state: FlappyState): void {
  state.best = Math.max(state.best, state.score);
  state.status = "playing";
  state.score = 0;
  state.time = 0;
  state.deadFor = 0;
  state.message = "tap to flap";
}

/** One pipe cleared. */
export function awardPoint(state: FlappyState): number {
  state.score += 1;
  state.best = Math.max(state.best, state.score);
  return state.score;
}

export function endRun(state: FlappyState, reason: string): void {
  if (state.status !== "playing") return;
  state.status = "dead";
  state.best = Math.max(state.best, state.score);
  state.deadFor = 0;
  state.message = reason;
}

/** One-line description used by the HUD and by failing tests. */
export function describeRun(state: FlappyState): string {
  return `${state.status} score=${state.score} best=${state.best} time=${state.time.toFixed(1)}s`;
}
