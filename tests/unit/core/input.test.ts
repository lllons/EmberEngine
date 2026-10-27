/**
 * @ember/core/input — snapshots, the mutable state systems read, and input scripts.
 */

import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import {
  type InputSnapshot,
  InputScript,
  InputState,
  InputTracker,
  Keys,
  emptySnapshot,
  normalizeSnapshot,
  snapshot,
  snapshotsEqual,
  vec2,
} from "@ember/core";

Deno.test("emptySnapshot has no keys and no mouse buttons", () => {
  const empty = emptySnapshot();
  assertEquals(empty.held, []);
  assertEquals(empty.pressed, []);
  assertEquals(empty.released, []);
  assertEquals(empty.mouse, vec2(0, 0));
  assertEquals(empty.mouseHeld, []);
});

Deno.test("snapshot fills missing fields from the empty snapshot", () => {
  const partial = snapshot({ held: ["Space"] });
  assertEquals(partial.held, ["Space"]);
  assertEquals(partial.pressed, []);
  assertEquals(partial.mouse, vec2(0, 0));
});

Deno.test("snapshot copies the mouse position", () => {
  const mouse = vec2(5, 5);
  const partial = snapshot({ mouse });
  mouse.x = 99;
  assertEquals(partial.mouse, vec2(5, 5));
});

Deno.test("normalizeSnapshot sorts and dedupes every list", () => {
  const normalized = normalizeSnapshot(snapshot({
    held: ["KeyD", "KeyA", "KeyD"],
    pressed: ["Space", "ArrowUp"],
    released: ["Escape"],
    mouseHeld: ["left"],
    mousePressed: [],
    mouseReleased: [],
  }));
  assertEquals(normalized.held, ["KeyA", "KeyD"]);
  assertEquals(normalized.pressed, ["ArrowUp", "Space"]);
  assertEquals(normalized.released, ["Escape"]);
  assertEquals(normalized.mouseHeld, ["left"]);
});

Deno.test("snapshotsEqual ignores ordering and duplicates", () => {
  const a = snapshot({ held: ["KeyA", "KeyD"] });
  const b = snapshot({ held: ["KeyD", "KeyA", "KeyA"] });
  assert(snapshotsEqual(a, b));
});

Deno.test("snapshotsEqual detects differences in every field", () => {
  assertFalse(snapshotsEqual(snapshot({ held: ["KeyA"] }), snapshot({ held: ["KeyD"] })));
  assertFalse(snapshotsEqual(snapshot({ pressed: ["Space"] }), snapshot()));
  assertFalse(snapshotsEqual(snapshot({ released: ["Space"] }), snapshot()));
  assertFalse(snapshotsEqual(snapshot({ mouse: vec2(1, 0) }), snapshot()));
  assertFalse(snapshotsEqual(snapshot({ mouseHeld: ["left"] }), snapshot()));
});

Deno.test("snapshotsEqual tolerates sub-epsilon mouse drift", () => {
  assert(snapshotsEqual(snapshot({ mouse: vec2(1, 1) }), snapshot({ mouse: vec2(1 + 1e-12, 1) })));
});

Deno.test("InputState.fromSnapshot tolerates a missing snapshot", () => {
  const state = InputState.fromSnapshot(undefined);
  assertFalse(state.isDown("Space"));
  assertFalse(state.wasPressed("Space"));
  assertEquals(state.toSnapshot(), emptySnapshot());
});

Deno.test("InputState reports held keys", () => {
  const state = InputState.fromSnapshot(snapshot({ held: [Keys.left, Keys.space] }));
  assert(state.isDown(Keys.left));
  assert(state.isDown(Keys.space));
  assertFalse(state.isDown(Keys.right));
});

Deno.test("InputState.isAnyDown matches the first hit", () => {
  const state = InputState.fromSnapshot(snapshot({ held: [Keys.keyA] }));
  assert(state.isAnyDown([Keys.left, Keys.keyA]));
  assertFalse(state.isAnyDown([Keys.left, Keys.right]));
  assertFalse(state.isAnyDown([]));
});

Deno.test("InputState reports press and release edges separately from held keys", () => {
  const state = InputState.fromSnapshot(snapshot({
    held: [Keys.space],
    pressed: [Keys.space],
    released: [Keys.left],
  }));
  assert(state.wasPressed(Keys.space));
  assert(state.wasReleased(Keys.left));
  assertFalse(state.wasPressed(Keys.left));
});

Deno.test("InputState.axis builds -1/0/1 from a key pair", () => {
  const right = InputState.fromSnapshot(snapshot({ held: [Keys.right] }));
  assertEquals(right.axis(Keys.left, Keys.right), 1);
  const left = InputState.fromSnapshot(snapshot({ held: [Keys.left] }));
  assertEquals(left.axis(Keys.left, Keys.right), -1);
  assertEquals(InputState.fromSnapshot(snapshot()).axis(Keys.left, Keys.right), 0);
  const both = InputState.fromSnapshot(snapshot({ held: [Keys.left, Keys.right] }));
  assertEquals(both.axis(Keys.left, Keys.right), 0);
});

Deno.test("InputState tracks the pointer position", () => {
  const state = InputState.fromSnapshot(snapshot({ mouse: vec2(12, 34) }));
  assertEquals(state.mouse, vec2(12, 34));
  assertEquals(state.mouseX, 12);
  assertEquals(state.mouseY, 34);
});

Deno.test("InputState mouse getter copies the pointer", () => {
  const state = InputState.fromSnapshot(snapshot({ mouse: vec2(1, 1) }));
  const mouse = state.mouse;
  mouse.x = 50;
  assertEquals(state.mouseX, 1);
});

Deno.test("InputState tracks mouse buttons", () => {
  const state = InputState.fromSnapshot(snapshot({
    mouseHeld: ["left"],
    mousePressed: ["right"],
    mouseReleased: ["middle"],
  }));
  assert(state.isMouseDown("left"));
  assert(state.wasMousePressed("right"));
  assert(state.wasMouseReleased("middle"));
  assertFalse(state.isMouseDown("right"));
});

Deno.test("InputState.endFrame clears edges but keeps held keys", () => {
  const state = InputState.fromSnapshot(snapshot({
    held: [Keys.space],
    pressed: [Keys.space],
    released: [Keys.left],
    mouseHeld: ["left"],
    mousePressed: ["left"],
  }));
  state.endFrame();
  assert(state.isDown(Keys.space));
  assert(state.isMouseDown("left"));
  assertFalse(state.wasPressed(Keys.space));
  assertFalse(state.wasReleased(Keys.left));
  assertFalse(state.wasMousePressed("left"));
});

Deno.test("InputState.clear drops everything", () => {
  const state = InputState.fromSnapshot(snapshot({ held: [Keys.space], mouseHeld: ["left"], mouse: vec2(3, 3) }));
  state.clear();
  assertFalse(state.isDown(Keys.space));
  assertFalse(state.isMouseDown("left"));
  assertEquals(state.mouse, vec2(3, 3));
});

Deno.test("InputState.apply replaces the previous snapshot wholesale", () => {
  const state = InputState.fromSnapshot(snapshot({ held: [Keys.left, Keys.right] }));
  state.apply(snapshot({ held: [Keys.up] }));
  assertFalse(state.isDown(Keys.left));
  assert(state.isDown(Keys.up));
});

Deno.test("InputState.toSnapshot round-trips into an equal snapshot", () => {
  const source = snapshot({ held: [Keys.keyA], pressed: [Keys.space], mouse: vec2(7, 8), mouseHeld: ["left"] });
  const state = InputState.fromSnapshot(source);
  assert(snapshotsEqual(state.toSnapshot(), source));
});

Deno.test("InputTracker derives press edges from key events", () => {
  const tracker = new InputTracker();
  tracker.press(Keys.space);
  const first = tracker.snapshot();
  assertEquals(first.pressed, [Keys.space]);
  assertEquals(first.held, [Keys.space]);
  const second = tracker.snapshot();
  assertEquals(second.pressed, []);
  assertEquals(second.held, [Keys.space]);
});

Deno.test("InputTracker derives release edges", () => {
  const tracker = new InputTracker();
  tracker.press(Keys.space);
  tracker.snapshot();
  tracker.release(Keys.space);
  const afterRelease = tracker.snapshot();
  assertEquals(afterRelease.released, [Keys.space]);
  assertEquals(afterRelease.held, []);
  assertEquals(tracker.snapshot().released, []);
});

Deno.test("InputTracker tracks the pointer and its buttons", () => {
  const tracker = new InputTracker();
  tracker.moveMouse(10, 20);
  tracker.pressMouse("left");
  const first = tracker.snapshot();
  assertEquals(first.mouse, vec2(10, 20));
  assertEquals(first.mousePressed, ["left"]);
  assertEquals(first.mouseHeld, ["left"]);
  tracker.releaseMouse("left");
  const second = tracker.snapshot();
  assertEquals(second.mouseReleased, ["left"]);
  assertEquals(second.mouseHeld, []);
});

Deno.test("InputTracker reports a tap that starts and ends inside one frame", () => {
  const tracker = new InputTracker();
  tracker.press(Keys.keyE);
  tracker.release(Keys.keyE);
  const state = tracker.snapshot();
  assertEquals(state.held, []);
  assertEquals(state.pressed, [Keys.keyE]);
  assertEquals(state.released, [Keys.keyE]);
  // Edges do not repeat on the next frame.
  const next = tracker.snapshot();
  assertEquals(next.pressed, []);
  assertEquals(next.released, []);
});

Deno.test("InputTracker.releaseAll drops every held key and button", () => {
  const tracker = new InputTracker();
  tracker.press(Keys.space);
  tracker.pressMouse("left");
  tracker.snapshot();
  tracker.releaseAll();
  const state = tracker.snapshot();
  assertEquals(state.held, []);
  assertEquals(state.mouseHeld, []);
  assertEquals(state.released, [Keys.space]);
  assertEquals(state.mouseReleased, ["left"]);
});

Deno.test("InputScript of nothing yields empty snapshots forever", () => {
  const script = new InputScript();
  assertEquals(script.length, 0);
  assertEquals(script.at(0), emptySnapshot());
  assertEquals(script.at(50), emptySnapshot());
});

Deno.test("InputScript repeats the final frame once it runs out", () => {
  const script = InputScript.of(snapshot({ held: [Keys.right] }), snapshot({ held: [] }));
  assertEquals(script.length, 2);
  assertEquals(script.at(0).held, [Keys.right]);
  assertEquals(script.at(1).held, []);
  assertEquals(script.at(99).held, []);
});

Deno.test("InputScript.of normalizes its frames", () => {
  const script = InputScript.of(snapshot({ held: ["KeyD", "KeyA", "KeyD"] }));
  assertEquals(script.at(0).held, ["KeyA", "KeyD"]);
});

Deno.test("InputScript JSON round-trips", () => {
  const script = InputScript.of(
    snapshot({ held: [Keys.right], mouse: vec2(1, 2) }),
    snapshot({ pressed: [Keys.space] }),
  );
  const restored = InputScript.fromJSON(JSON.parse(JSON.stringify(script.toJSON())));
  assertEquals(restored.length, 2);
  assertEquals(restored.at(0).held, [Keys.right]);
  assertEquals(restored.at(0).mouse, vec2(1, 2));
  assertEquals(restored.at(1).pressed, [Keys.space]);
});

Deno.test("InputScript.fromJSON rejects non-arrays", () => {
  assertThrows(() => InputScript.fromJSON({}), Error);
  assertThrows(() => InputScript.fromJSON(null), Error);
});

Deno.test("InputScript blocks a hold for a chosen number of frames", () => {
  const frames = Array.from({ length: 5 }, (_, index) => snapshot({ held: [Keys.right], pressed: index === 0 ? [Keys.right] : [] }));
  const script = InputScript.of(...frames);
  assertEquals(script.length, 5);
  assert(script.at(0).pressed.includes(Keys.right));
  assert(!script.at(1).pressed.includes(Keys.right));
  assert(script.at(4).held.includes(Keys.right));
});
