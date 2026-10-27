/**
 * @ember/core/input — input state model shared by hosts.
 *
 * Owner: this file owns what "input" means. A browser host fills a snapshot from
 * DOM events; tests and replays provide snapshots directly; systems read the
 * `InputState`. Keys are named by `KeyboardEvent.code`-style strings ("ArrowLeft").
 */

import { type Vec2, vec2, vec2Clone } from "./math.ts";

export type KeyName = string;

export type MouseButton = "left" | "middle" | "right";

export const Keys = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  space: "Space",
  enter: "Enter",
  escape: "Escape",
  shiftLeft: "ShiftLeft",
  shiftRight: "ShiftRight",
  keyA: "KeyA",
  keyD: "KeyD",
  keyE: "KeyE",
  keyR: "KeyR",
  keyS: "KeyS",
  keyW: "KeyW",
  digit1: "Digit1",
} as const;

/** Immutable per-frame input state. */
export interface InputSnapshot {
  /** Keys held at the end of the frame (sorted, unique). */
  held: KeyName[];
  /** Keys that went down during the frame (sorted, unique). */
  pressed: KeyName[];
  /** Keys that went up during the frame (sorted, unique). */
  released: KeyName[];
  mouse: Vec2;
  mouseHeld: MouseButton[];
  mousePressed: MouseButton[];
  mouseReleased: MouseButton[];
}

export function emptySnapshot(): InputSnapshot {
  return {
    held: [],
    pressed: [],
    released: [],
    mouse: vec2(0, 0),
    mouseHeld: [],
    mousePressed: [],
    mouseReleased: [],
  };
}

export function snapshot(init: Partial<InputSnapshot> = {}): InputSnapshot {
  return {
    ...emptySnapshot(),
    ...init,
    mouse: init.mouse ? vec2Clone(init.mouse) : vec2(0, 0),
  };
}

/** Canonical ordering so identical inputs always serialize identically. */
function canonical(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

export function normalizeSnapshot(input: InputSnapshot): InputSnapshot {
  return {
    held: canonical(input.held),
    pressed: canonical(input.pressed),
    released: canonical(input.released),
    mouse: vec2Clone(input.mouse),
    mouseHeld: canonical(input.mouseHeld) as MouseButton[],
    mousePressed: canonical(input.mousePressed) as MouseButton[],
    mouseReleased: canonical(input.mouseReleased) as MouseButton[],
  };
}

export function snapshotsEqual(a: InputSnapshot, b: InputSnapshot, epsilon = 1e-9): boolean {
  const na = normalizeSnapshot(a);
  const nb = normalizeSnapshot(b);
  return (
    na.held.join(",") === nb.held.join(",") &&
    na.pressed.join(",") === nb.pressed.join(",") &&
    na.released.join(",") === nb.released.join(",") &&
    na.mouseHeld.join(",") === nb.mouseHeld.join(",") &&
    na.mousePressed.join(",") === nb.mousePressed.join(",") &&
    na.mouseReleased.join(",") === nb.mouseReleased.join(",") &&
    Math.abs(na.mouse.x - nb.mouse.x) <= epsilon &&
    Math.abs(na.mouse.y - nb.mouse.y) <= epsilon
  );
}

/**
 * Mutable input state used by systems. Hosts call `apply(snapshot)` once per frame
 * followed by `endFrame()` after the systems have run.
 */
export class InputState {
  private heldKeys = new Set<KeyName>();
  private pressedKeys = new Set<KeyName>();
  private releasedKeys = new Set<KeyName>();
  private heldButtons = new Set<MouseButton>();
  private pressedButtons = new Set<MouseButton>();
  private releasedButtons = new Set<MouseButton>();
  private pointer: Vec2 = vec2(0, 0);

  /** Builds state from a snapshot; a missing snapshot yields an idle state. */
  static fromSnapshot(input?: InputSnapshot): InputState {
    const state = new InputState();
    state.apply(input ?? emptySnapshot());
    return state;
  }

  apply(input: InputSnapshot): void {
    const normalized = normalizeSnapshot(input);
    this.heldKeys = new Set(normalized.held);
    this.pressedKeys = new Set(normalized.pressed);
    this.releasedKeys = new Set(normalized.released);
    this.heldButtons = new Set(normalized.mouseHeld);
    this.pressedButtons = new Set(normalized.mousePressed);
    this.releasedButtons = new Set(normalized.mouseReleased);
    this.pointer = vec2Clone(normalized.mouse);
  }

  isDown(key: KeyName): boolean {
    return this.heldKeys.has(key);
  }

  isAnyDown(keys: readonly KeyName[]): boolean {
    return keys.some((key) => this.heldKeys.has(key));
  }

  wasPressed(key: KeyName): boolean {
    return this.pressedKeys.has(key);
  }

  wasReleased(key: KeyName): boolean {
    return this.releasedKeys.has(key);
  }

  get mouse(): Vec2 {
    return vec2Clone(this.pointer);
  }

  get mouseX(): number {
    return this.pointer.x;
  }

  get mouseY(): number {
    return this.pointer.y;
  }

  isMouseDown(button: MouseButton): boolean {
    return this.heldButtons.has(button);
  }

  wasMousePressed(button: MouseButton): boolean {
    return this.pressedButtons.has(button);
  }

  wasMouseReleased(button: MouseButton): boolean {
    return this.releasedButtons.has(button);
  }

  /** -1, 0 or 1 from a pair of keys. */
  axis(negative: KeyName, positive: KeyName): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  /** Clears per-frame edges; held state persists. */
  endFrame(): void {
    this.pressedKeys.clear();
    this.releasedKeys.clear();
    this.pressedButtons.clear();
    this.releasedButtons.clear();
  }

  toSnapshot(): InputSnapshot {
    return normalizeSnapshot({
      held: [...this.heldKeys],
      pressed: [...this.pressedKeys],
      released: [...this.releasedKeys],
      mouse: this.pointer,
      mouseHeld: [...this.heldButtons],
      mousePressed: [...this.pressedButtons],
      mouseReleased: [...this.releasedButtons],
    });
  }

  clear(): void {
    this.heldKeys.clear();
    this.pressedKeys.clear();
    this.releasedKeys.clear();
    this.heldButtons.clear();
    this.pressedButtons.clear();
    this.releasedButtons.clear();
  }
}

/**
 * Deterministic input script: a list of per-frame snapshots.
 * Used by tests and by the editor's "recorded input" replay.
 */
export class InputScript {
  readonly frames: InputSnapshot[];

  constructor(frames: InputSnapshot[] = []) {
    this.frames = frames.map(normalizeSnapshot);
  }

  static of(...frames: InputSnapshot[]): InputScript {
    return new InputScript(frames);
  }

  get length(): number {
    return this.frames.length;
  }

  /** Snapshot for frame `index`, repeating the last frame once the script ends. */
  at(index: number): InputSnapshot {
    if (this.frames.length === 0) return emptySnapshot();
    if (index < this.frames.length) return this.frames[index];
    return this.frames[this.frames.length - 1];
  }

  toJSON(): InputSnapshot[] {
    return this.frames.map(normalizeSnapshot);
  }

  static fromJSON(data: unknown): InputScript {
    if (!Array.isArray(data)) throw new Error("InputScript.fromJSON expects an array");
    return new InputScript(data.map((frame) => snapshot(frame as Partial<InputSnapshot>)));
  }
}

/**
 * Converts a stream of held-key sets into snapshots with correct pressed/released
 * edges — the bridge from DOM events (or a test script) to the input model.
 */
export class InputTracker {
  private held = new Set<KeyName>();
  private pointer: Vec2 = vec2(0, 0);
  private buttons = new Set<MouseButton>();
  /** Presses/releases seen since the last snapshot, so a sub-frame tap is never lost. */
  private pendingPresses = new Set<KeyName>();
  private pendingReleases = new Set<KeyName>();
  private pendingButtonPresses = new Set<MouseButton>();
  private pendingButtonReleases = new Set<MouseButton>();
  private previousHeld: KeyName[] = [];
  private previousButtons: MouseButton[] = [];

  press(key: KeyName): void {
    this.held.add(key);
    this.pendingPresses.add(key);
  }

  release(key: KeyName): void {
    if (this.held.delete(key)) this.pendingReleases.add(key);
  }

  moveMouse(x: number, y: number): void {
    this.pointer = vec2(x, y);
  }

  pressMouse(button: MouseButton): void {
    this.buttons.add(button);
    this.pendingButtonPresses.add(button);
  }

  releaseMouse(button: MouseButton): void {
    if (this.buttons.delete(button)) this.pendingButtonReleases.add(button);
  }

  /** Releases every held key and button (used when the host loses focus). */
  releaseAll(): void {
    for (const key of [...this.held]) this.release(key);
    for (const button of [...this.buttons]) this.releaseMouse(button);
  }

  /**
   * Snapshot for the current frame: edges are the union of everything seen since the last
   * call (so a tap between two frames still registers as a press) and the diff against the
   * previous snapshot. Everything is then replaced, making snapshots strictly sequential.
   */
  snapshot(): InputSnapshot {
    const previousHeld = new Set(this.previousHeld);
    const previousButtons = new Set(this.previousButtons);

    const pressed = new Set<KeyName>(this.pendingPresses);
    for (const key of this.held) if (!previousHeld.has(key)) pressed.add(key);
    const released = new Set<KeyName>(this.pendingReleases);
    for (const key of this.previousHeld) if (!this.held.has(key)) released.add(key);

    const mousePressed = new Set<MouseButton>(this.pendingButtonPresses);
    for (const button of this.buttons) if (!previousButtons.has(button)) mousePressed.add(button);
    const mouseReleased = new Set<MouseButton>(this.pendingButtonReleases);
    for (const button of this.previousButtons) if (!this.buttons.has(button)) mouseReleased.add(button);

    this.pendingPresses.clear();
    this.pendingReleases.clear();
    this.pendingButtonPresses.clear();
    this.pendingButtonReleases.clear();
    this.previousHeld = [...this.held];
    this.previousButtons = [...this.buttons];

    return normalizeSnapshot({
      held: [...this.held],
      pressed: [...pressed],
      released: [...released],
      mouse: this.pointer,
      mouseHeld: [...this.buttons],
      mousePressed: [...mousePressed],
      mouseReleased: [...mouseReleased],
    });
  }
}
