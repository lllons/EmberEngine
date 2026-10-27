/**
 * @ember/render2d/build — scene to draw commands.
 *
 * Owner: this file owns "what does this frame look like". It is pure and headless:
 * give it a scene and a camera, get back JSON draw commands. Tests assert on those
 * commands directly, which is why the whole 2D pipeline is testable without a canvas.
 *
 * Ordering: commands are sorted by `layer`, then by entity id, so output is deterministic
 * for a given scene regardless of insertion history.
 */

import {
  BoxCollider,
  Camera2DState,
  CircleShape,
  type Entity,
  isVisibleInHierarchy,
  RectShape,
  type Scene,
  type Size,
  Sprite,
  TextLabel,
  Theme,
  type Vec2,
  worldTransform,
} from "@ember/core";
import {
  type CircleCommand,
  commandBounds,
  type DrawCommand,
  FULL_UV,
  type RectCommand,
  type ShapeCommand,
  type SpriteCommand,
  type TextCommand,
} from "./commands.ts";
import { visibleWorldRect, worldToScreen } from "./camera2d.ts";

export interface BuildOptions {
  /** Defaults to the scene's configured viewport. */
  viewport?: Size;
  /** Defaults to the scene's camera. */
  camera?: Camera2DState;
  /** Skip shapes outside the view (default true; the editor turns it off). */
  cull?: boolean;
  /** Emit the background `clear` command (default true). */
  background?: boolean;
  /** Draw an outline box for colliders (editor overlay). */
  debugColliders?: boolean;
}

export interface BuildStats {
  /** Renderable entities visited. */
  considered: number;
  /** Commands emitted. */
  drawn: number;
  /** Shapes skipped because they were off-screen. */
  culled: number;
}

export interface DrawList {
  commands: DrawCommand[];
  stats: BuildStats;
  camera: Camera2DState;
  viewport: Size;
}

/** Runs the scene through the camera and returns the commands for one frame. */
export function buildDrawList(scene: Scene, options: BuildOptions = {}): DrawList {
  const viewport = options.viewport ?? scene.resources.viewport;
  const camera = options.camera ?? scene.resources.camera;
  const cull = options.cull ?? true;
  const view = { x: 0, y: 0, w: viewport.width, h: viewport.height };

  const commands: DrawCommand[] = [];
  const stats: BuildStats = { considered: 0, drawn: 0, culled: 0 };
  const shapes: ShapeCommand[] = [];

  if (options.background ?? true) {
    commands.push({ kind: "clear", color: scene.resources.background });
  }

  for (const entity of scene.world.entities()) {
    const shape = buildEntityCommands(scene, entity, camera, viewport, options);
    if (shape.length === 0) continue;
    stats.considered++;
    for (const command of shape) {
      if (cull && !overlapsView(command, view)) {
        stats.culled++;
        continue;
      }
      shapes.push(command);
      stats.drawn++;
    }
  }

  shapes.sort(compareCommands);
  commands.push(...shapes);

  return { commands, stats, camera, viewport };
}

/** Draw commands for a single entity, in screen space. Empty when it draws nothing. */
export function buildEntityCommands(
  scene: Scene,
  entity: Entity,
  camera: Camera2DState,
  viewport: Size,
  options: Pick<BuildOptions, "debugColliders"> = {},
): ShapeCommand[] {
  const world = scene.world;
  if (!world.isAlive(entity)) return [];
  if (!isVisibleInHierarchy(world, entity)) return [];

  const transform = worldTransform(world, entity);
  if (!transform) return [];

  const origin = worldToScreen(camera, viewport, transform.position);
  const zoomX = camera.zoom * transform.scale.x;
  const zoomY = camera.zoom * transform.scale.y;
  const result: ShapeCommand[] = [];

  const sprite = world.get(entity, Sprite);
  if (sprite && sprite.alpha > 0) {
    const frameCount = Math.max(1, Math.floor(sprite.frameCount));
    const frame = ((Math.floor(sprite.frame) % frameCount) + frameCount) % frameCount;
    const command: SpriteCommand = {
      kind: "sprite",
      x: origin.x,
      y: origin.y,
      width: sprite.width * Math.abs(zoomX),
      height: sprite.height * Math.abs(zoomY),
      texture: sprite.texture,
      uv: frameCount > 1
        ? { u0: frame / frameCount, v0: 0, u1: (frame + 1) / frameCount, v1: 1 }
        : FULL_UV,
      tint: sprite.tint,
      alpha: sprite.alpha,
      // Sprite-local rotation is cosmetic: it tilts the image without touching the
      // transform (and therefore the collider).
      rotation: transform.rotation + sprite.rotation,
      anchorX: 0.5,
      anchorY: 0.5,
      flipX: sprite.flipX,
      entity,
      layer: sprite.layer,
    };
    result.push(command);
  }

  const rectShape = world.get(entity, RectShape);
  if (rectShape && rectShape.alpha > 0) {
    const command: RectCommand = {
      kind: "rect",
      x: origin.x,
      y: origin.y,
      w: rectShape.width * Math.abs(zoomX),
      h: rectShape.height * Math.abs(zoomY),
      color: rectShape.color,
      alpha: rectShape.alpha,
      rotation: transform.rotation,
      anchorX: 0.5,
      anchorY: 0.5,
      filled: rectShape.filled,
      strokeWidth: rectShape.strokeWidth * camera.zoom,
      entity,
      layer: rectShape.layer,
    };
    result.push(command);
  }

  const circle = world.get(entity, CircleShape);
  if (circle && circle.alpha > 0) {
    const command: CircleCommand = {
      kind: "circle",
      x: origin.x,
      y: origin.y,
      radius: circle.radius * Math.abs(zoomX),
      color: circle.color,
      alpha: circle.alpha,
      filled: circle.filled,
      strokeWidth: circle.strokeWidth * camera.zoom,
      entity,
      layer: circle.layer,
    };
    result.push(command);
  }

  const label = world.get(entity, TextLabel);
  if (label && label.text.length > 0 && label.alpha > 0) {
    const command: TextCommand = {
      kind: "text",
      text: label.text,
      x: origin.x,
      y: origin.y,
      size: label.size * camera.zoom,
      color: label.color,
      alpha: label.alpha,
      align: label.align,
      baseline: label.baseline,
      entity,
      layer: label.layer,
    };
    result.push(command);
  }

  if (options.debugColliders) {
    const collider = world.get(entity, BoxCollider);
    if (collider && collider.enabled) {
      const center = worldToScreen(camera, viewport, {
        x: transform.position.x + collider.offset.x * transform.scale.x,
        y: transform.position.y + collider.offset.y * transform.scale.y,
      });
      result.push({
        kind: "rect",
        x: center.x,
        y: center.y,
        w: collider.width * Math.abs(zoomX),
        h: collider.height * Math.abs(zoomY),
        color: collider.trigger ? Theme.accent : Theme.danger,
        alpha: 0.9,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
        filled: false,
        strokeWidth: 1,
        entity,
        layer: 900,
      });
    }
  }

  return result;
}

/** Stable draw order: lower layers first, ties broken by entity id. */
export function compareCommands(a: DrawCommand, b: DrawCommand): number {
  const layerA = a.kind === "clear" ? -Infinity : a.layer;
  const layerB = b.kind === "clear" ? -Infinity : b.layer;
  if (layerA !== layerB) return layerA - layerB;
  if (a.kind === "clear" || b.kind === "clear") return 0;
  return a.entity - b.entity;
}

function overlapsView(command: ShapeCommand, view: Rect): boolean {
  const bounds = commandBounds(command);
  return (
    bounds.x < view.x + view.w &&
    view.x < bounds.x + bounds.w &&
    bounds.y < view.y + view.h &&
    view.y < bounds.y + bounds.h
  );
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Topmost entity under a screen point, or null. Mirrors `buildDrawList` ordering in
 * reverse so editor picking matches what the player sees.
 */
export function pickEntityAtPoint(drawList: DrawList, screen: Vec2): Entity | null {
  for (let i = drawList.commands.length - 1; i >= 0; i--) {
    const command = drawList.commands[i];
    if (command.kind === "clear") continue;
    const bounds = commandBounds(command);
    if (
      screen.x >= bounds.x && screen.x <= bounds.x + bounds.w &&
      screen.y >= bounds.y && screen.y <= bounds.y + bounds.h
    ) {
      return command.entity;
    }
  }
  return null;
}

/** Every entity under a screen point, topmost first. Used by the editor marquee tool. */
export function pickEntitiesAtPoint(drawList: DrawList, screen: Vec2): Entity[] {
  const hits: Entity[] = [];
  for (let i = drawList.commands.length - 1; i >= 0; i--) {
    const command = drawList.commands[i];
    if (command.kind === "clear") continue;
    const bounds = commandBounds(command);
    if (
      screen.x >= bounds.x && screen.x <= bounds.x + bounds.w &&
      screen.y >= bounds.y && screen.y <= bounds.y + bounds.h
    ) {
      if (!hits.includes(command.entity)) hits.push(command.entity);
    }
  }
  return hits;
}

/** World-space view rectangle for a draw list (convenience for callers that cull). */
export function drawListViewRect(drawList: DrawList): Rect {
  return visibleWorldRect(drawList.camera, drawList.viewport);
}
