/**
 * `game.json` discovery and validation (`packages/packager/manifest.ts`).
 *
 * Every case writes a real game directory into a temp folder, so the suite exercises the
 * file-system contract the CLI and exporter both depend on.
 */

import { resolveGame, slug, toFileUrl } from "../../packages/packager/manifest.ts";
import { assert, assertEqual, inTempDir, joinPath, table } from "../harness.ts";

async function writeGame(
  directory: string,
  manifest: Record<string, unknown>,
  files: Record<string, string> = {},
): Promise<string> {
  await Deno.writeTextFile(joinPath(directory, "game.json"), JSON.stringify(manifest));
  for (const [path, content] of Object.entries(files)) {
    const target = joinPath(directory, path);
    const slash = target.lastIndexOf("/");
    if (slash > 0) await Deno.mkdir(target.slice(0, slash), { recursive: true });
    await Deno.writeTextFile(target, content);
  }
  return directory;
}

const entryFile = { "src/game.ts": "export const createGame = () => {}\n" };

Deno.test("export/manifest resolves a modern game.json", async () => {
  await inTempDir(async (directory) => {
    await writeGame(directory, {
      id: "Ember Runner",
      title: "Ember Runner",
      viewport: { width: 960, height: 540 },
      entry: "src/game.ts",
      description: "run and jump",
    }, entryFile);
    const resolved = await resolveGame(directory);
    assertEqual(resolved.manifest.name, "ember-runner", "slugged id");
    assertEqual(resolved.manifest.title, "Ember Runner", "title");
    assertEqual(resolved.manifest.width, 960, "width");
    assertEqual(resolved.manifest.height, 540, "height");
    assertEqual(resolved.manifest.entry, "src/game.ts", "entry");
    assertEqual(resolved.manifest.description, "run and jump", "description");
    assert(
      resolved.entryPath.replace(/\\/g, "/").endsWith("src/game.ts"),
      `entry resolved next to the manifest: ${resolved.entryPath}`,
    );
  });
});

Deno.test("export/manifest accepts the legacy name/width/height schema", async () => {
  await inTempDir(async (directory) => {
    await writeGame(directory, { name: "Legacy Game", width: 320, height: 240 }, entryFile);
    const resolved = await resolveGame(directory);
    assertEqual(resolved.manifest.name, "legacy-game", "name");
    assertEqual(resolved.manifest.title, "Legacy Game", "title falls back to name");
    assertEqual(resolved.manifest.width, 320, "width");
    assertEqual(resolved.manifest.height, 240, "height");
  });
});

Deno.test("export/manifest floors fractional viewport dimensions", async () => {
  await inTempDir(async (directory) => {
    await writeGame(
      directory,
      { id: "frac", viewport: { width: 640.9, height: 480.2 } },
      entryFile,
    );
    const resolved = await resolveGame(directory);
    assertEqual(resolved.manifest.width, 640, "width floored");
    assertEqual(resolved.manifest.height, 480, "height floored");
  });
});

Deno.test("export/manifest defaults the entry and description", async () => {
  await inTempDir(async (directory) => {
    await writeGame(directory, { id: "defaults", viewport: { width: 10, height: 10 } }, entryFile);
    const resolved = await resolveGame(directory);
    assertEqual(resolved.manifest.entry, "src/game.ts", "default entry");
    assertEqual(resolved.manifest.description, "", "default description");
  });
});

Deno.test("export/manifest ignores a blank title and empty entry", async () => {
  await inTempDir(async (directory) => {
    await writeGame(directory, {
      id: "blank",
      title: "",
      entry: "",
      viewport: { width: 10, height: 10 },
    }, entryFile);
    const resolved = await resolveGame(directory);
    assertEqual(resolved.manifest.title, "blank", "title falls back to the id");
    assertEqual(resolved.manifest.entry, "src/game.ts", "entry falls back to the default");
  });
});

Deno.test("export/manifest reports a missing game.json", async () => {
  await inTempDir(async (directory) => {
    await assertRejectsMatch(() => resolveGame(directory), /no game\.json/);
  });
});

Deno.test("export/manifest reports invalid JSON with the parse message", async () => {
  await inTempDir(async (directory) => {
    await Deno.writeTextFile(joinPath(directory, "game.json"), "{ nope");
    await assertRejectsMatch(() => resolveGame(directory), /not valid JSON/);
  });
});

Deno.test("export/manifest rejects a JSON array", async () => {
  await inTempDir(async (directory) => {
    await Deno.writeTextFile(joinPath(directory, "game.json"), "[1,2,3]");
    await assertRejectsMatch(() => resolveGame(directory), /must contain a JSON object/);
  });
});

Deno.test("export/manifest rejects an empty id", async () => {
  await inTempDir(async (directory) => {
    await writeGame(directory, { id: "   ", viewport: { width: 10, height: 10 } }, entryFile);
    await assertRejectsMatch(() => resolveGame(directory), /non-empty "id"/);
  });
});

Deno.test("export/manifest rejects a manifest with neither id nor name", async () => {
  await inTempDir(async (directory) => {
    await writeGame(directory, { viewport: { width: 10, height: 10 } }, entryFile);
    await assertRejectsMatch(() => resolveGame(directory), /non-empty "name"/);
  });
});

Deno.test("export/manifest rejects a non-numeric width", async () => {
  await inTempDir(async (directory) => {
    await writeGame(directory, { id: "bad", viewport: { width: "640", height: 480 } }, entryFile);
    await assertRejectsMatch(() => resolveGame(directory), /positive "viewport\.width"/);
  });
});

Deno.test("export/manifest rejects a zero height", async () => {
  await inTempDir(async (directory) => {
    await writeGame(directory, { id: "bad", viewport: { width: 640, height: 0 } }, entryFile);
    await assertRejectsMatch(() => resolveGame(directory), /positive "viewport\.height"/);
  });
});

Deno.test("export/manifest rejects an entry that does not exist", async () => {
  await inTempDir(async (directory) => {
    await writeGame(directory, {
      id: "bad",
      viewport: { width: 640, height: 480 },
      entry: "src/missing.ts",
    });
    await assertRejectsMatch(() => resolveGame(directory), /does not exist/);
  });
});

Deno.test("export/manifest rejects a missing default entry", async () => {
  await inTempDir(async (directory) => {
    await writeGame(directory, { id: "bare", viewport: { width: 10, height: 10 } });
    await assertRejectsMatch(() => resolveGame(directory), /does not exist/);
  });
});

table(
  "export/manifest slug",
  [
    { label: "spaces become dashes", input: "Ember Runner", expected: "ember-runner" },
    { label: "punctuation collapses", input: "  Mixed__Case!!  ", expected: "mixed-case" },
    { label: "already slugged", input: "already-slugged", expected: "already-slugged" },
    { label: "dots become dashes", input: "v1.2.3", expected: "v1-2-3" },
    { label: "digits kept", input: "Game 2", expected: "game-2" },
    { label: "only separators falls back", input: "---", expected: "game" },
    { label: "empty falls back", input: "", expected: "game" },
    { label: "accents are dropped", input: "Café", expected: "caf" },
  ] as const,
  (row) => {
    assertEqual(slug(row.input), row.expected, row.label);
  },
);

table(
  "export/manifest toFileUrl",
  [
    { label: "relative path", input: "src/game.ts", expected: "file:///src/game.ts" },
    { label: "absolute path", input: "/work/src/game.ts", expected: "file:///work/src/game.ts" },
    {
      label: "windows separators",
      input: "C:\\work\\src\\game.ts",
      expected: "file:///C:/work/src/game.ts",
    },
    { label: "spaces encoded", input: "C:\\my work\\a.ts", expected: "file:///C:/my%20work/a.ts" },
    {
      label: "windows absolute path",
      input: "C:/work/game.ts",
      expected: "file:///C:/work/game.ts",
    },
  ] as const,
  (row) => {
    assertEqual(toFileUrl(row.input), row.expected, row.label);
  },
);

Deno.test("export/manifest slug output is always file safe", () => {
  for (const name of ["A B", "a/b", "a\\b", "..", "./x", "TAB\tNAME", "100%"]) {
    const value = slug(name);
    assert(/^[a-z0-9-]+$/.test(value), `slug(${JSON.stringify(name)}) = ${value}`);
  }
});

async function assertRejectsMatch(fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  let message = "no error thrown";
  try {
    await fn();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
    if (pattern.test(message)) return;
    throw new Error(`error "${message}" does not match ${pattern}`);
  }
  throw new Error(`expected a rejection matching ${pattern}, got ${message}`);
}
