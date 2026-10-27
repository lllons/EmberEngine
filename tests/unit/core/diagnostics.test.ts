/**
 * @ember/core/diagnostics — log records, counters and frame-stat formatting.
 */

import { assert, assertEquals } from "@std/assert";
import { type LogRecord, Diagnostics, formatFrameStats } from "@ember/core";

Deno.test("Diagnostics records messages at or above the minimum level", () => {
  const diagnostics = new Diagnostics({ minLevel: "info" });
  assertEquals(diagnostics.debug("hidden"), null);
  assert(diagnostics.info("kept") !== null);
  assert(diagnostics.warn("kept") !== null);
  assert(diagnostics.error("kept") !== null);
  assertEquals(diagnostics.records.length, 3);
});

Deno.test("Diagnostics minLevel debug keeps everything", () => {
  const diagnostics = new Diagnostics({ minLevel: "debug" });
  diagnostics.debug("d");
  diagnostics.info("i");
  assertEquals(diagnostics.records.length, 2);
});

Deno.test("Diagnostics minLevel error drops warnings", () => {
  const diagnostics = new Diagnostics({ minLevel: "error" });
  diagnostics.warn("dropped");
  diagnostics.error("kept");
  assertEquals(diagnostics.records.length, 1);
  assertEquals(diagnostics.records[0].level, "error");
});

Deno.test("Diagnostics numbers records monotonically from 1", () => {
  const diagnostics = new Diagnostics();
  diagnostics.info("first");
  diagnostics.info("second");
  diagnostics.info("third");
  assertEquals(diagnostics.records.map((record) => record.sequence), [1, 2, 3]);
  assertEquals(diagnostics.sequence, 3);
});

Deno.test("Diagnostics keeps structured data with the record", () => {
  const diagnostics = new Diagnostics();
  const record = diagnostics.info("scene changed", { to: "level-2", attempt: 3 })!;
  assertEquals(record.data, { to: "level-2", attempt: 3 });
});

Deno.test("Diagnostics ring buffer drops the oldest records at capacity", () => {
  const diagnostics = new Diagnostics({ capacity: 3 });
  for (let i = 1; i <= 5; i++) diagnostics.info(`message ${i}`);
  assertEquals(diagnostics.records.length, 3);
  assertEquals(diagnostics.records.map((record) => record.message), [
    "message 3",
    "message 4",
    "message 5",
  ]);
});

Deno.test("Diagnostics capacity of 0 is treated as 1", () => {
  const diagnostics = new Diagnostics({ capacity: 0 });
  diagnostics.info("a");
  diagnostics.info("b");
  assertEquals(diagnostics.records.length, 1);
});

Deno.test("Diagnostics count and byLevel filter records", () => {
  const diagnostics = new Diagnostics({ minLevel: "debug" });
  diagnostics.debug("d");
  diagnostics.info("i");
  diagnostics.warn("w");
  diagnostics.error("e");
  diagnostics.error("e2");
  assertEquals(diagnostics.count("error"), 2);
  assertEquals(diagnostics.byLevel("warn").map((record) => record.message), ["w"]);
  assertEquals(diagnostics.count("debug"), 1);
});

Deno.test("Diagnostics lastMessage is undefined with no records", () => {
  const diagnostics = new Diagnostics();
  assertEquals(diagnostics.lastMessage(), undefined);
  diagnostics.info("only");
  assertEquals(diagnostics.lastMessage(), "only");
});

Deno.test("Diagnostics toLines renders level, message and data", () => {
  const diagnostics = new Diagnostics();
  diagnostics.info("plain");
  diagnostics.warn("with data", { entity: 4 });
  assertEquals(diagnostics.toLines(), [
    "[info] plain",
    "[warn] with data {\"entity\":4}",
  ]);
});

Deno.test("Diagnostics counters accumulate and can be read back", () => {
  const diagnostics = new Diagnostics();
  assertEquals(diagnostics.getCounter("collisions"), 0);
  diagnostics.increment("collisions");
  diagnostics.increment("collisions", 4);
  assertEquals(diagnostics.getCounter("collisions"), 5);
  diagnostics.resetCounters();
  assertEquals(diagnostics.getCounter("collisions"), 0);
});

Deno.test("Diagnostics increment returns the new value", () => {
  const diagnostics = new Diagnostics();
  assertEquals(diagnostics.increment("frames"), 1);
  assertEquals(diagnostics.increment("frames", 9), 10);
});

Deno.test("Diagnostics listeners receive records and can unsubscribe", () => {
  const diagnostics = new Diagnostics();
  const seen: string[] = [];
  const unsubscribe = diagnostics.onRecord((record) => seen.push(record.message));
  diagnostics.info("first");
  unsubscribe();
  diagnostics.info("second");
  assertEquals(seen, ["first"]);
});

Deno.test("Diagnostics sink receives records as well as listeners", () => {
  const sunk: LogRecord[] = [];
  const diagnostics = new Diagnostics({ sink: (record) => sunk.push(record) });
  diagnostics.info("sunk");
  assertEquals(sunk.length, 1);
  assertEquals(sunk[0].message, "sunk");
});

Deno.test("Diagnostics setSink can replace and clear the sink", () => {
  const first: string[] = [];
  const diagnostics = new Diagnostics({ sink: (record) => first.push(record.message) });
  diagnostics.info("one");
  diagnostics.setSink(undefined);
  diagnostics.info("two");
  assertEquals(first, ["one"]);
});

Deno.test("Diagnostics listeners are not called for dropped records", () => {
  const diagnostics = new Diagnostics({ minLevel: "warn" });
  let calls = 0;
  diagnostics.onRecord(() => calls++);
  diagnostics.info("dropped");
  diagnostics.warn("kept");
  assertEquals(calls, 1);
});

Deno.test("Diagnostics.clear empties records and counters but not the sequence", () => {
  const diagnostics = new Diagnostics();
  diagnostics.info("one");
  diagnostics.increment("x");
  diagnostics.clear();
  assertEquals(diagnostics.records.length, 0);
  assertEquals(diagnostics.getCounter("x"), 0);
  assertEquals(diagnostics.sequence, 1);
  diagnostics.info("two");
  assertEquals(diagnostics.records[0].sequence, 2);
});

Deno.test("Diagnostics logs a timestamp when one is supplied", () => {
  const diagnostics = new Diagnostics();
  const record = diagnostics.log("info", "timed", undefined, 12.5)!;
  assertEquals(record.time, 12.5);
});

Deno.test("Diagnostics defaults to info level and 500 records", () => {
  const diagnostics = new Diagnostics();
  assertEquals(diagnostics.minLevel, "info");
  assertEquals(diagnostics.capacity, 500);
});

Deno.test("formatFrameStats renders every field", () => {
  const line = formatFrameStats({
    frame: 12,
    time: 1.25,
    lastSteps: 1,
    entityCount: 42,
    drawCommands: 17,
    fps: 59.6,
  });
  assertEquals(
    line,
    "frame=12 t=1.25s steps=1 entities=42 draws=17 fps=60",
  );
});

Deno.test("formatFrameStats handles zero values", () => {
  const line = formatFrameStats({ frame: 0, time: 0, lastSteps: 0, entityCount: 0, drawCommands: 0, fps: 0 });
  assertEquals(line, "frame=0 t=0.00s steps=0 entities=0 draws=0 fps=0");
});

Deno.test("Diagnostics survives a long run without unbounded growth", () => {
  const diagnostics = new Diagnostics({ capacity: 50 });
  for (let i = 0; i < 5000; i++) diagnostics.info(`line ${i}`);
  assertEquals(diagnostics.records.length, 50);
  assertEquals(diagnostics.records.at(-1)!.message, "line 4999");
});

Deno.test("a diagnostics instance is usable with no options at all", () => {
  const diagnostics = new Diagnostics();
  assert(diagnostics.error("plain error") !== null);
  assertEquals(diagnostics.records.length, 1);
  assertEquals(diagnostics.log("debug", "dropped"), null);
});
