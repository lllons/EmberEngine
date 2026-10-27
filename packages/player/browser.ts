/**
 * @ember/player/browser — the browser host.
 *
 * Owner: this file owns how a running game meets a real window: canvas sizing, key
 * mapping, the requestAnimationFrame loop that drives `RuntimeHost`, and the hand-off to
 * the `canvas2d` backend. The editor's Play mode and the exported `.exe` page both call
 * `startPlayer`, so a game looks and behaves the same in both.
 *
 * The frame clock belongs to `@ember/runtime`'s `RuntimeHost`; this file never decides how
 * simulation time advances, only when the browser asks for the next frame.
 *
 * DOM types are declared structurally (as in `render2d/backends/canvas2d.ts`) because
 * the workspace type-checks under Deno's lib rather than `lib.dom`.
 */

import { type InputSnapshot, InputTracker, type Size, Theme } from "@ember/core";
import { type Context2D, createCanvas2DRenderer } from "@ember/render2d";
import type { RuntimeHost } from "@ember/runtime";

/** Everything a page needs to run a game it already owns. */
export interface PlayerSetup {
  title: string;
  viewport: Size;
  /** The game's host: owns the session, the fixed-step clock and the frame stats. */
  host: RuntimeHost;
}

/** Proof that the host is alive and painting; also posted to `/api/frame` in dev. */
export interface FrameReport {
  frames: number;
  draws: number;
  entities: number;
  time: number;
  fps: number;
  width: number;
  height: number;
  /** Pixels that differ from the scene background (a blank canvas reports 0). */
  paintedPixels: number;
  /** `#rrggbb` samples from fixed screen positions, for sanity-checking colours. */
  samples: string[];
}

export interface PlayerOptions {
  /** Canvas to draw into; created and appended when omitted. */
  canvas?: CanvasLike;
  /** Where frame reports are POSTed. Defaults to `/api/frame`. */
  reportUrl?: string;
  /** Report every N frames (0 disables reporting). */
  reportEvery?: number;
}

export interface PlayerHandle {
  readonly host: RuntimeHost;
  readonly frames: number;
  readonly lastReport: FrameReport | null;
  /** Forces a paint + report right now (host self-check and tooling). */
  probe(): FrameReport;
  stop(): void;
}

// ---------------------------------------------------------------------------
// The DOM surface this file needs, declared structurally.
// ---------------------------------------------------------------------------

export interface CanvasLike {
  id: string;
  width: number;
  height: number;
  getContext(contextId: "2d", options?: { alpha?: boolean }): Canvas2DContext | null;
}

export interface Canvas2DContext extends Context2D {
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
}

interface KeyboardEventLike {
  code: string;
  preventDefault(): void;
}

interface DocumentLike {
  title: string;
  querySelector(selectors: string): unknown;
  createElement(tagName: "canvas"): CanvasLike;
  body: { appendChild(node: unknown): void };
}

interface WindowLike {
  addEventListener(type: string, listener: (event: KeyboardEventLike) => void): void;
}

/** Keys the page keeps for the game instead of letting the browser scroll. */
const CAPTURED_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
]);

/** Starts the game in the current page. Returns a handle; the loop runs until stopped. */
export function startPlayer(setup: PlayerSetup, options: PlayerOptions = {}): PlayerHandle {
  const viewport = setup.viewport;
  const canvas = options.canvas ?? createCanvas(viewport);
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("the browser did not provide a 2d canvas context");

  const { host } = setup;
  const session = host.session;
  const renderer = createCanvas2DRenderer(context, {
    width: viewport.width,
    height: viewport.height,
    placeholderColor: Theme.danger,
  });
  const tracker = new InputTracker();
  const reportUrl = options.reportUrl ?? "/api/frame";
  const reportEvery = options.reportEvery ?? 30;

  const doc = (globalThis as unknown as { document: DocumentLike }).document;
  doc.title = setup.title;
  bindKeyboard(tracker);

  let frames = 0;
  let lastReport: FrameReport | null = null;
  let running = true;
  let lastTimestamp = 0;

  const handle: PlayerHandle = {
    host,
    get frames() {
      return frames;
    },
    get lastReport() {
      return lastReport;
    },
    probe,
    stop,
  };

  function paint(): void {
    const drawList = session.drawList();
    renderer.render(drawList.commands);
    frames += 1;
  }

  function measure(): FrameReport {
    const background = session.scene.resources.background;
    const pixels = context!.getImageData(0, 0, viewport.width, viewport.height).data;
    const bg = parseHex(background);
    let painted = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (
        Math.abs(pixels[index] - bg[0]) > 8 ||
        Math.abs(pixels[index + 1] - bg[1]) > 8 ||
        Math.abs(pixels[index + 2] - bg[2]) > 8
      ) {
        painted += 1;
      }
    }
    const samples: string[] = [];
    for (const [x, y] of samplePoints(viewport)) {
      const offset = (y * viewport.width + x) * 4;
      samples.push(rgbToHex(pixels[offset], pixels[offset + 1], pixels[offset + 2]));
    }
    return {
      frames,
      draws: session.drawList().stats.drawn,
      entities: session.entityCount,
      time: Math.round(session.time * 1000) / 1000,
      fps: Math.round(host.fps.fps * 10) / 10,
      width: viewport.width,
      height: viewport.height,
      paintedPixels: painted,
      samples,
    };
  }

  function report(): void {
    lastReport = measure();
    if (reportEvery > 0) {
      void fetch(reportUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lastReport),
      }).catch(() => {
        // Reporting is diagnostics only; a closed host must never stop the game.
      });
    }
  }

  function probe(): FrameReport {
    paint();
    report();
    return lastReport as FrameReport;
  }

  function frame(timestamp: number): void {
    if (!running) return;
    const raw = lastTimestamp === 0 ? 1 / 60 : (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    // `RuntimeHost.advance` applies this frame's key edges to the first fixed step only.
    const snapshot: InputSnapshot = tracker.snapshot();
    host.advance(raw, snapshot);

    paint();
    if (reportEvery > 0 && (frames === 1 || frames % reportEvery === 0)) report();

    scheduleFrame(frame);
  }

  function stop(): void {
    running = false;
  }

  // Exposed for the host's self-check and for browser-side debugging.
  (globalThis as Record<string, unknown>).__ember = { setup, host, session, handle, probe, report };

  scheduleFrame(frame);
  return handle;
}

/** `requestAnimationFrame` is a browser global; Deno's lib does not declare it. */
function scheduleFrame(callback: (timestamp: number) => void): void {
  const raf = (globalThis as unknown as {
    requestAnimationFrame(handler: (timestamp: number) => void): number;
  }).requestAnimationFrame;
  raf(callback);
}

function createCanvas(viewport: Size): CanvasLike {
  const doc = (globalThis as unknown as { document: DocumentLike }).document;
  const existing = doc.querySelector("canvas") as CanvasLike | null;
  const canvas = existing ?? doc.createElement("canvas");
  if (!existing) doc.body.appendChild(canvas);
  canvas.id = "ember-canvas";
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  return canvas;
}

function bindKeyboard(tracker: InputTracker): void {
  const target = globalThis as unknown as WindowLike;
  target.addEventListener("keydown", (event) => {
    if (CAPTURED_KEYS.has(event.code)) event.preventDefault();
    tracker.press(event.code);
  });
  target.addEventListener("keyup", (event) => {
    if (CAPTURED_KEYS.has(event.code)) event.preventDefault();
    tracker.release(event.code);
  });
  target.addEventListener("blur", () => {
    // Losing focus must not leave a key stuck down.
    for (const key of CAPTURED_KEYS) tracker.release(key);
  });
}

/** Nine screen positions spread over the frame (centre, quadrants, corners inset). */
function samplePoints(viewport: Size): Array<[number, number]> {
  const xs = [0.25, 0.5, 0.75].map((fraction) =>
    Math.min(viewport.width - 1, Math.floor(viewport.width * fraction))
  );
  const ys = [0.25, 0.5, 0.75].map((fraction) =>
    Math.min(viewport.height - 1, Math.floor(viewport.height * fraction))
  );
  const points: Array<[number, number]> = [];
  for (const y of ys) for (const x of xs) points.push([x, y]);
  return points;
}

function parseHex(color: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return [0, 0, 0];
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
