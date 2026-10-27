/**
 * @ember/render3d/build3d — 3D meshes to draw commands.
 *
 * Owner: this file owns "what does a 3D frame look like". Like `render2d/build.ts` it is
 * pure and headless: scene + camera in, screen-space triangle commands out.
 *
 * Pipeline per triangle:
 * 1. model matrix (own `Transform3D` folded with 3D ancestors)
 * 2. world-space face normal, backface cull against the eye
 * 3. flat Lambert shading against one directional light
 * 4. perspective projection; triangles with any vertex outside near/far are dropped whole
 * 5. painter's sort, farthest first
 *
 * Depth is the average view-space depth of the three vertices. Painter's algorithm is
 * approximate for intersecting geometry, which is the accepted trade for zero dependencies
 * and a backend that works everywhere (including headless tests).
 */

import {
  type Camera3DState,
  clamp01,
  type Color,
  isVisibleInHierarchy,
  mat4TransformPoint,
  MeshRenderer,
  parseColor,
  rgba,
  type Scene,
  type Size,
  Transform3D,
  type Vec3,
  vec3Cross,
  vec3Dot,
  vec3Negate,
  vec3Normalize,
  vec3Sub,
  worldTransform3D,
} from "@ember/core";
import type { TriangleCommand } from "@ember/render2d";
import { camera3DMatrices, projectWithMatrices } from "./camera3d.ts";
import { meshByName } from "./mesh.ts";

/** Direction *towards* the light: upper front-left, so the default cube reads as solid. */
export const DEFAULT_LIGHT_DIRECTION: Vec3 = vec3Normalize({ x: -0.35, y: 0.85, z: 0.4 });

export interface Build3DOptions {
  /** Defaults to the scene's configured viewport. */
  viewport?: Size;
  /** Defaults to the scene's `camera3d` resource. */
  camera?: Camera3DState;
  /** Direction towards the light. Normalised internally. */
  lightDirection?: Vec3;
  /** Remove faces pointing away from the camera (default true). */
  cullBackfaces?: boolean;
  /** Force wireframe on or off for every mesh; defaults to each renderer's setting. */
  wireframe?: boolean;
  /** Ambient light floor in [0, 1]; default 0.35. */
  ambient?: number;
}

export interface Build3DStats {
  /** Entities with a `Transform3D` + `MeshRenderer` visited. */
  considered: number;
  /** Triangles emitted. */
  drawn: number;
  /** Triangles removed as backfaces. */
  culled: number;
  /** Triangles dropped because a vertex was outside the near/far range. */
  clipped: number;
  /** Entities skipped because `MeshRenderer.mesh` is not registered. */
  missingMeshes: number;
}

export interface Build3DResult {
  commands: TriangleCommand[];
  stats: Build3DStats;
  camera: Camera3DState;
  viewport: Size;
}

/** Brightness multiplier applied to a base colour; `1` is unchanged, `0` is black. */
export function shadeColor(color: Color, brightness: number): Color {
  const parsed = parseColor(color);
  if (!parsed) return color;
  const k = clamp01(brightness);
  return rgba(parsed.r * k, parsed.g * k, parsed.b * k, parsed.a);
}

/** Projects every visible mesh in the scene into painter-sorted triangle commands. */
export function build3DCommands(scene: Scene, options: Build3DOptions = {}): Build3DResult {
  const viewport = options.viewport ?? scene.resources.viewport;
  const camera = options.camera ?? scene.resources.camera3d;
  const matrices = camera3DMatrices(camera, viewport);
  const cullBackfaces = options.cullBackfaces ?? true;
  const ambient = clamp01(options.ambient ?? 0.35);
  const light = vec3Normalize(options.lightDirection ?? DEFAULT_LIGHT_DIRECTION);

  const commands: TriangleCommand[] = [];
  const stats: Build3DStats = {
    considered: 0,
    drawn: 0,
    culled: 0,
    clipped: 0,
    missingMeshes: 0,
  };

  for (const entity of scene.world.query(Transform3D, MeshRenderer)) {
    stats.considered++;
    if (!isVisibleInHierarchy(scene.world, entity)) continue;
    const renderer = scene.world.require(entity, MeshRenderer);
    if (renderer.alpha <= 0) continue;
    const mesh = meshByName(renderer.mesh);
    if (!mesh) {
      stats.missingMeshes++;
      continue;
    }
    const model = worldTransform3D(scene.world, entity);
    if (!model) continue;
    const filled = !(options.wireframe ?? renderer.wireframe);

    for (let i = 0; i < mesh.indices.length; i += 3) {
      const localA = mesh.positions[mesh.indices[i]];
      const localB = mesh.positions[mesh.indices[i + 1]];
      const localC = mesh.positions[mesh.indices[i + 2]];
      const a = mat4TransformPoint(model, localA);
      const b = mat4TransformPoint(model, localB);
      const c = mat4TransformPoint(model, localC);

      let normal = vec3Normalize(vec3Cross(vec3Sub(b, a), vec3Sub(c, a)));
      const centroid = {
        x: (a.x + b.x + c.x) / 3,
        y: (a.y + b.y + c.y) / 3,
        z: (a.z + b.z + c.z) / 3,
      };
      const toEye = vec3Sub(camera.position, centroid);
      if (vec3Dot(normal, toEye) <= 1e-9) {
        if (cullBackfaces && !renderer.doubleSided) {
          stats.culled++;
          continue;
        }
        // Seen from behind: flip the normal so lighting still makes sense.
        normal = vec3Negate(normal);
      }

      const pa = projectWithMatrices(matrices, camera, viewport, a);
      const pb = projectWithMatrices(matrices, camera, viewport, b);
      const pc = projectWithMatrices(matrices, camera, viewport, c);
      if (!pa.visible || !pb.visible || !pc.visible) {
        stats.clipped++;
        continue;
      }

      const brightness = ambient + (1 - ambient) * Math.max(0, vec3Dot(normal, light));
      commands.push({
        kind: "triangle",
        ax: pa.x,
        ay: pa.y,
        bx: pb.x,
        by: pb.y,
        cx: pc.x,
        cy: pc.y,
        color: shadeColor(renderer.color, brightness),
        alpha: clamp01(renderer.alpha),
        filled,
        strokeWidth: 1,
        depth: (pa.depth + pb.depth + pc.depth) / 3,
        entity,
        layer: renderer.layer,
      });
      stats.drawn++;
    }
  }

  commands.sort((first, second) => second.depth - first.depth || first.entity - second.entity);
  return { commands, stats, camera, viewport };
}
