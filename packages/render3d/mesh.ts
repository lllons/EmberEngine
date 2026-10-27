/**
 * @ember/render3d/mesh — the mesh registry and built-in primitives.
 *
 * Owner: this file owns "what geometry exists". Meshes are plain object-space vertex and
 * index arrays; the renderer never mutates them.
 *
 * Conventions:
 * - Unit sized, centred on the origin, so `Transform3D.scale` is the world size.
 * - +Y is up and +Z faces the default camera.
 * - Triangles are counter-clockwise when seen from outside, which is what backface
 *   culling in `build3d.ts` relies on.
 */

import type { Vec3 } from "@ember/core";

export interface Mesh {
  /** Unique key referenced by `MeshRenderer.mesh`. */
  name: string;
  /** Object-space vertices. */
  positions: Vec3[];
  /** Triangle indices, three per triangle, counter-clockwise from outside. */
  indices: number[];
}

/** Validates the arrays and returns a mesh; throws when the geometry is malformed. */
export function defineMesh(name: string, positions: Vec3[], indices: number[]): Mesh {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
    throw new Error(`mesh name must be alphanumeric, got "${name}"`);
  }
  if (positions.length === 0) throw new Error(`mesh "${name}" has no vertices`);
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new Error(`mesh "${name}" indices must be a non-empty multiple of 3`);
  }
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= positions.length) {
      throw new Error(`mesh "${name}" references missing vertex ${index}`);
    }
  }
  return { name, positions: positions.map((p) => ({ ...p })), indices: [...indices] };
}

/** A 1x1x1 cube. */
export const CUBE_MESH: Mesh = defineMesh("cube", [
  { x: -0.5, y: -0.5, z: -0.5 },
  { x: 0.5, y: -0.5, z: -0.5 },
  { x: 0.5, y: 0.5, z: -0.5 },
  { x: -0.5, y: 0.5, z: -0.5 },
  { x: -0.5, y: -0.5, z: 0.5 },
  { x: 0.5, y: -0.5, z: 0.5 },
  { x: 0.5, y: 0.5, z: 0.5 },
  { x: -0.5, y: 0.5, z: 0.5 },
], [
  // front (+Z)
  4,
  5,
  6,
  4,
  6,
  7,
  // back (-Z)
  0,
  3,
  2,
  0,
  2,
  1,
  // right (+X)
  1,
  2,
  6,
  1,
  6,
  5,
  // left (-X)
  0,
  4,
  7,
  0,
  7,
  3,
  // top (+Y)
  3,
  7,
  6,
  3,
  6,
  2,
  // bottom (-Y)
  0,
  1,
  5,
  0,
  5,
  4,
]);

/** A 1x1 quad in the XZ plane, facing up; the usual ground tile. */
export const QUAD_MESH: Mesh = defineMesh("quad", [
  { x: -0.5, y: 0, z: -0.5 },
  { x: 0.5, y: 0, z: -0.5 },
  { x: 0.5, y: 0, z: 0.5 },
  { x: -0.5, y: 0, z: 0.5 },
], [
  0,
  2,
  1,
  0,
  3,
  2,
]);

/** A 1x1 pyramid: square base at y = 0, apex at y = 1. */
export const PYRAMID_MESH: Mesh = defineMesh("pyramid", [
  { x: -0.5, y: 0, z: -0.5 },
  { x: 0.5, y: 0, z: -0.5 },
  { x: 0.5, y: 0, z: 0.5 },
  { x: -0.5, y: 0, z: 0.5 },
  { x: 0, y: 1, z: 0 },
], [
  // base (-Y)
  0,
  1,
  2,
  0,
  2,
  3,
  // sides
  3,
  2,
  4,
  2,
  1,
  4,
  1,
  0,
  4,
  0,
  3,
  4,
]);

/** A single 1x1 triangle in the XY plane, facing +Z. */
export const TRIANGLE_MESH: Mesh = defineMesh("triangle", [
  { x: -0.5, y: -0.5, z: 0 },
  { x: 0.5, y: -0.5, z: 0 },
  { x: 0, y: 0.5, z: 0 },
], [
  0,
  1,
  2,
]);

const registry = new Map<string, Mesh>([
  [CUBE_MESH.name, CUBE_MESH],
  [QUAD_MESH.name, QUAD_MESH],
  [PYRAMID_MESH.name, PYRAMID_MESH],
  [TRIANGLE_MESH.name, TRIANGLE_MESH],
]);

/** Registers a mesh so scenes can reference it by name. Throws on a duplicate name. */
export function registerMesh(mesh: Mesh): Mesh {
  if (registry.has(mesh.name)) {
    throw new Error(`mesh "${mesh.name}" is already registered`);
  }
  const validated = defineMesh(mesh.name, mesh.positions, mesh.indices);
  registry.set(validated.name, validated);
  return validated;
}

export function meshByName(name: string): Mesh | undefined {
  return registry.get(name);
}

/** Registered mesh names, sorted, so listings and tests are deterministic. */
export function meshNames(): string[] {
  return [...registry.keys()].sort();
}

/** Removes a registered mesh; built-ins can be replaced after removal. */
export function unregisterMesh(name: string): boolean {
  return registry.delete(name);
}
