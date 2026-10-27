/**
 * @ember/core/time — fixed-step accumulation and FPS metering, the loop's arithmetic.
 */

import { assert, assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import { DEFAULT_FIXED_DT, FixedStepAccumulator, FpsMeter, clampDelta } from "@ember/core";

Deno.test("clampDelta rejects negative and non-finite deltas", () => {
  assertEquals(clampDelta(-1), 0);
  assertEquals(clampDelta(Number.NaN), 0);
  // An infinite delta is dropped rather than clamped: there is nothing sane to simulate.
  assertEquals(clampDelta(Number.POSITIVE_INFINITY), 0);
});

Deno.test("clampDelta passes normal deltas through", () => {
  assertAlmostEquals(clampDelta(0.016), 0.016, 1e-9);
  assertAlmostEquals(clampDelta(0), 0, 1e-9);
});

Deno.test("clampDelta caps at the default maximum", () => {
  assertAlmostEquals(clampDelta(5), 0.25, 1e-9);
  assertAlmostEquals(clampDelta(5, 1), 1, 1e-9);
});

Deno.test("the default fixed step is 1/60", () => {
  assertAlmostEquals(DEFAULT_FIXED_DT, 1 / 60, 1e-12);
});

Deno.test("accumulator: constructor validates its arguments", () => {
  assertThrows(() => new FixedStepAccumulator(0), RangeError);
  assertThrows(() => new FixedStepAccumulator(-1), RangeError);
  assertThrows(() => new FixedStepAccumulator(1 / 60, 0), RangeError);
});

Deno.test("accumulator: plan with no banked time runs nothing", () => {
  const accumulator = new FixedStepAccumulator();
  const plan = accumulator.plan();
  assertEquals(plan.steps, 0);
  assertEquals(plan.remainder, 0);
  assertEquals(plan.alpha, 0);
});

Deno.test("accumulator: a half step banks time without stepping", () => {
  const accumulator = new FixedStepAccumulator(0.01);
  accumulator.add(0.005);
  const plan = accumulator.plan();
  assertEquals(plan.steps, 0);
  assertAlmostEquals(plan.remainder, 0.005, 1e-9);
  assertAlmostEquals(plan.alpha, 0.5, 1e-9);
});

Deno.test("accumulator: a whole step is planned exactly once", () => {
  const accumulator = new FixedStepAccumulator(0.01);
  const plan = accumulator.advance(0.01);
  assertEquals(plan.steps, 1);
  assertAlmostEquals(plan.remainder, 0, 1e-9);
  assertEquals(accumulator.plan().steps, 0);
});

Deno.test("accumulator: multiple steps in one frame", () => {
  const accumulator = new FixedStepAccumulator(0.01);
  assertEquals(accumulator.advance(0.035).steps, 3);
  assertAlmostEquals(accumulator.pending(), 0.005, 1e-9);
});

Deno.test("accumulator: maxSteps caps the work and reports what was dropped", () => {
  const accumulator = new FixedStepAccumulator(0.01, 2);
  const plan = accumulator.advance(0.06);
  assertEquals(plan.steps, 2);
  assertAlmostEquals(plan.droppedSeconds, 0.04, 1e-9);
  assertAlmostEquals(plan.remainder, 0, 1e-9);
});

Deno.test("accumulator: remainder never exceeds one step", () => {
  const accumulator = new FixedStepAccumulator(0.01);
  for (let frame = 0; frame < 100; frame++) {
    accumulator.advance(0.013);
    assert(accumulator.pending() < 0.01 + 1e-9, `pending ${accumulator.pending()}`);
  }
});

Deno.test("accumulator: simulates 60 frames of 60Hz in one second", () => {
  const accumulator = new FixedStepAccumulator();
  let steps = 0;
  for (let frame = 0; frame < 60; frame++) steps += accumulator.advance(1 / 60).steps;
  assertEquals(steps, 60);
});

Deno.test("accumulator: jittery frame times still produce 60 steps per second", () => {
  const accumulator = new FixedStepAccumulator();
  const deltas = [0.008, 0.025, 0.016, 0.03, 0.004, 0.017];
  let total = 0;
  let steps = 0;
  while (total < 1) {
    const delta = deltas[steps % deltas.length];
    total += delta;
    steps += accumulator.advance(delta).steps;
  }
  assert(steps >= 59 && steps <= 61, `expected ~60 steps, got ${steps}`);
});

Deno.test("accumulator: negative and NaN deltas are ignored", () => {
  const accumulator = new FixedStepAccumulator(0.01);
  accumulator.advance(-5);
  accumulator.advance(Number.NaN);
  assertEquals(accumulator.pending(), 0);
  assertEquals(accumulator.plan().steps, 0);
});

Deno.test("accumulator: reset clears banked time", () => {
  const accumulator = new FixedStepAccumulator(0.01);
  accumulator.add(0.007);
  accumulator.reset();
  assertEquals(accumulator.pending(), 0);
});

Deno.test("accumulator: alpha tracks the un-simulated fraction", () => {
  const accumulator = new FixedStepAccumulator(0.02);
  accumulator.add(0.015);
  assertAlmostEquals(accumulator.plan().alpha, 0.75, 1e-9);
  accumulator.add(0.01);
  assertAlmostEquals(accumulator.plan().alpha, 0.25, 1e-9);
});

Deno.test("accumulator: plan is pure until advance consumes it", () => {
  const accumulator = new FixedStepAccumulator(0.01);
  accumulator.add(0.03);
  assertEquals(accumulator.plan().steps, 3);
  assertEquals(accumulator.plan().steps, 3);
  assertEquals(accumulator.advance(0).steps, 3);
  assertEquals(accumulator.pending(), 0);
});

Deno.test("fps meter: no samples means zero fps", () => {
  const meter = new FpsMeter();
  assertEquals(meter.fps, 0);
  assertEquals(meter.averageDelta, 0);
  assertEquals(meter.sampleCount, 0);
});

Deno.test("fps meter: constructor validates the window", () => {
  assertThrows(() => new FpsMeter(0), RangeError);
});

Deno.test("fps meter: 60Hz frames report ~60 fps", () => {
  const meter = new FpsMeter(60);
  for (let i = 0; i < 60; i++) meter.sample(1 / 60);
  assertAlmostEquals(meter.fps, 60, 0.001);
  assertEquals(meter.sampleCount, 60);
});

Deno.test("fps meter: the window bounds the samples kept", () => {
  const meter = new FpsMeter(10);
  for (let i = 0; i < 100; i++) meter.sample(1 / 30);
  assertEquals(meter.sampleCount, 10);
  assertAlmostEquals(meter.fps, 30, 0.001);
});

Deno.test("fps meter: ignores invalid samples", () => {
  const meter = new FpsMeter();
  meter.sample(0);
  meter.sample(-1);
  meter.sample(Number.NaN);
  assertEquals(meter.sampleCount, 0);
});

Deno.test("fps meter: a slow frame lowers the average only within the window", () => {
  const meter = new FpsMeter(4);
  for (let i = 0; i < 10; i++) meter.sample(1 / 60);
  const steady = meter.fps;
  meter.sample(0.5);
  assert(meter.fps < steady);
});

Deno.test("fps meter: reset clears every sample", () => {
  const meter = new FpsMeter();
  meter.sample(0.016);
  meter.reset();
  assertEquals(meter.sampleCount, 0);
  assertEquals(meter.fps, 0);
});
