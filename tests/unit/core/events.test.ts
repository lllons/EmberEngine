/**
 * @ember/core/events — the in-frame event bus and its queue.
 */

import { assert, assertEquals } from "@std/assert";
import { EventBus, EventQueue } from "@ember/core";

interface Events extends Record<string, unknown> {
  tick: { frame: number };
  hit: { entity: number; damage: number };
  plain: undefined;
}

Deno.test("EventBus delivers to a single listener", () => {
  const bus = new EventBus<Events>();
  const seen: number[] = [];
  bus.on("tick", (payload) => seen.push(payload.frame));
  assertEquals(bus.emit("tick", { frame: 1 }), 1);
  assertEquals(seen, [1]);
});

Deno.test("EventBus delivers to every listener in registration order", () => {
  const bus = new EventBus<Events>();
  const order: string[] = [];
  bus.on("tick", () => order.push("first"));
  bus.on("tick", () => order.push("second"));
  bus.on("tick", () => order.push("third"));
  assertEquals(bus.emit("tick", { frame: 0 }), 3);
  assertEquals(order, ["first", "second", "third"]);
});

Deno.test("EventBus emit returns 0 with no listeners", () => {
  const bus = new EventBus<Events>();
  assertEquals(bus.emit("tick", { frame: 0 }), 0);
});

Deno.test("EventBus keeps event types separate", () => {
  const bus = new EventBus<Events>();
  let ticks = 0;
  let hits = 0;
  bus.on("tick", () => ticks++);
  bus.on("hit", () => hits++);
  bus.emit("hit", { entity: 1, damage: 2 });
  assertEquals([ticks, hits], [0, 1]);
});

Deno.test("EventBus listenerCount tracks subscriptions per type", () => {
  const bus = new EventBus<Events>();
  assertEquals(bus.listenerCount("tick"), 0);
  bus.on("tick", () => {});
  assertEquals(bus.listenerCount("tick"), 1);
  assertEquals(bus.listenerCount("hit"), 0);
});

Deno.test("EventBus.on returns an unsubscribe handle", () => {
  const bus = new EventBus<Events>();
  let calls = 0;
  const subscription = bus.on("tick", () => calls++);
  bus.emit("tick", { frame: 0 });
  subscription.unsubscribe();
  bus.emit("tick", { frame: 0 });
  assertEquals(calls, 1);
  assertEquals(bus.listenerCount("tick"), 0);
});

Deno.test("EventBus.once fires exactly once", () => {
  const bus = new EventBus<Events>();
  let calls = 0;
  bus.once("tick", () => calls++);
  bus.emit("tick", { frame: 0 });
  bus.emit("tick", { frame: 1 });
  assertEquals(calls, 1);
});

Deno.test("EventBus.once receives the first payload", () => {
  const bus = new EventBus<Events>();
  const seen: number[] = [];
  bus.once("tick", (payload) => seen.push(payload.frame));
  bus.emit("tick", { frame: 7 });
  bus.emit("tick", { frame: 8 });
  assertEquals(seen, [7]);
});

Deno.test("EventBus tolerates unsubscribing during emission", () => {
  const bus = new EventBus<Events>();
  const order: string[] = [];
  const subscription = bus.on("tick", () => order.push("a"));
  bus.on("tick", () => {
    order.push("b");
    subscription.unsubscribe();
  });
  bus.emit("tick", { frame: 0 });
  bus.emit("tick", { frame: 1 });
  assertEquals(order, ["a", "b", "b"]);
});

Deno.test("EventBus ignores listeners added during emission until the next event", () => {
  const bus = new EventBus<Events>();
  let lateCalls = 0;
  bus.on("tick", () => {
    bus.on("tick", () => lateCalls++);
  });
  bus.emit("tick", { frame: 0 });
  assertEquals(lateCalls, 0);
  bus.emit("tick", { frame: 1 });
  assertEquals(lateCalls, 1);
});

Deno.test("EventBus.clear removes one type", () => {
  const bus = new EventBus<Events>();
  bus.on("tick", () => {});
  bus.on("hit", () => {});
  bus.clear("tick");
  assertEquals(bus.listenerCount("tick"), 0);
  assertEquals(bus.listenerCount("hit"), 1);
});

Deno.test("EventBus.clear with no argument removes everything", () => {
  const bus = new EventBus<Events>();
  bus.on("tick", () => {});
  bus.on("hit", () => {});
  bus.clear();
  assertEquals([bus.listenerCount("tick"), bus.listenerCount("hit")], [0, 0]);
});

Deno.test("EventBus handlers may throw without corrupting the bus", () => {
  const bus = new EventBus<Events>();
  let later = 0;
  bus.on("tick", () => {
    throw new Error("boom");
  });
  bus.on("tick", () => later++);
  try {
    bus.emit("tick", { frame: 0 });
  } catch {
    // The throwing handler propagates; the bus itself stays usable.
  }
  assertEquals(bus.listenerCount("tick"), 2);
});

Deno.test("EventBus carries structured payloads unchanged", () => {
  const bus = new EventBus<Events>();
  let received: Events["hit"] | null = null;
  bus.on("hit", (payload) => received = payload);
  const payload = { entity: 12, damage: 3 };
  bus.emit("hit", payload);
  assertEquals(received, payload);
});

Deno.test("EventQueue starts empty", () => {
  const queue = new EventQueue<Events>();
  assertEquals(queue.size, 0);
  const bus = new EventBus<Events>();
  assertEquals(queue.drain(bus), 0);
});

Deno.test("EventQueue drains in push order", () => {
  const queue = new EventQueue<Events>();
  const bus = new EventBus<Events>();
  const seen: number[] = [];
  bus.on("tick", (payload) => seen.push(payload.frame));
  queue.push("tick", { frame: 1 });
  queue.push("tick", { frame: 2 });
  assertEquals(queue.size, 2);
  assertEquals(queue.drain(bus), 2);
  assertEquals(seen, [1, 2]);
  assertEquals(queue.size, 0);
});

Deno.test("EventQueue drain is idempotent when already empty", () => {
  const queue = new EventQueue<Events>();
  const bus = new EventBus<Events>();
  bus.on("tick", () => {});
  queue.push("tick", { frame: 1 });
  assertEquals(queue.drain(bus), 1);
  assertEquals(queue.drain(bus), 0);
});

Deno.test("EventQueue keeps types distinct when draining", () => {
  const queue = new EventQueue<Events>();
  const bus = new EventBus<Events>();
  const order: string[] = [];
  bus.on("tick", () => order.push("tick"));
  bus.on("hit", () => order.push("hit"));
  queue.push("hit", { entity: 1, damage: 1 });
  queue.push("tick", { frame: 1 });
  queue.drain(bus);
  assertEquals(order, ["hit", "tick"]);
});

Deno.test("EventQueue: events pushed while draining wait for the next drain", () => {
  const queue = new EventQueue<Events>();
  const bus = new EventBus<Events>();
  let depth = 0;
  bus.on("tick", (payload) => {
    depth++;
    if (payload.frame === 1) queue.push("tick", { frame: 2 });
  });
  queue.push("tick", { frame: 1 });
  queue.drain(bus);
  assertEquals(depth, 1);
  assertEquals(queue.size, 1);
  queue.drain(bus);
  assertEquals(depth, 2);
});

Deno.test("EventQueue holds many events without loss", () => {
  const queue = new EventQueue<Events>();
  const bus = new EventBus<Events>();
  let total = 0;
  bus.on("hit", (payload) => total += payload.damage);
  for (let i = 0; i < 100; i++) queue.push("hit", { entity: i, damage: 1 });
  assertEquals(queue.drain(bus), 100);
  assertEquals(total, 100);
});
