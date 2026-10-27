/**
 * @ember/core/rng — determinism guarantees the whole engine leans on.
 */

import { assert, assertAlmostEquals, assertEquals, assertNotEquals } from "@std/assert";
import { createRng, hashSeed } from "@ember/core";

Deno.test("createRng: same seed produces the same sequence", () => {
  const a = createRng(12345);
  const b = createRng(12345);
  for (let i = 0; i < 200; i++) assertEquals(a.next(), b.next());
});

Deno.test("createRng: different seeds diverge", () => {
  const a = createRng(1);
  const b = createRng(2);
  let differences = 0;
  for (let i = 0; i < 50; i++) if (a.next() !== b.next()) differences++;
  assert(differences > 40, "expected nearly every draw to differ");
});

Deno.test("createRng: string seeds agree with their hash", () => {
  const fromString = createRng("ember-runner");
  const fromHash = createRng(hashSeed("ember-runner"));
  for (let i = 0; i < 20; i++) assertEquals(fromString.next(), fromHash.next());
});

Deno.test("hashSeed: stable, deterministic and spread", () => {
  assertEquals(hashSeed("a"), hashSeed("a"));
  assertNotEquals(hashSeed("a"), hashSeed("b"));
  assert(hashSeed("") >= 0);
  const values = new Set(["a", "b", "level-1", "level-2", "x", "y"].map(hashSeed));
  assertEquals(values.size, 6);
});

Deno.test("next returns 32-bit unsigned integers", () => {
  const rng = createRng(7);
  for (let i = 0; i < 500; i++) {
    const value = rng.next();
    assert(Number.isInteger(value), `not an integer: ${value}`);
    assert(value >= 0 && value <= 0xffffffff, `out of range: ${value}`);
  }
});

Deno.test("float stays within the requested bounds", () => {
  const rng = createRng("bounds");
  for (let i = 0; i < 500; i++) {
    const value = rng.float(10, 20);
    assert(value >= 10 && value < 20, `float out of range: ${value}`);
  }
});

Deno.test("float default range is [0, 1)", () => {
  const rng = createRng(99);
  for (let i = 0; i < 500; i++) {
    const value = rng.float();
    assert(value >= 0 && value < 1);
  }
});

Deno.test("float covers the range roughly uniformly", () => {
  const rng = createRng("uniform");
  const buckets = [0, 0, 0, 0];
  for (let i = 0; i < 4000; i++) buckets[Math.floor(rng.float(0, 4))]++;
  for (const count of buckets) {
    assert(count > 800 && count < 1200, `bucket ${count} is not uniform enough`);
  }
});

Deno.test("int is inclusive on both ends", () => {
  const rng = createRng("int");
  const seen = new Set<number>();
  for (let i = 0; i < 400; i++) {
    const value = rng.int(3, 6);
    assert(Number.isInteger(value));
    assert(value >= 3 && value <= 6, `int out of range: ${value}`);
    seen.add(value);
  }
  assertEquals([...seen].sort(), [3, 4, 5, 6]);
});

Deno.test("int with a single-value range always returns that value", () => {
  const rng = createRng(5);
  for (let i = 0; i < 20; i++) assertEquals(rng.int(4, 4), 4);
});

Deno.test("int swaps inverted bounds", () => {
  const rng = createRng(6);
  for (let i = 0; i < 50; i++) {
    const value = rng.int(10, 2);
    assert(value >= 2 && value <= 10);
  }
});

Deno.test("chance honours the extremes exactly", () => {
  const rng = createRng("chance");
  for (let i = 0; i < 50; i++) {
    assert(!rng.chance(0));
    assert(rng.chance(1));
  }
});

Deno.test("chance approximates its probability", () => {
  const rng = createRng("probability");
  let hits = 0;
  for (let i = 0; i < 4000; i++) if (rng.chance(0.25)) hits++;
  assert(hits > 850 && hits < 1150, `expected ~1000 hits, got ${hits}`);
});

Deno.test("pick returns undefined only for an empty list", () => {
  const rng = createRng("pick");
  assertEquals(rng.pick([]), undefined);
  assertEquals(rng.pick(["only"]), "only");
  const items = ["a", "b", "c"];
  for (let i = 0; i < 50; i++) assert(items.includes(rng.pick(items)!));
});

Deno.test("shuffle keeps every element and does not mutate the input", () => {
  const rng = createRng("shuffle");
  const source = [1, 2, 3, 4, 5, 6, 7, 8];
  const shuffled = rng.shuffle(source);
  assertEquals([...source], [1, 2, 3, 4, 5, 6, 7, 8]);
  assertEquals([...shuffled].sort((a, b) => a - b), [...source]);
});

Deno.test("shuffle actually reorders", () => {
  const rng = createRng("reorder");
  const source = Array.from({ length: 12 }, (_, index) => index);
  let reordered = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const shuffled = rng.shuffle(source);
    if (shuffled.some((value, index) => value !== source[index])) reordered++;
  }
  assert(reordered >= 4, "shuffle should almost always reorder");
});

Deno.test("state advances and can seed an identical generator", () => {
  const rng = createRng(3);
  const before = rng.state();
  rng.next();
  const after = rng.state();
  assertNotEquals(before, after);
  const clone = createRng(after);
  assertEquals(clone.next(), createRng(rng.state()).next());
});

Deno.test("fork is independent of its parent", () => {
  const parent = createRng("fork");
  const child = parent.fork();
  const expected = child.next();
  const freshChild = createRng("fork").fork();
  assertEquals(expected, freshChild.next());
  // Advancing the parent does not change the child's future draws.
  const childSecond = child.next();
  const freshSecond = freshChild.next();
  assertEquals(childSecond, freshSecond);
  parent.next();
  assertEquals(child.next(), freshChild.next());
});

Deno.test("determinism: identical seeds replay identical float sequences", () => {
  const a = createRng("level-1");
  const b = createRng("level-1");
  const runA = Array.from({ length: 50 }, () => a.float(-10, 10));
  const runB = Array.from({ length: 50 }, () => b.float(-10, 10));
  assertEquals(runA, runB);
});

Deno.test("float bounds work with negative ranges", () => {
  const rng = createRng("negative");
  for (let i = 0; i < 200; i++) {
    const value = rng.float(-5, -1);
    assert(value >= -5 && value < -1);
  }
});

Deno.test("average of float draws converges to the range midpoint", () => {
  const rng = createRng("mean");
  let total = 0;
  const draws = 5000;
  for (let i = 0; i < draws; i++) total += rng.float(0, 10);
  assertAlmostEquals(total / draws, 5, 0.2);
});
