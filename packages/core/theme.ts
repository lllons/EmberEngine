/**
 * @ember/core/theme — the engine's single palette.
 *
 * Owner: this file owns every colour the product ships. The native editor, the browser
 * player chrome and the games all read these tokens, so the product's look changes here
 * once instead of drifting per paint site.
 *
 * The look is black and white with red and orange accents: neutrals carry structure
 * (panels, borders, text), orange marks interaction and reward, red marks danger and
 * failure. Text pairs are chosen to stay legible on black (white/muted on ink).
 */

/** Raw colour values. Only this module should contain literal colours. */
export const Palette = {
  black: "#000000",
  ink: "#050505",
  coal: "#0a0a0a",
  panel: "#111111",
  raised: "#171717",
  border: "#272727",
  borderSoft: "#1c1c1c",
  field: "#0d0d0d",
  white: "#f5f5f5",
  text: "#e8e8e8",
  muted: "#9a9a9a",
  faint: "#666666",
  orange: "#ff7a2f",
  orangeDeep: "#d94f12",
  orangeDim: "#3a2318",
  red: "#e5484d",
  redLight: "#ff9aa0",
  redDeep: "#8f2329",
  redDim: "#2a1417",
} as const;

/** Semantic roles used by the editor, the player chrome and games. */
export const Theme = {
  background: Palette.ink,
  panel: Palette.panel,
  panelDeep: Palette.coal,
  header: Palette.raised,
  border: Palette.border,
  borderSoft: Palette.borderSoft,
  field: Palette.field,
  text: Palette.text,
  muted: Palette.muted,
  faint: Palette.faint,
  /** Primary accent: interaction, selection, rewards. */
  accent: Palette.orange,
  accentDeep: Palette.orangeDeep,
  accentSoft: Palette.orangeDim,
  /** Danger: failures, hazards, destructive actions. */
  danger: Palette.red,
  dangerLight: Palette.redLight,
  dangerDeep: Palette.redDeep,
  dangerSoft: Palette.redDim,
  /** Emphasis that must stay neutral (titles, success, highlights). */
  highlight: Palette.white,
  rowHover: Palette.raised,
  rowSelected: "#2a2a2a",
} as const;
