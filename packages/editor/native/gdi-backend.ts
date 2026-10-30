/**
 * @ember/editor/native/gdi-backend — executes engine draw commands on a GDI surface.
 *
 * Owner: this file owns "the editor previews exactly what the engine draws", translated to
 * Win32 GDI. 2D shapes and projected 3D triangles arrive in the same command list, so the
 * native viewport renders both without knowing which pipeline produced them.
 *
 * Geometry is letterboxed: commands use the scene viewport's pixel space, and the editor
 * scales them into the available viewport rectangle while preserving aspect ratio.
 *
 * Sprites draw their real texture when the caller supplies one (the editor builds the
 * project's procedural textures), including uv frames, tint, alpha, flip and rotation. A
 * key with no texture behind it falls back to the tinted box used before.
 */

import { Colors, rotateVec, Theme } from "@ember/core";
import type { DrawCommand, RgbaImage, ShapeCommand } from "@ember/render2d";
import { commandBounds, sampleSprite } from "@ember/render2d";
import type { GdiCanvas } from "./gdi.ts";

export interface PreviewRect {
  /** Top-left of the viewport panel in client coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Scene viewport size the commands were built for. */
  sceneWidth: number;
  sceneHeight: number;
}

export interface PreviewMapping {
  originX: number;
  originY: number;
  scale: number;
  sceneWidth: number;
  sceneHeight: number;
}

export interface GdiRenderOptions {
  /**
   * Procedural textures by `Sprite.texture` key, as built by `@ember/assets` with the
   * software canvas factory. Keys with no texture draw the tinted placeholder box.
   */
  textures?: (key: string) => RgbaImage | undefined;
}

/** Where the scene sits inside the panel; shared by rendering, picking and dragging. */
export function previewMapping(rect: PreviewRect): PreviewMapping {
  const scale = Math.min(rect.w / rect.sceneWidth, rect.h / rect.sceneHeight);
  return {
    originX: rect.x + (rect.w - rect.sceneWidth * scale) / 2,
    originY: rect.y + (rect.h - rect.sceneHeight * scale) / 2,
    scale,
    sceneWidth: rect.sceneWidth,
    sceneHeight: rect.sceneHeight,
  };
}

function x(mapping: PreviewMapping, value: number): number {
  return mapping.originX + value * mapping.scale;
}

function y(mapping: PreviewMapping, value: number): number {
  return mapping.originY + value * mapping.scale;
}

/** Renders one frame. The caller owns the selection overlay. */
export function renderCommandsGdi(
  canvas: GdiCanvas,
  commands: readonly DrawCommand[],
  rect: PreviewRect,
  options: GdiRenderOptions = {},
): PreviewMapping {
  const mapping = previewMapping(rect);
  canvas.fillRect(rect.x, rect.y, rect.w, rect.h, Theme.background);
  canvas.clip(rect.x, rect.y, rect.w, rect.h);

  for (const command of commands) {
    if (command.kind === "clear") {
      canvas.fillRect(
        mapping.originX,
        mapping.originY,
        mapping.sceneWidth * mapping.scale,
        mapping.sceneHeight * mapping.scale,
        command.color,
      );
      continue;
    }
    drawShape(canvas, command, mapping, options);
  }

  canvas.restore();
  canvas.strokeRect(
    mapping.originX,
    mapping.originY,
    mapping.sceneWidth * mapping.scale,
    mapping.sceneHeight * mapping.scale,
    Theme.border,
  );
  return mapping;
}

function drawShape(
  canvas: GdiCanvas,
  command: ShapeCommand,
  mapping: PreviewMapping,
  options: GdiRenderOptions,
): void {
  if (command.alpha <= 0.02) return;
  const scale = mapping.scale;
  switch (command.kind) {
    case "rect": {
      const width = command.w * scale;
      const height = command.h * scale;
      const left = x(mapping, command.x) - width * command.anchorX;
      const top = y(mapping, command.y) - height * command.anchorY;
      if (command.rotation === 0) {
        if (command.filled) canvas.fillRect(left, top, width, height, command.color);
        else canvas.strokeRect(left, top, width, height, command.color, command.strokeWidth * scale);
      } else {
        const centerX = x(mapping, command.x);
        const centerY = y(mapping, command.y);
        const corners = [
          { x: -width * command.anchorX, y: -height * command.anchorY },
          { x: width * (1 - command.anchorX), y: -height * command.anchorY },
          { x: width * (1 - command.anchorX), y: height * (1 - command.anchorY) },
          { x: -width * command.anchorX, y: height * (1 - command.anchorY) },
        ].map((point) => {
          const rotated = rotateVec(point, command.rotation);
          return { x: centerX + rotated.x, y: centerY + rotated.y };
        });
        canvas.polygon(corners, command.color, command.filled, command.strokeWidth * scale);
      }
      return;
    }
    case "circle": {
      const radius = command.radius * scale;
      canvas.ellipse(
        x(mapping, command.x) - radius,
        y(mapping, command.y) - radius,
        radius * 2,
        radius * 2,
        command.color,
        command.filled,
        command.strokeWidth * scale,
      );
      return;
    }
    case "sprite": {
      const width = command.width * scale;
      const height = command.height * scale;
      const left = x(mapping, command.x) - width * command.anchorX;
      const top = y(mapping, command.y) - height * command.anchorY;
      const texture = options.textures?.(command.texture);
      if (texture && width >= 1 && height >= 1) {
        // Sample first, then blit: uv frames, tint, alpha, flip and rotation are all pixels
        // the GDI surface can take in one go.
        const sampled = sampleSprite(texture, {
          uv: command.uv,
          width,
          height,
          tint: command.tint,
          alpha: command.alpha,
          flipX: command.flipX,
          rotation: command.rotation,
          anchorX: command.anchorX,
          anchorY: command.anchorY,
        });
        canvas.alphaBlit(
          sampled.image,
          x(mapping, command.x) + sampled.offsetX,
          y(mapping, command.y) + sampled.offsetY,
        );
        return;
      }
      // No texture for this key; the tint keeps layout readable.
      canvas.fillRect(
        left,
        top,
        width,
        height,
        command.tint === Colors.white ? Theme.faint : command.tint,
      );
      canvas.strokeRect(left, top, width, height, Theme.borderSoft);
      return;
    }
    case "text": {
      canvas.text(
        x(mapping, command.x),
        y(mapping, command.y),
        command.text,
        Math.max(8, command.size * scale),
        command.color,
        command.align,
        command.baseline,
      );
      return;
    }
    case "triangle": {
      canvas.polygon(
        [
          { x: x(mapping, command.ax), y: y(mapping, command.ay) },
          { x: x(mapping, command.bx), y: y(mapping, command.by) },
          { x: x(mapping, command.cx), y: y(mapping, command.cy) },
        ],
        command.color,
        command.filled,
        command.strokeWidth * scale,
      );
      return;
    }
  }
}

/** Client point -> scene-space point (the space draw commands live in). */
export function clientToScene(
  rect: PreviewRect,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const mapping = previewMapping(rect);
  return {
    x: (clientX - mapping.originX) / mapping.scale,
    y: (clientY - mapping.originY) / mapping.scale,
  };
}

/** Union of one entity's command bounds, in scene space. */
export function entitySceneBounds(
  commands: readonly DrawCommand[],
  entity: number,
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const command of commands) {
    if (command.kind === "clear" || command.entity !== entity) continue;
    const bounds = commandBounds(command);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.w);
    maxY = Math.max(maxY, bounds.y + bounds.h);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
