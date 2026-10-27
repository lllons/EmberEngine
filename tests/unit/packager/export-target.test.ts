/**
 * @ember/packager/export-target — where an exported game is installed.
 *
 * The editor asks the player for a folder or file path after compiling; these helpers turn
 * that answer into a final path and put the executable there.
 */

import { assert, assertEquals } from "@std/assert";
import { executableName, placeExportedGame, resolveExportTarget } from "@ember/packager";

const workspaceRoot = Deno.cwd();
const fallback = `${workspaceRoot}/dist/ember-runner.exe`;
const options = { workspaceRoot, gameId: "ember-runner", fallback };

const slash = (path: string) => path.replace(/\\/g, "/");

Deno.test("the executable name is the game id plus the platform extension", () => {
  assertEquals(
    executableName("runner"),
    Deno.build.os === "windows" ? "runner.exe" : "runner",
  );
});

Deno.test("an empty answer keeps the default dist path", () => {
  assertEquals(resolveExportTarget("", options), fallback);
  assertEquals(resolveExportTarget("   ", options), fallback);
});

Deno.test("a quoted path is unquoted", () => {
  assertEquals(
    slash(resolveExportTarget('"C:/Games/ember.exe"', options)),
    "C:/Games/ember.exe",
  );
});

Deno.test("a folder that exists gets the executable name appended", async () => {
  const directory = await Deno.makeTempDir({ prefix: "ember-install-" });
  try {
    assertEquals(
      slash(resolveExportTarget(directory, options)),
      `${slash(directory)}/${executableName("ember-runner")}`,
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("a path with a trailing separator is treated as a folder", () => {
  assertEquals(
    slash(resolveExportTarget("C:/Games/Ember/", options)),
    `C:/Games/Ember/${executableName("ember-runner")}`,
  );
});

Deno.test("a full .exe path is kept as the file", () => {
  assertEquals(slash(resolveExportTarget("C:/Games/MyGame.exe", options)), "C:/Games/MyGame.exe");
});

Deno.test("a file path without an extension gets one", () => {
  assertEquals(
    slash(resolveExportTarget("C:/Games/MyGame", options)),
    `C:/Games/MyGame${executableName("x").slice(1)}`,
  );
});

Deno.test("a relative answer resolves against the workspace root", () => {
  const resolved = slash(resolveExportTarget("exports/build.exe", options));
  assert(resolved.startsWith(slash(workspaceRoot)));
  assert(resolved.endsWith("/exports/build.exe"));
});

Deno.test("placing a build copies it into the target folder", async () => {
  const directory = await Deno.makeTempDir({ prefix: "ember-install-" });
  try {
    const source = `${directory}/source.exe`;
    await Deno.writeTextFile(source, "binary");
    const target = `${directory}/nested/game.exe`;
    assertEquals(await placeExportedGame(source, target), target);
    assertEquals(await Deno.readTextFile(target), "binary");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("placing a build overwrites an older copy", async () => {
  const directory = await Deno.makeTempDir({ prefix: "ember-install-" });
  try {
    const source = `${directory}/source.exe`;
    const target = `${directory}/game.exe`;
    await Deno.writeTextFile(target, "old");
    await Deno.writeTextFile(source, "new");
    await placeExportedGame(source, target);
    assertEquals(await Deno.readTextFile(target), "new");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("placing a build onto itself is a no-op", async () => {
  const directory = await Deno.makeTempDir({ prefix: "ember-install-" });
  try {
    const source = `${directory}/source.exe`;
    await Deno.writeTextFile(source, "binary");
    assertEquals(await placeExportedGame(source, source), source);
    assertEquals(await Deno.readTextFile(source), "binary");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
