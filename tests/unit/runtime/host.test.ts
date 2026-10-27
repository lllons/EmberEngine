/**
 * @ember/runtime/host — the variable frame clock around a session.
 */

import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { InputScript, Scene, snapshot } from "@ember/core";
import { RuntimeHost, RuntimeSession, defineSystem, defineScript } from "@ember/runtime";

const DT = 1 / 60;

function host(systems = [] as ReturnType<typeof defineSystem>[]): RuntimeHost {
  return new RuntimeHost(new RuntimeSession({ scene: new Scene(), systems }));
}

Deno.test("a host starts with an empty accumulator and no samples", () => {
  const runtimeHost = host();
  assertEquals(runtimeHost.accumulator.pending(), 0);
  assertEquals(runtimeHost.fps.sampleCount, 0);
  assertEquals(runtimeHost.fixedDt, DT);
});

Deno.test("a frame shorter than the fixed step runs no steps and banks the time", () => {
  const runtimeHost = host();
  const frame = runtimeHost.advance(DT / 3);
  assertEquals(frame.steps, 0);
  assertEquals(frame.frame, 0);
  assertAlmostEquals(runtimeHost.accumulator.pending(), DT / 3, 1e-12);
});

Deno.test("a frame exactly one fixed step long runs exactly one step", () => {
  const runtimeHost = host();
  const frame = runtimeHost.advance(DT);
  assertEquals(frame.steps, 1);
  assertEquals(frame.frame, 1);
  assertEquals(runtimeHost.accumulator.pending(), 0);
});

Deno.test("banked time produces the step on the following frame", () => {
  const runtimeHost = host();
  runtimeHost.advance(DT / 2);
  const frame = runtimeHost.advance(DT / 2);
  assertEquals(frame.steps, 1);
  assertEquals(frame.frame, 1);
});

Deno.test("a long frame runs at most five steps and reports the dropped time", () => {
  const runtimeHost = host();
  const frame = runtimeHost.advance(DT * 20);
  assertEquals(frame.steps, 5);
  assertEquals(frame.frame, 5);
  assert(frame.droppedSeconds > 0);
});

Deno.test("alpha interpolates between the last and the next step", () => {
  const runtimeHost = host();
  const first = runtimeHost.advance(DT * 1.5);
  assertEquals(first.steps, 1);
  assertAlmostEquals(first.alpha, 0.5, 1e-9);
});

Deno.test("frame results carry the time, frame and fps after the frame", () => {
  const runtimeHost = host();
  const frame = runtimeHost.advance(DT);
  assertAlmostEquals(frame.time, DT, 1e-12);
  assertEquals(frame.frame, 1);
  assertAlmostEquals(frame.fps, 60, 1e-9);
});

Deno.test("results lists one entry per simulated step", () => {
  const runtimeHost = host();
  const frame = runtimeHost.advance(DT * 3);
  assertEquals(frame.results.length, 3);
  assertEquals(frame.results.map((result) => result.frame), [1, 2, 3]);
});

Deno.test("the first step of a frame receives the snapshot and later steps do not", () => {
  const seen: Array<boolean> = [];
  const session = new RuntimeSession({
    scene: new Scene(),
    systems: [
      defineSystem("probe", (ctx) => {
        seen.push(ctx.input.wasPressed("Space"));
      }),
    ],
  });
  const runtimeHost = new RuntimeHost(session);
  runtimeHost.advance(DT * 3, snapshot({ held: ["Space"], pressed: ["Space"] }));
  assertEquals(seen, [true, false, false]);
});

Deno.test("non-finite and negative frame deltas are ignored by the accumulator", () => {
  const runtimeHost = host();
  runtimeHost.advance(-1);
  runtimeHost.advance(Number.POSITIVE_INFINITY);
  assertEquals(runtimeHost.accumulator.pending(), 0);
  assertEquals(runtimeHost.session.frame, 0);
});

Deno.test("fps smooths over the configured window", () => {
  const runtimeHost = new RuntimeHost(new RuntimeSession({ scene: new Scene(), systems: [] }), {
    fpsWindow: 3,
  });
  for (let i = 0; i < 10; i++) runtimeHost.advance(DT);
  assertEquals(runtimeHost.fps.sampleCount, 3);
  assertAlmostEquals(runtimeHost.fps.fps, 60, 1e-9);
});

Deno.test("tick runs exactly the requested number of steps", () => {
  const runtimeHost = host();
  runtimeHost.tick(7);
  assertEquals(runtimeHost.session.frame, 7);
  assertEquals(runtimeHost.accumulator.pending(), 0, "tick ignores the accumulator");
});

Deno.test("tick defaults to a single step", () => {
  const runtimeHost = host();
  runtimeHost.tick();
  assertEquals(runtimeHost.session.frame, 1);
});

Deno.test("simulate runs a whole second as 60 fixed frames", () => {
  const runtimeHost = host();
  runtimeHost.simulate(1);
  assertEquals(runtimeHost.session.frame, 60);
  assertAlmostEquals(runtimeHost.session.time, 1, 1e-12);
});

Deno.test("simulate feeds one snapshot per frame from a list", () => {
  const seen: Array<boolean> = [];
  const session = new RuntimeSession({
    scene: new Scene(),
    systems: [
      defineSystem("probe", (ctx) => {
        seen.push(ctx.input.wasPressed("KeyE"));
      }),
    ],
  });
  const runtimeHost = new RuntimeHost(session);
  runtimeHost.simulate(0.05, [snapshot({ pressed: ["KeyE"] }), snapshot()]);
  assertEquals(seen[0], true);
  assertEquals(seen[1], false);
});

Deno.test("simulate replays an InputScript by frame index", () => {
  const seen: Array<boolean> = [];
  const session = new RuntimeSession({
    scene: new Scene(),
    systems: [
      defineSystem("probe", (ctx) => {
        seen.push(ctx.input.isDown("KeyD"));
      }),
    ],
  });
  const runtimeHost = new RuntimeHost(session);
  const inputScript = InputScript.of(
    snapshot({ held: ["KeyD"] }),
    snapshot({ held: ["KeyD"] }),
    snapshot(),
  );
  runtimeHost.simulate(DT * 3, inputScript);
  assertEquals(seen, [true, true, false]);
});

Deno.test("simulate rounds up to at least one frame", () => {
  const runtimeHost = host();
  runtimeHost.simulate(0);
  assertEquals(runtimeHost.session.frame, 1);
});

Deno.test("simulate feeds no snapshot past the end of the list", () => {
  const runtimeHost = host([defineSystem("noop", () => {})]);
  runtimeHost.simulate(0.05, [snapshot({ held: ["KeyA"] })]);
  assert(runtimeHost.session.input.isDown("KeyA"), "held keys persist afterwards");
});

Deno.test("reset clears the clock, accumulator and fps samples", () => {
  const runtimeHost = host();
  runtimeHost.advance(DT * 2);
  runtimeHost.reset();
  assertEquals(runtimeHost.session.frame, 0);
  assertEquals(runtimeHost.accumulator.pending(), 0);
  assertEquals(runtimeHost.fps.sampleCount, 0);
});

Deno.test("the fixed dt can be overridden per host", () => {
  const runtimeHost = new RuntimeHost(new RuntimeSession({ scene: new Scene(), systems: [] }), {
    fixedDt: 1 / 30,
  });
  assertEquals(runtimeHost.fixedDt, 1 / 30);
  runtimeHost.advance(1 / 30);
  assertEquals(runtimeHost.session.frame, 1);
});

Deno.test("maxSteps can be lowered for a stricter budget", () => {
  const runtimeHost = new RuntimeHost(new RuntimeSession({ scene: new Scene(), systems: [] }), {
    maxSteps: 1,
  });
  const frame = runtimeHost.advance(DT * 10);
  assertEquals(frame.steps, 1);
  assertAlmostEquals(frame.droppedSeconds, 9 * DT, 1e-9);
});

Deno.test("a whole second of random frames simulates exactly one second", () => {
  const runtimeHost = host();
  let elapsed = 0;
  const pattern = [0.008, 0.021, 0.004, 0.033, 0.016, 0.012, 0.02, 0.006];
  let index = 0;
  while (elapsed < 1) {
    const dt = pattern[index++ % pattern.length];
    runtimeHost.advance(dt);
    elapsed += dt;
  }
  assert(runtimeHost.session.time > 0.98);
  assert(runtimeHost.session.time <= 1.02);
});

Deno.test("systems run through the host at the fixed rate", () => {
  let ticks = 0;
  const session = new RuntimeSession({
    scene: new Scene(),
    systems: [
      defineSystem("counter", () => {
        ticks++;
      }, 50),
    ],
  });
  new RuntimeHost(session).simulate(0.5);
  assertEquals(ticks, 30);
});

Deno.test("host and session agree on the frame after a mixed advance sequence", () => {
  const runtimeHost = host();
  runtimeHost.advance(DT);
  runtimeHost.tick(3);
  runtimeHost.advance(DT * 2.5);
  assertEquals(runtimeHost.session.frame, 6);
  assertEquals(runtimeHost.accumulator.pending() > 0, true);
});

Deno.test("defineScript is usable inside a host run", () => {
  defineScript("host-probe", () => ({ update: () => {} }));
  const runtimeHost = host();
  runtimeHost.simulate(DT);
  assert(runtimeHost.session.time > 0);
});
