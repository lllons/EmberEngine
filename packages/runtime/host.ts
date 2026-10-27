/**
 * @ember/runtime/host — the game loop.
 *
 * Owner: this file owns the *variable* frame clock. One host frame accumulates real time,
 * runs zero or more fixed steps (via `RuntimeSession.step`) and reports frame stats.
 * The editor's play mode, the exported player and the tests all drive games through it,
 * so "how the game advances" has exactly one implementation.
 */

import { FixedStepAccumulator, FpsMeter, InputScript, type InputSnapshot } from "@ember/core";
import type { RuntimeSession, StepResult } from "./session.ts";

export interface RuntimeHostOptions {
  fixedDt?: number;
  /** Max fixed steps per host frame; extra time is dropped to avoid the death spiral. */
  maxSteps?: number;
  fpsWindow?: number;
}

export interface HostFrameResult {
  /** Fixed steps simulated during this call. */
  steps: number;
  /** Seconds of real time discarded because `maxSteps` was hit. */
  droppedSeconds: number;
  /** Interpolation factor between the previous and current step (0..1). */
  alpha: number;
  /** Simulated seconds after this frame. */
  time: number;
  /** Fixed steps simulated since the session was created. */
  frame: number;
  /** Smoothed host frames per second. */
  fps: number;
  results: StepResult[];
}

export class RuntimeHost {
  readonly session: RuntimeSession;
  readonly accumulator: FixedStepAccumulator;
  readonly fps: FpsMeter;

  constructor(session: RuntimeSession, options: RuntimeHostOptions = {}) {
    this.session = session;
    this.accumulator = new FixedStepAccumulator(
      options.fixedDt ?? session.fixedDt,
      options.maxSteps ?? 5,
    );
    this.fps = new FpsMeter(options.fpsWindow ?? 60);
  }

  get fixedDt(): number {
    return this.accumulator.fixedDt;
  }

  /**
   * Advances by one real-time delta. `snapshot` carries this frame's input edges and is
   * applied to the first fixed step only, so extra steps in the same frame keep the same
   * held keys without re-triggering "pressed" edges.
   */
  advance(realDt: number, snapshot?: InputSnapshot): HostFrameResult {
    this.fps.sample(realDt);
    const plan = this.accumulator.advance(realDt);
    const results: StepResult[] = [];
    for (let i = 0; i < plan.steps; i++) {
      results.push(this.session.step(this.fixedDt, i === 0 ? snapshot : undefined));
    }
    return {
      steps: plan.steps,
      droppedSeconds: plan.droppedSeconds,
      alpha: plan.alpha,
      time: this.session.time,
      frame: this.session.frame,
      fps: this.fps.fps,
      results,
    };
  }

  /** Runs exactly `steps` fixed steps, ignoring the accumulator (tests, headless runs). */
  tick(steps = 1, snapshot?: InputSnapshot): StepResult {
    let last = this.session.step(this.fixedDt, snapshot);
    for (let i = 1; i < steps; i++) last = this.session.step(this.fixedDt, undefined);
    return last;
  }

  /**
   * Simulates `seconds` of game time deterministically, feeding `script` one snapshot per
   * frame. Used by tests, by `ember play --headless` and by recorded-input replays.
   */
  simulate(seconds: number, script?: InputScript | readonly InputSnapshot[]): StepResult {
    const frames = Math.max(1, Math.round(seconds / this.fixedDt));
    const provided = script instanceof InputScript ? script.frames : (script ?? []);
    let last = this.tick(1, provided[0]);
    for (let frame = 1; frame < frames; frame++) {
      last = this.tick(1, provided[frame]);
    }
    return last;
  }

  reset(): void {
    this.accumulator.reset();
    this.fps.reset();
    this.session.reset();
  }
}
