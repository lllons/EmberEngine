/**
 * @ember/render3d/compose — one frame containing 2D and 3D.
 *
 * Owner: this file owns cross-pipeline draw order. It is the entry point players and the
 * editor should call: `buildFrame(scene)` returns every command needed for one frame,
 * whether the scene is 2D, 3D or both.
 *
 * Ordering rule (the only cross-pipeline control): commands sort by `layer`, then 2D
 * before 3D at the same layer, then 3D far-to-near, then entity id. Put a 2D HUD on a
 * higher layer than the meshes; keep 2D and 3D gameplay art in separate layers when their
 * relative order matters.
 */

import type { Camera2DState, Camera3DState, Scene, Size, Vec3 } from "@ember/core";
import { buildDrawList, type BuildStats, type DrawCommand } from "@ember/render2d";
import { build3DCommands, type Build3DStats } from "./build3d.ts";

export interface FrameOptions {
  viewport?: Size;
  camera2d?: Camera2DState;
  camera3d?: Camera3DState;
  /** 2D off-screen culling (default true; the editor turns it off). */
  cull2d?: boolean;
  /** Emit the background `clear` command (default true). */
  background?: boolean;
  /** 2D collider overlay (editor). */
  debugColliders?: boolean;
  lightDirection?: Vec3;
  cullBackfaces?: boolean;
  wireframe?: boolean;
  ambient?: number;
}

export interface Frame {
  commands: DrawCommand[];
  stats: { twoD: BuildStats; threeD: Build3DStats };
  camera2d: Camera2DState;
  camera3d: Camera3DState;
  viewport: Size;
}

/**
 * Stable total order for a mixed frame. `clear` always comes first; everything else is
 * ordered by layer, pipeline, depth and entity.
 */
export function compareMixedCommands(a: DrawCommand, b: DrawCommand): number {
  const layerA = a.kind === "clear" ? -Infinity : a.layer;
  const layerB = b.kind === "clear" ? -Infinity : b.layer;
  if (layerA !== layerB) return layerA - layerB;
  if (a.kind === "clear" || b.kind === "clear") return 0;
  const rankA = a.kind === "triangle" ? 1 : 0;
  const rankB = b.kind === "triangle" ? 1 : 0;
  if (rankA !== rankB) return rankA - rankB;
  if (a.kind === "triangle" && b.kind === "triangle" && a.depth !== b.depth) {
    return b.depth - a.depth;
  }
  return a.entity - b.entity;
}

/** Builds the complete 2D + 3D command list for one frame. */
export function buildFrame(scene: Scene, options: FrameOptions = {}): Frame {
  const viewport = options.viewport ?? scene.resources.viewport;
  const twoD = buildDrawList(scene, {
    viewport,
    camera: options.camera2d,
    cull: options.cull2d,
    background: false,
    debugColliders: options.debugColliders,
  });
  const threeD = build3DCommands(scene, {
    viewport,
    camera: options.camera3d,
    lightDirection: options.lightDirection,
    cullBackfaces: options.cullBackfaces,
    wireframe: options.wireframe,
    ambient: options.ambient,
  });

  const commands: DrawCommand[] = [];
  if (options.background ?? true) {
    commands.push({ kind: "clear", color: scene.resources.background });
  }
  commands.push(...twoD.commands, ...threeD.commands);
  commands.sort(compareMixedCommands);

  return {
    commands,
    stats: { twoD: twoD.stats, threeD: threeD.stats },
    camera2d: twoD.camera,
    camera3d: threeD.camera,
    viewport,
  };
}
