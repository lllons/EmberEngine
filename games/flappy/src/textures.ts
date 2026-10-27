/**
 * games/flappy — procedural artwork.
 *
 * Owner: this file owns the example's textures. Everything is drawn in code, so the game
 * ships no binary assets and the exported executable stays a single file. The palette is
 * the engine theme: white/grey structure, orange for the bird and rewards.
 */

import type { TextureSources } from "@ember/assets";
import { Colors, Theme } from "@ember/core";
import type { Context2D } from "@ember/render2d";

function fillBox(ctx: Context2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.closePath();
  ctx.fill();
}

/** The bird: an orange body with a white eye and a dark wing. */
export const birdTexture = {
  width: 34,
  height: 26,
  draw(ctx: Context2D, size: { width: number; height: number }): void {
    ctx.fillStyle = Colors.ember;
    ctx.beginPath();
    ctx.ellipse(size.width / 2, size.height / 2, size.width / 2 - 1, size.height / 2 - 1, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // Belly and wing keep the silhouette readable on black.
    ctx.fillStyle = Colors.white;
    ctx.beginPath();
    ctx.ellipse(size.width * 0.46, size.height * 0.72, size.width * 0.3, size.height * 0.2, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    fillBox(ctx, size.width * 0.2, size.height * 0.38, size.width * 0.34, size.height * 0.26, Colors.emberDeep);

    // Eye: white sclera, near-black pupil.
    ctx.fillStyle = Colors.white;
    ctx.beginPath();
    ctx.arc(size.width * 0.72, size.height * 0.32, size.width * 0.13, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = Theme.background;
    ctx.beginPath();
    ctx.arc(size.width * 0.75, size.height * 0.32, size.width * 0.06, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // Beak.
    fillBox(ctx, size.width * 0.86, size.height * 0.42, size.width * 0.16, size.height * 0.14, Colors.gold);
  },
};

/** A pipe shaft: light body, dark inner shade, orange rim at the tip edge. */
export const pipeTexture = {
  width: 74,
  height: 64,
  draw(ctx: Context2D, size: { width: number; height: number }): void {
    fillBox(ctx, 0, 0, size.width, size.height, Theme.highlight);
    fillBox(ctx, size.width * 0.16, 0, size.width * 0.16, size.height, Theme.faint);
    fillBox(ctx, size.width * 0.68, 0, size.width * 0.12, size.height, Theme.muted);
    fillBox(ctx, 0, 0, 4, size.height, Theme.accent);
    fillBox(ctx, size.width - 4, 0, 4, size.height, Theme.border);
  },
};

/** Ground strip: dark body with a lit top edge. */
export const groundTexture = {
  width: 64,
  height: 64,
  draw(ctx: Context2D, size: { width: number; height: number }): void {
    fillBox(ctx, 0, 0, size.width, size.height, Theme.panel);
    fillBox(ctx, 0, 0, size.width, 6, Theme.highlight);
    fillBox(ctx, 0, 6, size.width, 2, Theme.border);
  },
};

export const textureSources: TextureSources = {
  bird: birdTexture,
  pipe: pipeTexture,
  ground: groundTexture,
};

export const textureNames = Object.keys(textureSources).sort();
