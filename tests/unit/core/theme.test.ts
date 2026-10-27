/**
 * The palette is the product's single source of colour truth, so it is asserted like a
 * contract: every token is a real colour, the neutrals are truly neutral, and the text
 * pairs stay readable on the near-black background the editor and player ship.
 */

import { parseColor } from "../../../packages/core/color.ts";
import { Palette, Theme } from "../../../packages/core/theme.ts";
import { assert, assertEqual } from "../../harness.ts";

/** WCAG relative luminance for a hex token. */
function relativeLuminance(color: string): number {
  const parsed = parseColor(color);
  assert(parsed !== null, `not a colour: ${color}`);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(parsed.r) + 0.7152 * channel(parsed.g) + 0.0722 * channel(parsed.b);
}

function contrast(a: string, b: string): number {
  const high = Math.max(relativeLuminance(a), relativeLuminance(b));
  const low = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (high + 0.05) / (low + 0.05);
}

Deno.test("theme tokens are all valid colours", () => {
  for (const [name, value] of Object.entries(Theme)) {
    assert(parseColor(value) !== null, `${name} is a colour (${value})`);
  }
});

Deno.test("theme neutrals are grey and accents are red and orange", () => {
  const accents = new Set<string>([
    Palette.orange,
    Palette.orangeDeep,
    Palette.orangeDim,
    Palette.red,
    Palette.redLight,
    Palette.redDeep,
    Palette.redDim,
  ]);
  for (const [name, value] of Object.entries(Theme)) {
    if (accents.has(value)) continue;
    const parsed = parseColor(value);
    assert(parsed !== null, `${name} parses`);
    assertEqual(parsed.r, parsed.g, `${name} red equals green`);
    assertEqual(parsed.g, parsed.b, `${name} green equals blue`);
  }
  // Orange carries interaction; red carries danger. Neither is a leftover blue.
  const orange = parseColor(Theme.accent)!;
  assert(orange.r > orange.g && orange.g > orange.b, "accent is orange");
  const red = parseColor(Theme.danger)!;
  assert(red.r > red.g * 2 && red.r > red.b * 2, "danger is red");
});

Deno.test("theme text stays legible on the background", () => {
  assert(contrast(Theme.text, Theme.background) >= 7, "body text reaches AAA on black");
  assert(contrast(Theme.muted, Theme.background) >= 4.5, "muted text reaches AA on black");
  assert(contrast(Theme.faint, Theme.background) >= 3, "faint text stays visible");
  assert(contrast(Theme.dangerLight, Theme.dangerSoft) >= 4.5, "danger text reads on its chip");
});
