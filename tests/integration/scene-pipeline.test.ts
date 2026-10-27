/**
 * Integration: the scene file pipeline on real disk I/O.
 *
 * Covers the path the editor and the exporter take — serialize → write → read → load →
 * simulate → save again — and asserts the round-trip is lossless and deterministic.
 */

import {
  type Entity,
  Parent,
  readSceneFile,
  RectShape,
  Scene,
  sceneFromJson,
  sceneToJson,
  Script,
  Tag,
  Transform,
  vec2,
  Velocity,
  writeSceneFile,
} from "@ember/core";
import { defineSystem, Game, sceneDigest, worldDigest } from "@ember/runtime";
import { assert, assertEqual, assertThrows, inTempDir, joinPath, near } from "../harness.ts";

function sampleScene(name = "pipeline"): Scene {
  const scene = new Scene({
    name,
    viewport: { width: 640, height: 360 },
    gravity: vec2(0, 1200),
    background: "#101318",
    camera: {
      position: vec2(320, 180),
      zoom: 1.5,
      smoothing: 0.2,
      bounds: { x: 0, y: 0, w: 640, h: 360 },
    },
    metadata: { chapter: 2, tags: ["a", "b"] },
  });
  const player = scene.createEntity({ name: "hero", position: vec2(40, 60) });
  scene.world.add(player, Velocity, { x: 12, y: -3, angular: 0.25 });
  scene.world.add(player, Script, {
    name: "patrol",
    props: { speed: 5, steps: [1, 2, 3], nested: { ok: true } },
  });
  scene.world.add(player, Tag, { value: "player" });
  const crate = scene.createEntity({
    name: "crate",
    position: vec2(200, 100),
    rotation: 0.5,
    scale: vec2(2, 3),
  });
  scene.world.add(crate, RectShape, { width: 24, height: 24, color: "#ff7a2f", layer: 3 });
  scene.world.add(crate, Parent, { entity: player });
  return scene;
}

Deno.test("integration/scene round-trips through JSON without loss", () => {
  const original = sampleScene();
  const reloaded = sceneFromJson(sceneToJson(original));
  assertEqual(worldDigest(reloaded.world), worldDigest(original.world), "world digest");
  assertEqual(reloaded.name, original.name, "name");
  assertEqual(reloaded.metadata, original.metadata, "metadata");
  assertEqual(reloaded.resources, original.resources, "resources");
  assertEqual(reloaded.entityCount, original.entityCount, "entity count");
});

Deno.test("integration/scene round-trip preserves nested script props", () => {
  const reloaded = sceneFromJson(sceneToJson(sampleScene()));
  const [hero] = reloaded.world.entities();
  const script = reloaded.world.require(hero, Script);
  assertEqual(script.name, "patrol", "script name");
  assertEqual(script.props, { speed: 5, steps: [1, 2, 3], nested: { ok: true } }, "props");
});

Deno.test("integration/scene round-trip keeps entity ids and parent links", () => {
  const original = sampleScene();
  const reloaded = sceneFromJson(sceneToJson(original));
  assertEqual(reloaded.world.entities(), original.world.entities(), "ids");
  const child = reloaded.world.entities()[1];
  assertEqual(reloaded.world.require(child, Parent).entity, reloaded.world.entities()[0], "parent");
});

Deno.test("integration/scene save is idempotent across two round-trips", () => {
  const first = sceneToJson(sampleScene());
  const second = sceneToJson(sceneFromJson(first));
  assertEqual(second, first, "byte-identical JSON");
});

Deno.test("integration/scene loaded scenes do not alias their source document", () => {
  const json = sceneToJson(sampleScene());
  const a = sceneFromJson(json);
  const b = sceneFromJson(json);
  const [aHero] = a.world.entities();
  a.world.require(aHero, Transform).position = vec2(999, 999);
  const [bHero] = b.world.entities();
  near(b.world.require(bHero, Transform).position.x, 40, 1e-12, "second load unaffected");
});

Deno.test("integration/scene file format is versioned and human readable", () => {
  const json = sceneToJson(sampleScene());
  const parsed = JSON.parse(json);
  assertEqual(parsed.format, "emberscene", "format marker");
  assertEqual(parsed.version, 1, "version");
  assert(json.includes("\n  "), "pretty printed");
  assert(Array.isArray(parsed.entities), "entities array");
});

Deno.test("integration/scene drops a dangling parent link with a warning", () => {
  const data = JSON.parse(sceneToJson(sampleScene()));
  data.entities[1].components.Parent.entity = 999;
  const warnings: string[] = [];
  const scene = sceneFromJson(JSON.stringify(data), {
    onWarning: (message) => warnings.push(message),
  });
  const child = scene.world.entities()[1];
  assertEqual(scene.world.get(child, Parent), undefined, "link removed");
  assertEqual(warnings.length, 1, "one warning");
  assert(warnings[0].includes("missing parent 999"), `warning: ${warnings[0]}`);
});

Deno.test("integration/scene removes a self-parent link with a warning", () => {
  const data = JSON.parse(sceneToJson(sampleScene()));
  data.entities[1].components.Parent.entity = 2;
  const warnings: string[] = [];
  const scene = sceneFromJson(JSON.stringify(data), {
    onWarning: (message) => warnings.push(message),
  });
  const child = scene.world.entities()[1];
  assertEqual(scene.world.get(child, Parent), undefined, "link removed");
  assert(warnings.some((warning) => warning.includes("own parent")), `warnings: ${warnings}`);
});

Deno.test("integration/scene skips an unknown component and keeps the rest", () => {
  const data = JSON.parse(sceneToJson(sampleScene()));
  data.entities[0].components.NotAComponent = { whatever: true };
  const warnings: string[] = [];
  const scene = sceneFromJson(JSON.stringify(data), {
    onWarning: (message) => warnings.push(message),
  });
  assertEqual(scene.entityCount, 2, "entities kept");
  assert(scene.world.get(1 as Entity, Tag) !== undefined, "known components kept");
  assert(warnings.some((warning) => warning.includes("NotAComponent")), "warning names it");
});

Deno.test("integration/scene rejects a file from a newer format version", () => {
  const data = JSON.parse(sceneToJson(sampleScene()));
  data.version = 99;
  assertThrows(() => sceneFromJson(JSON.stringify(data)), /newer than supported/, "newer version");
});

Deno.test("integration/scene migrates an unversioned document and warns", () => {
  const data = JSON.parse(sceneToJson(sampleScene()));
  delete data.version;
  const warnings: string[] = [];
  const scene = sceneFromJson(JSON.stringify(data), {
    onWarning: (message) => warnings.push(message),
  });
  assertEqual(scene.entityCount, 2, "loaded");
  assert(warnings.some((warning) => warning.includes("migrated")), `warnings: ${warnings}`);
});

Deno.test("integration/scene files are written into nested directories", async () => {
  await inTempDir(async (directory) => {
    const path = joinPath(directory, "levels", "deep", "one.emberscene");
    await writeSceneFile(path, sampleScene("deep"));
    const text = await Deno.readTextFile(path);
    assert(text.includes('"format": "emberscene"'), "file written");
    const reloaded = await readSceneFile(path);
    assertEqual(reloaded.name, "deep", "read back");
  });
});

Deno.test("integration/scene reads a directory of scenes through Game", async () => {
  await inTempDir(async (directory) => {
    await writeSceneFile(joinPath(directory, "one.emberscene"), sampleScene("one"));
    await writeSceneFile(joinPath(directory, "two.emberscene"), sampleScene("two"));
    const game = new Game({ id: "disk", title: "Disk" });
    const loaded = await game.loadSceneDirectory(directory);
    assertEqual(loaded.sort(), ["one", "two"], "loaded names");
    assertEqual(game.createScene("one").name, "one", "name from file");
    assertEqual(game.createScene("two").entityCount, 2, "entities from file");
  });
});

Deno.test("integration/scene a disk-loaded scene simulates deterministically in a host", async () => {
  await inTempDir(async (directory) => {
    await writeSceneFile(joinPath(directory, "level.emberscene"), sampleScene("level"));
    const build = async () => {
      const game = new Game({ id: "disk", title: "Disk" });
      await game.loadSceneDirectory(directory);
      const host = game.createHost("level", {
        fixedDt: 1 / 60,
        systems: [
          defineSystem("integrate", (ctx) => {
            for (const entity of ctx.scene.world.query(Velocity)) {
              const velocity = ctx.scene.world.require(entity, Velocity);
              const transform = ctx.scene.world.get(entity, Transform);
              if (!transform) continue;
              transform.position.x += velocity.x * ctx.dt;
              transform.position.y += velocity.y * ctx.dt;
            }
          }),
        ],
      });
      host.simulate(1);
      return worldDigest(host.session.scene.world);
    };
    assertEqual(await build(), await build(), "same digest from two disk loads");
  });
});

Deno.test("integration/scene save → load → save keeps the digest after simulation", async () => {
  await inTempDir(async (directory) => {
    const first = joinPath(directory, "first.emberscene");
    await writeSceneFile(first, sampleScene("first"));
    const loaded = await readSceneFile(first);
    for (let step = 0; step < 30; step++) {
      for (const entity of loaded.world.query(Velocity)) {
        const velocity = loaded.world.require(entity, Velocity);
        const transform = loaded.world.get(entity, Transform);
        assert(transform !== undefined, "transform exists");
        transform.position.x += velocity.x / 60;
        transform.position.y += velocity.y / 60;
      }
    }
    const second = joinPath(directory, "second.emberscene");
    await writeSceneFile(second, loaded);
    const reloaded = await readSceneFile(second);
    assertEqual(sceneDigest(reloaded), sceneDigest(loaded), "digest after the full loop");
    near(
      reloaded.world.require(1 as Entity, Transform).position.x,
      40 + 12 * 30 / 60,
      1e-9,
      "moved position kept",
    );
  });
});

Deno.test("integration/scene a 500-entity scene survives the file round-trip", async () => {
  await inTempDir(async (directory) => {
    const scene = new Scene({ name: "many", viewport: { width: 320, height: 240 } });
    for (let index = 0; index < 500; index++) {
      const entity = scene.createEntity({
        name: `e${index}`,
        position: vec2(index % 40, Math.floor(index / 40)),
      });
      scene.world.add(entity, Tag, { value: `tag-${index}` });
    }
    const path = joinPath(directory, "many.emberscene");
    await writeSceneFile(path, scene);
    const reloaded = await readSceneFile(path);
    assertEqual(reloaded.entityCount, 500, "entity count");
    assertEqual(worldDigest(reloaded.world), worldDigest(scene.world), "digest");
    const info = await Deno.stat(path);
    assert(info.size > 10_000, `file has real content: ${info.size} bytes`);
  });
});
