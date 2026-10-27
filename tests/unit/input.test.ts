/** Input: snapshots, edges, axis helpers, the diffing tracker and recorded scripts. */

import {
  emptySnapshot,
  InputScript,
  InputState,
  InputTracker,
  Keys,
  normalizeSnapshot,
  snapshot,
  snapshotsEqual,
  vec2,
} from "@ember/core";
import { assert, assertEqual, assertThrows, table } from "../harness.ts";

table("input/emptySnapshot", [
  { label: "held", field: "held", expected: [] },
  { label: "pressed", field: "pressed", expected: [] },
  { label: "released", field: "released", expected: [] },
  { label: "mouseHeld", field: "mouseHeld", expected: [] },
  { label: "mousePressed", field: "mousePressed", expected: [] },
  { label: "mouseReleased", field: "mouseReleased", expected: [] },
  { label: "mouse", field: "mouse", expected: { x: 0, y: 0 } },
] as const, (row) => {
  const state = emptySnapshot();
  assertEqual((state as unknown as Record<string, unknown>)[row.field], row.expected, row.label);
});

Deno.test("input/snapshot fills only the provided fields", () => {
  const state = snapshot({ held: [Keys.keyW] });
  assertEqual(state.held, [Keys.keyW], "held");
  assertEqual(state.pressed, [], "pressed stays empty");
  assertEqual(state.mouse, { x: 0, y: 0 }, "mouse defaults");
});

Deno.test("input/snapshot copies the mouse vector", () => {
  const mouse = vec2(4, 5);
  const state = snapshot({ mouse });
  mouse.x = 100;
  assertEqual(state.mouse.x, 4, "mouse must be copied");
});

Deno.test("input/normalizeSnapshot sorts and de-duplicates", () => {
  const normalized = normalizeSnapshot({
    held: [Keys.keyD, Keys.keyA, Keys.keyD],
    pressed: [Keys.space, Keys.space],
    released: [],
    mouse: vec2(1, 2),
    mouseHeld: ["right", "left", "right"],
    mousePressed: [],
    mouseReleased: [],
  });
  assertEqual(normalized.held, [Keys.keyA, Keys.keyD], "held");
  assertEqual(normalized.pressed, [Keys.space], "pressed");
  assertEqual(normalized.mouseHeld, ["left", "right"], "mouseHeld");
});

table("input/snapshotsEqual", [
  {
    label: "identical",
    a: snapshot({ held: [Keys.keyA] }),
    b: snapshot({ held: [Keys.keyA] }),
    expected: true,
    epsilon: 1e-9,
  },
  {
    label: "order does not matter",
    a: snapshot({ held: [Keys.keyD, Keys.keyA] }),
    b: snapshot({ held: [Keys.keyA, Keys.keyD] }),
    expected: true,
    epsilon: 1e-9,
  },
  {
    label: "different keys",
    a: snapshot({ held: [Keys.keyA] }),
    b: snapshot({ held: [Keys.keyD] }),
    expected: false,
    epsilon: 1e-9,
  },
  {
    label: "different mouse",
    a: snapshot({ mouse: vec2(0, 0) }),
    b: snapshot({ mouse: vec2(1, 0) }),
    expected: false,
    epsilon: 1e-9,
  },
  {
    label: "mouse within epsilon",
    a: snapshot({ mouse: vec2(0, 0) }),
    b: snapshot({ mouse: vec2(0.5, 0) }),
    expected: true,
    epsilon: 1,
  },
], (row) => {
  assertEqual(snapshotsEqual(row.a, row.b, row.epsilon), row.expected, row.label);
});

Deno.test("input/InputState.fromSnapshot exposes held, pressed and released", () => {
  const state = InputState.fromSnapshot(snapshot({
    held: [Keys.keyA],
    pressed: [Keys.keyA],
    released: [Keys.keyD],
  }));
  assert(state.isDown(Keys.keyA), "held key is down");
  assert(state.wasPressed(Keys.keyA), "pressed edge");
  assert(state.wasReleased(Keys.keyD), "released edge");
  assert(!state.isDown(Keys.keyD), "released key is not held");
});

Deno.test("input/apply replaces the previous frame's edges", () => {
  const state = new InputState();
  state.apply(snapshot({ held: [Keys.keyA], pressed: [Keys.keyA] }));
  assert(state.wasPressed(Keys.keyA), "first frame press");
  state.apply(snapshot({ held: [Keys.keyA] }));
  assert(state.isDown(Keys.keyA), "key still held");
  assert(!state.wasPressed(Keys.keyA), "edge must not repeat");
});

Deno.test("input/endFrame clears edges but keeps held keys", () => {
  const state = new InputState();
  state.apply(snapshot({ held: [Keys.keyA], pressed: [Keys.keyA], released: [Keys.keyD] }));
  state.endFrame();
  assert(!state.wasPressed(Keys.keyA), "pressed cleared");
  assert(!state.wasReleased(Keys.keyD), "released cleared");
  assert(state.isDown(Keys.keyA), "held survives");
});

table("input/axis", [
  { label: "right only", held: [Keys.right], expected: 1 },
  { label: "left only", held: [Keys.left], expected: -1 },
  { label: "both cancel", held: [Keys.left, Keys.right], expected: 0 },
  { label: "neither", held: [], expected: 0 },
] as const, (row) => {
  const state = InputState.fromSnapshot(snapshot({ held: [...row.held] }));
  assertEqual(state.axis(Keys.left, Keys.right), row.expected, row.label);
});

Deno.test("input/isAnyDown checks a group of keys", () => {
  const state = InputState.fromSnapshot(snapshot({ held: [Keys.keyW] }));
  assert(state.isAnyDown([Keys.keyA, Keys.keyW]), "W is in the group");
  assert(!state.isAnyDown([Keys.keyA, Keys.keyD]), "neither move key is down");
  assert(!state.isAnyDown([Keys.space]), "space is not down");
  assert(!state.isAnyDown([]), "empty group is false");
});

Deno.test("input/mouse buttons expose held and edge state", () => {
  const state = InputState.fromSnapshot(snapshot({
    mouse: vec2(10, 20),
    mouseHeld: ["left"],
    mousePressed: ["left"],
    mouseReleased: ["right"],
  }));
  assert(state.isMouseDown("left"), "left held");
  assert(state.wasMousePressed("left"), "left pressed");
  assert(state.wasMouseReleased("right"), "right released");
  assert(!state.isMouseDown("right"), "right not held");
});

Deno.test("input/toSnapshot round-trips through apply", () => {
  const original = snapshot({
    held: [Keys.keyA],
    pressed: [Keys.keyA],
    released: [Keys.keyD],
    mouse: vec2(3, 4),
    mouseHeld: ["left"],
    mousePressed: ["left"],
    mouseReleased: [],
  });
  const state = InputState.fromSnapshot(original);
  assert(snapshotsEqual(state.toSnapshot(), original), "round-trip must be equal");
});

Deno.test("input/clear forgets every key and button", () => {
  const state = InputState.fromSnapshot(snapshot({
    held: [Keys.keyA],
    pressed: [Keys.keyA],
    mouse: vec2(1, 1),
    mouseHeld: ["left"],
  }));
  state.clear();
  const cleared = state.toSnapshot();
  assertEqual(cleared.held, [], "held");
  assertEqual(cleared.pressed, [], "pressed");
  assertEqual(cleared.mouseHeld, [], "mouseHeld");
  // The pointer position intentionally survives `clear`: losing focus should not
  // teleport the cursor, only release every held key and button.
  assertEqual(cleared.mouse, { x: 1, y: 1 }, "pointer position is preserved");
});

Deno.test("input/tracker turns key presses into edges", () => {
  const tracker = new InputTracker();
  tracker.press(Keys.space);
  const first = tracker.snapshot();
  assertEqual(first.held, [Keys.space], "held");
  assertEqual(first.pressed, [Keys.space], "pressed edge");
  const second = tracker.snapshot();
  assertEqual(second.pressed, [], "edge must not repeat");
  tracker.release(Keys.space);
  const third = tracker.snapshot();
  assertEqual(third.released, [Keys.space], "released edge");
  assertEqual(third.held, [], "held cleared");
});

Deno.test("input/tracker ignores duplicate presses and releases", () => {
  const tracker = new InputTracker();
  tracker.press(Keys.keyA);
  tracker.press(Keys.keyA);
  const first = tracker.snapshot();
  assertEqual(first.held, [Keys.keyA], "held once");
  assertEqual(first.pressed, [Keys.keyA], "pressed once");
  tracker.release(Keys.keyA);
  tracker.release(Keys.keyA);
  assertEqual(tracker.snapshot().released, [Keys.keyA], "released once");
});

Deno.test("input/tracker tracks the mouse and its buttons", () => {
  const tracker = new InputTracker();
  tracker.moveMouse(12, 34);
  tracker.pressMouse("left");
  const first = tracker.snapshot();
  assertEqual(first.mouse, { x: 12, y: 34 }, "mouse");
  assertEqual(first.mousePressed, ["left"], "pressed");
  tracker.releaseMouse("left");
  const second = tracker.snapshot();
  assertEqual(second.mouseReleased, ["left"], "released");
  assertEqual(second.mouseHeld, [], "held cleared");
});

Deno.test("input/InputScript records and repeats frames", () => {
  const script = InputScript.of(
    snapshot({ held: [Keys.right] }),
    snapshot({ held: [] }),
  );
  assertEqual(script.length, 2, "length");
  assertEqual(script.at(0).held, [Keys.right], "frame 0");
  assertEqual(script.at(1).held, [], "frame 1");
  assertEqual(script.at(99).held, [], "frames after the end repeat the last one");
  assertEqual(script.toJSON().length, 2, "toJSON");
});

Deno.test("input/InputScript handles an empty script", () => {
  const script = new InputScript();
  assertEqual(script.length, 0, "length");
  assertEqual(script.at(0), emptySnapshot(), "empty frame");
});

Deno.test("input/InputScript.fromJSON validates its input", () => {
  const script = InputScript.fromJSON([{ held: [Keys.keyA] }]);
  assertEqual(script.at(0).held, [Keys.keyA], "held");
  assertThrows(() => InputScript.fromJSON({}), /array/);
});

table("input/Keys constants", [
  { label: "left", key: "left", expected: "ArrowLeft" },
  { label: "right", key: "right", expected: "ArrowRight" },
  { label: "up", key: "up", expected: "ArrowUp" },
  { label: "down", key: "down", expected: "ArrowDown" },
  { label: "space", key: "space", expected: "Space" },
  { label: "enter", key: "enter", expected: "Enter" },
  { label: "escape", key: "escape", expected: "Escape" },
  { label: "keyA", key: "keyA", expected: "KeyA" },
  { label: "keyW", key: "keyW", expected: "KeyW" },
] as const, (row) => {
  assertEqual(Keys[row.key], row.expected, row.label);
});
