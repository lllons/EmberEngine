/** Time: delta clamping, fixed-step accumulation and the FPS meter. */

import { clampDelta, DEFAULT_FIXED_DT, FixedStepAccumulator, FpsMeter } from "@ember/core";
import { assert, assertEqual, assertThrows, near, table } from "../harness.ts";

table("time/clampDelta", [
  { label: "normal delta", input: 0.016, max: 0.25, expected: 0.016 },
  { label: "zero", input: 0, max: 0.25, expected: 0 },
  { label: "negative becomes zero", input: -1, max: 0.25, expected: 0 },
  { label: "NaN becomes zero", input: Number.NaN, max: 0.25, expected: 0 },
  { label: "infinity becomes zero", input: Number.POSITIVE_INFINITY, max: 0.25, expected: 0 },
  { label: "exactly at max", input: 0.25, max: 0.25, expected: 0.25 },
  { label: "above max clamps", input: 5, max: 0.25, expected: 0.25 },
  { label: "default max is 0.25", input: 10, expected: 0.25 },
  { label: "custom max", input: 2, max: 1, expected: 1 },
] as const, (row) => near(clampDelta(row.input, row.max ?? 0.25), row.expected, 1e-12));

table("time/accumulator constructor validation", [
  { label: "zero step", fixedDt: 0, maxSteps: 5 },
  { label: "negative step", fixedDt: -0.01, maxSteps: 5 },
  { label: "zero max steps", fixedDt: 1 / 60, maxSteps: 0 },
  { label: "negative max steps", fixedDt: 1 / 60, maxSteps: -1 },
] as const, (row) => {
  assertThrows(
    () => new FixedStepAccumulator(row.fixedDt, row.maxSteps),
    /must be/,
    row.label,
  );
});

Deno.test("time/accumulator defaults are 1/60 and 5", () => {
  const accumulator = new FixedStepAccumulator();
  near(accumulator.fixedDt, DEFAULT_FIXED_DT, 0, "fixedDt");
  near(DEFAULT_FIXED_DT, 1 / 60, 1e-15, "DEFAULT_FIXED_DT");
  assertEqual(accumulator.maxSteps, 5, "maxSteps");
});

table("time/accumulator step counts", [
  { label: "one fixed step", frames: [1 / 60], steps: 1 },
  { label: "two fixed steps in one frame", frames: [2 / 60], steps: 2 },
  { label: "nothing for a tiny delta", frames: [1 / 120], steps: 0 },
  { label: "accumulates two halves", frames: [1 / 120, 1 / 120], steps: 1 },
  { label: "three frames of a third", frames: [1 / 180, 1 / 180, 1 / 180], steps: 1 },
  { label: "zero delta", frames: [0], steps: 0 },
  { label: "ten frames of one step", frames: Array(10).fill(1 / 60), steps: 10 },
] as const, (row) => {
  const accumulator = new FixedStepAccumulator(1 / 60, 10);
  let steps = 0;
  for (const frame of row.frames) steps += accumulator.advance(frame).steps;
  assertEqual(steps, row.steps, row.label);
});

Deno.test("time/accumulator caps steps and reports dropped time", () => {
  const accumulator = new FixedStepAccumulator(1 / 60, 4);
  // 0.2 s holds twelve 1/60 steps; only four are allowed, so eight are dropped.
  const plan = accumulator.advance(0.2);
  assertEqual(plan.steps, 4, "steps");
  near(plan.droppedSeconds, (12 - 4) / 60, 1e-9, "droppedSeconds");
  near(accumulator.pending(), 0, 1e-9, "capped frame must not bank the excess");
});

Deno.test("time/accumulator clamps a huge host delta before banking it", () => {
  const accumulator = new FixedStepAccumulator(1 / 60, 5);
  accumulator.add(10);
  near(accumulator.pending(), 0.25, 1e-12, "clampDelta ceiling must bound the bank");
});

Deno.test("time/accumulator keeps the remainder as interpolation alpha", () => {
  const accumulator = new FixedStepAccumulator(1 / 60, 5);
  const plan = accumulator.advance(1 / 40);
  assertEqual(plan.steps, 1, "one step fits in 1/40 s");
  near(plan.remainder, 1 / 40 - 1 / 60, 1e-12, "remainder");
  near(plan.alpha, (1 / 40 - 1 / 60) / (1 / 60), 1e-12, "alpha");
  assert(plan.alpha >= 0 && plan.alpha < 1, `alpha out of range: ${plan.alpha}`);
});

Deno.test("time/accumulator add banks time and plan does not consume it", () => {
  const accumulator = new FixedStepAccumulator(1 / 60, 5);
  accumulator.add(0.01);
  accumulator.add(0.01);
  near(accumulator.pending(), 0.02, 1e-12, "pending after adds");
  const first = accumulator.plan();
  const second = accumulator.plan();
  assertEqual(first, second, "plan must be pure");
  near(accumulator.pending(), 0.02, 1e-12, "plan must not consume");
  accumulator.advance(0);
  near(accumulator.pending(), 0.02 - 1 / 60, 1e-12, "advance consumes one step");
});

Deno.test("time/accumulator reset clears banked time", () => {
  const accumulator = new FixedStepAccumulator(1 / 60, 5);
  accumulator.add(0.05);
  accumulator.reset();
  near(accumulator.pending(), 0, 0, "pending");
  assertEqual(accumulator.advance(1 / 60).steps, 1, "still steps after reset");
});

Deno.test("time/accumulator alpha stays below one across frames", () => {
  const accumulator = new FixedStepAccumulator(1 / 60, 5);
  for (const frame of [0.001, 0.02, 0.033, 0.0005, 0.1]) {
    const plan = accumulator.advance(frame);
    assert(plan.alpha >= 0 && plan.alpha < 1, `alpha ${plan.alpha} after ${frame}s`);
    assert(plan.remainder >= 0 && plan.remainder < 1 / 60 + 1e-12, `remainder ${plan.remainder}`);
  }
});

table("time/fps meter sampling", [
  { label: "no samples", samples: [] as number[], average: 0, fps: 0 },
  { label: "single 60hz sample", samples: [1 / 60], average: 1 / 60, fps: 60 },
  { label: "two equal samples", samples: [1 / 60, 1 / 60], average: 1 / 60, fps: 60 },
  { label: "30hz", samples: [1 / 30, 1 / 30], average: 1 / 30, fps: 30 },
  {
    label: "mixed",
    samples: [0.01, 0.03],
    average: 0.02,
    fps: 50,
  },
] as const, (row) => {
  const meter = new FpsMeter(60);
  for (const sample of row.samples) meter.sample(sample);
  near(meter.averageDelta, row.average, 1e-12, "averageDelta");
  near(meter.fps, row.fps, 1e-9, "fps");
  assertEqual(meter.sampleCount, row.samples.length, "sampleCount");
});

Deno.test("time/fps meter ignores unusable deltas", () => {
  const meter = new FpsMeter(10);
  meter.sample(0);
  meter.sample(-1);
  meter.sample(Number.NaN);
  meter.sample(Number.POSITIVE_INFINITY);
  assertEqual(meter.sampleCount, 0, "no samples recorded");
  near(meter.fps, 0, 0, "fps with no samples");
});

Deno.test("time/fps meter keeps only the window", () => {
  const meter = new FpsMeter(3);
  for (const delta of [0.01, 0.02, 0.03, 0.04, 0.05]) meter.sample(delta);
  assertEqual(meter.sampleCount, 3, "sampleCount");
  near(meter.averageDelta, (0.03 + 0.04 + 0.05) / 3, 1e-12, "average of the last three");
});

Deno.test("time/fps meter reset forgets samples", () => {
  const meter = new FpsMeter(5);
  meter.sample(0.02);
  meter.reset();
  assertEqual(meter.sampleCount, 0, "sampleCount");
  near(meter.fps, 0, 0, "fps");
});

Deno.test("time/fps meter rejects a non-positive window", () => {
  assertThrows(() => new FpsMeter(0), /window/);
});
