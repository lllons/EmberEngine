/**
 * ScriptRegistry and script props: how game behaviour attaches to entities and how JSON
 * props are read safely. Expectations come from the documented registry contract.
 */

import {
  defaultScripts,
  defineScript,
  numberProp,
  prop,
  script,
  ScriptRegistry,
  stringProp,
} from "@ember/runtime";
import { assert, assertEqual, assertThrows, table } from "../../harness.ts";

/** One created behaviour, recorded so assertions can inspect what the factory received. */
interface Creation {
  tag: string;
  entity: number;
  props: Record<string, unknown>;
}

function loggingFactory(tag: string, log: Creation[]) {
  return (props: Record<string, unknown>, entity: number) => {
    log.push({ tag, entity, props });
    return { update: () => {} };
  };
}

Deno.test("runtime/scripting define registers, chains and reports size", () => {
  const registry = new ScriptRegistry();
  assertEqual(registry.size, 0, "empty");
  const returned = registry.define("patrol", loggingFactory("patrol", []));
  assert(returned === registry, "define returns the registry");
  assertEqual(registry.size, 1, "size after define");
  assert(registry.has("patrol"), "has");
  assert(!registry.has("missing"), "has is false for unknown names");
  assertEqual(registry.names(), ["patrol"], "names");
});

Deno.test("runtime/scripting define rejects a duplicate name", () => {
  const registry = new ScriptRegistry().define("patrol", loggingFactory("patrol", []));
  assertThrows(
    () => registry.define("patrol", loggingFactory("other", [])),
    /already defined/,
    "duplicate",
  );
  assertEqual(registry.size, 1, "size unchanged");
});

Deno.test("runtime/scripting define rejects an empty name", () => {
  const registry = new ScriptRegistry();
  assertThrows(
    () => registry.define("", loggingFactory("x", [])),
    /must not be empty/,
    "empty name",
  );
});

Deno.test("runtime/scripting override replaces an existing definition", () => {
  const log: Creation[] = [];
  const registry = new ScriptRegistry().define("patrol", loggingFactory("old", log));
  registry.override("patrol", loggingFactory("new", log));
  assertEqual(registry.size, 1, "no growth");
  registry.create("patrol", {}, 1);
  assertEqual(log.map((entry) => entry.tag), ["new"], "replacement factory is used");
  registry.override("fresh", loggingFactory("fresh", log));
  assertEqual(registry.size, 2, "override also defines");
});

Deno.test("runtime/scripting create builds a behaviour from the factory", () => {
  const log: Creation[] = [];
  const registry = new ScriptRegistry().define("patrol", loggingFactory("patrol", log));
  const behaviour = registry.create("patrol", { value: 7 }, 42);
  assertEqual(log.length, 1, "factory called once");
  assertEqual(log[0].tag, "patrol", "tag");
  assertEqual(log[0].entity, 42, "entity");
  assertEqual(log[0].props, { value: 7 }, "props");
  assertEqual(typeof behaviour.update, "function", "behaviour returned");
});

Deno.test("runtime/scripting create throws for an unknown script", () => {
  const registry = new ScriptRegistry();
  assertThrows(() => registry.create("ghost", {}, 1), /unknown script "ghost"/, "unknown");
});

Deno.test("runtime/scripting names are sorted", () => {
  const registry = new ScriptRegistry()
    .define("zeta", loggingFactory("z", []))
    .define("alpha", loggingFactory("a", []))
    .define("mid", loggingFactory("m", []));
  assertEqual(registry.names(), ["alpha", "mid", "zeta"], "sorted names");
});

Deno.test("runtime/scripting merge lets incoming definitions win", () => {
  const log: Creation[] = [];
  const base = new ScriptRegistry()
    .define("shared", loggingFactory("base", log))
    .define("only-base", loggingFactory("only-base", log));
  const extra = new ScriptRegistry()
    .define("shared", loggingFactory("extra", log))
    .define("only-extra", loggingFactory("only-extra", log));
  base.merge(extra);
  assertEqual(base.size, 3, "union of names");
  base.create("shared", {}, 0);
  assertEqual(log.map((entry) => entry.tag), ["extra"], "incoming definition wins");
  assert(!extra.has("only-base"), "merge is one-way");
});

Deno.test("runtime/scripting factory returns undefined for unknown names", () => {
  const registry = new ScriptRegistry();
  assertEqual(registry.factory("nope"), undefined, "unknown");
  const defined = loggingFactory("x", []);
  registry.define("x", defined);
  assert(registry.factory("x") === defined, "same function");
});

Deno.test("runtime/scripting script() returns the same behaviour object", () => {
  const behaviour = script({ update: () => {} });
  assertEqual(typeof behaviour.update, "function", "update kept");
});

Deno.test("runtime/scripting defineScript writes to the default registry", () => {
  const log: Creation[] = [];
  const before = defaultScripts.size;
  defineScript("test-only-script", loggingFactory("test", log));
  assert(defaultScripts.size >= before, "default registry grew");
  assert(defaultScripts.has("test-only-script"), "definition is visible");
  defaultScripts.create("test-only-script", {}, 3);
  assertEqual(log[0].entity, 3, "usable through the default registry");
});

Deno.test("runtime/scripting defineScript can target a private registry", () => {
  const log: Creation[] = [];
  const registry = new ScriptRegistry();
  defineScript("private", loggingFactory("p", log), registry);
  assertEqual(registry.size, 1, "private registry");
  assert(!defaultScripts.has("private"), "default registry untouched");
});

table(
  "runtime/scripting prop enforces the fallback's type",
  [
    { label: "number passes", props: { speed: 12 }, key: "speed", fallback: 1, expected: 12 },
    {
      label: "string for a number falls back",
      props: { speed: "12" },
      key: "speed",
      fallback: 1,
      expected: 1,
    },
    { label: "missing key falls back", props: {}, key: "speed", fallback: 1, expected: 1 },
    { label: "null falls back", props: { speed: null }, key: "speed", fallback: 1, expected: 1 },
    {
      label: "string passes",
      props: { mode: "idle" },
      key: "mode",
      fallback: "run",
      expected: "idle",
    },
    {
      label: "number for a string falls back",
      props: { mode: 3 },
      key: "mode",
      fallback: "run",
      expected: "run",
    },
    {
      label: "boolean passes",
      props: { flag: false },
      key: "flag",
      fallback: true,
      expected: false,
    },
  ] as const,
  (row) => {
    assertEqual(prop(row.props, row.key, row.fallback), row.expected, row.label);
  },
);

table(
  "runtime/scripting numberProp accepts only finite numbers",
  [
    { label: "finite", props: { x: 2.5 }, expected: 2.5 },
    { label: "zero", props: { x: 0 }, expected: 0 },
    { label: "negative", props: { x: -4 }, expected: -4 },
    { label: "NaN", props: { x: Number.NaN }, expected: 9 },
    { label: "Infinity", props: { x: Number.POSITIVE_INFINITY }, expected: 9 },
    { label: "string", props: { x: "2.5" }, expected: 9 },
    { label: "missing", props: {}, expected: 9 },
  ] as const,
  (row) => {
    assertEqual(numberProp(row.props, "x", 9), row.expected, row.label);
  },
);

table(
  "runtime/scripting stringProp accepts only strings",
  [
    { label: "string", props: { s: "go" }, expected: "go" },
    { label: "empty string is kept", props: { s: "" }, expected: "" },
    { label: "number", props: { s: 1 }, expected: "fallback" },
    { label: "object", props: { s: {} }, expected: "fallback" },
    { label: "missing", props: {}, expected: "fallback" },
  ] as const,
  (row) => {
    assertEqual(stringProp(row.props, "s", "fallback"), row.expected, row.label);
  },
);
