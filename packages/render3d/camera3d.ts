/**
 * @ember/render3d/camera3d — the 3D world/screen mapping.
 *
 * Owner: this file owns "where does a 3D point land on screen". `render2d/camera2d.ts`
 * owns the 2D equivalent; nothing else projects 3D coordinates.
 *
 * Right-handed world (+Y up, +Z towards the viewer), canvas Y flipped so screen Y grows
 * downwards. Depth is positive distance in front of the camera, in world units.
 */

import {
  type Camera3DState,
  type Mat4,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  mat4TransformVec4,
  type Scene,
  type Size,
  type Vec2,
  type Vec3,
  vec3Sub,
} from "@ember/core";

export interface Camera3DMatrices {
  view: Mat4;
  projection: Mat4;
  /** `projection * view`: world space straight to clip space. */
  viewProjection: Mat4;
  aspect: number;
}

export interface ProjectedPoint {
  /** Screen position in pixels. */
  x: number;
  y: number;
  /** Distance in front of the camera, world units. */
  depth: number;
  /** False when behind the camera or outside the near/far range. */
  visible: boolean;
  /** Clip-space w before the perspective divide; <= 0 means behind the eye. */
  w: number;
}

export function camera3DMatrices(camera: Camera3DState, viewport: Size): Camera3DMatrices {
  const aspect = viewport.height === 0 ? 1 : viewport.width / viewport.height;
  const view = mat4LookAt(camera.position, camera.target, camera.up);
  const projection = mat4Perspective(camera.fov, aspect, camera.near, camera.far);
  return { view, projection, viewProjection: mat4Multiply(projection, view), aspect };
}

/** Projects a world point with matrices already computed for this frame. */
export function projectWithMatrices(
  matrices: Camera3DMatrices,
  camera: Camera3DState,
  viewport: Size,
  point: Vec3,
): ProjectedPoint {
  const clip = mat4TransformVec4(matrices.viewProjection, {
    x: point.x,
    y: point.y,
    z: point.z,
    w: 1,
  });
  const viewPoint = mat4TransformVec4(matrices.view, { x: point.x, y: point.y, z: point.z, w: 1 });
  const depth = -viewPoint.z;
  const behind = clip.w <= 1e-9;
  const visible = !behind && depth >= camera.near && depth <= camera.far;
  if (behind) {
    return { x: 0, y: 0, depth, visible: false, w: clip.w };
  }
  const ndcX = clip.x / clip.w;
  const ndcY = clip.y / clip.w;
  return {
    x: (ndcX * 0.5 + 0.5) * viewport.width,
    // Canvas Y grows downwards, NDC Y grows upwards.
    y: (1 - (ndcY * 0.5 + 0.5)) * viewport.height,
    depth,
    visible,
    w: clip.w,
  };
}

/** Convenience single-point projection (builds the matrices for you). */
export function projectPoint(
  camera: Camera3DState,
  viewport: Size,
  point: Vec3,
): ProjectedPoint {
  return projectWithMatrices(camera3DMatrices(camera, viewport), camera, viewport, point);
}

/** Screen position of a world point; behind-camera points return the screen centre. */
export function worldToScreen3D(camera: Camera3DState, viewport: Size, point: Vec3): Vec2 {
  const projected = projectPoint(camera, viewport, point);
  if (!projected.visible) {
    return { x: viewport.width / 2, y: viewport.height / 2 };
  }
  return { x: projected.x, y: projected.y };
}

/** Moves the camera to a point and keeps it looking at the same target. */
export function moveCamera3D(camera: Camera3DState, position: Vec3): Camera3DState {
  return { ...camera, position: { ...position } };
}

/** Orbits the camera around `target` by yaw/pitch radians at a fixed distance. */
export function orbitCamera3D(
  camera: Camera3DState,
  yaw: number,
  pitch: number,
  distance?: number,
): Camera3DState {
  const offset = vec3Sub(camera.position, camera.target);
  const radius = distance ?? Math.sqrt(offset.x ** 2 + offset.y ** 2 + offset.z ** 2);
  const horizontal = Math.cos(pitch) * radius;
  return {
    ...camera,
    position: {
      x: camera.target.x + Math.sin(yaw) * horizontal,
      y: camera.target.y + Math.sin(pitch) * radius,
      z: camera.target.z + Math.cos(yaw) * horizontal,
    },
  };
}

/** The scene's 3D camera, for callers that only have a scene. */
export function sceneCamera3D(scene: Scene): Camera3DState {
  return scene.resources.camera3d;
}
