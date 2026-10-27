/**
 * @ember/render2d/commands — the draw command vocabulary.
 *
 * Owner: this file owns what a "draw command" is. Commands are plain JSON data in
 * **screen space**: `build.ts` converts 2D world positions and `render3d` projects 3D
 * meshes into the same vocabulary, so backends only execute and never know which
 * pipeline produced a command.
 *
 * Anchoring convention: shapes are centred on their position unless a command says
 * otherwise (`anchorX`/`anchorY` are 0..1 fractions of the shape box).
 *
 * 2D and 3D share this vocabulary on purpose: one rasteriser, one set of backends, and
 * mixed frames where sprites and meshes can appear in the same layer order.
 */

import type { Color } from "@ember/core";

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export const FULL_UV: UvRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

export interface ClearCommand {
  kind: "clear";
  color: Color;
}

export interface RectCommand {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  color: Color;
  alpha: number;
  rotation: number;
  /** Anchor inside the box: 0.5/0.5 is the centre. */
  anchorX: number;
  anchorY: number;
  filled: boolean;
  strokeWidth: number;
  /** Source entity, for editor picking and debugging. */
  entity: number;
  layer: number;
}

export interface CircleCommand {
  kind: "circle";
  x: number;
  y: number;
  radius: number;
  color: Color;
  alpha: number;
  filled: boolean;
  strokeWidth: number;
  entity: number;
  layer: number;
}

export interface SpriteCommand {
  kind: "sprite";
  x: number;
  y: number;
  width: number;
  height: number;
  texture: string;
  uv: UvRect;
  /** Colour multiplied over the texture; `Colors.white` (the theme's white) draws it unmodified. */
  tint: Color;
  alpha: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
  flipX: boolean;
  entity: number;
  layer: number;
}

export interface TriangleCommand {
  kind: "triangle";
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  color: Color;
  alpha: number;
  /** `false` draws the three edges (wireframe meshes). */
  filled: boolean;
  strokeWidth: number;
  /**
   * View-space depth in world units, larger = farther from the camera.
   * Painter's algorithm: triangles are drawn far to near.
   */
  depth: number;
  entity: number;
  layer: number;
}

export interface TextCommand {
  kind: "text";
  text: string;
  x: number;
  y: number;
  size: number;
  color: Color;
  alpha: number;
  align: "left" | "center" | "right";
  baseline: "top" | "middle" | "bottom";
  entity: number;
  layer: number;
}

export type DrawCommand =
  | ClearCommand
  | RectCommand
  | CircleCommand
  | SpriteCommand
  | TextCommand
  | TriangleCommand;

/** Commands that can be culled; `clear` always executes. */
export type ShapeCommand =
  | RectCommand
  | CircleCommand
  | SpriteCommand
  | TextCommand
  | TriangleCommand;

export function isShapeCommand(command: DrawCommand): command is ShapeCommand {
  return command.kind !== "clear";
}

/** Screen-space bounding box a command paints into. */
export function commandBounds(
  command: ShapeCommand,
): { x: number; y: number; w: number; h: number } {
  switch (command.kind) {
    case "rect":
      return {
        x: command.x - command.w * command.anchorX,
        y: command.y - command.h * command.anchorY,
        w: command.w,
        h: command.h,
      };
    case "circle":
      return {
        x: command.x - command.radius,
        y: command.y - command.radius,
        w: command.radius * 2,
        h: command.radius * 2,
      };
    case "sprite":
      return {
        x: command.x - command.width * command.anchorX,
        y: command.y - command.height * command.anchorY,
        w: command.width,
        h: command.height,
      };
    case "triangle": {
      const xs = [command.ax, command.bx, command.cx];
      const ys = [command.ay, command.by, command.cy];
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return {
        x: minX,
        y: minY,
        w: Math.max(...xs) - minX,
        h: Math.max(...ys) - minY,
      };
    }
    case "text":
      return {
        x: command.x -
          (command.align === "center"
            ? (command.text.length * command.size) / 2
            : command.align === "right"
            ? command.text.length * command.size
            : 0),
        y: command.y - (command.baseline === "middle" ? command.size / 2 : 0),
        w: command.text.length * command.size,
        h: command.size,
      };
  }
}

export function commandsToJSON(commands: readonly DrawCommand[]): DrawCommand[] {
  return commands.map((command) => ({ ...command }));
}

/** Counts per command kind — used by the profiler panel and the tests. */
export function commandHistogram(commands: readonly DrawCommand[]): Record<string, number> {
  const histogram: Record<string, number> = {};
  for (const command of commands) {
    histogram[command.kind] = (histogram[command.kind] ?? 0) + 1;
  }
  return histogram;
}
