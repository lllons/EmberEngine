import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { type Camera3DState, mat4Multiply, Scene, vec3 } from "@ember/core";
import {
  camera3DMatrices,
  moveCamera3D,
  orbitCamera3D,
  projectPoint,
  sceneCamera3D,
  worldToScreen3D,
} from "@ember/render3d";

const VIEWPORT = { width: 800, height: 600 };

function testCamera(overrides: Partial<Camera3DState> = {}): Camera3DState {
  return {
    position: vec3(0, 0, 10),
    target: vec3(0, 0, 0),
    up: vec3(0, 1, 0),
    fov: Math.PI / 3,
    near: 0.1,
    far: 100,
    ...overrides,
  };
}

Deno.test("camera3DMatrices derives aspect and viewProjection from the viewport", () => {
  const matrices = camera3DMatrices(testCamera(), { width: 1920, height: 540 });
  assertAlmostEquals(matrices.aspect, 1920 / 540, 1e-12);
  assertEquals(matrices.viewProjection, mat4Multiply(matrices.projection, matrices.view));
});

Deno.test("camera3DMatrices guards a zero-height viewport", () => {
  const matrices = camera3DMatrices(testCamera(), { width: 800, height: 0 });
  assertEquals(matrices.aspect, 1);
});

Deno.test("the camera target projects to the centre of the screen", () => {
  const projected = projectPoint(testCamera(), VIEWPORT, vec3(0, 0, 0));
  assertEquals(projected.visible, true);
  assertAlmostEquals(projected.x, VIEWPORT.width / 2, 1e-9);
  assertAlmostEquals(projected.y, VIEWPORT.height / 2, 1e-9);
  assertAlmostEquals(projected.depth, 10, 1e-9);
});

Deno.test("the projection reports eye distance as depth", () => {
  const projected = projectPoint(testCamera(), VIEWPORT, vec3(0, 0, 4));
  assertAlmostEquals(projected.depth, 6, 1e-9);
});

Deno.test("+Y in world space maps above the screen centre", () => {
  const projected = projectPoint(testCamera(), VIEWPORT, vec3(0, 2, 0));
  assert(projected.y < VIEWPORT.height / 2, "world up must be screen up");
});

Deno.test("+X in world space maps right of the screen centre", () => {
  const projected = projectPoint(testCamera(), VIEWPORT, vec3(2, 0, 0));
  assert(projected.x > VIEWPORT.width / 2, "world +X must be screen right");
});

Deno.test("left and right are mirrored about the centre", () => {
  const left = projectPoint(testCamera(), VIEWPORT, vec3(-2, 0, 0));
  const right = projectPoint(testCamera(), VIEWPORT, vec3(2, 0, 0));
  assertAlmostEquals(VIEWPORT.width / 2 - left.x, right.x - VIEWPORT.width / 2, 1e-9);
});

Deno.test("a point behind the camera is not visible and stays finite", () => {
  const projected = projectPoint(testCamera(), VIEWPORT, vec3(0, 0, 11));
  assertEquals(projected.visible, false);
  assert(Number.isFinite(projected.x) && Number.isFinite(projected.y));
  assert(projected.depth < 0);
});

Deno.test("a point closer than the near plane is not visible", () => {
  const projected = projectPoint(testCamera({ near: 1 }), VIEWPORT, vec3(0, 0, 9.5));
  assertEquals(projected.visible, false);
  assertAlmostEquals(projected.depth, 0.5, 1e-9);
});

Deno.test("the near plane itself is visible", () => {
  const projected = projectPoint(testCamera({ near: 1 }), VIEWPORT, vec3(0, 0, 9));
  assertEquals(projected.visible, true);
});

Deno.test("a point beyond the far plane is not visible", () => {
  const projected = projectPoint(testCamera({ far: 20 }), VIEWPORT, vec3(0, 0, -11));
  assertAlmostEquals(projected.depth, 21, 1e-9);
  assertEquals(projected.visible, false);
});

Deno.test("worldToScreen3D keeps visible points and centres invisible ones", () => {
  const camera = testCamera();
  assertEquals(worldToScreen3D(camera, VIEWPORT, vec3(0, 0, 0)), {
    x: VIEWPORT.width / 2,
    y: VIEWPORT.height / 2,
  });
  assertEquals(worldToScreen3D(camera, VIEWPORT, vec3(0, 0, 50)), {
    x: VIEWPORT.width / 2,
    y: VIEWPORT.height / 2,
  });
});

Deno.test("moveCamera3D changes the eye and keeps the target", () => {
  const moved = moveCamera3D(testCamera(), vec3(5, 6, 7));
  assertEquals(moved.position, vec3(5, 6, 7));
  assertEquals(moved.target, vec3(0, 0, 0));
  assertEquals(moved.fov, Math.PI / 3);
});

Deno.test("orbitCamera3D preserves distance to the target", () => {
  const orbited = orbitCamera3D(testCamera(), Math.PI / 2, 0);
  assertEquals(orbited.position.x > 9.999, true);
  assertAlmostEquals(orbited.position.z, 0, 1e-9);
  const dx = orbited.position.x - orbited.target.x;
  const dy = orbited.position.y - orbited.target.y;
  const dz = orbited.position.z - orbited.target.z;
  assertAlmostEquals(Math.sqrt(dx * dx + dy * dy + dz * dz), 10, 1e-9);
});

Deno.test("sceneCamera3D reads the scene resource", () => {
  const scene = new Scene({ camera3d: { position: vec3(1, 2, 3) } });
  assertEquals(sceneCamera3D(scene).position, vec3(1, 2, 3));
  // Unspecified fields fall back to the defaults.
  assertEquals(sceneCamera3D(scene).target, vec3(0, 0, 0));
  assertEquals(sceneCamera3D(scene).up, vec3(0, 1, 0));
});
