/** Colour: parsing, formatting, blending and contrast, all against hand-checked values. */

import {
  Colors,
  contrastingText,
  luminance,
  mix,
  multiplyAlpha,
  parseColor,
  rgba,
  withAlpha,
} from "@ember/core";
import { assertEqual, near, table } from "../harness.ts";

table("color/parse hex", [
  { label: "6-digit black", input: "#000000", expected: { r: 0, g: 0, b: 0, a: 1 } },
  { label: "6-digit white", input: "#ffffff", expected: { r: 255, g: 255, b: 255, a: 1 } },
  { label: "6-digit mixed", input: "#102030", expected: { r: 16, g: 32, b: 48, a: 1 } },
  { label: "3-digit red", input: "#f00", expected: { r: 255, g: 0, b: 0, a: 1 } },
  { label: "3-digit green", input: "#0f0", expected: { r: 0, g: 255, b: 0, a: 1 } },
  { label: "3-digit blue", input: "#00f", expected: { r: 0, g: 0, b: 255, a: 1 } },
  { label: "8-digit alpha", input: "#ff000080", expected: { r: 255, g: 0, b: 0, a: 128 / 255 } },
  { label: "4-digit alpha partial", input: "#f008", expected: { r: 255, g: 0, b: 0, a: 136 / 255 } },
  { label: "4-digit alpha opaque", input: "#f00f", expected: { r: 255, g: 0, b: 0, a: 1 } },
  { label: "uppercase", input: "#FF8000", expected: { r: 255, g: 128, b: 0, a: 1 } },
  { label: "surrounding whitespace", input: "  #ffffff  ", expected: { r: 255, g: 255, b: 255, a: 1 } },
] as const, (row) => assertEqual(parseColor(row.input), row.expected, row.label));

table("color/parse functions and names", [
  { label: "rgba", input: "rgba(10, 20, 30, 0.5)", expected: { r: 10, g: 20, b: 30, a: 0.5 } },
  { label: "rgb defaults to opaque", input: "rgb(1,2,3)", expected: { r: 1, g: 2, b: 3, a: 1 } },
  { label: "rgb with spaces", input: "rgb( 4 , 5 , 6 )", expected: { r: 4, g: 5, b: 6, a: 1 } },
  { label: "uppercase function", input: "RGB(7,8,9)", expected: { r: 7, g: 8, b: 9, a: 1 } },
  { label: "named black", input: "black", expected: { r: 0, g: 0, b: 0, a: 1 } },
  { label: "named white", input: "white", expected: { r: 255, g: 255, b: 255, a: 1 } },
  { label: "named red", input: "red", expected: { r: 255, g: 0, b: 0, a: 1 } },
  { label: "named green is CSS green", input: "green", expected: { r: 0, g: 128, b: 0, a: 1 } },
  { label: "named blue", input: "blue", expected: { r: 0, g: 0, b: 255, a: 1 } },
  { label: "named transparent", input: "transparent", expected: { r: 0, g: 0, b: 0, a: 0 } },
] as const, (row) => assertEqual(parseColor(row.input), row.expected, row.label));

table("color/parse rejects garbage", [
  { label: "unknown name", input: "chartreuse" },
  { label: "empty string", input: "" },
  { label: "five hex digits", input: "#12345" },
  { label: "seven hex digits", input: "#1234567" },
  { label: "non-hex characters", input: "#gggggg" },
  { label: "missing blue channel", input: "rgb(1,2)" },
  { label: "non-numeric channel", input: "rgb(a,b,c)" },
  { label: "function without parens", input: "rgb 1 2 3" },
] as const, (row) => assertEqual(parseColor(row.input), null, row.label));

table("color/rgba formatting", [
  { label: "plain", args: [255, 0, 0] as const, expected: "rgba(255, 0, 0, 1)" },
  { label: "with alpha", args: [1, 2, 3, 0.25] as const, expected: "rgba(1, 2, 3, 0.25)" },
  { label: "clamps high channels", args: [300, 0, 0] as const, expected: "rgba(255, 0, 0, 1)" },
  { label: "clamps low channels", args: [-20, 0, 0] as const, expected: "rgba(0, 0, 0, 1)" },
  { label: "rounds channels", args: [12.4, 12.6, 0] as const, expected: "rgba(12, 13, 0, 1)" },
  { label: "clamps alpha high", args: [0, 0, 0, 2] as const, expected: "rgba(0, 0, 0, 1)" },
  { label: "clamps alpha low", args: [0, 0, 0, -1] as const, expected: "rgba(0, 0, 0, 0)" },
] as const, (row) => {
  const [r, g, b, a] = row.args;
  assertEqual(rgba(r, g, b, a), row.expected, row.label);
});

table("color/withAlpha", [
  { label: "hex to rgba", input: "#ff0000", alpha: 0.5, expected: "rgba(255, 0, 0, 0.5)" },
  { label: "replaces existing alpha", input: "rgba(10, 20, 30, 0.4)", alpha: 0.9, expected: "rgba(10, 20, 30, 0.9)" },
  { label: "clamps above one", input: "#00ff00", alpha: 4, expected: "rgba(0, 255, 0, 1)" },
  { label: "clamps below zero", input: "#00ff00", alpha: -1, expected: "rgba(0, 255, 0, 0)" },
  { label: "unknown format is returned unchanged", input: "chartreuse", alpha: 0.5, expected: "chartreuse" },
] as const, (row) => assertEqual(withAlpha(row.input, row.alpha), row.expected, row.label));

table("color/multiplyAlpha", [
  { label: "halves alpha", input: "#ff0000", factor: 0.5, expected: "rgba(255, 0, 0, 0.5)" },
  { label: "compounds existing alpha", input: "rgba(0, 0, 0, 0.5)", factor: 0.5, expected: "rgba(0, 0, 0, 0.25)" },
  { label: "clamps at one", input: "rgba(0, 0, 0, 0.5)", factor: 5, expected: "rgba(0, 0, 0, 1)" },
  { label: "zero factor clears", input: "#ffffff", factor: 0, expected: "rgba(255, 255, 255, 0)" },
  { label: "unknown format is returned unchanged", input: "nope", factor: 0.5, expected: "nope" },
] as const, (row) => assertEqual(multiplyAlpha(row.input, row.factor), row.expected, row.label));

table("color/mix", [
  { label: "t=0 is the first colour", a: "#000000", b: "#ffffff", t: 0, expected: "rgba(0, 0, 0, 1)" },
  { label: "t=1 is the second colour", a: "#000000", b: "#ffffff", t: 1, expected: "rgba(255, 255, 255, 1)" },
  { label: "midpoint is mid grey", a: "#000000", b: "#ffffff", t: 0.5, expected: "rgba(128, 128, 128, 1)" },
  { label: "red to blue midpoint", a: "#ff0000", b: "#0000ff", t: 0.5, expected: "rgba(128, 0, 128, 1)" },
  { label: "alpha interpolates", a: "rgba(0, 0, 0, 0)", b: "rgba(255, 255, 255, 1)", t: 0.5, expected: "rgba(128, 128, 128, 0.5)" },
  { label: "t above one clamps", a: "#000000", b: "#ffffff", t: 3, expected: "rgba(255, 255, 255, 1)" },
  { label: "t below zero clamps", a: "#000000", b: "#ffffff", t: -3, expected: "rgba(0, 0, 0, 1)" },
] as const, (row) => assertEqual(mix(row.a, row.b, row.t), row.expected, row.label));

Deno.test("color/mix falls back to the nearest colour for unparseable input", () => {
  assertEqual(mix("nope", "#ffffff", 0.25), "nope");
  assertEqual(mix("#000000", "nope", 0.75), "nope");
});

table("color/luminance", [
  { label: "white is 1", input: "#ffffff", value: 1 },
  { label: "black is 0", input: "#000000", value: 0 },
  { label: "red channel weight", input: "#ff0000", value: 0.2126 },
  { label: "green channel weight", input: "#00ff00", value: 0.7152 },
  { label: "blue channel weight", input: "#0000ff", value: 0.0722 },
  { label: "mid grey", input: "#808080", value: 128 / 255 },
  { label: "engine ink is dark", input: Colors.ink, value: 5 / 255 },
] as const, (row) => near(luminance(row.input), row.value, 1e-9, row.label));

Deno.test("color/luminance of unparseable input is 0", () => {
  near(luminance("nope"), 0, 0);
});

table("color/contrastingText", [
  { label: "white gets ink", input: "#ffffff", expected: Colors.ink },
  { label: "black gets white", input: "#000000", expected: Colors.white },
  { label: "mid grey gets white", input: "#808080", expected: Colors.white },
  { label: "gold gets ink", input: Colors.gold, expected: Colors.ink },
  { label: "engine ink gets white", input: Colors.ink, expected: Colors.white },
  { label: "sky gets white", input: Colors.skyDeep, expected: Colors.white },
] as const, (row) => assertEqual(contrastingText(row.input), row.expected, row.label));
