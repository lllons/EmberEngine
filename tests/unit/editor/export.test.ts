/**
 * @ember/editor/native/export — finding the source behind a factory module URL.
 *
 * A compiled editor reports URLs inside its own virtual filesystem, which the packager's child
 * processes (`deno bundle`, `deno compile`) cannot import, so the export has to map them back
 * to the checked-out source in the workspace.
 */

import { assert, assertEquals } from "@std/assert";
import { modulePath, resolveFactoryModule } from "@ember/editor";
import { join } from "node:path";

const workspace = Deno.cwd();

/** Windows returns either separator depending on where the path came from. */
const norm = (path: string | null) => path?.replace(/\\/g, "/") ?? null;

Deno.test("modulePath reads a file URL and ignores anything else", () => {
  assert(modulePath("file:///C:/work/packages/editor/examples.ts")?.endsWith("examples.ts"));
  assertEquals(modulePath("https://example.com/mod.ts"), null);
  assertEquals(modulePath("not a url"), null);
});

Deno.test("a module URL already on disk resolves to itself", async () => {
  const source = join(workspace, "packages", "editor", "examples.ts");
  const resolved = await resolveFactoryModule(`file:///${source.replace(/\\/g, "/")}`, workspace);
  assertEquals(norm(resolved), norm(source));
});

Deno.test("a compiled editor's URL maps back to the workspace source", async () => {
  const compiled =
    "file:///C:/Users/someone/AppData/Local/Temp/deno-compile-EmberEngine.exe/packages/editor/examples.ts";
  const resolved = await resolveFactoryModule(compiled, workspace);
  assertEquals(norm(resolved), norm(join(workspace, "packages", "editor", "examples.ts")));
});

Deno.test("a compiled example game maps back to its own module", async () => {
  const compiled =
    "file:///C:/Users/someone/AppData/Local/Temp/deno-compile-EmberEngine.exe/games/flappy/src/main.ts";
  const resolved = await resolveFactoryModule(compiled, workspace);
  assertEquals(norm(resolved), norm(join(workspace, "games", "flappy", "src", "main.ts")));
});

Deno.test("a factory with no source in the workspace resolves to nothing", async () => {
  const missing = "file:///C:/Users/someone/Temp/deno-compile-EmberEngine.exe/nowhere/ghost.ts";
  assertEquals(await resolveFactoryModule(missing, workspace), null);
});
