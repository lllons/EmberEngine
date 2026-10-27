/**
 * @ember/editor/native/gdi — the editor's rasteriser.
 *
 * Owner: this file owns Win32 GDI drawing primitives. It has no engine logic: the editor
 * panels and the `gdi-backend.ts` draw-command renderer both speak this small surface.
 *
 * GDI has no alpha channel, so translucent colours are flattened to their RGB value. That
 * is acceptable for an authoring view; the exported game still uses the real canvas
 * backend.
 */

import { parseColor } from "@ember/core";
import type { Win32Window } from "./win32.ts";

type GdiLibrary = Win32Window["gdi32"];

const TRANSPARENT = 1;
const PS_SOLID = 0;
const NULL_BRUSH = 5;

function colorRef(color: string): number {
  const parsed = parseColor(color);
  if (!parsed) return 0;
  const r = Math.round(Math.min(255, Math.max(0, parsed.r)));
  const g = Math.round(Math.min(255, Math.max(0, parsed.g)));
  const b = Math.round(Math.min(255, Math.max(0, parsed.b)));
  return b * 0x010000 + g * 0x000100 + r;
}

function wide(text: string): Uint16Array {
  const buffer = new Uint16Array(text.length);
  for (let index = 0; index < text.length; index++) buffer[index] = text.charCodeAt(index);
  return buffer;
}

export class GdiCanvas {
  private readonly gdi: GdiLibrary;
  private readonly hdc: Deno.PointerValue;
  private readonly brushes = new Map<string, Deno.PointerValue>();
  private readonly pens = new Map<string, Deno.PointerValue>();
  private readonly fonts = new Map<string, Deno.PointerValue>();
  private saved = 0;

  constructor(gdi: GdiLibrary, hdc: Deno.PointerValue) {
    this.gdi = gdi;
    this.hdc = hdc;
    this.gdi.symbols.SetBkMode(this.hdc, TRANSPARENT);
  }

  fillRect(x: number, y: number, width: number, height: number, color: string): void {
    if (width <= 0 || height <= 0) return;
    // `Rectangle` fills with the selected brush and outlines with the selected pen.
    this.selectBrush(color);
    this.selectPen(color, 1);
    this.gdi.symbols.Rectangle(
      this.hdc,
      Math.round(x),
      Math.round(y),
      Math.round(x + width),
      Math.round(y + height),
    );
  }

  strokeRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    lineWidth = 1,
  ): void {
    this.selectPen(color, lineWidth);
    this.selectStockBrush(NULL_BRUSH);
    this.gdi.symbols.Rectangle(
      this.hdc,
      Math.round(x),
      Math.round(y),
      Math.round(x + width),
      Math.round(y + height),
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, lineWidth = 1): void {
    this.selectPen(color, lineWidth);
    this.gdi.symbols.MoveToEx(this.hdc, Math.round(x1), Math.round(y1), null);
    this.gdi.symbols.LineTo(this.hdc, Math.round(x2), Math.round(y2));
  }

  ellipse(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    filled: boolean,
    lineWidth = 1,
  ): void {
    if (filled) {
      this.selectBrush(color);
    } else {
      this.selectStockBrush(NULL_BRUSH);
    }
    this.selectPen(color, lineWidth);
    this.gdi.symbols.Ellipse(
      this.hdc,
      Math.round(x),
      Math.round(y),
      Math.round(x + width),
      Math.round(y + height),
    );
  }

  polygon(
    points: ReadonlyArray<{ x: number; y: number }>,
    color: string,
    filled: boolean,
    lineWidth = 1,
  ): void {
    if (points.length < 3) return;
    const buffer = new Uint8Array(points.length * 8);
    const view = new DataView(buffer.buffer);
    points.forEach((point, index) => {
      view.setInt32(index * 8, Math.round(point.x), true);
      view.setInt32(index * 8 + 4, Math.round(point.y), true);
    });
    if (filled) this.selectBrush(color);
    else this.selectStockBrush(NULL_BRUSH);
    this.selectPen(color, lineWidth);
    this.gdi.symbols.Polygon(this.hdc, Deno.UnsafePointer.of(buffer), points.length);
  }

  text(
    x: number,
    y: number,
    value: string,
    size: number,
    color: string,
    align: "left" | "center" | "right" = "left",
    baseline: "top" | "middle" | "bottom" = "top",
    bold = false,
  ): void {
    if (value.length === 0) return;
    const width = this.measureText(value, size, bold);
    let left = x;
    if (align === "center") left -= width / 2;
    else if (align === "right") left -= width;
    let top = y;
    if (baseline === "middle") top -= size / 2;
    else if (baseline === "bottom") top -= size;
    this.selectFont(size, bold);
    this.gdi.symbols.SetTextColor(this.hdc, colorRef(color));
    const buffer = wide(value);
    this.gdi.symbols.TextOutW(
      this.hdc,
      Math.round(left),
      Math.round(top),
      Deno.UnsafePointer.of(buffer),
      value.length,
    );
  }

  measureText(value: string, size: number, bold = false): number {
    if (value.length === 0) return 0;
    this.selectFont(size, bold);
    const buffer = wide(value);
    const measured = new Uint8Array(8);
    this.gdi.symbols.GetTextExtentPoint32W(
      this.hdc,
      Deno.UnsafePointer.of(buffer),
      value.length,
      Deno.UnsafePointer.of(measured),
    );
    return new DataView(measured.buffer).getInt32(0, true);
  }

  /** Saves the DC and clips subsequent drawing to the rectangle. Pair with `restore`. */
  clip(x: number, y: number, width: number, height: number): void {
    this.saved = this.gdi.symbols.SaveDC(this.hdc);
    this.gdi.symbols.IntersectClipRect(
      this.hdc,
      Math.round(x),
      Math.round(y),
      Math.round(x + width),
      Math.round(y + height),
    );
  }

  restore(): void {
    if (!this.saved) return;
    this.gdi.symbols.RestoreDC(this.hdc, this.saved);
    this.saved = 0;
  }

  dispose(): void {
    for (const brush of this.brushes.values()) this.gdi.symbols.DeleteObject(brush);
    for (const pen of this.pens.values()) this.gdi.symbols.DeleteObject(pen);
    for (const font of this.fonts.values()) this.gdi.symbols.DeleteObject(font);
    this.brushes.clear();
    this.pens.clear();
    this.fonts.clear();
  }

  private brush(color: string): Deno.PointerValue {
    const key = String(colorRef(color));
    let brush = this.brushes.get(key);
    if (!brush) {
      brush = this.gdi.symbols.CreateSolidBrush(colorRef(color));
      this.brushes.set(key, brush);
    }
    return brush;
  }

  private pen(color: string, lineWidth: number): Deno.PointerValue {
    const key = `${colorRef(color)}:${lineWidth}`;
    let pen = this.pens.get(key);
    if (!pen) {
      pen = this.gdi.symbols.CreatePen(PS_SOLID, Math.max(1, Math.round(lineWidth)), colorRef(color));
      this.pens.set(key, pen);
    }
    return pen;
  }

  private selectBrush(color: string): void {
    this.gdi.symbols.SelectObject(this.hdc, this.brush(color));
  }

  private selectStockBrush(index: number): void {
    this.gdi.symbols.SelectObject(this.hdc, this.gdi.symbols.GetStockObject(index));
  }

  private selectPen(color: string, lineWidth: number): void {
    this.gdi.symbols.SelectObject(this.hdc, this.pen(color, lineWidth));
  }

  private selectFont(size: number, bold: boolean): void {
    const height = Math.max(8, Math.round(size));
    const key = `${height}:${bold ? 600 : 400}`;
    let font = this.fonts.get(key);
    if (!font) {
      font = this.gdi.symbols.CreateFontW(
        -height,
        0,
        0,
        0,
        bold ? 600 : 400,
        0,
        0,
        0,
        1,
        0,
        0,
        5,
        0,
        Deno.UnsafePointer.of(wide("Segoe UI")),
      );
      this.fonts.set(key, font);
    }
    this.gdi.symbols.SelectObject(this.hdc, font);
  }
}
