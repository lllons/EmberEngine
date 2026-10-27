/**
 * @ember/core/time — frame scheduling primitives.
 *
 * Owner: this file owns fixed-timestep accumulation and frame statistics.
 * The runtime loop consumes it; nothing else does frame math.
 */

export const DEFAULT_FIXED_DT = 1 / 60;

/** Clamps a frame delta so a stalled host cannot teleport the simulation. */
export function clampDelta(dt: number, maxDelta = 0.25): number {
  if (!Number.isFinite(dt) || dt < 0) return 0;
  return dt > maxDelta ? maxDelta : dt;
}

export interface StepPlan {
  /** Number of fixed simulation steps to run this frame. */
  steps: number;
  /** Leftover time carried into the next frame (0..fixedDt). */
  remainder: number;
  /** Time not simulated because `maxSteps` was hit (dropped to avoid a death spiral). */
  droppedSeconds: number;
  /** Interpolation factor in [0, 1) between the previous and current step. */
  alpha: number;
}

/**
 * Accumulates variable real-time deltas into whole fixed steps.
 * Pure arithmetic: calling `plan()` twice with the same inputs gives the same plan.
 */
export class FixedStepAccumulator {
  readonly fixedDt: number;
  readonly maxSteps: number;
  private accumulator = 0;

  constructor(fixedDt = DEFAULT_FIXED_DT, maxSteps = 5) {
    if (!(fixedDt > 0)) throw new RangeError(`fixedDt must be > 0, got ${fixedDt}`);
    if (!(maxSteps >= 1)) throw new RangeError(`maxSteps must be >= 1, got ${maxSteps}`);
    this.fixedDt = fixedDt;
    this.maxSteps = maxSteps;
  }

  /** Seconds banked but not yet simulated. */
  pending(): number {
    return this.accumulator;
  }

  add(dt: number): void {
    this.accumulator += clampDelta(dt);
  }

  /** Computes the step plan for the banked time without consuming it. */
  plan(): StepPlan {
    const rawSteps = Math.floor(this.accumulator / this.fixedDt);
    const steps = Math.min(rawSteps, this.maxSteps);
    const remainder = this.accumulator - rawSteps * this.fixedDt;
    const droppedSeconds = (rawSteps - steps) * this.fixedDt;
    return {
      steps,
      remainder,
      droppedSeconds,
      alpha: remainder / this.fixedDt,
    };
  }

  /**
   * Plans and consumes: returns the number of steps to simulate now and keeps
   * the remainder for the next frame.
   */
  advance(dt: number): StepPlan {
    this.add(dt);
    const plan = this.plan();
    this.accumulator = plan.remainder;
    return plan;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

/** Rolling FPS/average-frame-time meter. */
export class FpsMeter {
  readonly window: number;
  private samples: number[] = [];

  constructor(window = 60) {
    if (window < 1) throw new RangeError("window must be >= 1");
    this.window = window;
  }

  /** Records a frame delta in seconds. */
  sample(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.samples.push(dt);
    if (this.samples.length > this.window) this.samples.shift();
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  /** Average delta in seconds, or 0 with no samples. */
  get averageDelta(): number {
    if (this.samples.length === 0) return 0;
    let total = 0;
    for (const dt of this.samples) total += dt;
    return total / this.samples.length;
  }

  get fps(): number {
    const average = this.averageDelta;
    return average > 0 ? 1 / average : 0;
  }

  reset(): void {
    this.samples = [];
  }
}
