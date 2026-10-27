import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import {
  mat4FromEuler,
  mat4FromTransform3D,
  mat4Identity,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  mat4RotationX,
  mat4RotationY,
  mat4RotationZ,
  mat4Scaling,
  mat4TransformDirection,
  mat4TransformPoint,
  mat4TransformVec4,
  mat4Translation,
  vec3,
  vec3Add,
  vec3Cross,
  vec3Distance,
  vec3Dot,
  vec3Equals,
  vec3Length,
  vec3Lerp,
  vec3Negate,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
} from "@ember/core";

const CLOSE = 1e-9;

Deno.test("vec3 add, sub, scale and negate are componentwise", () => {
  assertEquals(vec3Add(vec3(1, 2, 3), vec3(4, -5, 6)), vec3(5, -3, 9));
  assertEquals(vec3Sub(vec3(1, 2, 3), vec3(4, -5, 6)), vec3(-3, 7, -3));
  assertEquals(vec3Scale(vec3(2, -3, 4), 3), vec3(6, -9, 12));
  assertEquals(vec3Negate(vec3(2, 0, -1)), vec3(-2, 0, 1));
});

Deno.test("vec3Dot and vec3Cross follow the right-hand rule", () => {
  assertEquals(vec3Dot(vec3(1, 2, 3), vec3(4, -5, 6)), 4 - 10 + 18);
  // x cross y = z in a right-handed basis.
  assertEquals(vec3Cross(vec3(1, 0, 0), vec3(0, 1, 0)), vec3(0, 0, 1));
  assertEquals(vec3Cross(vec3(0, 0, 1), vec3(1, 0, 0)), vec3(0, 1, 0));
  // Anti-commutative.
  assertEquals(vec3Cross(vec3(0, 1, 0), vec3(1, 0, 0)), vec3(0, 0, -1));
});

Deno.test("vec3Length, vec3Distance and vec3Normalize agree with Pythagoras", () => {
  assertAlmostEquals(vec3Length(vec3(3, 4, 12)), 13, CLOSE);
  assertAlmostEquals(vec3Distance(vec3(1, 1, 1), vec3(1, 1, 4)), 3, CLOSE);
  const unit = vec3Normalize(vec3(0, 3, 4));
  assertAlmostEquals(vec3Length(unit), 1, CLOSE);
  assertEquals(unit, vec3(0, 0.6, 0.8));
});

Deno.test("vec3Normalize returns zero for the zero vector instead of NaN", () => {
  assertEquals(vec3Normalize(vec3(0, 0, 0)), vec3(0, 0, 0));
  assert(Number.isFinite(vec3Normalize(vec3(0, 0, 0)).x));
});

Deno.test("vec3Lerp hits both endpoints and the midpoint", () => {
  assertEquals(vec3Lerp(vec3(0, 0, 0), vec3(10, 20, -30), 0), vec3(0, 0, 0));
  assertEquals(vec3Lerp(vec3(0, 0, 0), vec3(10, 20, -30), 1), vec3(10, 20, -30));
  assertEquals(vec3Lerp(vec3(0, 0, 0), vec3(10, 20, -30), 0.5), vec3(5, 10, -15));
});

Deno.test("vec3Equals honours its epsilon", () => {
  assert(vec3Equals(vec3(1, 1, 1), vec3(1 + 1e-12, 1, 1)));
  assert(!vec3Equals(vec3(1, 1, 1), vec3(1.1, 1, 1)));
});

Deno.test("mat4Identity leaves a matrix unchanged when multiplied", () => {
  const m = mat4FromTransform3D({
    position: vec3(1, 2, 3),
    rotation: vec3(0.3, -0.4, 0.5),
    scale: vec3(2, 3, 4),
  });
  assertEquals(mat4Multiply(m, mat4Identity()), m);
  assertEquals(mat4Multiply(mat4Identity(), m), m);
});

Deno.test("mat4 translation moves a point without rotating it", () => {
  const m = mat4Translation(vec3(10, -20, 30));
  assertEquals(mat4TransformPoint(m, vec3(1, 2, 3)), vec3(11, -18, 33));
});

Deno.test("mat4 scaling multiplies each axis independently", () => {
  assertEquals(mat4TransformPoint(mat4Scaling(vec3(2, 3, -1)), vec3(4, 5, 6)), vec3(8, 15, -6));
});

Deno.test("rotation about Z turns +X into +Y by 90 degrees", () => {
  const rotated = mat4TransformPoint(mat4RotationZ(Math.PI / 2), vec3(1, 0, 0));
  assertEquals(vec3Equals(rotated, vec3(0, 1, 0), 1e-12), true);
});

Deno.test("rotation about Y turns +X into -Z by 90 degrees (right handed)", () => {
  const rotated = mat4TransformPoint(mat4RotationY(Math.PI / 2), vec3(1, 0, 0));
  assertEquals(vec3Equals(rotated, vec3(0, 0, -1), 1e-12), true);
});

Deno.test("rotation about X turns +Y into +Z by 90 degrees", () => {
  const rotated = mat4TransformPoint(mat4RotationX(Math.PI / 2), vec3(0, 1, 0));
  assertEquals(vec3Equals(rotated, vec3(0, 0, 1), 1e-12), true);
});

Deno.test("mat4FromEuler applies X, then Y, then Z", () => {
  const rotation = vec3(0.4, -0.7, 1.1);
  const expected = mat4Multiply(
    mat4Multiply(mat4RotationZ(rotation.z), mat4RotationY(rotation.y)),
    mat4RotationX(rotation.x),
  );
  assertEquals(mat4FromEuler(rotation), expected);
});

Deno.test("mat4FromTransform3D applies scale, then rotation, then translation", () => {
  const m = mat4FromTransform3D({
    position: vec3(10, 0, 0),
    rotation: vec3(0, 0, Math.PI / 2),
    scale: vec3(2, 2, 2),
  });
  const result = mat4TransformPoint(m, vec3(1, 0, 0));
  assertEquals(vec3Equals(result, vec3(10, 2, 0), 1e-12), true);
});

Deno.test("mat4TransformDirection ignores translation", () => {
  const m = mat4Translation(vec3(100, 200, 300));
  assertEquals(mat4TransformDirection(m, vec3(1, 0, 0)), vec3(1, 0, 0));
});

Deno.test("mat4LookAt places the target on the -Z view axis", () => {
  const view = mat4LookAt(vec3(0, 0, 5), vec3(0, 0, 0), vec3(0, 1, 0));
  const target = mat4TransformPoint(view, vec3(0, 0, 0));
  assertEquals(vec3Equals(target, vec3(0, 0, -5), 1e-12), true);
  // A point one unit right of the target stays one unit right in view space.
  const right = mat4TransformPoint(view, vec3(1, 0, 0));
  assertEquals(vec3Equals(right, vec3(1, 0, -5), 1e-12), true);
});

Deno.test("mat4LookAt keeps an above-target point above the view axis", () => {
  const view = mat4LookAt(vec3(0, 0, 5), vec3(0, 0, 0), vec3(0, 1, 0));
  const above = mat4TransformPoint(view, vec3(0, 1, 0));
  assertEquals(vec3Equals(above, vec3(0, 1, -5), 1e-12), true);
});

Deno.test("mat4Perspective maps near and far planes to NDC z = -1 and +1", () => {
  const near = 1;
  const far = 101;
  const projection = mat4Perspective(Math.PI / 3, 1, near, far);
  const nearClip = mat4TransformVec4(projection, { x: 0, y: 0, z: -near, w: 1 });
  assertAlmostEquals(nearClip.z / nearClip.w, -1, 1e-9);
  const farClip = mat4TransformVec4(projection, { x: 0, y: 0, z: -far, w: 1 });
  assertAlmostEquals(farClip.z / farClip.w, 1, 1e-9);
});

Deno.test("mat4Perspective divides X by the aspect ratio", () => {
  const square = mat4Perspective(Math.PI / 3, 1, 0.1, 100);
  const wide = mat4Perspective(Math.PI / 3, 2, 0.1, 100);
  assertAlmostEquals(wide[0], square[0] / 2, 1e-12);
  // Clip-space w is the positive distance in front of the camera.
  const clip = mat4TransformVec4(square, { x: 0, y: 0, z: -7, w: 1 });
  assertAlmostEquals(clip.w, 7, 1e-12);
});

Deno.test("mat4Perspective keeps the vertical field of view independent of aspect", () => {
  const projection = mat4Perspective(Math.PI / 3, 16 / 9, 0.1, 100);
  // y scale = 1 / tan(fov / 2)
  assertAlmostEquals(projection[5], 1 / Math.tan(Math.PI / 6), 1e-12);
});
