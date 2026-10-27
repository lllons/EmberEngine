/**
 * @ember/player/app/host — mounts a running game into a browser element.
 *
 * Owner: this file owns the browser host: canvas creation, keyboard/mouse capture, the
 * requestAnimationFrame loop and the render call. The exported player page and the editor's
 * Play mode both mount through here, so "playing a game in a browser" behaves identically
 * in both. Headless hosts use `RuntimeHost` directly instead.
 */

import { Diagnostics, type FrameStats, InputTracker } from "@ember/core";
import { type Context2D, createCanvas2DRenderer, type TextureResolver } from "@ember/render2d";
import { type Game, RuntimeHost, type RuntimeSession } from "@ember/runtime";
import { createCanvas, fitCanvasToContainer } from "./canvas-factory.ts";

export interface MountGameOptions {
  /** Element the canvas is appended to. */
  mount: HTMLElement;
  game: Game;
  sceneName?: string;
  /** Resolves `Sprite.texture` keys to images. */
  resolveTexture?: TextureResolver;
  /** Capture input from the window (default true). */
  captureInput?: boolean;
  /** Start the loop immediately (default true). */
  autoplay?: boolean;
  /** Called once per host frame with frame statistics. */
  onStats?: (stats: FrameStats) => void;
  /** Called once when the loop starts and whenever the scene changes. */
  onScene?: (name: string, session: RuntimeSession) => void;
}

export interface MountedGame {
  canvas: HTMLCanvasElement;
  ctx: Context2D;
  host: RuntimeHost;
  get session(): RuntimeSession;
  get sceneName(): string;
  get running(): boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Advances `steps` fixed steps without touching the clock (editor single-step). */
  step(steps?: number): void;
  /** Switches scene, preserving the loop state. */
  loadScene(name: string): void;
  restart(): void;
  resize(): void;
  /** Current frame statistics. */
  stats(): FrameStats;
  stop(): void;
}

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

export function mountGame(options: MountGameOptions): MountedGame {
  const { mount, game } = options;
  let sceneName = options.sceneName ?? game.startScene;
  const session = game.createSession(sceneName, {
    diagnostics: new Diagnostics({ minLevel: "warn" }),
  });
  const host = new RuntimeHost(session);

  const canvas = createCanvas(session.viewport.width, session.viewport.height);
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  mount.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("this browser does not expose a 2D canvas context");
  const renderer = createCanvas2DRenderer(ctx as unknown as Context2D, {
    resolveTexture: options.resolveTexture,
    width: canvas.width,
    height: canvas.height,
  });
  const typedCtx = ctx as unknown as Context2D;

  const input = new InputTracker();
  let running = false;
  let frameHandle = 0;
  let lastTime = 0;
  let stats: FrameStats = {
    frame: 0,
    time: 0,
    lastSteps: 0,
    entityCount: session.entityCount,
    drawCommands: 0,
    fps: 0,
  };

  const listeners: Array<() => void> = [];
  if (options.captureInput ?? true) {
    const onKeyDown = (event: KeyboardEvent) => {
      if (CAPTURED_KEYS.has(event.code)) event.preventDefault();
      input.press(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => input.release(event.code);
    const onBlur = () => {
      // Losing focus must not leave keys stuck down.
      for (const code of [...CAPTURED_KEYS]) input.release(code);
    };
    const toCanvasPoint = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
    };
    const onMouseMove = (event: MouseEvent) => {
      const point = toCanvasPoint(event);
      input.moveMouse(point.x, point.y);
    };
    const onMouseDown = (event: MouseEvent) => {
      const point = toCanvasPoint(event);
      input.moveMouse(point.x, point.y);
      input.pressMouse(event.button === 2 ? "right" : event.button === 1 ? "middle" : "left");
    };
    const onMouseUp = (event: MouseEvent) => {
      input.releaseMouse(event.button === 2 ? "right" : event.button === 1 ? "middle" : "left");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    listeners.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
    });
    const onResize = () => fitCanvasToContainer(canvas, mount);
    window.addEventListener("resize", onResize);
    listeners.push(() => window.removeEventListener("resize", onResize));
    fitCanvasToContainer(canvas, mount);
  }

  function renderFrame(): void {
    const drawList = session.drawList();
    renderer.render(drawList.commands);
    stats = {
      frame: session.frame,
      time: session.time,
      lastSteps: stats.lastSteps,
      entityCount: session.entityCount,
      drawCommands: drawList.commands.length,
      fps: host.fps.fps,
    };
    options.onStats?.(stats);
  }

  function loop(timestamp: number): void {
    if (!running) return;
    const delta = lastTime === 0 ? 0 : (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    const frame = host.advance(delta, input.snapshot());
    stats.lastSteps = frame.steps;
    renderFrame();
    frameHandle = requestAnimationFrame(loop);
  }

  function play(): void {
    if (running) return;
    running = true;
    lastTime = 0;
    frameHandle = requestAnimationFrame(loop);
  }

  function pause(): void {
    running = false;
    if (frameHandle) cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  }

  function loadScene(name: string): void {
    session.setScene(game.createScene(name));
    sceneName = name;
    canvas.width = session.viewport.width;
    canvas.height = session.viewport.height;
    fitCanvasToContainer(canvas, mount);
    options.onScene?.(name, session);
    renderFrame();
  }

  if (options.autoplay ?? true) play();

  return {
    canvas,
    ctx: typedCtx,
    host,
    get session() {
      return session;
    },
    get sceneName() {
      return sceneName;
    },
    get running() {
      return running;
    },
    play,
    pause,
    toggle() {
      if (running) pause();
      else play();
    },
    step(steps = 1) {
      host.tick(steps);
      renderFrame();
    },
    loadScene,
    restart() {
      loadScene(game.startScene);
      session.reset();
      play();
    },
    resize() {
      fitCanvasToContainer(canvas, mount);
    },
    stats() {
      return stats;
    },
    stop() {
      pause();
      for (const remove of listeners) remove();
      canvas.remove();
    },
  };
}
