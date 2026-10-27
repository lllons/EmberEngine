/** Rectangle math: hand-computed extents, edge cases at the boundaries. */

import {
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
  vec2,
} from "@ember/core";
import { assertEqual, near, table, vecNear } from "../../harness.ts";

table("math/rects construction", [
  {
    label: "defaults to zero",
    actual: rect(),
    expected: { x: 0, y: 0, w: 0, h: 0 },
  },
  {
    label: "explicit values",
    actual: rect(1, 2, 3, 4),
    expected: { x: 1, y: 2, w: 3, h: 4 },
  },
  {
    label: "from centre",
    actual: rectFromCenter(vec2(10, 20), 4, 6),
    expected: { x: 8, y: 17, w: 4, h: 6 },
  },
  {
    label: "from centre with odd size",
    actual: rectFromCenter(vec2(0, 0), 5, 5),
    expected: { x: -2.5, y: -2.5, w: 5, h: 5 },
  },
  {
    label: "from ordered corners",
    actual: rectFromCorners(vec2(1, 2), vec2(4, 8)),
    expected: { x: 1, y: 2, w: 3, h: 6 },
  },
  {
    label: "from reversed corners",
    actual: rectFromCorners(vec2(4, 8), vec2(1, 2)),
    expected: { x: 1, y: 2, w: 3, h: 6 },
  },
  {
    label: "from mixed corners",
    actual: rectFromCorners(vec2(4, 2), vec2(1, 8)),
    expected: { x: 1, y: 2, w: 3, h: 6 },
  },
] as const, (row) => assertEqual(row.actual, row.expected, row.label));

table("math/rects accessors", [
  { label: "min", r: rect(2, 3, 4, 5), point: vec2(2, 3) },
  { label: "max", r: rect(2, 3, 4, 5), point: vec2(6, 8), useMax: true },
  { label: "centre", r: rect(2, 3, 4, 5), point: vec2(4, 5.5), useCenter: true },
  { label: "min negative", r: rect(-2, -3, 4, 5), point: vec2(-2, -3) },
  { label: "max negative", r: rect(-2, -3, 4, 5), point: vec2(2, 2), useMax: true },
] as const, (row) => {
  const actual = row.useMax ? rectMax(row.r) : row.useCenter ? rectCenter(row.r) : rectMin(row.r);
  vecNear(actual, row.point, 1e-12, row.label);
});

table("math/rects containsPoint", [
  { label: "interior", r: rect(0, 0, 10, 10), p: vec2(5, 5), expected: true },
  { label: "left edge", r: rect(0, 0, 10, 10), p: vec2(0, 5), expected: true },
  { label: "right edge", r: rect(0, 0, 10, 10), p: vec2(10, 5), expected: true },
  { label: "top edge", r: rect(0, 0, 10, 10), p: vec2(5, 0), expected: true },
  { label: "bottom edge", r: rect(0, 0, 10, 10), p: vec2(5, 10), expected: true },
  { label: "top-left corner", r: rect(0, 0, 10, 10), p: vec2(0, 0), expected: true },
  { label: "just outside left", r: rect(0, 0, 10, 10), p: vec2(-0.001, 5), expected: false },
  { label: "just outside bottom", r: rect(0, 0, 10, 10), p: vec2(5, 10.001), expected: false },
  { label: "far away", r: rect(0, 0, 10, 10), p: vec2(100, 100), expected: false },
  { label: "negative rect", r: rect(-10, -10, 5, 5), p: vec2(-8, -8), expected: true },
] as const, (row) => {
  assertEqual(rectContainsPoint(row.r, row.p), row.expected, row.label);
});

table("math/rects containsRect", [
  { label: "equal", outer: rect(0, 0, 10, 10), inner: rect(0, 0, 10, 10), expected: true },
  { label: "inside", outer: rect(0, 0, 10, 10), inner: rect(2, 2, 3, 3), expected: true },
  {
    label: "shares left edge",
    outer: rect(0, 0, 10, 10),
    inner: rect(0, 2, 3, 3),
    expected: true,
  },
  {
    label: "overflows right",
    outer: rect(0, 0, 10, 10),
    inner: rect(8, 2, 3, 3),
    expected: false,
  },
  {
    label: "overflows top",
    outer: rect(0, 0, 10, 10),
    inner: rect(2, -1, 3, 3),
    expected: false,
  },
  {
    label: "larger than outer",
    outer: rect(0, 0, 10, 10),
    inner: rect(-1, -1, 12, 12),
    expected: false,
  },
] as const, (row) => {
  assertEqual(rectContainsRect(row.outer, row.inner), row.expected, row.label);
});

table("math/rects intersects", [
  { label: "overlap", a: rect(0, 0, 4, 4), b: rect(2, 2, 4, 4), expected: true },
  { label: "containment", a: rect(0, 0, 10, 10), b: rect(4, 4, 2, 2), expected: true },
  { label: "shared edge only", a: rect(0, 0, 4, 4), b: rect(4, 0, 4, 4), expected: false },
  { label: "corner touch only", a: rect(0, 0, 4, 4), b: rect(4, 4, 4, 4), expected: false },
  { label: "disjoint", a: rect(0, 0, 4, 4), b: rect(10, 10, 4, 4), expected: false },
  { label: "one-pixel overlap", a: rect(0, 0, 4, 4), b: rect(3.5, 0, 4, 4), expected: true },
] as const, (row) => {
  assertEqual(rectIntersects(row.a, row.b), row.expected, row.label);
});

table("math/rects intersection", [
  {
    label: "overlap region",
    a: rect(0, 0, 4, 4),
    b: rect(2, 1, 4, 4),
    expected: { x: 2, y: 1, w: 2, h: 3 },
  },
  {
    label: "containment returns inner",
    a: rect(0, 0, 10, 10),
    b: rect(2, 2, 3, 3),
    expected: { x: 2, y: 2, w: 3, h: 3 },
  },
  { label: "touching gives null", a: rect(0, 0, 4, 4), b: rect(4, 0, 2, 2), expected: null },
  { label: "disjoint gives null", a: rect(0, 0, 4, 4), b: rect(5, 5, 2, 2), expected: null },
  { label: "zero-size gives null", a: rect(0, 0, 0, 4), b: rect(0, 0, 4, 4), expected: null },
] as const, (row) => {
  assertEqual(rectIntersection(row.a, row.b), row.expected, row.label);
});

table("math/rects overlapArea", [
  { label: "half overlap", a: rect(0, 0, 4, 4), b: rect(2, 0, 4, 4), value: 8 },
  { label: "full overlap", a: rect(0, 0, 4, 4), b: rect(1, 1, 2, 2), value: 4 },
  { label: "none", a: rect(0, 0, 4, 4), b: rect(9, 9, 4, 4), value: 0 },
  { label: "edge touch", a: rect(0, 0, 4, 4), b: rect(4, 0, 4, 4), value: 0 },
  { label: "quarter overlap", a: rect(0, 0, 4, 4), b: rect(2, 2, 4, 4), value: 4 },
] as const, (row) => near(rectOverlapArea(row.a, row.b), row.value, 1e-12));

interface ShapeRow {
  label: string;
  op: "inflate" | "translate" | "union";
  a: { x: number; y: number; w: number; h: number };
  amount: number;
  offset: { x: number; y: number };
  other: { x: number; y: number; w: number; h: number };
  expected: { x: number; y: number; w: number; h: number };
}

const SHAPE_ROWS: ShapeRow[] = [
  {
    label: "inflate outward",
    op: "inflate",
    a: rect(0, 0, 10, 10),
    amount: 2,
    offset: vec2(0, 0),
    other: rect(0, 0, 0, 0),
    expected: { x: -2, y: -2, w: 14, h: 14 },
  },
  {
    label: "inflate inward",
    op: "inflate",
    a: rect(0, 0, 10, 10),
    amount: -1,
    offset: vec2(0, 0),
    other: rect(0, 0, 0, 0),
    expected: { x: 1, y: 1, w: 8, h: 8 },
  },
  {
    label: "translate",
    op: "translate",
    a: rect(1, 2, 3, 4),
    amount: 0,
    offset: vec2(-1, 5),
    other: rect(0, 0, 0, 0),
    expected: { x: 0, y: 7, w: 3, h: 4 },
  },
  {
    label: "union disjoint",
    op: "union",
    a: rect(0, 0, 2, 2),
    amount: 0,
    offset: vec2(0, 0),
    other: rect(4, 4, 2, 2),
    expected: { x: 0, y: 0, w: 6, h: 6 },
  },
  {
    label: "union containment",
    op: "union",
    a: rect(0, 0, 10, 10),
    amount: 0,
    offset: vec2(0, 0),
    other: rect(2, 2, 2, 2),
    expected: { x: 0, y: 0, w: 10, h: 10 },
  },
  {
    label: "union overlap",
    op: "union",
    a: rect(0, 0, 4, 4),
    amount: 0,
    offset: vec2(0, 0),
    other: rect(2, 2, 4, 4),
    expected: { x: 0, y: 0, w: 6, h: 6 },
  },
];

table("math/rects inflate·translate·union", SHAPE_ROWS, (row) => {
  const actual = row.op === "inflate"
    ? rectInflate(row.a, row.amount)
    : row.op === "translate"
    ? rectTranslate(row.a, row.offset)
    : rectUnion(row.a, row.other);
  assertEqual(actual, row.expected, row.label);
});

table("math/rects equals", [
  { label: "identical", a: rect(1, 2, 3, 4), b: rect(1, 2, 3, 4), expected: true },
  { label: "x differs", a: rect(1, 2, 3, 4), b: rect(1.1, 2, 3, 4), expected: false },
  { label: "height differs", a: rect(1, 2, 3, 4), b: rect(1, 2, 3, 4.1), expected: false },
  { label: "within epsilon", a: rect(1, 2, 3, 4), b: rect(1 + 1e-10, 2, 3, 4), expected: true },
  { label: "far apart", a: rect(0, 0, 1, 1), b: rect(5, 5, 1, 1), expected: false },
] as const, (row) => {
  assertEqual(rectEquals(row.a, row.b), row.expected, row.label);
});
