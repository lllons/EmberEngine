/** RNG: reproducibility, ranges and distribution properties of a seeded generator. */

import { createRng, hashSeed } from "@ember/core";
import { assert, assertEqual, near, table } from "../harness.ts";

table("rng/determinism", [
  { label: "same numeric seed", a: 1, b: 1 },
  { label: "same large seed", a: 4294967295, b: 4294967295 },
  { label: "same string seed", a: "ember-runner", b: "ember-runner" },
  { label: "same zero seed", a: 0, b: 0 },
] as const, (row) => {
  const left = createRng(row.a);
  const right = createRng(row.b);
  const leftSequence = Array.from({ length: 10 }, () => left.next());
  const rightSequence = Array.from({ length: 10 }, () => right.next());
  assertEqual(leftSequence, rightSequence, "sequences");
});

table("rng/divergence", [
  { label: "seed 1 vs 2", a: 1, b: 2 },
  { label: "seed 0 vs 1", a: 0, b: 1 },
  { label: "string seeds differ", a: "alpha", b: "beta" },
  { label: "numeric vs string", a: 7, b: "7" },
] as const, (row) => {
  const left = createRng(row.a);
  const right = createRng(row.b);
  const leftSequence = Array.from({ length: 8 }, () => left.next());
  const rightSequence = Array.from({ length: 8 }, () => right.next());
  assert(
    leftSequence.some((value, index) => value !== rightSequence[index]),
    `seeds produced identical sequences: ${leftSequence}`,
  );
});

Deno.test("rng/next returns unsigned 32-bit integers", () => {
  const rng = createRng(42);
  for (let i = 0; i < 500; i++) {
    const value = rng.next();
    assert(Number.isInteger(value), `not an integer: ${value}`);
    assert(value >= 0 && value <= 4294967295, `out of range: ${value}`);
  }
});

table("rng/float stays in range", [
  { label: "default range", min: 0, max: 1 },
  { label: "positive range", min: 10, max: 20 },
  { label: "negative range", min: -5, max: -1 },
  { label: "crossing zero", min: -2, max: 2 },
  { label: "narrow range", min: 0.25, max: 0.26 },
] as const, (row) => {
  const rng = createRng(`float-${row.label}`);
  for (let i = 0; i < 300; i++) {
    const value = rng.float(row.min, row.max);
    assert(value >= row.min && value < row.max, `${value} outside [${row.min}, ${row.max})`);
  }
});

Deno.test("rng/float default arguments cover [0, 1)", () => {
  const rng = createRng(9);
  let sawLow = false;
  let sawHigh = false;
  for (let i = 0; i < 500; i++) {
    const value = rng.float();
    assert(value >= 0 && value < 1, `out of range: ${value}`);
    if (value < 0.2) sawLow = true;
    if (value > 0.8) sawHigh = true;
  }
  assert(sawLow && sawHigh, "distribution never reached both ends");
});

table("rng/int is inclusive", [
  { label: "0..1", min: 0, max: 1 },
  { label: "1..6", min: 1, max: 6 },
  { label: "-3..3", min: -3, max: 3 },
  { label: "single value", min: 4, max: 4 },
  { label: "swapped arguments", min: 10, max: 2 },
] as const, (row) => {
  const rng = createRng(`int-${row.label}`);
  const low = Math.min(row.min, row.max);
  const high = Math.max(row.min, row.max);
  const seen = new Set<number>();
  for (let i = 0; i < 400; i++) {
    const value = rng.int(row.min, row.max);
    assert(Number.isInteger(value), `not an integer: ${value}`);
    assert(value >= low && value <= high, `${value} outside [${low}, ${high}]`);
    seen.add(value);
  }
  for (let value = low; value <= high; value++) {
    assert(seen.has(value), `range [${low}, ${high}] never produced ${value}`);
  }
});

table("rng/chance boundaries", [
  { label: "zero never fires", p: 0, expected: false },
  { label: "negative never fires", p: -1, expected: false },
  { label: "one always fires", p: 1, expected: true },
  { label: "above one always fires", p: 4, expected: true },
] as const, (row) => {
  const rng = createRng(`chance-${row.label}`);
  for (let i = 0; i < 100; i++) assertEqual(rng.chance(row.p), row.expected, row.label);
});

Deno.test("rng/chance(0.5) produces both outcomes", () => {
  const rng = createRng("half");
  let trues = 0;
  const draws = 2000;
  for (let i = 0; i < draws; i++) if (rng.chance(0.5)) trues++;
  assert(trues > draws * 0.4 && trues < draws * 0.6, `bias too strong: ${trues}/${draws}`);
});

Deno.test("rng/pick returns undefined only for an empty list", () => {
  const rng = createRng("pick");
  assertEqual(rng.pick([]), undefined, "empty pick");
  assertEqual(rng.pick(["only"]), "only", "single pick");
  const items = ["a", "b", "c"];
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const value = rng.pick(items);
    assert(value !== undefined && items.includes(value), `pick returned ${value}`);
    seen.add(value);
  }
  assertEqual([...seen].sort(), ["a", "b", "c"], "every item must be reachable");
});

Deno.test("rng/shuffle is a deterministic permutation", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const snapshot = [...items];
  const first = createRng("shuffle").shuffle(items);
  const second = createRng("shuffle").shuffle(items);
  assertEqual(first, second, "same seed, same shuffle");
  assertEqual([...first].sort((a, b) => a - b), snapshot, "shuffle must be a permutation");
  assertEqual(items, snapshot, "shuffle must not mutate the input");
});

Deno.test("rng/shuffle can change the order", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const shuffled = createRng("different").shuffle(items);
  assert(
    shuffled.some((value, index) => value !== items[index]),
    `shuffle returned the original order: ${shuffled}`,
  );
});

table("rng/state", [
  { label: "state starts at the seed", seed: 1234, draws: 0 },
  { label: "state after one draw", seed: 99, draws: 1 },
  { label: "state after five draws", seed: 5, draws: 5 },
], (row) => {
  const rng = createRng(row.seed);
  for (let i = 0; i < row.draws; i++) rng.next();
  near(rng.state(), (row.seed + row.draws) >>> 0, 0, "state");
});

Deno.test("rng/fork is independent of the parent", () => {
  const parent = createRng("fork-parent");
  const child = parent.fork();
  const childFirst = child.next();
  for (let i = 0; i < 10; i++) parent.next();
  const sibling = createRng("fork-parent").fork();
  assertEqual(sibling.next(), childFirst, "child output must not depend on parent draws");
});

table("rng/hashSeed", [
  { label: "empty string", input: "" },
  { label: "ascii", input: "ember" },
  { label: "with spaces", input: "ember runner" },
  { label: "unicode", input: "ember-🔥" },
  { label: "long", input: "x".repeat(200) },
] as const, (row) => {
  const first = hashSeed(row.input);
  const second = hashSeed(row.input);
  assertEqual(first, second, "hash must be stable");
  assert(Number.isInteger(first) && first >= 0 && first <= 4294967295, `bad hash ${first}`);
});

Deno.test("rng/hashSeed separates different strings", () => {
  const inputs = ["a", "b", "ab", "ba", "ember", "ember1"];
  const hashes = new Set(inputs.map(hashSeed));
  assertEqual(hashes.size, inputs.length, "collisions between test strings");
});
