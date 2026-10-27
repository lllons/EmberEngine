/** Transform2D: local→world mapping and world-space bounds, including rotation. */

import {
  transform2d,
  transform2dClone,
  transformBounds,
  transformPoint,
  vec2,
} from "@ember/core";
import { assert, assertEqual, near, table, vecNear } from "../../harness.ts";

const PI = Math.PI;

table("math/transforms transformPoint", [
  {
    label: "identity",
    t: transform2d(),
    local: vec2(3, 4),
    expected: vec2(3, 4),
  },
  {
    label: "translation only",
    t: transform2d(vec2(10, 20)),
    local: vec2(1, 2),
    expected: vec2(11, 22),
  },
  {
    label: "scale only",
    t: transform2d(vec2(0, 0), 0, vec2(2, 3)),
    local: vec2(4, 5),
    expected: vec2(8, 15),
  },
  {
    label: "rotation quarter turn",
    t: transform2d(vec2(0, 0), PI / 2),
    local: vec2(1, 0),
    expected: vec2(0, 1),
  },
  {
    label: "rotation half turn",
    t: transform2d(vec2(0, 0), PI),
    local: vec2(1, 2),
    expected: vec2(-1, -2),
  },
  {
    label: "scale then rotate",
    t: transform2d(vec2(0, 0), PI / 2, vec2(2, 2)),
    local: vec2(1, 0),
    expected: vec2(0, 2),
  },
  {
    label: "rotate then translate",
    t: transform2d(vec2(5, 5), PI / 2),
    local: vec2(1, 0),
    expected: vec2(5, 6),
  },
  {
    label: "all three",
    t: transform2d(vec2(100, 50), PI / 2, vec2(3, 3)),
    local: vec2(2, 0),
    expected: vec2(100, 56),
  },
  {
    label: "negative scale mirrors",
    t: transform2d(vec2(0, 0), 0, vec2(-1, 1)),
    local: vec2(4, 2),
    expected: vec2(-4, 2),
  },
] as const, (row) => vecNear(transformPoint(row.t, row.local), row.expected, 1e-12));

table("math/transforms transformBounds", [
  {
    label: "unrotated box",
    t: transform2d(vec2(0, 0)),
    size: { width: 2, height: 4 },
    expected: { x: -1, y: -2, w: 2, h: 4 },
  },
  {
    label: "translated box",
    t: transform2d(vec2(10, 20)),
    size: { width: 2, height: 2 },
    expected: { x: 9, y: 19, w: 2, h: 2 },
  },
  {
    label: "scaled box",
    t: transform2d(vec2(0, 0), 0, vec2(2, 1)),
    size: { width: 2, height: 4 },
    expected: { x: -2, y: -2, w: 4, h: 4 },
  },
  {
    label: "negative scale uses magnitude",
    t: transform2d(vec2(0, 0), 0, vec2(-2, 1)),
    size: { width: 2, height: 4 },
    expected: { x: -2, y: -2, w: 4, h: 4 },
  },
  {
    label: "quarter turn swaps extents",
    t: transform2d(vec2(0, 0), PI / 2),
    size: { width: 2, height: 4 },
    expected: { x: -2, y: -1, w: 4, h: 2 },
  },
  {
    label: "45 degrees grows square by sqrt2",
    t: transform2d(vec2(0, 0), PI / 4),
    size: { width: 2, height: 2 },
    expected: { x: -Math.SQRT2, y: -Math.SQRT2, w: 2 * Math.SQRT2, h: 2 * Math.SQRT2 },
  },
  {
    label: "rotation around an offset centre",
    t: transform2d(vec2(10, 10), PI),
    size: { width: 2, height: 2 },
    expected: { x: 9, y: 9, w: 2, h: 2 },
  },
] as const, (row) => {
  const bounds = transformBounds(row.t, row.size);
  near(bounds.x, row.expected.x, 1e-9, "x");
  near(bounds.y, row.expected.y, 1e-9, "y");
  near(bounds.w, row.expected.w, 1e-9, "w");
  near(bounds.h, row.expected.h, 1e-9, "h");
});

Deno.test("math/transforms defaults are identity", () => {
  const t = transform2d();
  vecNear(t.position, vec2(0, 0));
  near(t.rotation, 0, 0);
  vecNear(t.scale, vec2(1, 1));
  vecNear(transformPoint(t, vec2(7, -3)), vec2(7, -3));
});

Deno.test("math/transforms transform2d copies its inputs", () => {
  const position = vec2(1, 2);
  const t = transform2d(position);
  position.x = 99;
  near(t.position.x, 1, 0, "position must be copied");
});

Deno.test("math/transforms clone is a deep copy", () => {
  const original = transform2d(vec2(1, 2), 0.5, vec2(3, 4));
  const copy = transform2dClone(original);
  copy.position.x = 100;
  copy.scale.y = 100;
  copy.rotation = 9;
  near(original.position.x, 1, 0, "position");
  near(original.scale.y, 4, 0, "scale");
  near(original.rotation, 0.5, 0, "rotation");
  assertEqual(transform2dClone(original), original, "clone equals original");
});

Deno.test("math/transforms rotation preserves distance from the origin", () => {
  for (const angle of [0.3, 1.1, 2.4, 5.9]) {
    const t = transform2d(vec2(0, 0), angle);
    const p = transformPoint(t, vec2(3, 4));
    near(Math.hypot(p.x, p.y), 5, 1e-12, `angle ${angle}`);
  }
});

Deno.test("math/transforms bounds contain all four rotated corners", () => {
  const t = transform2d(vec2(3, -2), 0.7, vec2(1.5, 0.5));
  const bounds = transformBounds(t, { width: 4, height: 2 });
  for (const corner of [vec2(-2, -1), vec2(2, -1), vec2(2, 1), vec2(-2, 1)]) {
    const world = transformPoint(t, corner);
    assert(
      world.x >= bounds.x - 1e-9 && world.x <= bounds.x + bounds.w + 1e-9,
      `corner x ${world.x} outside ${JSON.stringify(bounds)}`,
    );
    assert(
      world.y >= bounds.y - 1e-9 && world.y <= bounds.y + bounds.h + 1e-9,
      `corner y ${world.y} outside ${JSON.stringify(bounds)}`,
    );
  }
});
