/** Vector math: every case checks a hand-computed value or a structural invariant. */

import {
  add,
  angleOf,
  applyDeadzone,
  clamp,
  clamp01,
  clampVec,
  cross,
  distance,
  distanceSq,
  dot,
  equals,
  isFinite2,
  length,
  lengthSq,
  lerp,
  lerpAngle,
  lerpVec,
  maxVec,
  midpoint,
  minVec,
  moveTowards,
  mul,
  negate,
  normalize,
  perpendicular,
  rotateVec,
  scale,
  smoothstep,
  sub,
  toDegrees,
  toRadians,
  vec2,
  vec2Clone,
  vec2FromAngle,
  wrapAngle,
  damp,
} from "@ember/core";
import { assert, assertEqual, near, table, vecNear } from "../../harness.ts";

const PI = Math.PI;

interface BinaryRow {
  label: string;
  op: "add" | "sub" | "mul" | "scale" | "negate";
  a: { x: number; y: number };
  b: { x: number; y: number };
  s: number;
  expected: { x: number; y: number };
}

const zero = { x: 0, y: 0 };

const BINARY_ROWS: BinaryRow[] = [
  { label: "add", op: "add", a: vec2(1, 2), b: vec2(3, 4), s: 1, expected: vec2(4, 6) },
  { label: "add negatives", op: "add", a: vec2(-1, -2), b: vec2(-3, -4), s: 1, expected: vec2(-4, -6) },
  { label: "add identity", op: "add", a: vec2(7, -3), b: zero, s: 1, expected: vec2(7, -3) },
  { label: "sub", op: "sub", a: vec2(5, 5), b: vec2(2, 8), s: 1, expected: vec2(3, -3) },
  { label: "sub to zero", op: "sub", a: vec2(3, 4), b: vec2(3, 4), s: 1, expected: vec2(0, 0) },
  { label: "mul componentwise", op: "mul", a: vec2(2, 3), b: vec2(4, -5), s: 1, expected: vec2(8, -15) },
  { label: "mul by zero", op: "mul", a: vec2(2, 3), b: zero, s: 1, expected: vec2(0, 0) },
  { label: "scale up", op: "scale", a: vec2(1, -2), b: zero, s: 3, expected: vec2(3, -6) },
  { label: "scale by fraction", op: "scale", a: vec2(4, 8), b: zero, s: 0.25, expected: vec2(1, 2) },
  { label: "scale by negative", op: "scale", a: vec2(2, -2), b: zero, s: -1, expected: vec2(-2, 2) },
  { label: "negate", op: "negate", a: vec2(2, -5), b: zero, s: 1, expected: vec2(-2, 5) },
  { label: "negate zero", op: "negate", a: zero, b: zero, s: 1, expected: vec2(0, 0) },
];

table("math/vectors add·sub·mul·scale·negate", BINARY_ROWS, (row) => {
  const actual = row.op === "add"
    ? add(row.a, row.b)
    : row.op === "sub"
    ? sub(row.a, row.b)
    : row.op === "mul"
    ? mul(row.a, row.b)
    : row.op === "scale"
    ? scale(row.a, row.s)
    : negate(row.a);
  vecNear(actual, row.expected);
});

table("math/vectors dot·cross", [
  { label: "dot orthogonal", a: vec2(1, 0), b: vec2(0, 1), value: 0 },
  { label: "dot parallel", a: vec2(3, 4), b: vec2(3, 4), value: 25 },
  { label: "dot signed", a: vec2(1, 2), b: vec2(3, 4), value: 11 },
  { label: "dot negative", a: vec2(-1, 2), b: vec2(3, -4), value: -11 },
  { label: "dot with zero", a: vec2(9, 9), b: vec2(0, 0), value: 0 },
  { label: "cross unit x y", a: vec2(1, 0), b: vec2(0, 1), value: 1 },
  { label: "cross unit y x", a: vec2(0, 1), b: vec2(1, 0), value: -1 },
  { label: "cross parallel", a: vec2(2, 4), b: vec2(1, 2), value: 0 },
  { label: "cross signed", a: vec2(2, 3), b: vec2(5, 7), value: -1 },
  { label: "cross of zeros", a: vec2(0, 0), b: vec2(4, 5), value: 0 },
] as const, (row) => {
  near(row.label.startsWith("dot") ? dot(row.a, row.b) : cross(row.a, row.b), row.value, 1e-12);
});

interface MetricRow {
  label: string;
  op: "length" | "lengthSq" | "distance" | "distanceSq";
  a: { x: number; y: number };
  b: { x: number; y: number };
  value: number;
}

const METRIC_ROWS: MetricRow[] = [
  { label: "length 3-4-5", op: "length", a: vec2(3, 4), b: zero, value: 5 },
  { label: "length zero", op: "length", a: zero, b: zero, value: 0 },
  { label: "length negative", op: "length", a: vec2(-3, -4), b: zero, value: 5 },
  { label: "length unit", op: "length", a: vec2(0, 1), b: zero, value: 1 },
  { label: "length sqrt2 diagonal", op: "length", a: vec2(1, 1), b: zero, value: Math.SQRT2 },
  { label: "lengthSq 3-4-5", op: "lengthSq", a: vec2(3, 4), b: zero, value: 25 },
  { label: "lengthSq avoids sqrt", op: "lengthSq", a: vec2(7, 0), b: zero, value: 49 },
  { label: "distance horizontal", op: "distance", a: vec2(1, 2), b: vec2(5, 2), value: 4 },
  { label: "distance vertical", op: "distance", a: vec2(1, 2), b: vec2(1, -3), value: 5 },
  { label: "distance diagonal", op: "distance", a: vec2(1, 2), b: vec2(4, 6), value: 5 },
  { label: "distance identical", op: "distance", a: vec2(9, 9), b: vec2(9, 9), value: 0 },
  { label: "distanceSq diagonal", op: "distanceSq", a: vec2(1, 2), b: vec2(4, 6), value: 25 },
];

table("math/vectors length·distance", METRIC_ROWS, (row) => {
  const actual = row.op === "length"
    ? length(row.a)
    : row.op === "lengthSq"
    ? lengthSq(row.a)
    : row.op === "distance"
    ? distance(row.a, row.b)
    : distanceSq(row.a, row.b);
  near(actual, row.value, 1e-12);
});

table("math/vectors normalize", [
  { label: "x axis stays unit", v: vec2(1, 0), expected: vec2(1, 0) },
  { label: "y axis stays unit", v: vec2(0, 1), expected: vec2(0, 1) },
  { label: "scales 3-4-5", v: vec2(3, 4), expected: vec2(0.6, 0.8) },
  { label: "negative direction", v: vec2(-3, 4), expected: vec2(-0.6, 0.8) },
  { label: "zero vector is zero, not NaN", v: vec2(0, 0), expected: vec2(0, 0) },
  { label: "tiny vector is zero", v: vec2(1e-12, 0), expected: vec2(0, 0) },
  { label: "large vector", v: vec2(1000, 0), expected: vec2(1, 0) },
] as const, (row) => vecNear(normalize(row.v), row.expected, 1e-12));

Deno.test("math/vectors normalize result has unit length", () => {
  for (const v of [vec2(2, 7), vec2(-3, -9), vec2(0.001, 0.002)]) {
    near(length(normalize(v)), 1, 1e-12, `length of normalize(${JSON.stringify(v)})`);
  }
});

table("math/vectors lerp", [
  { label: "t=0 returns a", a: 2, b: 10, t: 0, value: 2 },
  { label: "t=1 returns b", a: 2, b: 10, t: 1, value: 10 },
  { label: "t=0.5 midpoint", a: 2, b: 10, t: 0.5, value: 6 },
  { label: "t=0.25 quarter", a: 0, b: 100, t: 0.25, value: 25 },
  { label: "t beyond 1 extrapolates", a: 0, b: 10, t: 2, value: 20 },
  { label: "t below 0 extrapolates", a: 0, b: 10, t: -1, value: -10 },
  { label: "negative range", a: 10, b: -10, t: 0.5, value: 0 },
] as const, (row) => near(lerp(row.a, row.b, row.t), row.value, 1e-12));

table("math/vectors lerpVec", [
  { label: "t=0", a: vec2(1, 2), b: vec2(5, 6), t: 0, expected: vec2(1, 2) },
  { label: "t=1", a: vec2(1, 2), b: vec2(5, 6), t: 1, expected: vec2(5, 6) },
  { label: "t=0.5", a: vec2(1, 2), b: vec2(5, 6), t: 0.5, expected: vec2(3, 4) },
  { label: "t=0.25", a: vec2(0, 0), b: vec2(8, -4), t: 0.25, expected: vec2(2, -1) },
  { label: "axis independent", a: vec2(0, 10), b: vec2(10, 0), t: 0.5, expected: vec2(5, 5) },
] as const, (row) => vecNear(lerpVec(row.a, row.b, row.t), row.expected, 1e-12));

table("math/vectors clamp", [
  { label: "inside", value: 5, min: 0, max: 10, expected: 5 },
  { label: "at min", value: 0, min: 0, max: 10, expected: 0 },
  { label: "at max", value: 10, min: 0, max: 10, expected: 10 },
  { label: "below", value: -3, min: 0, max: 10, expected: 0 },
  { label: "above", value: 30, min: 0, max: 10, expected: 10 },
  { label: "swapped bounds still clamp", value: 5, min: 10, max: 0, expected: 5 },
  { label: "swapped bounds below", value: -1, min: 10, max: 0, expected: 0 },
  { label: "negative range", value: -5, min: -10, max: -1, expected: -5 },
  { label: "infinite upper", value: 1e9, min: 0, max: Number.POSITIVE_INFINITY, expected: 1e9 },
] as const, (row) => near(clamp(row.value, row.min, row.max), row.expected, 1e-12));

table("math/vectors clamp01", [
  { label: "below zero", value: -0.5, expected: 0 },
  { label: "zero", value: 0, expected: 0 },
  { label: "half", value: 0.5, expected: 0.5 },
  { label: "one", value: 1, expected: 1 },
  { label: "above one", value: 2, expected: 1 },
] as const, (row) => near(clamp01(row.value), row.expected, 1e-12));

table("math/vectors clampVec·minVec·maxVec·midpoint", [
  {
    label: "clampVec per axis",
    op: "clamp",
    a: vec2(-5, 12),
    b: vec2(0, 0),
    expected: vec2(0, 10),
  },
  { label: "minVec", op: "min", a: vec2(3, -1), b: vec2(1, 5), expected: vec2(1, -1) },
  { label: "maxVec", op: "max", a: vec2(3, -1), b: vec2(1, 5), expected: vec2(3, 5) },
  { label: "midpoint", op: "mid", a: vec2(0, 0), b: vec2(4, 10), expected: vec2(2, 5) },
  {
    label: "midpoint negative",
    op: "mid",
    a: vec2(-4, -10),
    b: vec2(0, 0),
    expected: vec2(-2, -5),
  },
  { label: "minVec equal", op: "min", a: vec2(2, 2), b: vec2(2, 2), expected: vec2(2, 2) },
  { label: "maxVec mixed", op: "max", a: vec2(-3, 8), b: vec2(-4, -8), expected: vec2(-3, 8) },
] as const, (row) => {
  const actual = row.op === "clamp"
    ? clampVec(row.a, 0, 10)
    : row.op === "min"
    ? minVec(row.a, row.b)
    : row.op === "max"
    ? maxVec(row.a, row.b)
    : midpoint(row.a, row.b);
  vecNear(actual, row.expected, 1e-12);
});

interface EqualsRow {
  label: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
  expected: boolean;
  eps: number;
}

const EQUALS_ROWS: EqualsRow[] = [
  { label: "identical", a: vec2(1, 2), b: vec2(1, 2), expected: true, eps: 1e-9 },
  { label: "x differs", a: vec2(1, 2), b: vec2(1.1, 2), expected: false, eps: 1e-9 },
  { label: "y differs", a: vec2(1, 2), b: vec2(1, 2.1), expected: false, eps: 1e-9 },
  { label: "within default epsilon", a: vec2(1, 2), b: vec2(1 + 1e-10, 2), expected: true, eps: 1e-9 },
  { label: "outside default epsilon", a: vec2(1, 2), b: vec2(1 + 1e-6, 2), expected: false, eps: 1e-9 },
  { label: "custom epsilon accepts", a: vec2(0, 0), b: vec2(0.5, -0.5), expected: true, eps: 0.6 },
];

table("math/vectors equals", EQUALS_ROWS, (row) => {
  assertEqual(equals(row.a, row.b, row.eps), row.expected, row.label);
});

interface AngleRow {
  label: string;
  fromAngle: boolean;
  v: { x: number; y: number };
  radians: number;
  radius: number;
  expected: { x: number; y: number };
  angle: number;
}

const ANGLE_ROWS: AngleRow[] = [
  { label: "from angle zero", fromAngle: true, v: zero, radians: 0, radius: 1, expected: vec2(1, 0), angle: 0 },
  { label: "from angle quarter turn", fromAngle: true, v: zero, radians: PI / 2, radius: 1, expected: vec2(0, 1), angle: 0 },
  { label: "from angle half turn", fromAngle: true, v: zero, radians: PI, radius: 1, expected: vec2(-1, 0), angle: 0 },
  { label: "from angle with radius", fromAngle: true, v: zero, radians: 0, radius: 5, expected: vec2(5, 0), angle: 0 },
  { label: "from angle negative radius flips", fromAngle: true, v: zero, radians: 0, radius: -2, expected: vec2(-2, 0), angle: 0 },
  { label: "angleOf x axis", fromAngle: false, v: vec2(1, 0), radians: 0, radius: 1, expected: zero, angle: 0 },
  { label: "angleOf y axis", fromAngle: false, v: vec2(0, 1), radians: 0, radius: 1, expected: zero, angle: PI / 2 },
  { label: "angleOf negative x", fromAngle: false, v: vec2(-1, 0), radians: 0, radius: 1, expected: zero, angle: PI },
  { label: "angleOf third quadrant", fromAngle: false, v: vec2(-1, -1), radians: 0, radius: 1, expected: zero, angle: -3 * PI / 4 },
];

table("math/vectors angle", ANGLE_ROWS, (row) => {
  if (row.fromAngle) {
    vecNear(vec2FromAngle(row.radians, row.radius), row.expected, 1e-12);
  } else {
    near(angleOf(row.v), row.angle, 1e-12);
  }
});

table("math/vectors rotateVec", [
  { label: "zero rotation is identity", v: vec2(2, 3), radians: 0, expected: vec2(2, 3) },
  { label: "quarter turn", v: vec2(1, 0), radians: PI / 2, expected: vec2(0, 1) },
  { label: "half turn", v: vec2(2, 0), radians: PI, expected: vec2(-2, 0) },
  { label: "three quarter turn", v: vec2(1, 0), radians: 3 * PI / 2, expected: vec2(0, -1) },
  { label: "negative quarter turn", v: vec2(0, 1), radians: -PI / 2, expected: vec2(1, 0) },
  { label: "45 degrees", v: vec2(1, 0), radians: PI / 4, expected: vec2(Math.SQRT1_2, Math.SQRT1_2) },
  { label: "rotating by full turn is identity", v: vec2(3, -4), radians: 2 * PI, expected: vec2(3, -4) },
] as const, (row) => vecNear(rotateVec(row.v, row.radians), row.expected, 1e-12));

Deno.test("math/vectors rotateVec preserves length", () => {
  const v = vec2(3, 4);
  for (const angle of [0.1, 0.7, PI, 2.5]) {
    near(length(rotateVec(v, angle)), 5, 1e-12, `angle ${angle}`);
  }
});

table("math/vectors perpendicular", [
  { label: "x axis to y", v: vec2(1, 0), expected: vec2(0, 1) },
  { label: "y axis to -x", v: vec2(0, 1), expected: vec2(-1, 0) },
  { label: "diagonal", v: vec2(2, 3), expected: vec2(-3, 2) },
  { label: "zero", v: vec2(0, 0), expected: vec2(0, 0) },
] as const, (row) => {
  vecNear(perpendicular(row.v), row.expected, 1e-12);
  near(dot(row.v, perpendicular(row.v)), 0, 1e-12, "perpendicular is orthogonal");
});

table("math/vectors applyDeadzone", [
  { label: "inside deadzone is zero", v: vec2(0.3, 0.3), deadzone: 0.5, expected: vec2(0, 0) },
  { label: "exactly at deadzone is zero", v: vec2(0.5, 0), deadzone: 0.5, expected: vec2(0, 0) },
  { label: "outside deadzone passes through", v: vec2(1, 0), deadzone: 0.5, expected: vec2(1, 0) },
  { label: "zero deadzone passes zero", v: vec2(0, 0), deadzone: 0, expected: vec2(0, 0) },
  { label: "diagonal outside", v: vec2(0.4, 0.4), deadzone: 0.5, expected: vec2(0.4, 0.4) },
] as const, (row) => vecNear(applyDeadzone(row.v, row.deadzone), row.expected, 1e-12));

table("math/vectors moveTowards", [
  { label: "within delta snaps", current: 1, target: 2, maxDelta: 5, value: 2 },
  { label: "above target steps down", current: 10, target: 0, maxDelta: 3, value: 7 },
  { label: "below target steps up", current: 0, target: 10, maxDelta: 3, value: 3 },
  { label: "already at target", current: 4, target: 4, maxDelta: 1, value: 4 },
  { label: "zero delta does nothing", current: 4, target: 9, maxDelta: 0, value: 4 },
  { label: "exact delta reaches target", current: 0, target: 5, maxDelta: 5, value: 5 },
  { label: "negative range", current: -5, target: -1, maxDelta: 2, value: -3 },
] as const, (row) => near(moveTowards(row.current, row.target, row.maxDelta), row.value, 1e-12));

table("math/vectors degrees·radians", [
  { label: "0°", degrees: 0, radians: 0 },
  { label: "90°", degrees: 90, radians: PI / 2 },
  { label: "180°", degrees: 180, radians: PI },
  { label: "270°", degrees: 270, radians: 3 * PI / 2 },
  { label: "360°", degrees: 360, radians: 2 * PI },
  { label: "-45°", degrees: -45, radians: -PI / 4 },
] as const, (row) => {
  near(toRadians(row.degrees), row.radians, 1e-12, "toRadians");
  near(toDegrees(row.radians), row.degrees, 1e-9, "toDegrees");
});

table("math/vectors wrapAngle", [
  { label: "zero", radians: 0, expected: 0 },
  { label: "half turn stays PI", radians: PI, expected: PI },
  { label: "-PI becomes PI", radians: -PI, expected: PI },
  { label: "3PI becomes PI", radians: 3 * PI, expected: PI },
  { label: "-3PI becomes PI", radians: -3 * PI, expected: PI },
  { label: "2PI becomes 0", radians: 2 * PI, expected: 0 },
  { label: "1.5PI wraps to -0.5PI", radians: 1.5 * PI, expected: -0.5 * PI },
  { label: "-1.5PI wraps to 0.5PI", radians: -1.5 * PI, expected: 0.5 * PI },
  { label: "small stays", radians: 0.25, expected: 0.25 },
] as const, (row) => near(wrapAngle(row.radians), row.expected, 1e-12));

table("math/vectors lerpAngle", [
  { label: "t=0", a: 0.1, b: 1.2, t: 0, value: 0.1 },
  { label: "t=1", a: 0.1, b: 1.2, t: 1, value: 1.2 },
  { label: "short way across zero", a: 0.1, b: -0.1, t: 0.5, value: 0 },
  { label: "across the wrap point", a: 3, b: -3, t: 0.5, value: 3 + (wrapAngle(-6) * 0.5) },
  { label: "quarter", a: 0, b: PI / 2, t: 0.5, value: PI / 4 },
] as const, (row) => near(lerpAngle(row.a, row.b, row.t), row.value, 1e-12));

table("math/vectors smoothstep", [
  { label: "below edge0", x: -1, e0: 0, e1: 1, expected: 0 },
  { label: "at edge0", x: 0, e0: 0, e1: 1, expected: 0 },
  { label: "midpoint", x: 0.5, e0: 0, e1: 1, expected: 0.5 },
  { label: "at edge1", x: 1, e0: 0, e1: 1, expected: 1 },
  { label: "above edge1", x: 2, e0: 0, e1: 1, expected: 1 },
  { label: "shifted range midpoint", x: 3, e0: 2, e1: 4, expected: 0.5 },
  { label: "inverted range widens to 0.5", x: 0.5, e0: 1, e1: 0, expected: 0.5 },
  { label: "degenerate edges below", x: -1, e0: 0, e1: 0, expected: 0 },
  { label: "degenerate edges at", x: 0, e0: 0, e1: 0, expected: 1 },
], (row) => near(smoothstep(row.e0, row.e1, row.x), row.expected, 1e-12));

table("math/vectors damp", [
  { label: "smoothing 0 snaps", current: 0, target: 10, smoothing: 0, dt: 1, value: 10 },
  { label: "smoothing negative snaps", current: 0, target: 10, smoothing: -1, dt: 1, value: 10 },
  { label: "dt 0 does nothing", current: 3, target: 10, smoothing: 1, dt: 0, value: 3 },
  {
    label: "one time constant",
    current: 0,
    target: 100,
    smoothing: 1,
    dt: 1,
    value: 100 * (1 - Math.exp(-1)),
  },
  {
    label: "small step moves a little",
    current: 0,
    target: 100,
    smoothing: 4,
    dt: 1,
    value: 100 * (1 - Math.exp(-0.25)),
  },
] as const, (row) => near(damp(row.current, row.target, row.smoothing, row.dt), row.value, 1e-12));

Deno.test("math/vectors damp approaches but never overshoots the target", () => {
  let value = 0;
  for (let i = 0; i < 100; i++) value = damp(value, 50, 0.5, 0.016);
  assert(value <= 50, `damp overshot: ${value}`);
  // Exponential approach over 1.6 s with a 0.5 s time constant, computed independently.
  near(value, 50 * (1 - Math.exp(-(100 * 0.016) / 0.5)), 1e-9, "after 100 steps");
});

table("math/vectors isFinite2", [
  { label: "normal", v: vec2(1, 2), expected: true },
  { label: "zeros", v: vec2(0, 0), expected: true },
  { label: "NaN x", v: vec2(Number.NaN, 0), expected: false },
  { label: "NaN y", v: vec2(0, Number.NaN), expected: false },
  { label: "infinite x", v: vec2(Number.POSITIVE_INFINITY, 0), expected: false },
  { label: "infinite y", v: vec2(0, Number.NEGATIVE_INFINITY), expected: false },
] as const, (row) => assertEqual(isFinite2(row.v), row.expected, row.label));

Deno.test("math/vectors vec2 defaults and vec2Clone copies", () => {
  vecNear(vec2(), vec2(0, 0));
  vecNear(vec2(5), vec2(5, 0));
  const original = vec2(2, 3);
  const copy = vec2Clone(original);
  copy.x = 99;
  near(original.x, 2, 0, "clone must not alias the original");
});

Deno.test("math/vectors operations never mutate their inputs", () => {
  const a = vec2(1, 2);
  const b = vec2(3, 4);
  const before = JSON.stringify([a, b]);
  add(a, b);
  sub(a, b);
  mul(a, b);
  scale(a, 2);
  negate(a);
  lerpVec(a, b, 0.5);
  rotateVec(a, 1);
  normalize(a);
  assertEqual(JSON.stringify([a, b]), before, "inputs changed");
});
