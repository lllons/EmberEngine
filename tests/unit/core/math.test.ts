/**
 * @ember/core/math — 2D vector, rect and transform math.
 *
 * Every case is a real assertion about a concrete input/output pair or a documented
 * invariant, driven from tables so the suite covers the whole surface without prose.
 */

import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import {
  add,
  angleOf,
  angleOf as angle,
  applyDeadzone,
  clamp,
  clamp01,
  clampVec,
  cross,
  damp,
  distance,
  distanceSq,
  dot,
  EPSILON,
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
  rect,
  rectCenter,
  rectContainsPoint,
  rectContainsRect,
  rectEquals,
  rectFromCenter,
  rectFromCorners,
  rectInflate,
  rectIntersection,
  rectIntersects,
  rectMax,
  rectMin,
  rectOverlapArea,
  rectTranslate,
  rectUnion,
  rotateVec,
  scale,
  smoothstep,
  sub,
  toDegrees,
  toRadians,
  transform2d,
  transform2dClone,
  transformBounds,
  transformPoint,
  vec2,
  vec2Clone,
  vec2FromAngle,
  wrapAngle,
} from "@ember/core";

const vectors: Array<[string, { x: number; y: number }, { x: number; y: number }]> = [
  ["positive", vec2(1, 2), vec2(3, 4)],
  ["negative", vec2(-1, -2), vec2(-3, -4)],
  ["mixed", vec2(2.5, -7.25), vec2(-0.5, 4)],
  ["zero", vec2(0, 0), vec2(5, 5)],
  ["large", vec2(1e6, -1e6), vec2(2e6, 3e6)],
];

for (const [label, a, b] of vectors) {
  Deno.test(`add ${label}`, () => {
    assertEquals(add(a, b), vec2(a.x + b.x, a.y + b.y));
  });
  Deno.test(`sub ${label}`, () => {
    assertEquals(sub(a, b), vec2(a.x - b.x, a.y - b.y));
  });
  Deno.test(`mul ${label}`, () => {
    assertEquals(mul(a, b), vec2(a.x * b.x, a.y * b.y));
  });
  Deno.test(`dot ${label}`, () => {
    assertEquals(dot(a, b), a.x * b.x + a.y * b.y);
  });
  Deno.test(`cross ${label}`, () => {
    assertEquals(cross(a, b), a.x * b.y - a.y * b.x);
  });
  Deno.test(`lengthSq/length ${label}`, () => {
    assertEquals(lengthSq(a), a.x * a.x + a.y * a.y);
    assertAlmostEquals(length(a), Math.hypot(a.x, a.y), 1e-9);
  });
  Deno.test(`distance ${label}`, () => {
    assertAlmostEquals(distance(a, b), Math.hypot(a.x - b.x, a.y - b.y), 1e-9);
    assertAlmostEquals(distanceSq(a, b), (a.x - b.x) ** 2 + (a.y - b.y) ** 2, 1e-6);
  });
  Deno.test(`negate ${label}`, () => {
    assertEquals(negate(a), vec2(-a.x, -a.y));
  });
  Deno.test(`scale ${label}`, () => {
    assertEquals(scale(a, 3), vec2(a.x * 3, a.y * 3));
  });
  Deno.test(`min/max/midpoint ${label}`, () => {
    assertEquals(minVec(a, b), vec2(Math.min(a.x, b.x), Math.min(a.y, b.y)));
    assertEquals(maxVec(a, b), vec2(Math.max(a.x, b.x), Math.max(a.y, b.y)));
    assertEquals(midpoint(a, b), vec2((a.x + b.x) / 2, (a.y + b.y) / 2));
  });
  Deno.test(`equals ${label}`, () => {
    assert(equals(a, vec2Clone(a)));
    if (Math.hypot(a.x - b.x, a.y - b.y) > 1) assert(!equals(a, b));
  });
  Deno.test(`vec2Clone ${label} is independent`, () => {
    const copy = vec2Clone(a);
    copy.x += 100;
    assert(copy.x !== a.x);
  });
}

Deno.test("normalize: unit length for non-zero vectors", () => {
  for (const [label, a] of vectors.map(([label, a]) => [label, a] as const)) {
    const unit = normalize(a);
    if (length(a) <= EPSILON) {
      assertEquals(unit, vec2(0, 0), `${label} should collapse to zero`);
    } else {
      assertAlmostEquals(length(unit), 1, 1e-9, `${label} should be unit length`);
    }
  }
});

Deno.test("normalize: zero vector yields zero, not NaN", () => {
  const unit = normalize(vec2(0, 0));
  assertEquals(unit, vec2(0, 0));
  assert(isFinite2(unit));
});

Deno.test("angleOf matches atan2 and vec2FromAngle round-trips", () => {
  const angles = [0, 0.5, -0.5, Math.PI / 2, -Math.PI / 2, 3, -3];
  for (const value of angles) {
    assertAlmostEquals(angle(vec2FromAngle(value, 2)), value, 1e-9);
    assertAlmostEquals(angleOf(vec2(Math.cos(value), Math.sin(value))), value, 1e-9);
  }
});

Deno.test("rotateVec rotates by 90 degrees", () => {
  const rotated = rotateVec(vec2(1, 0), Math.PI / 2);
  assertAlmostEquals(rotated.x, 0, 1e-9);
  assertAlmostEquals(rotated.y, 1, 1e-9);
});

Deno.test("rotateVec preserves length", () => {
  const source = vec2(3, -4);
  for (const angle of [0.1, 1, 2.5, -3]) {
    assertAlmostEquals(length(rotateVec(source, angle)), 5, 1e-9);
  }
});

Deno.test("perpendicular is orthogonal to its input", () => {
  for (const [, a] of vectors) {
    assertAlmostEquals(dot(a, perpendicular(a)), 0, 1e-9);
  }
});

Deno.test("clamp: bounds, swapped bounds and edges", () => {
  assertEquals(clamp(5, 0, 10), 5);
  assertEquals(clamp(-5, 0, 10), 0);
  assertEquals(clamp(15, 0, 10), 10);
  assertEquals(clamp(5, 10, 0), 5);
  assertEquals(clamp(-1, 10, 0), 0);
  assertEquals(clamp01(-2), 0);
  assertEquals(clamp01(0.25), 0.25);
  assertEquals(clamp01(2), 1);
});

Deno.test("clampVec clamps both axes", () => {
  assertEquals(clampVec(vec2(-5, 20), 0, 10), vec2(0, 10));
});

Deno.test("applyDeadzone zeros small values only", () => {
  assertEquals(applyDeadzone(vec2(0.2, 0.1), 0.5), vec2(0, 0));
  assertEquals(applyDeadzone(vec2(2, 0), 0.5), vec2(2, 0));
});

Deno.test("lerp interpolates endpoints and midpoint", () => {
  assertEquals(lerp(10, 20, 0), 10);
  assertEquals(lerp(10, 20, 1), 20);
  assertEquals(lerp(10, 20, 0.5), 15);
  assertEquals(lerpVec(vec2(0, 0), vec2(10, 20), 0.5), vec2(5, 10));
});

Deno.test("moveTowards never overshoots", () => {
  assertEquals(moveTowards(0, 10, 3), 3);
  assertEquals(moveTowards(0, 10, 100), 10);
  assertEquals(moveTowards(10, 0, 4), 6);
  assertEquals(moveTowards(5, 5, 1), 5);
});

Deno.test("wrapAngle keeps angles inside (-PI, PI]", () => {
  const cases: Array<[number, number]> = [
    [0, 0],
    [Math.PI, Math.PI],
    [Math.PI * 3, Math.PI],
    [-Math.PI * 3, Math.PI],
    [Math.PI * 2, 0],
  ];
  for (const [input, expected] of cases) {
    assertAlmostEquals(wrapAngle(input), expected, 1e-9, `wrapAngle(${input})`);
  }
});

Deno.test("wrapAngle output is always within range", () => {
  for (let i = -20; i <= 20; i++) {
    const result = wrapAngle(i * 1.7);
    assert(result > -Math.PI - 1e-9 && result <= Math.PI + 1e-9, `value ${result} out of range`);
  }
});

Deno.test("lerpAngle takes the short way around", () => {
  const result = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
  assertAlmostEquals(Math.abs(result), Math.PI, 1e-6);
});

Deno.test("toRadians/toDegrees round-trip", () => {
  for (const degrees of [0, 45, 90, 180, 360, -270]) {
    assertAlmostEquals(toDegrees(toRadians(degrees)), degrees, 1e-9);
  }
});

Deno.test("smoothstep clamps and eases", () => {
  assertEquals(smoothstep(0, 1, -1), 0);
  assertEquals(smoothstep(0, 1, 0), 0);
  assertEquals(smoothstep(0, 1, 1), 1);
  assertEquals(smoothstep(0, 1, 2), 1);
  assertAlmostEquals(smoothstep(0, 1, 0.5), 0.5, 1e-9);
  assertEquals(smoothstep(2, 2, 1), 0);
  assertEquals(smoothstep(2, 2, 3), 1);
});

Deno.test("damp approaches the target monotonically", () => {
  let value = 0;
  for (let i = 0; i < 60; i++) value = damp(value, 100, 0.1, 1 / 60);
  assert(value > 0 && value < 100);
  assertAlmostEquals(damp(0, 50, 0, 1), 50);
  assertAlmostEquals(damp(0, 50, -1, 1), 50);
});

Deno.test("isFinite2 rejects NaN and Infinity", () => {
  assert(isFinite2(vec2(1, 2)));
  assert(!isFinite2(vec2(Number.NaN, 0)));
  assert(!isFinite2(vec2(0, Number.POSITIVE_INFINITY)));
});

// ---------------------------------------------------------------------------
// Rect
// ---------------------------------------------------------------------------

const rects: Array<[string, { x: number; y: number; w: number; h: number }]> = [
  ["unit", rect(0, 0, 1, 1)],
  ["offset", rect(10, 20, 30, 40)],
  ["negative", rect(-30, -20, 10, 5)],
  ["flat", rect(0, 0, 0, 0)],
];

for (const [label, r] of rects) {
  Deno.test(`rect min/max/center ${label}`, () => {
    assertEquals(rectMin(r), vec2(r.x, r.y));
    assertEquals(rectMax(r), vec2(r.x + r.w, r.y + r.h));
    assertEquals(rectCenter(r), vec2(r.x + r.w / 2, r.y + r.h / 2));
  });
  Deno.test(`rectContainsPoint ${label}`, () => {
    assert(rectContainsPoint(r, rectCenter(r)));
    assert(!rectContainsPoint(r, vec2(r.x - 1, r.y - 1)));
  });
  Deno.test(`rectInflate ${label}`, () => {
    const inflated = rectInflate(r, 5);
    assertEquals(inflated.w, r.w + 10);
    assertEquals(inflated.h, r.h + 10);
    assert(rectContainsRect(inflated, r));
  });
  Deno.test(`rectTranslate ${label}`, () => {
    const moved = rectTranslate(r, vec2(3, -4));
    assertEquals(moved.x, r.x + 3);
    assertEquals(moved.y, r.y - 4);
    assertEquals(moved.w, r.w);
  });
}

Deno.test("rectFromCenter and rectFromCorners agree", () => {
  const center = rectFromCenter(vec2(50, 50), 20, 10);
  assertEquals(center, rect(40, 45, 20, 10));
  const corners = rectFromCorners(vec2(50, 50), vec2(30, 40));
  assertEquals(corners, rect(30, 40, 20, 10));
  const reversed = rectFromCorners(vec2(30, 40), vec2(50, 50));
  assertEquals(reversed, corners);
});

Deno.test("rectIntersects and rectIntersection: overlapping case", () => {
  const a = rect(0, 0, 10, 10);
  const b = rect(5, 5, 10, 10);
  assert(rectIntersects(a, b));
  assertEquals(rectIntersection(a, b), rect(5, 5, 5, 5));
  assertEquals(rectOverlapArea(a, b), 25);
});

Deno.test("rectIntersection: touching rects do not overlap", () => {
  const a = rect(0, 0, 10, 10);
  const b = rect(10, 0, 10, 10);
  assert(!rectIntersects(a, b));
  assertEquals(rectIntersection(a, b), null);
  assertEquals(rectOverlapArea(a, b), 0);
});

Deno.test("rectIntersection: containment returns the inner rect", () => {
  const outer = rect(0, 0, 100, 100);
  const inner = rect(10, 10, 5, 5);
  assert(rectIntersects(outer, inner));
  assertEquals(rectIntersection(outer, inner), inner);
  assert(rectContainsRect(outer, inner));
  assert(!rectContainsRect(inner, outer));
});

Deno.test("rectUnion covers both inputs", () => {
  const a = rect(0, 0, 10, 10);
  const b = rect(20, 20, 5, 5);
  const union = rectUnion(a, b);
  assertEquals(union, rect(0, 0, 25, 25));
  assert(rectContainsRect(union, a));
  assert(rectContainsRect(union, b));
});

Deno.test("rectEquals tolerates tiny float error only", () => {
  assert(rectEquals(rect(0, 0, 10, 10), rect(0, 0, 10, 10)));
  assert(rectEquals(rect(0, 0, 10, 10), rect(1e-12, 0, 10, 10)));
  assert(!rectEquals(rect(0, 0, 10, 10), rect(0.5, 0, 10, 10)));
});

// ---------------------------------------------------------------------------
// Transform2D
// ---------------------------------------------------------------------------

Deno.test("transform2d clone is deep enough", () => {
  const source = transform2d(vec2(1, 2), 0.5, vec2(3, 4));
  const copy = transform2dClone(source);
  assertEquals(copy, source);
  copy.position.x = 99;
  copy.scale.y = 99;
  assert(source.position.x === 1 && source.scale.y === 4);
});

Deno.test("transformPoint applies translate, rotate and scale", () => {
  const t = transform2d(vec2(10, 0), Math.PI / 2, vec2(2, 2));
  const point = transformPoint(t, vec2(1, 0));
  assertAlmostEquals(point.x, 10, 1e-9);
  assertAlmostEquals(point.y, 2, 1e-9);
});

Deno.test("transformPoint at the origin is the transform position", () => {
  const t = transform2d(vec2(7, -3), 1.2, vec2(3, 0.5));
  const point = transformPoint(t, vec2(0, 0));
  assertAlmostEquals(point.x, 7, 1e-9);
  assertAlmostEquals(point.y, -3, 1e-9);
});

Deno.test("transformBounds with no rotation is centred on the transform", () => {
  const bounds = transformBounds(transform2d(vec2(50, 50), 0, vec2(2, 3)), { width: 10, height: 10 });
  assertEquals(bounds, rect(40, 35, 20, 30));
});

Deno.test("transformBounds with rotation grows the axis-aligned box", () => {
  const unrotated = transformBounds(transform2d(vec2(0, 0), 0, vec2(1, 1)), { width: 10, height: 10 });
  const rotated = transformBounds(transform2d(vec2(0, 0), Math.PI / 4, vec2(1, 1)), {
    width: 10,
    height: 10,
  });
  assert(rotated.w > unrotated.w);
  assertAlmostEquals(rotated.w, Math.SQRT2 * 10, 1e-6);
  assertAlmostEquals(rotated.x + rotated.w / 2, 0, 1e-9);
});
