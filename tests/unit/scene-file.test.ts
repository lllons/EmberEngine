/** Scene files: slug rules plus real reads/writes in a temporary directory. */

import {
  ensureDir,
  listSceneFiles,
  readSceneFile,
  Scene,
  SCENE_FILE_EXTENSION,
  sceneExists,
  sceneFileName,
  slugify,
  Transform,
  vec2,
  writeSceneFile,
} from "@ember/core";
import { assert, assertEqual, inTempDir, near, table } from "../harness.ts";

table("scene-file/slugify", [
  { label: "spaces", input: "Hello World", expected: "hello-world" },
  { label: "uppercase", input: "LEVEL", expected: "level" },
  { label: "underscores", input: "a_b", expected: "a-b" },
  { label: "collapses runs", input: "a   b___c", expected: "a-b-c" },
  { label: "trims separators", input: "  -trim-  ", expected: "trim" },
  { label: "digits survive", input: "level 1", expected: "level-1" },
  { label: "symbols only becomes untitled", input: "!!!", expected: "untitled" },
  { label: "empty becomes untitled", input: "", expected: "untitled" },
  { label: "already a slug", input: "boss-arena", expected: "boss-arena" },
] as const, (row) => assertEqual(slugify(row.input), row.expected, row.label));

table("scene-file/sceneFileName", [
  { label: "adds the extension", input: "Level 1", expected: `level-1${SCENE_FILE_EXTENSION}` },
  { label: "keeps a single extension", input: "level-1.emberscene", expected: "level-1.emberscene" },
  { label: "empty name", input: "", expected: `untitled${SCENE_FILE_EXTENSION}` },
  { label: "extension stripping is case sensitive", input: "Boss.EMBERSCENE", expected: "boss-emberscene.emberscene" },
] as const, (row) => assertEqual(sceneFileName(row.input), row.expected, row.label));

Deno.test("scene-file/write then read preserves the scene", async () => {
  await inTempDir(async (directory) => {
    const scene = new Scene({ name: "level-1" });
    const entity = scene.createEntity({ name: "Hero", position: vec2(2, 3) });
    scene.world.require(entity, Transform).rotation = 0.25;
    const path = `${directory}/level-1${SCENE_FILE_EXTENSION}`;
    await writeSceneFile(path, scene);
    const loaded = await readSceneFile(path);
    assertEqual(loaded.name, "level-1", "name");
    assertEqual(loaded.entityCount, 1, "entities");
    near(loaded.world.require(1, Transform).position.x, 2, 0, "position");
    near(loaded.world.require(1, Transform).rotation, 0.25, 0, "rotation");
  });
});

Deno.test("scene-file/write creates missing parent directories", async () => {
  await inTempDir(async (directory) => {
    const nested = `${directory}/a/b/c`;
    await writeSceneFile(`${nested}/deep.emberscene`, new Scene({ name: "deep" }));
    assert(await sceneExists(`${nested}/deep.emberscene`), "file must exist");
  });
});

Deno.test("scene-file/sceneExists reports false for missing files", async () => {
  await inTempDir(async (directory) => {
    assertEqual(await sceneExists(`${directory}/missing.emberscene`), false, "missing");
    await writeSceneFile(`${directory}/present.emberscene`, new Scene());
    assertEqual(await sceneExists(`${directory}/present.emberscene`), true, "present");
  });
});

Deno.test("scene-file/ensureDir is idempotent", async () => {
  await inTempDir(async (directory) => {
    await ensureDir(`${directory}/x`);
    await ensureDir(`${directory}/x`);
    const info = await Deno.stat(`${directory}/x`);
    assert(info.isDirectory, "directory exists");
  });
});

Deno.test("scene-file/listSceneFiles filters and sorts", async () => {
  await inTempDir(async (directory) => {
    await writeSceneFile(`${directory}/b.emberscene`, new Scene({ name: "b" }));
    await writeSceneFile(`${directory}/a.emberscene`, new Scene({ name: "a" }));
    await Deno.writeTextFile(`${directory}/notes.txt`, "not a scene");
    await Deno.mkdir(`${directory}/folder.emberscene`);
    const files = await listSceneFiles(directory);
    assertEqual(files.length, 2, "only scene files are listed");
    assert(files[0].endsWith("a.emberscene"), `first should be a: ${files}`);
    assert(files[1].endsWith("b.emberscene"), `second should be b: ${files}`);
  });
});

Deno.test("scene-file/listSceneFiles returns empty for a missing directory", async () => {
  await inTempDir(async (directory) => {
    assertEqual(await listSceneFiles(`${directory}/nope`), [], "missing directory");
  });
});

Deno.test("scene-file/readSceneFile throws for a missing file", async () => {
  await inTempDir(async (directory) => {
    let threw = false;
    try {
      await readSceneFile(`${directory}/nope.emberscene`);
    } catch {
      threw = true;
    }
    assert(threw, "reading a missing file must throw");
  });
});

Deno.test("scene-file/readSceneFile rejects a corrupt file", async () => {
  await inTempDir(async (directory) => {
    const path = `${directory}/broken.emberscene`;
    await Deno.writeTextFile(path, "{not json");
    let message = "";
    try {
      await readSceneFile(path);
    } catch (error) {
      message = (error as Error).message;
    }
    assert(/not valid JSON/.test(message), `unexpected error: ${message}`);
  });
});

Deno.test("scene-file/writing pretty JSON stays human readable", async () => {
  await inTempDir(async (directory) => {
    const path = `${directory}/readable.emberscene`;
    await writeSceneFile(path, new Scene({ name: "readable" }));
    const text = await Deno.readTextFile(path);
    assert(text.includes("\n  \"format\""), "indented keys expected");
    assert(text.endsWith("\n") || text.endsWith("}"), "file must end cleanly");
  });
});

Deno.test("scene-file/slugify never emits a path separator", () => {
  for (const input of ["a/b", "a\\b", "../etc/passwd"]) {
    const slug = slugify(input);
    assert(!slug.includes("/") && !slug.includes("\\"), `slug ${slug} contains a separator`);
    assert(!slug.includes(".."), `slug ${slug} contains traversal`);
  }
});

Deno.test("scene-file/sceneFileName is safe for every slug case", () => {
  for (const name of ["", "!!!", "a b", "A/B"]) {
    const file = sceneFileName(name);
    assert(file.endsWith(SCENE_FILE_EXTENSION), `${file} must end with the extension`);
    assert(!file.includes("/"), `${file} must not contain a path separator`);
  }
});
