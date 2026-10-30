/**
 * @ember/editor/native/gdi — the editor's rasteriser.
 *
 * Owner: this file owns Win32 GDI drawing primitives. It has no engine logic: the editor
 * panels and the `gdi-backend.ts` draw-command renderer both speak this small surface.
 *
 * GDI has no alpha channel, so translucent *shapes* are flattened to their RGB value. That
 * is acceptable for an authoring view; the exported game still uses the real canvas
 * backend. Textures are the exception: `alphaBlit` draws 32-bit RGBA pixels through
 * `AlphaBlend`, so sprites keep their alpha edges and translucency.
 */

import { parseColor, rgba, Theme } from "@ember/core";
import type { RgbaImage } from "@ember/render2d";
import type { Win32Window } from "./win32.ts";

type GdiLibrary = Win32Window["gdi32"];
/** `msimg32.dll`, the one place per-pixel alpha lives in Win32. */
type BlendLibrary = Win32Window["msimg32"];

const TRANSPARENT = 1;
const PS_SOLID = 0;
const NULL_BRUSH = 5;
const DIB_RGB_COLORS = 0;
/** BLENDFUNCTION { AC_SRC_OVER, 0, 255, AC_SRC_ALPHA } passed by value as a 32-bit word. */
const BLEND_SOURCE_ALPHA = 0x01ff0000;

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
  /** Absent only on a system without `msimg32.dll`; `alphaBlit` then draws a placeholder. */
  private readonly blend: BlendLibrary | null;
  private readonly brushes = new Map<string, Deno.PointerValue>();
  private readonly pens = new Map<string, Deno.PointerValue>();
  private readonly fonts = new Map<string, Deno.PointerValue>();
  private saved = 0;
  /** Scratch surface textures are copied into before `AlphaBlend` puts them on the DC. */
  private blitDc: Deno.PointerValue = null;
  private blitBitmap: Deno.PointerValue = null;
  private blitPrevious: Deno.PointerValue = null;
  private blitBits: Deno.PointerObject | null = null;
  private blitWidth = 0;
  private blitHeight = 0;

  constructor(gdi: GdiLibrary, hdc: Deno.PointerValue, blend: BlendLibrary | null = null) {
    this.gdi = gdi;
    this.hdc = hdc;
    this.blend = blend;
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
    mono = false,
  ): void {
    if (value.length === 0) return;
    const width = this.measureText(value, size, bold, mono);
    let left = x;
    if (align === "center") left -= width / 2;
    else if (align === "right") left -= width;
    let top = y;
    if (baseline === "middle") top -= size / 2;
    else if (baseline === "bottom") top -= size;
    this.selectFont(size, bold, mono);
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

  measureText(value: string, size: number, bold = false, mono = false): number {
    if (value.length === 0) return 0;
    this.selectFont(size, bold, mono);
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

  /**
   * Draws RGBA pixels (straight alpha) with their own alpha channel at `x`,`y`, 1:1. Uses a
   * memory DIB section plus `AlphaBlend`, so semi-transparent pixels blend with what is
   * already on the DC. Falls back to a flat box when the blend library is unavailable.
   */
  alphaBlit(image: RgbaImage, x: number, y: number): void {
    if (image.width <= 0 || image.height <= 0) return;
    if (!this.ensureBlitSurface(image.width, image.height) || !this.blitBits || !this.blitDc) {
      this.placeholderBlit(image, x, y);
      return;
    }
    const stride = this.blitWidth * 4;
    const target = new Uint8Array(
      Deno.UnsafePointerView.getArrayBuffer(this.blitBits, stride * image.height),
    );
    const pixels = image.pixels;
    for (let row = 0; row < image.height; row++) {
      let source = row * image.width * 4;
      let destination = row * stride;
      for (let column = 0; column < image.width; column++) {
        // A 32-bit DIB stores blue first, then green, red and the alpha byte.
        target[destination] = pixels[source + 2];
        target[destination + 1] = pixels[source + 1];
        target[destination + 2] = pixels[source];
        target[destination + 3] = pixels[source + 3];
        source += 4;
        destination += 4;
      }
    }
    const drawn = this.blend?.symbols.AlphaBlend(
      this.hdc,
      Math.round(x),
      Math.round(y),
      image.width,
      image.height,
      this.blitDc,
      0,
      0,
      image.width,
      image.height,
      BLEND_SOURCE_ALPHA,
    );
    if (!drawn) this.placeholderBlit(image, x, y);
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
    this.releaseBlitSurface();
  }

  /** One scratch DIB section, grown on demand and kept for the life of the canvas. */
  private ensureBlitSurface(width: number, height: number): boolean {
    if (!this.blend) return false;
    if (this.blitBits && width <= this.blitWidth && height <= this.blitHeight) return true;
    this.releaseBlitSurface();
    const dc = this.gdi.symbols.CreateCompatibleDC(this.hdc);
    if (!dc) return false;
    const header = new DataView(new ArrayBuffer(44));
    header.setUint32(0, 40, true); // biSize
    header.setInt32(4, Math.max(width, this.blitWidth), true); // biWidth
    header.setInt32(8, -Math.max(height, this.blitHeight), true); // biHeight (top-down)
    header.setUint16(12, 1, true); // biPlanes
    header.setUint16(14, 32, true); // biBitCount
    header.setUint32(16, 0, true); // BI_RGB
    const bitsOut = new Uint8Array(8);
    const bitmap = this.gdi.symbols.CreateDIBSection(
      dc,
      Deno.UnsafePointer.of(new Uint8Array(header.buffer)),
      DIB_RGB_COLORS,
      Deno.UnsafePointer.of(bitsOut),
      null,
      0,
    );
    const bits = Deno.UnsafePointer.create(new DataView(bitsOut.buffer).getBigUint64(0, true));
    if (!bitmap || !bits) {
      if (bitmap) this.gdi.symbols.DeleteObject(bitmap);
      this.gdi.symbols.DeleteDC(dc);
      return false;
    }
    this.blitDc = dc;
    this.blitBitmap = bitmap;
    this.blitPrevious = this.gdi.symbols.SelectObject(dc, bitmap);
    this.blitBits = bits;
    this.blitWidth = header.getInt32(4, true);
    this.blitHeight = Math.abs(header.getInt32(8, true));
    return true;
  }

  private releaseBlitSurface(): void {
    if (this.blitBitmap && this.blitDc) {
      this.gdi.symbols.SelectObject(this.blitDc, this.blitPrevious ?? null);
      this.gdi.symbols.DeleteObject(this.blitBitmap);
    }
    if (this.blitDc) this.gdi.symbols.DeleteDC(this.blitDc);
    this.blitDc = null;
    this.blitBitmap = null;
    this.blitPrevious = null;
    this.blitBits = null;
    this.blitWidth = 0;
    this.blitHeight = 0;
  }

  /** Last resort for a machine without `AlphaBlend`: a box of the texture's average colour. */
  private placeholderBlit(image: RgbaImage, x: number, y: number): void {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let index = 0; index < image.pixels.length; index += 4) {
      if (image.pixels[index + 3] === 0) continue;
      red += image.pixels[index];
      green += image.pixels[index + 1];
      blue += image.pixels[index + 2];
      count++;
    }
    if (count === 0) return;
    this.fillRect(x, y, image.width, image.height, rgba(red / count, green / count, blue / count));
    this.strokeRect(x, y, image.width, image.height, Theme.borderSoft);
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

  private selectFont(size: number, bold: boolean, mono = false): void {
    const height = Math.max(8, Math.round(size));
    const key = `${height}:${bold ? 600 : 400}:${mono ? "mono" : "ui"}`;
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
        Deno.UnsafePointer.of(wide(mono ? "Consolas" : "Segoe UI")),
      );
      this.fonts.set(key, font);
    }
    this.gdi.symbols.SelectObject(this.hdc, font);
  }
}
