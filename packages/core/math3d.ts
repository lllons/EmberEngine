/**
 * @ember/core/math3d — 3D math primitives.
 *
 * Owner: this file owns vector/matrix math for the 3D pipeline (and for any gameplay code
 * that needs it). `math.ts` stays the owner of 2D math.
 *
 * Conventions, fixed here so the renderer, gameplay and tests all agree:
 * - Right-handed world: +X right, +Y up, +Z towards the viewer.
 * - Matrices are column-major `number[16]`, like WebGL, so index `col * 4 + row`.
 * - `camera` matrices view the world looking down -Z; screen Y is flipped by the renderer
 *   because canvas Y grows downwards.
 * - Euler rotation is applied X first, then Y, then Z (`Rz * Ry * Rx`), in radians.
 *
 * Pure functions, no input mutation.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type Mat4 = number[];

/** Position/rotation(Euler)/scale triple for 3D entities. */
export interface Transform3DState {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

const EPSILON_3D = 1e-9;

// ---------------------------------------------------------------------------
// Vec3
// ---------------------------------------------------------------------------

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function vec3Clone(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vec3Negate(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z };
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vec3LengthSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function vec3Length(v: Vec3): number {
  return Math.sqrt(vec3LengthSq(v));
}

export function vec3Distance(a: Vec3, b: Vec3): number {
  return vec3Length(vec3Sub(a, b));
}

/** Returns the zero vector when `v` has (near) zero length instead of NaN. */
export function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len <= EPSILON_3D) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function vec3Equals(a: Vec3, b: Vec3, epsilon = EPSILON_3D): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.z - b.z) <= epsilon
  );
}

export function isFinite3(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

// ---------------------------------------------------------------------------
// Mat4
// ---------------------------------------------------------------------------

export function mat4Identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function mat4Clone(m: Mat4): Mat4 {
  return [...m];
}

/** Returns `a * b` (apply `b` first, then `a`). */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out: Mat4 = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] = a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

export function mat4Translation(v: Vec3): Mat4 {
  const m = mat4Identity();
  m[12] = v.x;
  m[13] = v.y;
  m[14] = v.z;
  return m;
}

export function mat4Scaling(v: Vec3): Mat4 {
  const m = mat4Identity();
  m[0] = v.x;
  m[5] = v.y;
  m[10] = v.z;
  return m;
}

export function mat4RotationX(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = mat4Identity();
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

export function mat4RotationY(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = mat4Identity();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

export function mat4RotationZ(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = mat4Identity();
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

/** Euler rotation applied X, then Y, then Z: `Rz * Ry * Rx`. */
export function mat4FromEuler(rotation: Vec3): Mat4 {
  const rz = mat4RotationZ(rotation.z);
  const ry = mat4RotationY(rotation.y);
  const rx = mat4RotationX(rotation.x);
  return mat4Multiply(mat4Multiply(rz, ry), rx);
}

/** `Translation * Rotation * Scale` for a 3D transform. */
export function mat4FromTransform3D(transform: Transform3DState): Mat4 {
  const rotation = mat4FromEuler(transform.rotation);
  const scaled = mat4Multiply(rotation, mat4Scaling(transform.scale));
  return mat4Multiply(mat4Translation(transform.position), scaled);
}

/** Transforms a point (w = 1) and divides by w. */
export function mat4TransformPoint(m: Mat4, p: Vec3): Vec3 {
  const clip = mat4TransformVec4(m, { x: p.x, y: p.y, z: p.z, w: 1 });
  if (clip.w === 0 || clip.w === 1) return { x: clip.x, y: clip.y, z: clip.z };
  return { x: clip.x / clip.w, y: clip.y / clip.w, z: clip.z / clip.w };
}

/** Transforms a direction (w = 0); ignores translation. */
export function mat4TransformDirection(m: Mat4, v: Vec3): Vec3 {
  const transformed = mat4TransformVec4(m, { x: v.x, y: v.y, z: v.z, w: 0 });
  return { x: transformed.x, y: transformed.y, z: transformed.z };
}

export function mat4TransformVec4(m: Mat4, v: Vec4): Vec4 {
  return {
    x: m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12] * v.w,
    y: m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13] * v.w,
    z: m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14] * v.w,
    w: m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15] * v.w,
  };
}

/**
 * Right-handed look-at view matrix. The camera sits at `eye`, looks at `target`, and
 * views space down -Z. `up` must not be parallel to the view direction.
 */
export function mat4LookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = vec3Normalize(vec3Sub(eye, target));
  const x = vec3Normalize(vec3Cross(up, z));
  const y = vec3Cross(z, x);
  return [
    x.x,
    y.x,
    z.x,
    0,
    x.y,
    y.y,
    z.y,
    0,
    x.z,
    y.z,
    z.z,
    0,
    -vec3Dot(x, eye),
    -vec3Dot(y, eye),
    -vec3Dot(z, eye),
    1,
  ];
}

/** Standard perspective projection; `fovY` is the vertical field of view in radians. */
export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const m: Mat4 = new Array(16).fill(0);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}
