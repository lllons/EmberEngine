/**
 * @ember/render2d/backends/canvas2d — executes draw commands on a Canvas 2D context.
 *
 * Owner: this file owns the one and only rasteriser. The browser editor, the exported
 * `.exe` player (which hosts a canvas in a webview/static page) and the tests all use it.
 *
 * The context is typed structurally rather than as `CanvasRenderingContext2D` so tests can
 * pass a recording fake and so the module stays usable in non-DOM runtimes.
 */

import { Colors, Theme } from "@ember/core";
import type { DrawCommand, ShapeCommand } from "../commands.ts";

export interface Context2D {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
  ): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  /** Canvas 2D's two `drawImage` signatures; a 5-argument call draws 1:1. */
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(
    image: unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  measureText?(text: string): { width: number };
}

export interface TextureLike {
  /** Whatever the backend can draw: an ImageBitmap, HTMLImageElement, offscreen canvas… */
  image: unknown;
}

export type TextureResolver = (key: string) => TextureLike | undefined;

export interface Canvas2DBackendOptions {
  /** Resolves `Sprite.texture` keys to images; sprites fall back to a placeholder box. */
  resolveTexture?: TextureResolver;
  /** Colour drawn when a sprite's texture is missing. */
  placeholderColor?: string;
  /** Surface size in pixels, used for `clear`. Defaults to the context's canvas. */
  width?: number;
  height?: number;
}

export interface RenderStats {
  commands: number;
  byKind: Record<string, number>;
  /** Saves/restores avoided by only setting state when a command needs it. */
  skippedStateChanges: number;
}

const DEFAULT_PLACEHOLDER = Theme.danger;

/**
 * Creates a stateless-ish renderer bound to one context. Safe to reuse for every frame;
 * it holds no per-frame state after `render` returns.
 */
export function createCanvas2DRenderer(
  ctx: Context2D,
  options: Canvas2DBackendOptions = {},
) {
  const placeholderColor = options.placeholderColor ?? DEFAULT_PLACEHOLDER;

  /** Explicit option first, then the real canvas the context belongs to, then a default. */
  function surfaceWidth(): number {
    return options.width ?? readSize((ctx as { canvas?: unknown }).canvas, "width") ?? 1920;
  }

  function surfaceHeight(): number {
    return options.height ?? readSize((ctx as { canvas?: unknown }).canvas, "height") ?? 1080;
  }

  function drawShape(command: ShapeCommand): void {
    switch (command.kind) {
      case "rect":
        drawRect(command);
        return;
      case "circle":
        drawCircle(command);
        return;
      case "sprite":
        drawSprite(command);
        return;
      case "text":
        drawText(command);
        return;
      case "triangle":
        drawTriangle(command);
        return;
    }
  }

  function drawRect(command: Extract<ShapeCommand, { kind: "rect" }>): void {
    const needsTransform = command.rotation !== 0;
    const needsAlpha = command.alpha < 1;
    if (needsTransform || needsAlpha) ctx.save();
    if (needsAlpha) ctx.globalAlpha = command.alpha;
    if (needsTransform) {
      ctx.translate(command.x, command.y);
      ctx.rotate(command.rotation);
    }
    const x = needsTransform
      ? -command.w * command.anchorX
      : command.x - command.w * command.anchorX;
    const y = needsTransform
      ? -command.h * command.anchorY
      : command.y - command.h * command.anchorY;
    if (command.filled) {
      ctx.fillStyle = command.color;
      ctx.fillRect(x, y, command.w, command.h);
    } else {
      ctx.strokeStyle = command.color;
      ctx.lineWidth = Math.max(0.5, command.strokeWidth);
      ctx.strokeRect(x, y, command.w, command.h);
    }
    if (needsTransform || needsAlpha) ctx.restore();
  }

  function drawCircle(command: Extract<ShapeCommand, { kind: "circle" }>): void {
    const needsAlpha = command.alpha < 1;
    if (needsAlpha) ctx.save();
    if (needsAlpha) ctx.globalAlpha = command.alpha;
    ctx.beginPath();
    ctx.arc(command.x, command.y, Math.max(0, command.radius), 0, Math.PI * 2);
    if (command.filled) {
      ctx.fillStyle = command.color;
      ctx.fill();
    } else {
      ctx.strokeStyle = command.color;
      ctx.lineWidth = Math.max(0.5, command.strokeWidth);
      ctx.stroke();
    }
    ctx.closePath();
    if (needsAlpha) ctx.restore();
  }

  function drawSprite(command: Extract<ShapeCommand, { kind: "sprite" }>): void {
    const texture = command.texture ? options.resolveTexture?.(command.texture) : undefined;
    const needsTransform = command.rotation !== 0;
    const needsAlpha = command.alpha < 1;
    if (needsTransform || needsAlpha) ctx.save();
    if (needsAlpha) ctx.globalAlpha = command.alpha;
    if (needsTransform) {
      ctx.translate(command.x, command.y);
      ctx.rotate(command.rotation);
    }
    const dx = needsTransform
      ? -command.width * command.anchorX
      : command.x - command.width * command.anchorX;
    const dy = needsTransform
      ? -command.height * command.anchorY
      : command.y - command.height * command.anchorY;
    if (texture) {
      // Frame strips are addressed with normalized UVs; the resolver's image size gives
      // the pixel source rect. Images without dimensions draw 1:1.
      const imageW = readSize(texture.image, "width");
      const imageH = readSize(texture.image, "height");
      if (imageW !== undefined && imageH !== undefined) {
        const uv = command.uv;
        ctx.drawImage(
          texture.image,
          uv.u0 * imageW,
          uv.v0 * imageH,
          Math.max(1, (uv.u1 - uv.u0) * imageW),
          Math.max(1, (uv.v1 - uv.v0) * imageH),
          dx,
          dy,
          command.width,
          command.height,
        );
      } else {
        ctx.drawImage(texture.image, dx, dy, command.width, command.height);
      }
    } else {
      ctx.fillStyle = command.tint === Colors.white ? placeholderColor : command.tint;
      ctx.fillRect(dx, dy, command.width, command.height);
    }
    if (needsTransform || needsAlpha) ctx.restore();
  }

  function drawTriangle(command: Extract<ShapeCommand, { kind: "triangle" }>): void {
    const needsAlpha = command.alpha < 1;
    if (needsAlpha) ctx.save();
    if (needsAlpha) ctx.globalAlpha = command.alpha;
    ctx.beginPath();
    ctx.moveTo(command.ax, command.ay);
    ctx.lineTo(command.bx, command.by);
    ctx.lineTo(command.cx, command.cy);
    ctx.closePath();
    if (command.filled) {
      ctx.fillStyle = command.color;
      ctx.fill();
    } else {
      ctx.strokeStyle = command.color;
      ctx.lineWidth = Math.max(0.5, command.strokeWidth);
      ctx.stroke();
    }
    if (needsAlpha) ctx.restore();
  }

  function drawText(command: Extract<ShapeCommand, { kind: "text" }>): void {
    const needsAlpha = command.alpha < 1;
    if (needsAlpha) ctx.save();
    if (needsAlpha) ctx.globalAlpha = command.alpha;
    ctx.fillStyle = command.color;
    ctx.font = `${Math.max(1, command.size)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = command.align;
    ctx.textBaseline = command.baseline;
    ctx.fillText(command.text, command.x, command.y);
    if (needsAlpha) ctx.restore();
  }

  function render(commands: readonly DrawCommand[]): RenderStats {
    const byKind: Record<string, number> = {};
    for (const command of commands) {
      byKind[command.kind] = (byKind[command.kind] ?? 0) + 1;
      if (command.kind === "clear") {
        ctx.globalAlpha = 1;
        ctx.fillStyle = command.color;
        ctx.fillRect(0, 0, surfaceWidth(), surfaceHeight());
        continue;
      }
      drawShape(command);
    }
    return { commands: commands.length, byKind, skippedStateChanges: 0 };
  }

  return { render, drawShape, surfaceWidth, surfaceHeight };
}

/** Renders a command list with a fresh stateless renderer. */
export function renderCommands(
  ctx: Context2D,
  commands: readonly DrawCommand[],
  options: Canvas2DBackendOptions = {},
): RenderStats {
  return createCanvas2DRenderer(ctx, options).render(commands);
}

function readSize(image: unknown, key: "width" | "height"): number | undefined {
  if (!image || typeof image !== "object") return undefined;
  const value = (image as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
