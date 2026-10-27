/** Events: delivery counts, ordering, unsubscription and the in-frame queue. */

import { EventBus, EventQueue } from "@ember/core";
import { assert, assertEqual, table } from "../harness.ts";

interface TestEvents {
  ping: number;
  move: { x: number; y: number };
  [key: string]: unknown;
}

Deno.test("events/emit with no listeners delivers nothing", () => {
  const bus = new EventBus<TestEvents>();
  assertEqual(bus.emit("ping", 1), 0, "delivered");
});

table("events/emit counts listeners", [
  { label: "one listener", listeners: 1, delivered: 1 },
  { label: "three listeners", listeners: 3, delivered: 3 },
  { label: "no listeners", listeners: 0, delivered: 0 },
] as const, (row) => {
  const bus = new EventBus<TestEvents>();
  let total = 0;
  for (let i = 0; i < row.listeners; i++) bus.on("ping", (value) => (total += value));
  assertEqual(bus.emit("ping", 2), row.delivered, "delivered count");
  assertEqual(total, row.delivered * 2, "payload received");
});

Deno.test("events/listeners run in registration order", () => {
  const bus = new EventBus<TestEvents>();
  const order: string[] = [];
  bus.on("ping", () => order.push("first"));
  bus.on("ping", () => order.push("second"));
  bus.on("ping", () => order.push("third"));
  bus.emit("ping", 1);
  assertEqual(order, ["first", "second", "third"]);
});

Deno.test("events/payloads are forwarded unchanged", () => {
  const bus = new EventBus<TestEvents>();
  const seen: Array<{ x: number; y: number }> = [];
  bus.on("move", (payload) => seen.push(payload));
  const payload = { x: 3, y: 4 };
  bus.emit("move", payload);
  assert(seen[0] === payload, "the same object must arrive");
});

Deno.test("events/unsubscribe stops delivery", () => {
  const bus = new EventBus<TestEvents>();
  let hits = 0;
  const subscription = bus.on("ping", () => hits++);
  bus.emit("ping", 1);
  subscription.unsubscribe();
  bus.emit("ping", 1);
  assertEqual(hits, 1, "hits");
  assertEqual(bus.listenerCount("ping"), 0, "listenerCount");
});

Deno.test("events/once fires exactly once", () => {
  const bus = new EventBus<TestEvents>();
  let hits = 0;
  bus.once("ping", () => hits++);
  bus.emit("ping", 1);
  bus.emit("ping", 1);
  bus.emit("ping", 1);
  assertEqual(hits, 1, "hits");
  assertEqual(bus.listenerCount("ping"), 0, "listener removed after firing");
});

Deno.test("events/a listener added during emit is not called for that emit", () => {
  const bus = new EventBus<TestEvents>();
  let lateHits = 0;
  bus.on("ping", () => {
    bus.on("ping", () => lateHits++);
  });
  bus.emit("ping", 1);
  assertEqual(lateHits, 0, "late listener must wait for the next emit");
  bus.emit("ping", 1);
  assert(lateHits > 0, "late listener fires on the following emit");
});

Deno.test("events/clear can target one event or everything", () => {
  const bus = new EventBus<TestEvents>();
  bus.on("ping", () => {});
  bus.on("move", () => {});
  bus.clear("ping");
  assertEqual(bus.listenerCount("ping"), 0, "targeted clear");
  assertEqual(bus.listenerCount("move"), 1, "other events untouched");
  bus.clear();
  assertEqual(bus.listenerCount("move"), 0, "full clear");
});

Deno.test("events/queue buffers until drained", () => {
  const queue = new EventQueue<TestEvents>();
  assertEqual(queue.size, 0, "starts empty");
  queue.push("ping", 1);
  queue.push("ping", 2);
  assertEqual(queue.size, 2, "size");
  const bus = new EventBus<TestEvents>();
  const received: number[] = [];
  bus.on("ping", (value) => received.push(value));
  assertEqual(queue.drain(bus), 2, "drained count");
  assertEqual(received, [1, 2], "delivery order");
  assertEqual(queue.size, 0, "queue is empty after drain");
});

Deno.test("events/draining an empty queue is a no-op", () => {
  const queue = new EventQueue<TestEvents>();
  const bus = new EventBus<TestEvents>();
  assertEqual(queue.drain(bus), 0, "drained count");
});

Deno.test("events/drain delivers multiple event types", () => {
  const queue = new EventQueue<TestEvents>();
  const bus = new EventBus<TestEvents>();
  const log: string[] = [];
  bus.on("ping", () => log.push("ping"));
  bus.on("move", () => log.push("move"));
  queue.push("ping", 1);
  queue.push("move", { x: 0, y: 0 });
  assertEqual(queue.drain(bus), 2, "drained count");
  assertEqual(log, ["ping", "move"]);
});
