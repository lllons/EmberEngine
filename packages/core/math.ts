/**
 * @ember/core/math — 2D math primitives.
 *
 * Owner: this file owns vector/rect/transform math for the whole engine.
 * Rules: pure functions, no mutation of inputs, angles in radians.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Axis-aligned rectangle. `x`/`y` is the top-left corner in world units. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Position/rotation/scale pair used by every renderable component. */
export interface Transform2D {
  position: Vec2;
  /** Radians, clockwise, matching canvas conventions. */
  rotation: number;
  scale: Vec2;
}

export const EPSILON = 1e-9;

// ---------------------------------------------------------------------------
// Vec2
// ---------------------------------------------------------------------------

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function vec2Clone(v: Vec2): Vec2 {
  return { x: v.x, y: v.y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function mul(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x * b.x, y: a.y * b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function negate(v: Vec2): Vec2 {
  return { x: -v.x, y: -v.y };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function lengthSq(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

export function length(v: Vec2): number {
  return Math.sqrt(lengthSq(v));
}

export function distanceSq(a: Vec2, b: Vec2): number {
  return lengthSq(sub(a, b));
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.sqrt(distanceSq(a, b));
}

/** Returns the zero vector when `v` has (near) zero length instead of NaN. */
export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len <= EPSILON) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function clamp(value: number, min: number, max: number): number {
  if (min > max) [min, max] = [max, min];
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function clampVec(v: Vec2, min: number, max: number): Vec2 {
  return { x: clamp(v.x, min, max), y: clamp(v.y, min, max) };
}

export function minVec(a: Vec2, b: Vec2): Vec2 {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
}

export function maxVec(a: Vec2, b: Vec2): Vec2 {
  return { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
}

export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function equals(a: Vec2, b: Vec2, epsilon = EPSILON): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

export function vec2FromAngle(radians: number, radius = 1): Vec2 {
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}

export function angleOf(v: Vec2): number {
  return Math.atan2(v.y, v.x);
}

/** Rotate `v` by `radians` around the origin. */
export function rotateVec(v: Vec2, radians: number): Vec2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/** Perpendicular vector (90 degrees counter-clockwise in math orientation). */
export function perpendicular(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

/** Freshest value, i.e. `0` when |v| <= deadzone. */
export function applyDeadzone(v: Vec2, deadzone: number): Vec2 {
  return length(v) <= deadzone ? { x: 0, y: 0 } : v;
}

/** Moves `current` toward `target` by at most `maxDelta`. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(radians: number): number {
  let angle = radians % (Math.PI * 2);
  if (angle <= -Math.PI) angle += Math.PI * 2;
  if (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach. */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  if (smoothing <= 0) return target;
  const factor = 1 - Math.exp(-dt / smoothing);
  return current + (target - current) * factor;
}

export function isFinite2(v: Vec2): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}

// ---------------------------------------------------------------------------
// Rect
// ---------------------------------------------------------------------------

export function rect(x = 0, y = 0, w = 0, h = 0): Rect {
  return { x, y, w, h };
}

export function rectFromCenter(center: Vec2, w: number, h: number): Rect {
  return { x: center.x - w / 2, y: center.y - h / 2, w, h };
}

export function rectFromCorners(a: Vec2, b: Vec2): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

export function rectMin(r: Rect): Vec2 {
  return { x: r.x, y: r.y };
}

export function rectMax(r: Rect): Vec2 {
  return { x: r.x + r.w, y: r.y + r.h };
}

export function rectCenter(r: Rect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function rectContainsPoint(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function rectIntersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Overlap rectangle, or `null` when the rects only touch. */
export function rectIntersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}

export function rectOverlapArea(a: Rect, b: Rect): number {
  const overlap = rectIntersection(a, b);
  return overlap ? overlap.w * overlap.h : 0;
}

export function rectInflate(r: Rect, amount: number): Rect {
  return { x: r.x - amount, y: r.y - amount, w: r.w + amount * 2, h: r.h + amount * 2 };
}

export function rectTranslate(r: Rect, offset: Vec2): Rect {
  return { x: r.x + offset.x, y: r.y + offset.y, w: r.w, h: r.h };
}

export function rectUnion(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

export function rectEquals(a: Rect, b: Rect, epsilon = EPSILON): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.w - b.w) <= epsilon &&
    Math.abs(a.h - b.h) <= epsilon
  );
}

// ---------------------------------------------------------------------------
// Transform2D
// ---------------------------------------------------------------------------

export function transform2d(
  position: Vec2 = { x: 0, y: 0 },
  rotation = 0,
  scale: Vec2 = { x: 1, y: 1 },
): Transform2D {
  return { position: { ...position }, rotation, scale: { ...scale } };
}

export function transform2dClone(t: Transform2D): Transform2D {
  return {
    position: { ...t.position },
    rotation: t.rotation,
    scale: { ...t.scale },
  };
}

/** Maps a point from the transform's local space into world space. */
export function transformPoint(t: Transform2D, local: Vec2): Vec2 {
  const scaled = { x: local.x * t.scale.x, y: local.y * t.scale.y };
  const rotated = rotateVec(scaled, t.rotation);
  return add(t.position, rotated);
}

/** World-space axis-aligned bounds of a local-space box around the transform. */
export function transformBounds(t: Transform2D, size: Size): Rect {
  const halfW = (size.width * Math.abs(t.scale.x)) / 2;
  const halfH = (size.height * Math.abs(t.scale.y)) / 2;
  if (t.rotation === 0) {
    return { x: t.position.x - halfW, y: t.position.y - halfH, w: halfW * 2, h: halfH * 2 };
  }
  const corners: Vec2[] = [
    transformPoint(t, { x: -size.width / 2, y: -size.height / 2 }),
    transformPoint(t, { x: size.width / 2, y: -size.height / 2 }),
    transformPoint(t, { x: size.width / 2, y: size.height / 2 }),
    transformPoint(t, { x: -size.width / 2, y: size.height / 2 }),
  ];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const corner of corners) {
    minX = Math.min(minX, corner.x);
    minY = Math.min(minY, corner.y);
    maxX = Math.max(maxX, corner.x);
    maxY = Math.max(maxY, corner.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
