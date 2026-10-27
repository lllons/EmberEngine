/**
 * games/ember-runner — procedural textures.
 *
 * Owner: this file owns the game's artwork. Every texture is drawn in code, so the game
 * ships no binary assets, the exported `.exe` stays small, and headless runs build the same
 * texture set against the stub canvas factory. Note this file deliberately takes the plain
 * `Context2D` interface from the renderer: a texture draws with the same API the backend uses.
 */

import type { TextureSources } from "@ember/assets";
import { Colors, withAlpha } from "@ember/core";
import type { Context2D } from "@ember/render2d";

function fillBox(ctx: Context2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.closePath();
  ctx.fill();
}

/** The player: an ember-coloured runner with a visor and a bright core. */
export const playerTexture = {
  width: 28,
  height: 36,
  draw(ctx: Context2D, size: { width: number; height: number }): void {
    fillBox(ctx, 0, 0, size.width, size.height, Colors.ember);
    ctx.strokeStyle = Colors.emberDeep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(1, 1, size.width - 2, size.height - 2);
    ctx.closePath();
    ctx.stroke();
    fillBox(ctx, size.width * 0.25, size.height * 0.18, size.width * 0.5, size.height * 0.26, Colors.gold);
    ctx.fillStyle = withAlpha(Colors.ink, 0.85);
    ctx.beginPath();
    ctx.arc(size.width / 2, size.height * 0.72, size.width * 0.16, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  },
};

/** A four-frame spinning ember coin (frame strip, read with `Sprite.frame`). */
export const coinTexture = {
  width: 64,
  height: 16,
  draw(ctx: Context2D, size: { width: number; height: number }): void {
    const frames = 4;
    const frameWidth = size.width / frames;
    const squeeze = [1, 0.7, 0.4, 0.7];
    for (let frame = 0; frame < frames; frame++) {
      const cx = frame * frameWidth + frameWidth / 2;
      const cy = size.height / 2;
      const radiusX = Math.max(0.5, (frameWidth / 2 - 2) * squeeze[frame]);
      const radiusY = frameWidth / 2 - 2;
      ctx.fillStyle = frame % 2 === 0 ? Colors.gold : Colors.ember;
      ctx.beginPath();
      ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
  },
};

/** A hazard spike block. */
export const hazardTexture = {
  width: 32,
  height: 32,
  draw(ctx: Context2D, size: { width: number; height: number }): void {
    fillBox(ctx, 0, 0, size.width, size.height, Colors.hazard);
    fillBox(ctx, size.width / 2 - 3, 0, 6, size.height, withAlpha(Colors.ink, 0.65));
  },
};

/** The exit gate: a pillar with a glowing core. */
export const goalTexture = {
  width: 48,
  height: 96,
  draw(ctx: Context2D, size: { width: number; height: number }): void {
    fillBox(ctx, 0, 0, size.width, size.height, Colors.skyDeep);
    fillBox(ctx, size.width * 0.35, size.height * 0.15, size.width * 0.3, size.height * 0.7, Colors.sky);
    ctx.fillStyle = withAlpha(Colors.white, 0.85);
    ctx.beginPath();
    ctx.arc(size.width / 2, size.height * 0.5, size.width * 0.12, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  },
};

/** Ground strip with a lit top edge. */
export const groundTexture = {
  width: 64,
  height: 64,
  draw(ctx: Context2D, size: { width: number; height: number }): void {
    fillBox(ctx, 0, 0, size.width, size.height, Colors.slate);
    fillBox(ctx, 0, 0, size.width, 6, Colors.grass);
  },
};

export const textureSources: TextureSources = {
  player: playerTexture,
  coin: coinTexture,
  hazard: hazardTexture,
  goal: goalTexture,
  ground: groundTexture,
};

export const textureNames = Object.keys(textureSources).sort();
