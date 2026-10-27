/**
 * @ember/cli/args — the command line surface, including where an export is installed.
 */

import { assertEquals, assertThrows } from "@std/assert";
import { parseCliArgs } from "../../../packages/cli/main.ts";

Deno.test("export defaults to keeping the build in dist/", () => {
  assertEquals(parseCliArgs(["export"]).out, null);
});

Deno.test("--out captures the folder or file the game is installed into", () => {
  assertEquals(parseCliArgs(["export", "--out", "D:/Games/"]).out, "D:/Games/");
  assertEquals(parseCliArgs(["export", "--out", "D:/Games/ember.exe"]).out, "D:/Games/ember.exe");
});

Deno.test("--out without a value is rejected", () => {
  assertThrows(() => parseCliArgs(["export", "--out"]), Error, "--out expects");
});
