/** Diagnostics: level filtering, ring buffer, counters and formatting. */

import { Diagnostics, formatFrameStats, type LogRecord } from "@ember/core";
import { assert, assertEqual, near, table } from "../harness.ts";

Deno.test("diagnostics/default level is info", () => {
  const diagnostics = new Diagnostics();
  assertEqual(diagnostics.log("debug", "hidden"), null, "debug is filtered");
  const info = diagnostics.log("info", "kept");
  assert(info !== null, "info is kept");
  assertEqual(info!.level, "info", "level");
});

table("diagnostics/minLevel", [
  { label: "debug allowed", minLevel: "debug" as const, level: "debug" as const, kept: true },
  { label: "info filtered by warn", minLevel: "warn" as const, level: "info" as const, kept: false },
  { label: "warn kept", minLevel: "warn" as const, level: "warn" as const, kept: true },
  { label: "error kept", minLevel: "error" as const, level: "error" as const, kept: true },
  { label: "warn filtered by error", minLevel: "error" as const, level: "warn" as const, kept: false },
] as const, (row) => {
  const diagnostics = new Diagnostics({ minLevel: row.minLevel });
  const record = diagnostics.log(row.level, "message");
  assertEqual(record !== null, row.kept, row.label);
});

Deno.test("diagnostics/sequence numbers start at one and increase", () => {
  const diagnostics = new Diagnostics();
  const first = diagnostics.info("a")!;
  const second = diagnostics.info("b")!;
  assertEqual(first.sequence, 1, "first sequence");
  assertEqual(second.sequence, 2, "second sequence");
  assertEqual(diagnostics.sequence, 2, "sequence getter");
});

Deno.test("diagnostics/records carry time and data", () => {
  const diagnostics = new Diagnostics();
  const record = diagnostics.log("warn", "careful", { entity: 7 }, 1.5)!;
  assertEqual(record.time, 1.5, "time");
  assertEqual(record.data, { entity: 7 }, "data");
});

Deno.test("diagnostics/capacity drops the oldest records", () => {
  const diagnostics = new Diagnostics({ capacity: 3 });
  for (const message of ["a", "b", "c", "d", "e"]) diagnostics.info(message);
  assertEqual(diagnostics.records.length, 3, "record count");
  assertEqual(diagnostics.records.map((record) => record.message), ["c", "d", "e"]);
});

Deno.test("diagnostics/capacity is at least one", () => {
  const diagnostics = new Diagnostics({ capacity: 0 });
  diagnostics.info("a");
  diagnostics.info("b");
  assertEqual(diagnostics.records.length, 1, "capacity clamped to 1");
});

Deno.test("diagnostics/counters increment and reset", () => {
  const diagnostics = new Diagnostics();
  assertEqual(diagnostics.getCounter("draws"), 0, "default");
  assertEqual(diagnostics.increment("draws"), 1, "first increment");
  assertEqual(diagnostics.increment("draws", 5), 6, "amount");
  assertEqual(diagnostics.getCounter("draws"), 6, "read back");
  diagnostics.resetCounters();
  assertEqual(diagnostics.getCounter("draws"), 0, "reset");
});

Deno.test("diagnostics/count and byLevel filter by level", () => {
  const diagnostics = new Diagnostics({ minLevel: "debug" });
  diagnostics.debug("d");
  diagnostics.info("i");
  diagnostics.warn("w");
  diagnostics.error("e");
  diagnostics.warn("w2");
  assertEqual(diagnostics.count("warn"), 2, "warn count");
  assertEqual(diagnostics.count("error"), 1, "error count");
  assertEqual(diagnostics.byLevel("warn").map((record) => record.message), ["w", "w2"]);
});

table("diagnostics/lastMessage", [
  { label: "empty", messages: [] as string[], expected: undefined },
  { label: "one", messages: ["only"], expected: "only" },
  { label: "several", messages: ["a", "b"], expected: "b" },
] as const, (row) => {
  const diagnostics = new Diagnostics();
  for (const message of row.messages) diagnostics.info(message);
  assertEqual(diagnostics.lastMessage(), row.expected, row.label);
});

Deno.test("diagnostics/toLines renders level, message and data", () => {
  const diagnostics = new Diagnostics();
  diagnostics.info("started");
  diagnostics.warn("slow frame", { ms: 32 });
  assertEqual(diagnostics.toLines(), [
    "[info] started",
    '[warn] slow frame {"ms":32}',
  ]);
});

Deno.test("diagnostics/clear empties records and counters but keeps the sequence", () => {
  const diagnostics = new Diagnostics();
  diagnostics.info("a");
  diagnostics.increment("hits");
  diagnostics.clear();
  assertEqual(diagnostics.records.length, 0, "records");
  assertEqual(diagnostics.getCounter("hits"), 0, "counters");
  assertEqual(diagnostics.sequence, 1, "sequence keeps counting");
  assertEqual(diagnostics.lastMessage(), undefined, "no last message");
});

Deno.test("diagnostics/onRecord delivers and can be removed", () => {
  const diagnostics = new Diagnostics();
  const seen: LogRecord[] = [];
  const unsubscribe = diagnostics.onRecord((record) => seen.push(record));
  diagnostics.info("first");
  unsubscribe();
  diagnostics.info("second");
  assertEqual(seen.map((record) => record.message), ["first"]);
});

Deno.test("diagnostics/sink receives every kept record", () => {
  const sunk: string[] = [];
  const diagnostics = new Diagnostics({ sink: (record) => sunk.push(record.message) });
  diagnostics.info("one");
  diagnostics.log("debug", "filtered");
  diagnostics.error("two");
  assertEqual(sunk, ["one", "two"]);
});

Deno.test("diagnostics/setSink can replace the sink", () => {
  const diagnostics = new Diagnostics();
  const sunk: string[] = [];
  diagnostics.setSink((record) => sunk.push(record.message));
  diagnostics.info("hello");
  diagnostics.setSink(undefined);
  diagnostics.info("ignored");
  assertEqual(sunk, ["hello"]);
});

table("diagnostics/formatFrameStats", [
  {
    label: "renders every field",
    stats: { frame: 12, time: 0.5, lastSteps: 2, entityCount: 7, drawCommands: 9, fps: 60 },
    expected: "frame=12 t=0.50s steps=2 entities=7 draws=9 fps=60",
  },
  {
    label: "rounds fps",
    stats: { frame: 1, time: 0, lastSteps: 1, entityCount: 0, drawCommands: 0, fps: 59.6 },
    expected: "frame=1 t=0.00s steps=1 entities=0 draws=0 fps=60",
  },
] as const, (row) => assertEqual(formatFrameStats(row.stats), row.expected, row.label));

Deno.test("diagnostics/time in log records is optional and defaults to zero", () => {
  const diagnostics = new Diagnostics();
  const record = diagnostics.info("immediate")!;
  near(record.time, 0, 0, "time");
  assert(record.data === undefined, "no data unless provided");
});
