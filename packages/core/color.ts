/**
 * @ember/core/color — CSS colour values with the small amount of math the engine needs.
 *
 * Owner: this file owns colour representation. Colours are CSS strings so browser
 * backends can assign them directly and scene files stay human readable.
 */

export type Color = string;

export const Colors = {
  transparent: "rgba(0, 0, 0, 0)",
  black: "#000000",
  white: "#ffffff",
  ink: "#10131a",
  slate: "#1b2030",
  slateLight: "#2a3350",
  ember: "#ff7a2f",
  emberDeep: "#d94f12",
  gold: "#ffc857",
  sky: "#7fb2ff",
  skyDeep: "#2b4a7d",
  grass: "#5ec27a",
  hazard: "#e5484d",
  grey: "#8b93a7",
} as const;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, Rgba> = {
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

/** Parses `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()` and a few names. */
export function parseColor(color: Color): Rgba | null {
  const text = color.trim().toLowerCase();
  if (text.startsWith("#")) {
    const hex = text.slice(1);
    if (hex.length === 3) {
      const [r, g, b] = [...hex].map((c) => parseInt(c + c, 16));
      return { r, g, b, a: 1 };
    }
    if (hex.length === 4) {
      const [r, g, b, a] = [...hex].map((c) => parseInt(c + c, 16));
      return { r, g, b, a: a / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
      return { r, g, b, a };
    }
    return null;
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(text);
  if (fn) {
    const parts = fn[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    return {
      r: parts[0],
      g: parts[1],
      b: parts[2],
      a: parts[3] === undefined ? 1 : parts[3],
    };
  }
  return NAMED[text] ?? null;
}

function channel(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)));
}

export function rgba(r: number, g: number, b: number, a = 1): Color {
  return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${Math.min(1, Math.max(0, a))})`;
}

/** Returns the colour with a new alpha; unknown formats fall back to the input. */
export function withAlpha(color: Color, alpha: number): Color {
  const parsed = parseColor(color);
  if (!parsed) return color;
  return rgba(parsed.r, parsed.g, parsed.b, Math.min(1, Math.max(0, alpha)));
}

/** Multiplies the existing alpha. */
export function multiplyAlpha(color: Color, factor: number): Color {
  const parsed = parseColor(color);
  if (!parsed) return color;
  return rgba(parsed.r, parsed.g, parsed.b, Math.min(1, Math.max(0, parsed.a * factor)));
}

/** Linear blend between two colours; `t=0` is `a`, `t=1` is `b`. */
export function mix(a: Color, b: Color, t: number): Color {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  const k = Math.min(1, Math.max(0, t));
  return rgba(
    ca.r + (cb.r - ca.r) * k,
    ca.g + (cb.g - ca.g) * k,
    ca.b + (cb.b - ca.b) * k,
    ca.a + (cb.a - ca.a) * k,
  );
}

/** Perceived luminance in [0, 1]; used to pick readable text colours. */
export function luminance(color: Color): number {
  const parsed = parseColor(color);
  if (!parsed) return 0;
  return (0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b) / 255;
}

export function contrastingText(color: Color): Color {
  return luminance(color) > 0.55 ? Colors.ink : Colors.white;
}
