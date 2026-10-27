import { assert, assertEquals, assertThrows } from "@std/assert";
import { vec3, vec3Cross, vec3Dot, vec3Normalize, vec3Sub } from "@ember/core";
import {
  CUBE_MESH,
  defineMesh,
  type Mesh,
  meshByName,
  meshNames,
  PYRAMID_MESH,
  QUAD_MESH,
  registerMesh,
  TRIANGLE_MESH,
  unregisterMesh,
} from "@ember/render3d";

/** Outward-facing triangles must have normals pointing away from the shape's centre. */
function outwardTriangles(mesh: Mesh, centre: { x: number; y: number; z: number }): number {
  let outward = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.positions[mesh.indices[i]];
    const b = mesh.positions[mesh.indices[i + 1]];
    const c = mesh.positions[mesh.indices[i + 2]];
    const normal = vec3Normalize(vec3Cross(vec3Sub(b, a), vec3Sub(c, a)));
    const centroid = {
      x: (a.x + b.x + c.x) / 3,
      y: (a.y + b.y + c.y) / 3,
      z: (a.z + b.z + c.z) / 3,
    };
    if (vec3Dot(normal, vec3Sub(centroid, centre)) > 0) outward++;
  }
  return outward;
}

Deno.test("cube is a closed 12-triangle unit box", () => {
  assertEquals(CUBE_MESH.positions.length, 8);
  assertEquals(CUBE_MESH.indices.length, 36);
  assertEquals(CUBE_MESH.indices.length / 3, 12);
  for (const position of CUBE_MESH.positions) {
    assertEquals(Math.max(Math.abs(position.x), Math.abs(position.y), Math.abs(position.z)), 0.5);
  }
});

Deno.test("every cube triangle winds outward", () => {
  assertEquals(outwardTriangles(CUBE_MESH, vec3(0, 0, 0)), 12);
});

Deno.test("quad is a two-triangle ground plane facing +Y", () => {
  assertEquals(QUAD_MESH.indices.length / 3, 2);
  const a = QUAD_MESH.positions[QUAD_MESH.indices[0]];
  const b = QUAD_MESH.positions[QUAD_MESH.indices[1]];
  const c = QUAD_MESH.positions[QUAD_MESH.indices[2]];
  const normal = vec3Normalize(vec3Cross(vec3Sub(b, a), vec3Sub(c, a)));
  assertEquals(normal, vec3(0, 1, 0));
});

Deno.test("pyramid has a base and four sides, all winding outward", () => {
  assertEquals(PYRAMID_MESH.indices.length / 3, 6);
  assertEquals(outwardTriangles(PYRAMID_MESH, vec3(0, 0.25, 0)), 6);
});

Deno.test("triangle primitive faces +Z", () => {
  assertEquals(TRIANGLE_MESH.indices.length / 3, 1);
  const a = TRIANGLE_MESH.positions[TRIANGLE_MESH.indices[0]];
  const b = TRIANGLE_MESH.positions[TRIANGLE_MESH.indices[1]];
  const c = TRIANGLE_MESH.positions[TRIANGLE_MESH.indices[2]];
  const normal = vec3Normalize(vec3Cross(vec3Sub(b, a), vec3Sub(c, a)));
  assertEquals(normal, vec3(0, 0, 1));
});

Deno.test("built-in meshes are registered by name", () => {
  for (const mesh of [CUBE_MESH, QUAD_MESH, PYRAMID_MESH, TRIANGLE_MESH]) {
    assertEquals(meshByName(mesh.name)?.name, mesh.name);
  }
  assertEquals(meshByName("does-not-exist"), undefined);
});

Deno.test("meshNames is sorted and contains the built-ins", () => {
  const names = meshNames();
  assertEquals([...names].sort(), names);
  for (const builtIn of ["cube", "quad", "pyramid", "triangle"]) {
    assert(names.includes(builtIn), `missing built-in mesh "${builtIn}"`);
  }
});

Deno.test("registerMesh copies the geometry and rejects duplicate names", () => {
  const mesh = defineMesh("test-registered", [
    vec3(0, 0, 0),
    vec3(1, 0, 0),
    vec3(0, 1, 0),
  ], [0, 1, 2]);
  const registered = registerMesh(mesh);
  assertEquals(registered.name, "test-registered");
  assert(meshByName("test-registered"));
  assertThrows(() => registerMesh(mesh), Error, "already registered");
  assertEquals(unregisterMesh("test-registered"), true);
  assertEquals(unregisterMesh("test-registered"), false);
});

Deno.test("defineMesh rejects malformed names, vertices and indices", () => {
  assertThrows(() => defineMesh("123bad", [vec3(0, 0, 0)], [0, 0, 0]), Error);
  assertThrows(() => defineMesh("empty", [], [0, 0, 0]), Error, "no vertices");
  assertThrows(() => defineMesh("no-indices", [vec3(0, 0, 0)], []), Error);
  assertThrows(() => defineMesh("not-triangles", [vec3(0, 0, 0)], [0, 0]), Error);
  assertThrows(() => defineMesh("out-of-range", [vec3(0, 0, 0)], [0, 1, 2]), Error);
  assertThrows(() => defineMesh("fractional", [vec3(0, 0, 0)], [0, 0, 0.5]), Error);
});
