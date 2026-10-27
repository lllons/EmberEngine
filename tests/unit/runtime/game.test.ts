/**
 * The `Game` definition: scene registry, start-scene rules, script/system composition,
 * session wiring, services, describe() and loading scenes from disk.
 */

import { Scene, vec2, writeSceneFile } from "@ember/core";
import {
  defaultScripts,
  defineGame,
  defineScript,
  defineSystem,
  Game,
  type GameDefinition,
  RuntimeHost,
  ScriptRegistry,
} from "@ember/runtime";
import { assert, assertEqual, assertThrows, inTempDir, joinPath, near } from "../../harness.ts";

function level(name = "level", x = 0): Scene {
  const scene = new Scene({ name, viewport: { width: 320, height: 240 } });
  scene.createEntity({ name: "player", position: vec2(x, 0) });
  return scene;
}

function definition(overrides: Partial<GameDefinition> = {}): GameDefinition {
  return { id: "test-game", title: "Test Game", scenes: { level: () => level() }, ...overrides };
}

Deno.test("runtime/game requires a non-empty id", () => {
  assertThrows(() => new Game({ id: "", title: "x" }), /game id must not be empty/, "id");
});

Deno.test("runtime/game exposes id, title and a default version", () => {
  const game = new Game(definition());
  assertEqual(game.id, "test-game", "id");
  assertEqual(game.title, "Test Game", "title");
  assertEqual(game.version, "0.1.0", "default version");
  assertEqual(new Game(definition({ version: "2.1.0" })).version, "2.1.0", "declared version");
});

Deno.test("runtime/game constructor registers the declared scenes in order", () => {
  const game = new Game(definition({ scenes: { one: () => level("one"), two: () => level("two") } }));
  assertEqual(game.sceneNames(), ["one", "two"], "load order");
  assertEqual(game.sceneCount, 2, "count");
  assert(game.hasScene("one") && game.hasScene("two"), "both registered");
});

Deno.test("runtime/game registerScene rejects an empty name", () => {
  const game = new Game(definition());
  assertThrows(() => game.registerScene("", () => level()), /scene name must not be empty/, "name");
});

Deno.test("runtime/game re-registering a scene keeps the original load order", () => {
  const game = new Game(definition({ scenes: { a: () => level("a"), b: () => level("b") } }));
  game.registerScene("a", () => level("a2"));
  assertEqual(game.sceneNames(), ["a", "b"], "order preserved");
  assertEqual(game.sceneCount, 2, "no duplicate entry");
  assertEqual(game.createScene("a").name, "a2", "source replaced");
});

Deno.test("runtime/game removeScene reports whether it removed anything", () => {
  const game = new Game(definition({ scenes: { a: () => level("a"), b: () => level("b") } }));
  assertEqual(game.removeScene("a"), true, "removed");
  assertEqual(game.removeScene("a"), false, "second removal");
  assertEqual(game.sceneNames(), ["b"], "order updated");
  assertEqual(game.sceneCount, 1, "count");
});

Deno.test("runtime/game startScene prefers the declared start", () => {
  const game = new Game(definition({ scenes: { a: () => level("a"), b: () => level("b") }, start: "b" }));
  assertEqual(game.startScene, "b", "declared start");
});

Deno.test("runtime/game startScene falls back to the first scene", () => {
  const game = new Game(definition({ scenes: { a: () => level("a"), b: () => level("b") } }));
  assertEqual(game.startScene, "a", "first registered");
});

Deno.test("runtime/game startScene ignores a start that is not registered", () => {
  const game = new Game(definition({ scenes: { a: () => level("a") }, start: "missing" }));
  assertEqual(game.startScene, "a", "fallback");
});

Deno.test("runtime/game without scenes cannot name a start scene", () => {
  const game = new Game({ id: "empty", title: "Empty" });
  assertThrows(() => game.startScene, /defines no scenes/, "start scene");
});

Deno.test("runtime/game createScene calls a factory for every instance", () => {
  let builds = 0;
  const game = new Game(definition({
    scenes: {
      level: () => {
        builds += 1;
        return level(`level-${builds}`);
      },
    },
  }));
  assertEqual(game.createScene("level").name, "level-1", "first build");
  assertEqual(game.createScene("level").name, "level-2", "second build");
  assertEqual(builds, 2, "factory calls");
});

Deno.test("runtime/game createScene clones a static scene instead of sharing it", () => {
  const shared = level("shared");
  const game = new Game(definition({ scenes: { shared } }));
  const first = game.createScene("shared");
  const second = game.createScene("shared");
  assert(first !== second, "distinct instances");
  assert(first !== shared, "not the original");
  first.createEntity({ name: "extra" });
  assertEqual(shared.entityCount, 1, "the original is untouched");
  assertEqual(second.entityCount, 1, "siblings are untouched");
});

Deno.test("runtime/game createScene rejects an unknown scene", () => {
  const game = new Game(definition());
  assertThrows(() => game.createScene("nope"), /has no scene "nope"/, "unknown scene");
});

Deno.test("runtime/game viewport override replaces every scene's viewport", () => {
  const game = new Game(definition({ viewport: { width: 800, height: 600 } }));
  const created = game.createScene("level");
  assertEqual(created.resources.viewport, { width: 800, height: 600 }, "overridden");
});

Deno.test("runtime/game keeps a scene's own viewport without an override", () => {
  const game = new Game(definition());
  assertEqual(game.createScene("level").resources.viewport, { width: 320, height: 240 }, "scene value");
});

Deno.test("runtime/game scripts() includes the engine defaults", () => {
  const game = new Game(definition());
  const registry = game.scripts();
  assert(registry.size >= defaultScripts.size, "defaults merged");
  assertEqual(registry.names(), defaultScripts.names(), "names match the defaults");
});

Deno.test("runtime/game scripts() prefers the game's own definitions", () => {
  const log: string[] = [];
  const scripts = new ScriptRegistry();
  scripts.define("shared", () => {
    log.push("game");
    return {};
  });
  const game = new Game(definition({ scripts }));
  game.scripts().create("shared", {}, 1);
  assertEqual(log, ["game"], "game definition shadows the engine default");
});

Deno.test("runtime/game scripts() returns a fresh registry each call", () => {
  const game = new Game(definition());
  const first = game.scripts();
  const count = first.size;
  defineScript("late-arrival", () => ({}), first);
  assertEqual(game.scripts().size, count, "no leakage into the next call");
});

Deno.test("runtime/game systems() lists the built-ins in phase order", () => {
  const game = new Game(definition());
  assertEqual(
    game.systems().map((system) => system.name),
    ["animation", "scripts", "gravity", "velocity", "collision", "camera", "lifetime"],
    "built-in order",
  );
});

Deno.test("runtime/game systems() appends the game's own systems", () => {
  const game = new Game(definition({
    systems: [defineSystem("waves", () => {}, 500), defineSystem("scoring", () => {}, 600)],
  }));
  const names = game.systems().map((system) => system.name);
  assertEqual(names.slice(-2), ["waves", "scoring"], "game systems follow the built-ins");
});

Deno.test("runtime/game createSession uses the start scene and logs it", () => {
  const game = new Game(definition());
  const session = game.createSession();
  assertEqual(session.scene.name, "level", "start scene");
  const started = session.diagnostics.records.find((record) => record.message === "session started");
  assertEqual(started?.data, { game: "test-game", scene: "level" }, "diagnostics record");
});

Deno.test("runtime/game createSession can start in another scene", () => {
  const game = new Game(definition({ scenes: { a: () => level("a"), b: () => level("b") } }));
  assertEqual(game.createSession("b").scene.name, "b", "requested scene");
});

Deno.test("runtime/game createSession rejects an unknown scene name", () => {
  const game = new Game(definition());
  assertThrows(() => game.createSession("ghost"), /has no scene "ghost"/, "unknown");
});

Deno.test("runtime/game createSession merges services with the options winning", () => {
  const game = new Game(definition({ services: () => ({ audio: "engine", save: "slot-1" }) }));
  const session = game.createSession("level", { services: { save: "slot-2" } });
  assertEqual(session.service("audio"), "engine", "definition service");
  assertEqual(session.service("save"), "slot-2", "option overrides");
});

Deno.test("runtime/game createSession runs the configure hook", () => {
  const game = new Game(definition({
    configure: (session) => {
      session.provide("configured", true);
      session.addSystem(defineSystem("from-configure", () => {}, 700));
    },
  }));
  const session = game.createSession();
  assertEqual(session.service("configured"), true, "service provided");
  assert(session.systems.some((system) => system.name === "from-configure"), "system added");
});

Deno.test("runtime/game createSession replaces built-ins when systems are given", () => {
  const game = new Game(definition());
  const session = game.createSession("level", { systems: [defineSystem("only", () => {})] });
  assertEqual(session.systems.map((system) => system.name), ["only"], "built-ins replaced");
});

Deno.test("runtime/game sessions are seeded deterministically", () => {
  const game = new Game(definition({ seed: 99 }));
  const first = game.createSession(), second = game.createSession();
  const a = first.rng.float(0, 1), b = second.rng.float(0, 1);
  near(a, b, 0, "same seed, same first value");
  const other = new Game(definition({ seed: 100 })).createSession();
  assert(other.rng.float(0, 1) !== a, "a different seed diverges");
});

Deno.test("runtime/game session options can override the seed", () => {
  const game = new Game(definition({ seed: 1 }));
  const explicit = game.createSession("level", { seed: 1234 });
  const reference = game.createSession("level", { seed: 1234 });
  near(explicit.rng.float(0, 1), reference.rng.float(0, 1), 0, "option seed is used");
});

Deno.test("runtime/game createHost wraps the session it creates", () => {
  const game = new Game(definition());
  const host = game.createHost("level", { fixedDt: 0.02 });
  assert(host instanceof RuntimeHost, "host type");
  assertEqual(host.session.scene.name, "level", "host session");
  near(host.fixedDt, 0.02, 1e-12, "fixed step honoured");
});

Deno.test("runtime/game describe() summarizes the definition", () => {
  const game = new Game(definition({ scenes: { a: () => level("a"), b: () => level("b") }, start: "b" }));
  const described = game.describe();
  assertEqual(described.id, "test-game", "id");
  assertEqual(described.title, "Test Game", "title");
  assertEqual(described.version, "0.1.0", "version");
  assertEqual(described.start, "b", "start");
  assertEqual(described.scenes, ["a", "b"], "scenes");
  assert(described.systems.includes("collision"), "systems listed");
  assert(described.scripts.length >= defaultScripts.size, "scripts listed");
});

Deno.test("runtime/game describe() reports a null start without scenes", () => {
  const described = new Game({ id: "empty", title: "Empty" }).describe();
  assertEqual(described.start, null, "start");
  assertEqual(described.scenes, [], "scenes");
});

Deno.test("runtime/game loadSceneDirectory registers one scene per file", async () => {
  await inTempDir(async (directory) => {
    await writeSceneFile(joinPath(directory, "alpha.emberscene"), level("alpha"));
    await writeSceneFile(joinPath(directory, "beta.emberscene"), level("beta"));
    const game = new Game({ id: "disk", title: "Disk" });
    const loaded = await game.loadSceneDirectory(directory);
    assertEqual(loaded.sort(), ["alpha", "beta"], "loaded names");
    assertEqual(game.sceneCount, 2, "registered");
    assertEqual(game.createScene("alpha").name, "alpha", "name from the file name");
    assertEqual(game.createScene("alpha").entityCount, 1, "entities survive the trip");
  });
});

Deno.test("runtime/game loadSceneDirectory skips a corrupt file and warns", async () => {
  await inTempDir(async (directory) => {
    await writeSceneFile(joinPath(directory, "good.emberscene"), level("good"));
    await Deno.writeTextFile(joinPath(directory, "bad.emberscene"), "{ this is not json }");
    const warnings: string[] = [];
    const game = new Game({ id: "disk", title: "Disk" });
    const loaded = await game.loadSceneDirectory(directory, { onWarning: (message) => warnings.push(message) });
    assertEqual(loaded, ["good"], "only the readable scene is loaded");
    assertEqual(warnings.length, 1, "one warning");
    assert(warnings[0].includes("bad.emberscene"), `warning names the file: ${warnings[0]}`);
  });
});

Deno.test("runtime/game loadSceneDirectory on a missing directory loads nothing", async () => {
  const game = new Game({ id: "disk", title: "Disk" });
  const loaded = await game.loadSceneDirectory("does/not/exist");
  assertEqual(loaded, [], "nothing loaded");
});

Deno.test("runtime/game loadSceneDirectory returns a fresh scene per session", async () => {
  await inTempDir(async (directory) => {
    await writeSceneFile(joinPath(directory, "alpha.emberscene"), level("alpha"));
    const game = new Game({ id: "disk", title: "Disk" });
    await game.loadSceneDirectory(directory);
    const first = game.createScene("alpha");
    first.createEntity({ name: "spawned-at-runtime" });
    assertEqual(game.createScene("alpha").entityCount, 1, "sessions do not share a scene");
  });
});

Deno.test("runtime/game defineGame returns a Game with the same wiring", () => {
  const game = defineGame(definition({ scenes: { a: () => level("a") } }));
  assert(game instanceof Game, "Game instance");
  assertEqual(game.describe().scenes, ["a"], "scenes");
});

Deno.test("runtime/game session entity count matches the scene it built", () => {
  const game = new Game(definition());
  const session = game.createSession();
  assertEqual(session.entityCount, 1, "one entity");
  assertEqual(session.scene.entityCount, 1, "scene agrees with the session");
});
