/**
 * The frame clock: `FixedStepAccumulator`, `FpsMeter` and `RuntimeHost`.
 *
 * Expectations are arithmetic derived from the fixed-step contract (accumulate real time,
 * run whole steps, carry the remainder, drop the overflow), not recorded behaviour.
 */

import {
  BoxCollider,
  clampDelta,
  FixedStepAccumulator,
  FpsMeter,
  InputScript,
  RigidBody,
  Scene,
  snapshot,
  Transform,
  vec2,
  Velocity,
} from "@ember/core";
import {
  defaultSystems,
  defineSystem,
  RuntimeHost,
  type RuntimeHostOptions,
  RuntimeSession,
  type System,
  worldDigest,
} from "@ember/runtime";
import { assert, assertEqual, assertThrows, near, table, vecNear } from "../../harness.ts";

const DT = 1 / 60;

table(
  "runtime/accumulator clampDelta",
  [
    { label: "passes a small delta through", input: 0.1, max: 0.25, expected: 0.1 },
    { label: "caps at maxDelta", input: 1, max: 0.25, expected: 0.25 },
    { label: "caps at exactly maxDelta", input: 0.25, max: 0.25, expected: 0.25 },
    { label: "rejects negatives", input: -5, max: 0.25, expected: 0 },
    { label: "rejects NaN", input: Number.NaN, max: 0.25, expected: 0 },
    { label: "rejects Infinity", input: Number.POSITIVE_INFINITY, max: 0.25, expected: 0 },
    { label: "zero stays zero", input: 0, max: 0.25, expected: 0 },
  ] as const,
  (row) => {
    near(clampDelta(row.input, row.max), row.expected, 1e-12, row.label);
  },
);

table(
  "runtime/accumulator plans whole steps",
  [
    { label: "below one step runs none", dt: 0.016, steps: 0, alpha: 0.96 },
    { label: "exactly one step", dt: DT, steps: 1, alpha: 0 },
    { label: "two and a half steps", dt: DT * 2.5, steps: 2, alpha: 0.5 },
    { label: "three steps worth", dt: DT * 3, steps: 3, alpha: 0 },
  ] as const,
  (row) => {
    const accumulator = new FixedStepAccumulator(DT, 10);
    const plan = accumulator.advance(row.dt);
    assertEqual(plan.steps, row.steps, row.label);
    near(plan.alpha, row.alpha, 1e-9, `${row.label} alpha`);
    near(plan.remainder, row.dt - row.steps * DT, 1e-12, `${row.label} remainder`);
    near(plan.droppedSeconds, 0, 1e-12, `${row.label} dropped`);
  },
);

Deno.test("runtime/accumulator carries the remainder into the next frame", () => {
  const accumulator = new FixedStepAccumulator(DT, 10);
  const first = accumulator.advance(0.01);
  assertEqual(first.steps, 0, "no whole step yet");
  near(accumulator.pending(), 0.01, 1e-12, "banked time");
  const second = accumulator.advance(0.01);
  assertEqual(second.steps, 1, "two frames of 0.01s make one step");
  near(accumulator.pending(), 0.02 - DT, 1e-12, "remainder kept");
});

Deno.test("runtime/accumulator drops overflow beyond maxSteps", () => {
  // A 1s frame is first clamped to the 0.25s bank cap (15 steps), then truncated to the
  // 5-step per-frame budget; the 10 steps that do not fit are dropped, not stored.
  const accumulator = new FixedStepAccumulator(DT, 5);
  const plan = accumulator.advance(1);
  assertEqual(plan.steps, 5, "capped at maxSteps");
  near(plan.droppedSeconds, (15 - 5) * DT, 1e-9, "dropped seconds");
  near(accumulator.pending(), 0, 1e-9, "nothing left banked");

  const smaller = new FixedStepAccumulator(DT, 5);
  const second = smaller.advance(0.2);
  assertEqual(second.steps, 5, "0.2s is 12 steps, still capped at 5");
  near(second.droppedSeconds, 7 * DT, 1e-9, "seven dropped steps");
});

Deno.test("runtime/accumulator plan is pure and repeatable", () => {
  const accumulator = new FixedStepAccumulator(DT, 5);
  accumulator.add(DT * 2.5);
  assertEqual(accumulator.plan(), accumulator.plan(), "same plan twice");
  near(accumulator.pending(), DT * 2.5, 1e-12, "planning does not consume");
});

Deno.test("runtime/accumulator add clamps and ignores junk", () => {
  const accumulator = new FixedStepAccumulator(DT, 5);
  accumulator.add(10);
  near(accumulator.pending(), 0.25, 1e-12, "clamped to the default 0.25s cap");
  accumulator.reset();
  accumulator.add(-1);
  accumulator.add(Number.NaN);
  near(accumulator.pending(), 0, 1e-12, "junk adds nothing");
});

Deno.test("runtime/accumulator rejects invalid construction", () => {
  assertThrows(() => new FixedStepAccumulator(0), RangeError, "fixedDt 0");
  assertThrows(() => new FixedStepAccumulator(-1), RangeError, "negative fixedDt");
  assertThrows(() => new FixedStepAccumulator(DT, 0), RangeError, "maxSteps 0");
});

Deno.test("runtime/accumulator alpha stays inside [0, 1)", () => {
  const accumulator = new FixedStepAccumulator(DT, 100);
  for (const dt of [0.001, 0.009, DT, DT * 1.999, 0.05]) {
    const plan = accumulator.advance(dt);
    assert(plan.alpha >= 0 && plan.alpha < 1, `alpha ${plan.alpha} for dt ${dt}`);
  }
});

table(
  "runtime/fps meter averages samples",
  [
    { label: "single 20ms frame", samples: [0.02], fps: 50 },
    { label: "single 16ms frame", samples: [1 / 60], fps: 60 },
    { label: "two frames average", samples: [0.01, 0.03], fps: 50 },
  ] as const,
  (row) => {
    const meter = new FpsMeter(60);
    for (const sample of row.samples) meter.sample(sample);
    near(meter.fps, row.fps, 1e-6, row.label);
  },
);

Deno.test("runtime/fps meter reports zero without samples", () => {
  const meter = new FpsMeter();
  assertEqual(meter.averageDelta, 0, "average");
  assertEqual(meter.fps, 0, "fps");
  assertEqual(meter.sampleCount, 0, "count");
});

Deno.test("runtime/fps meter ignores junk deltas", () => {
  const meter = new FpsMeter(4);
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) meter.sample(bad);
  assertEqual(meter.sampleCount, 0, "nothing recorded");
});

Deno.test("runtime/fps meter keeps only the newest window", () => {
  const meter = new FpsMeter(3);
  for (const sample of [0.01, 0.01, 0.01, 0.02, 0.03]) meter.sample(sample);
  assertEqual(meter.sampleCount, 3, "window trimmed");
  near(meter.averageDelta, (0.01 + 0.02 + 0.03) / 3, 1e-12, "average of the newest three");
  meter.reset();
  assertEqual(meter.sampleCount, 0, "reset");
});

Deno.test("runtime/fps meter rejects a zero window", () => {
  assertThrows(() => new FpsMeter(0), RangeError, "window");
});

// ---------------------------------------------------------------------------
// RuntimeHost
// ---------------------------------------------------------------------------

function host(systems?: readonly System[], options: RuntimeHostOptions = {}) {
  const scene = new Scene({ name: "loop", viewport: { width: 320, height: 240 } });
  const session = new RuntimeSession({ scene, fixedDt: DT, systems });
  return new RuntimeHost(session, options);
}

Deno.test("runtime/host advance runs no step until a whole step has banked", () => {
  const runtimeHost = host();
  const first = runtimeHost.advance(0.01);
  assertEqual(first.steps, 0, "first frame");
  assertEqual(runtimeHost.session.frame, 0, "frame count");
  const second = runtimeHost.advance(0.01);
  assertEqual(second.steps, 1, "second frame completes a step");
  assertEqual(runtimeHost.session.frame, 1, "one fixed step ran");
  near(runtimeHost.session.time, DT, 1e-12, "time advanced by exactly fixedDt");
});

Deno.test("runtime/host advance reports frame stats and fps", () => {
  const runtimeHost = host();
  const result = runtimeHost.advance(DT);
  assertEqual(result.steps, 1, "steps");
  assertEqual(result.frame, 1, "frame");
  near(result.time, DT, 1e-12, "time");
  near(result.fps, 60, 1e-6, "fps");
  assertEqual(result.results.length, 1, "one StepResult per fixed step");
  assertEqual(runtimeHost.fixedDt, DT, "host exposes the fixed step");
});

Deno.test("runtime/host advance drops overflow time instead of spiralling", () => {
  const runtimeHost = host(undefined, { maxSteps: 5 });
  const result = runtimeHost.advance(1);
  assertEqual(result.steps, 5, "capped");
  near(result.droppedSeconds, (15 - 5) * DT, 1e-9, "dropped");
  assertEqual(runtimeHost.session.frame, 5, "only five steps simulated");
});

Deno.test("runtime/host advance applies the snapshot to the first step only", () => {
  const seen: Array<{ step: number; pressed: boolean; held: boolean }> = [];
  const runtimeHost = host(
    [defineSystem("input-spy", (ctx) => {
      seen.push({
        step: ctx.frame,
        pressed: ctx.input.wasPressed("Space"),
        held: ctx.input.isDown("Space"),
      });
    }, 10)],
    { maxSteps: 5 },
  );
  runtimeHost.advance(DT * 3, snapshot({ held: ["Space"], pressed: ["Space"] }));
  assertEqual(seen.length, 3, "three fixed steps");
  assertEqual(seen.map((row) => row.pressed), [true, false, false], "press edge once");
  assertEqual(seen.map((row) => row.held), [true, true, true], "held key persists");
});

Deno.test("runtime/host tick ignores the accumulator", () => {
  const runtimeHost = host();
  runtimeHost.advance(0.01);
  const banked = runtimeHost.accumulator.pending();
  runtimeHost.tick(4);
  assertEqual(runtimeHost.session.frame, 4, "exactly four steps");
  near(runtimeHost.accumulator.pending(), banked, 1e-12, "accumulator untouched");
});

Deno.test("runtime/host tick passes its snapshot to the first step only", () => {
  const presses: boolean[] = [];
  const runtimeHost = host([
    defineSystem("spy", (ctx) => presses.push(ctx.input.wasPressed("KeyE")), 1),
  ]);
  runtimeHost.tick(3, snapshot({ pressed: ["KeyE"] }));
  assertEqual(presses, [true, false, false], "edge only on the first step");
});

table(
  "runtime/host simulate maps seconds to fixed frames",
  [
    { label: "half a second", seconds: 0.5, frames: 30 },
    { label: "one second", seconds: 1, frames: 60 },
    { label: "zero seconds still ticks once", seconds: 0, frames: 1 },
    { label: "a tenth of a second", seconds: 0.1, frames: 6 },
  ] as const,
  (row) => {
    const runtimeHost = host();
    const result = runtimeHost.simulate(row.seconds);
    assertEqual(runtimeHost.session.frame, row.frames, `${row.label}: frames`);
    assertEqual(result.frame, row.frames, `${row.label}: result frame`);
    near(runtimeHost.session.time, row.frames * DT, 1e-9, `${row.label}: simulated time`);
  },
);

Deno.test("runtime/host simulate repeats the last scripted frame after the script ends", () => {
  const held: boolean[] = [];
  const runtimeHost = host([
    defineSystem("spy", (ctx) => held.push(ctx.input.isDown("ArrowRight")), 1),
  ]);
  const script = InputScript.of(snapshot(), snapshot({ held: ["ArrowRight"] }));
  runtimeHost.simulate(5 * DT, script);
  assertEqual(held, [false, true, true, true, true], "last frame repeats");
});

Deno.test("runtime/host simulate accepts a plain snapshot array", () => {
  const held: boolean[] = [];
  const runtimeHost = host([defineSystem("spy", (ctx) => held.push(ctx.input.isDown("KeyD")), 1)]);
  runtimeHost.simulate(3 * DT, [snapshot({ held: ["KeyD"] }), snapshot()]);
  assertEqual(held, [true, false, false], "array is read frame by frame");
});

Deno.test("runtime/host reset clears accumulator, fps and session", () => {
  const runtimeHost = host();
  runtimeHost.advance(DT * 2);
  runtimeHost.reset();
  assertEqual(runtimeHost.session.frame, 0, "frame");
  assertEqual(runtimeHost.accumulator.pending(), 0, "pending time");
  assertEqual(runtimeHost.fps.sampleCount, 0, "fps samples");
});

Deno.test("runtime/host simulate is deterministic across two hosts", () => {
  const build = () => {
    const scene = new Scene({
      name: "det",
      viewport: { width: 320, height: 240 },
      gravity: vec2(0, 400),
    });
    const floor = scene.createEntity({ name: "floor", position: vec2(0, 100) });
    scene.world.add(floor, BoxCollider, { width: 200, height: 20, solid: true });
    scene.world.add(floor, RigidBody, { type: "static" });
    const faller = scene.createEntity({ name: "faller", position: vec2(0, 0) });
    scene.world.add(faller, Velocity, { x: 25, y: 0, angular: 0 });
    scene.world.add(faller, RigidBody, { type: "dynamic", gravityScale: 1, maxSpeed: 900 });
    scene.world.add(faller, BoxCollider, { width: 20, height: 20, solid: true });
    const session = new RuntimeSession({ scene, systems: defaultSystems(), seed: 3 });
    return { host: new RuntimeHost(session), faller, floor };
  };
  const a = build(), b = build();
  a.host.simulate(2);
  b.host.simulate(2);
  assertEqual(
    worldDigest(a.host.session.scene.world),
    worldDigest(b.host.session.scene.world),
    "digest",
  );
  const landed = a.host.session.scene.world.require(a.faller, Transform).position;
  vecNear(landed, b.host.session.scene.world.require(b.faller, Transform).position, 0, "position");
  near(landed.y, 80, 1.5, "faller rests on the floor");
});
