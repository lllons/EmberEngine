/**
 * @ember/render2d/camera2d — world/screen transforms and the camera controller.
 *
 * Owner: this file owns the mapping between world space and screen space.
 * Both the renderer and editor picking go through it, so a click and a pixel always
 * agree on where something is.
 */

import {
  type Camera2DState,
  clamp,
  damp,
  type Rect,
  type Scene,
  type Size,
  type Vec2,
  vec2,
  worldTransform,
} from "@ember/core";

/** Converts a world point into screen (pixel) coordinates. */
export function worldToScreen(camera: Camera2DState, viewport: Size, world: Vec2): Vec2 {
  return {
    x: (world.x - camera.position.x) * camera.zoom + viewport.width / 2,
    y: (world.y - camera.position.y) * camera.zoom + viewport.height / 2,
  };
}

/** Converts a screen point back into world coordinates. */
export function screenToWorld(camera: Camera2DState, viewport: Size, screen: Vec2): Vec2 {
  return {
    x: (screen.x - viewport.width / 2) / camera.zoom + camera.position.x,
    y: (screen.y - viewport.height / 2) / camera.zoom + camera.position.y,
  };
}

/** World-space rectangle currently visible through the camera. */
export function visibleWorldRect(camera: Camera2DState, viewport: Size): Rect {
  const topLeft = screenToWorld(camera, viewport, vec2(0, 0));
  const bottomRight = screenToWorld(camera, viewport, vec2(viewport.width, viewport.height));
  return { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y };
}

/**
 * Keeps the camera centre inside `bounds` so the view never shows past the stage edge.
 * When the view is larger than the bounds, the bounds are centred instead.
 */
export function clampCameraToBounds(
  position: Vec2,
  bounds: Rect,
  viewport: Size,
  zoom: number,
): Vec2 {
  const viewW = viewport.width / zoom;
  const viewH = viewport.height / zoom;
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;
  const x = viewW >= bounds.w
    ? centerX
    : clamp(position.x, bounds.x + viewW / 2, bounds.x + bounds.w - viewW / 2);
  const y = viewH >= bounds.h
    ? centerY
    : clamp(position.y, bounds.y + viewH / 2, bounds.y + bounds.h - viewH / 2);
  return vec2(x, y);
}

/** Zooms about a screen-space anchor so the world point under the cursor stays put. */
export function zoomAtScreenPoint(
  camera: Camera2DState,
  viewport: Size,
  anchor: Vec2,
  factor: number,
  limits: { min: number; max: number } = { min: 0.25, max: 4 },
): Camera2DState {
  const before = screenToWorld(camera, viewport, anchor);
  const zoom = clamp(camera.zoom * factor, limits.min, limits.max);
  const after = screenToWorld({ ...camera, zoom }, viewport, anchor);
  return {
    ...camera,
    zoom,
    position: vec2(
      camera.position.x + (before.x - after.x),
      camera.position.y + (before.y - after.y),
    ),
  };
}

export interface CameraUpdateOptions {
  /** Extra world units kept visible around the follow target. */
  deadzone?: number;
  /** When false the camera ignores `camera.bounds`. */
  clampToBounds?: boolean;
}

/**
 * Runtime camera: owns the camera state for one running scene and drives follow/clamp.
 * The editor drives it too, so Play mode framing matches the exported game exactly.
 */
export class Camera2DController {
  constructor(public state: Camera2DState, public viewport: Size) {}

  setViewport(viewport: Size): void {
    this.viewport = { ...viewport };
  }

  worldToScreen(world: Vec2): Vec2 {
    return worldToScreen(this.state, this.viewport, world);
  }

  screenToWorld(screen: Vec2): Vec2 {
    return screenToWorld(this.state, this.viewport, screen);
  }

  visibleRect(): Rect {
    return visibleWorldRect(this.state, this.viewport);
  }

  /** Adds padding (in world units) around `visibleRect`. */
  visibleRectPadded(padding: number): Rect {
    const rect = this.visibleRect();
    return {
      x: rect.x - padding,
      y: rect.y - padding,
      w: rect.w + padding * 2,
      h: rect.h + padding * 2,
    };
  }

  /** Instantly moves the camera, then applies the bounds clamp. */
  snapTo(position: Vec2, clampToBounds = true): void {
    this.state.position = vec2(position.x, position.y);
    this.applyBounds(clampToBounds);
  }

  zoomBy(factor: number, anchor?: Vec2): void {
    const screenAnchor = anchor ?? vec2(this.viewport.width / 2, this.viewport.height / 2);
    this.state = zoomAtScreenPoint(this.state, this.viewport, screenAnchor, factor);
  }

  /** Follows `state.follow` (when set) with smoothing, then clamps to scene bounds. */
  update(scene: Scene, dt: number, options: CameraUpdateOptions = {}): void {
    const target = this.followTarget(scene);
    if (target) {
      const smoothing = Math.max(0, this.state.smoothing);
      this.state.position = vec2(
        smoothing > 0 ? damp(this.state.position.x, target.x, smoothing, dt) : target.x,
        smoothing > 0 ? damp(this.state.position.y, target.y, smoothing, dt) : target.y,
      );
    }
    this.applyBounds(options.clampToBounds ?? true);
  }

  /** World position the camera is chasing, or undefined for a free camera. */
  followTarget(scene: Scene): Vec2 | undefined {
    const follow = this.state.follow;
    if (follow === null || !scene.world.isAlive(follow)) return undefined;
    const transform = worldTransform(scene.world, follow);
    if (!transform) return undefined;
    return transform.position;
  }

  private applyBounds(clampToBounds: boolean): void {
    const bounds = this.state.bounds;
    if (!clampToBounds || !bounds) return;
    this.state.position = clampCameraToBounds(
      this.state.position,
      bounds,
      this.viewport,
      this.state.zoom,
    );
  }
}
