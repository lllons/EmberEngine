/**
 * @ember/core/color — parsing, alpha maths and luminance, used by the renderer and editor.
 */

import { assert, assertAlmostEquals, assertEquals, assertNotEquals } from "@std/assert";
import {
  type Color,
  Colors,
  contrastingText,
  luminance,
  mix,
  multiplyAlpha,
  parseColor,
  rgba,
  withAlpha,
} from "@ember/core";

Deno.test("parseColor reads 3-digit hex", () => {
  assertEquals(parseColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
  assertEquals(parseColor("#f0a"), { r: 255, g: 0, b: 170, a: 1 });
});

Deno.test("parseColor reads 6-digit hex", () => {
  assertEquals(parseColor("#ff7a2f"), { r: 255, g: 122, b: 47, a: 1 });
  assertEquals(parseColor("  #000000  "), { r: 0, g: 0, b: 0, a: 1 });
});

Deno.test("parseColor reads 8-digit hex with alpha", () => {
  const parsed = parseColor("#ff000080")!;
  assertEquals([parsed.r, parsed.g, parsed.b], [255, 0, 0]);
  assertAlmostEquals(parsed.a, 128 / 255, 1e-9);
});

Deno.test("parseColor reads rgb() and rgba()", () => {
  assertEquals(parseColor("rgb(10, 20, 30)"), { r: 10, g: 20, b: 30, a: 1 });
  assertEquals(parseColor("rgba(10, 20, 30, 0.5)"), { r: 10, g: 20, b: 30, a: 0.5 });
});

Deno.test("parseColor reads named colours", () => {
  assertEquals(parseColor("black"), { r: 0, g: 0, b: 0, a: 1 });
  assertEquals(parseColor("white"), { r: 255, g: 255, b: 255, a: 1 });
  assertEquals(parseColor("transparent"), { r: 0, g: 0, b: 0, a: 0 });
});

Deno.test("parseColor returns null for junk instead of guessing", () => {
  for (const value of ["", "not-a-colour", "#12", "#123456789", "rgb(1,2)", "rgb(a,b,c)"]) {
    assertEquals(parseColor(value), null, `expected null for "${value}"`);
  }
});

Deno.test("rgba clamps channels and alpha", () => {
  assertEquals(rgba(300, -20, 10, 2), "rgba(255, 0, 10, 1)");
  assertEquals(rgba(1.4, 2.6, 3.5, -1), "rgba(1, 3, 4, 0)");
});

Deno.test("rgba output round-trips through parseColor", () => {
  const value = rgba(12, 34, 56, 0.25);
  assertEquals(parseColor(value), { r: 12, g: 34, b: 56, a: 0.25 });
});

Deno.test("rgba default alpha is 1", () => {
  assertAlmostEquals(parseColor(rgba(9, 9, 9))!.a, 1, 1e-9);
});

Deno.test("withAlpha replaces alpha and keeps the rgb channels", () => {
  const result = parseColor(withAlpha("#ff7a2f", 0.4))!;
  assertEquals([result.r, result.g, result.b], [255, 122, 47]);
  assertAlmostEquals(result.a, 0.4, 1e-9);
});

Deno.test("withAlpha clamps and passes unknown formats through", () => {
  assertAlmostEquals(parseColor(withAlpha("#ff0000", 5))!.a, 1, 1e-9);
  assertAlmostEquals(parseColor(withAlpha("#ff0000", -5))!.a, 0, 1e-9);
  const unknown: Color = "var(--ember)";
  assertEquals(withAlpha(unknown, 0.5), unknown);
});

for (const [label, input, factor, expected] of [
  ["half", "#ffffff", 0.5, 0.5],
  ["full", "#ffffff", 1, 1],
  ["doubling", "rgba(0,0,0,0.5)", 2, 1],
  ["zero", "#ffffff", 0, 0],
] as Array<[string, Color, number, number]>) {
  Deno.test(`multiplyAlpha ${label}`, () => {
    assertAlmostEquals(parseColor(multiplyAlpha(input, factor))!.a, expected, 1e-9);
  });
}

Deno.test("multiplyAlpha keeps alpha when the colour has none", () => {
  assertAlmostEquals(parseColor(multiplyAlpha("#000000", 0.1))!.a, 0.1, 1e-9);
});

Deno.test("mix blends channel by channel", () => {
  const result = parseColor(mix("#000000", "#ffffff", 0.5))!;
  assertEquals([result.r, result.g, result.b], [128, 128, 128]);
});

Deno.test("mix clamps t outside [0,1]", () => {
  assertEquals(parseColor(mix("#000000", "#ffffff", -1))!.r, 0);
  assertEquals(parseColor(mix("#000000", "#ffffff", 2))!.r, 255);
});

Deno.test("mix falls back for unparseable input without throwing", () => {
  const result = mix("nonsense", "#ffffff", 0.25);
  assert(typeof result === "string" && result.length > 0);
});

Deno.test("mix blends alpha too", () => {
  const result = parseColor(mix("rgba(0,0,0,0)", "rgba(0,0,0,1)", 0.5))!;
  assertAlmostEquals(result.a, 0.5, 1e-9);
});

Deno.test("luminance ranks black below white", () => {
  assertAlmostEquals(luminance("#000000"), 0, 1e-9);
  assertAlmostEquals(luminance("#ffffff"), 1, 1e-9);
  assert(luminance("#ff7a2f") > luminance("#2b4a7d"));
});

Deno.test("luminance of an unparseable colour is 0", () => {
  assertEquals(luminance("nope"), 0);
});

Deno.test("contrastingText picks ink on light and white on dark", () => {
  assertEquals(contrastingText("#ffffff"), Colors.ink);
  assertEquals(contrastingText("#000000"), Colors.white);
  assertEquals(contrastingText("#ffc857"), Colors.ink);
  assertEquals(contrastingText("#10131a"), Colors.white);
});

Deno.test("the engine palette is parseable", () => {
  for (const [name, value] of Object.entries(Colors)) {
    assertNotEquals(value.length, 0, `${name} is empty`);
    assert(parseColor(value) !== null || value.startsWith("rgba"), `${name} (${value}) is not a colour`);
  }
});

Deno.test("transparent is fully transparent", () => {
  const parsed = parseColor(Colors.transparent)!;
  assertAlmostEquals(parsed.a, 0, 1e-9);
});

Deno.test("parseColor is case-insensitive", () => {
  assertEquals(parseColor("#FF7A2F"), parseColor("#ff7a2f"));
  assertEquals(parseColor("WHITE"), parseColor("white"));
  assertEquals(parseColor("RGB(1, 2, 3)"), parseColor("rgb(1, 2, 3)"));
});
