/**
 * @ember/player/app/canvas-factory — the browser's canvas factory.
 *
 * Owner: the one place that constructs a real drawing surface. `@ember/assets` describes
 * textures; this file turns them into pixels in a browser, and the headless factory in
 * `@ember/assets` stands in when there is no display.
 */

import type { CanvasFactory, TextureCanvas } from "@ember/assets";
import type { Context2D } from "@ember/render2d";

export function createDomCanvasFactory(): CanvasFactory {
  return {
    name: "dom",
    create(width: number, height: number): TextureCanvas {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("this browser does not expose a 2D canvas context");
      return { ctx: ctx as unknown as Context2D, image: canvas, width, height };
    },
  };
}

/** Creates a detached canvas sized for a game surface. */
export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Scales a canvas with CSS while preserving aspect ratio inside `container`. */
export function fitCanvasToContainer(canvas: HTMLCanvasElement, container: HTMLElement): void {
  const scale = Math.min(
    container.clientWidth / canvas.width,
    container.clientHeight / canvas.height,
  );
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  canvas.style.width = `${Math.floor(canvas.width * factor)}px`;
  canvas.style.height = `${Math.floor(canvas.height * factor)}px`;
  canvas.style.imageRendering = factor >= 2 ? "pixelated" : "auto";
}
