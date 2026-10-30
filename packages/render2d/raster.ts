/**
 * @ember/render2d/raster — software rasterisation into RGBA bytes.
 *
 * Owner: this file owns "turn Context2D drawing (and sprite transforms) into pixels" without
 * a browser. The browser host rasterises through a DOM canvas; the native editor and headless
 * tools use this instead, so a procedural texture and a tinted, rotated, flipped sprite look
 * the same everywhere. Pure: no DOM, no FFI, deterministic for a given drawing sequence.
 *
 * Supported: `fillRect`, `strokeRect`, `clearRect`, path fills (`rect`, `arc`, `ellipse`,
 * `moveTo`/`lineTo`/`closePath`), path strokes, `translate`/`rotate`, `globalAlpha`,
 * `save`/`restore` and translucent colours. Coverage is 2x2 supersampled, which is enough
 * anti-aliasing for sprite-sized artwork.
 *
 * Unsupported, because nothing in the engine needs them yet: `fillText` and `drawImage`.
 * Both are recorded in `RasterSurface.unsupported` and draw nothing, so a texture using them
 * is visibly incomplete instead of silently wrong.
 */

import { type Color, parseColor } from "@ember/core";
import type { Context2D } from "./backends/canvas2d.ts";
import type { UvRect } from "./commands.ts";

/** Straight-alpha RGBA pixels, row-major, top-down. */
export interface RgbaImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export function createRgbaImage(width: number, height: number): RgbaImage {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return { width: w, height: h, pixels: new Uint8Array(w * h * 4) };
}

/** Reads one pixel as `[r, g, b, a]` (0-255); out-of-range reads are transparent. */
export function readPixel(image: RgbaImage, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return [0, 0, 0, 0];
  const index = (y * image.width + x) * 4;
  return [
    image.pixels[index],
    image.pixels[index + 1],
    image.pixels[index + 2],
    image.pixels[index + 3],
  ];
}

export interface RasterSurface {
  ctx: Context2D;
  /** The pixels the context draws into. */
  image: RgbaImage;
  /** Calls this rasteriser skipped, in call order (e.g. `fillText`). */
  unsupported: string[];
}

interface Point {
  x: number;
  y: number;
}

/** Canvas-style affine matrix: x' = a·x + c·y + e, y' = b·x + d·y + f. */
interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Path {
  points: Point[];
  closed: boolean;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Sample offsets inside one pixel; the average of the inside hits is its coverage. */
const SUBSAMPLES: ReadonlyArray<readonly [number, number]> = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
];

function colorOf(value: unknown): Rgba | null {
  return typeof value === "string" ? parseColor(value as Color) : null;
}

function applyMatrix(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

/** Uniform scale a matrix applies, used to scale stroke widths like a canvas does. */
function matrixScale(matrix: Matrix): number {
  const determinant = Math.abs(matrix.a * matrix.d - matrix.b * matrix.c);
  return determinant > 0 ? Math.sqrt(determinant) : 1;
}

function rotatePoint(point: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

/** Source-over blend of a colour at `alpha` into one pixel. */
function blendPixel(image: RgbaImage, x: number, y: number, color: Rgba, alpha: number): void {
  if (alpha <= 0 || x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const a = Math.min(1, alpha * color.a);
  if (a <= 0) return;
  const index = (y * image.width + x) * 4;
  const pixels = image.pixels;
  const dstAlpha = pixels[index + 3] / 255;
  const outAlpha = a + dstAlpha * (1 - a);
  if (outAlpha <= 0) {
    pixels[index] = 0;
    pixels[index + 1] = 0;
    pixels[index + 2] = 0;
    pixels[index + 3] = 0;
    return;
  }
  const keep = dstAlpha * (1 - a);
  pixels[index] = Math.round((color.r * a + pixels[index] * keep) / outAlpha);
  pixels[index + 1] = Math.round((color.g * a + pixels[index + 1] * keep) / outAlpha);
  pixels[index + 2] = Math.round((color.b * a + pixels[index + 2] * keep) / outAlpha);
  pixels[index + 3] = Math.round(outAlpha * 255);
}

/** Non-zero winding number of the (implicitly closed) paths around a point. */
function winding(paths: readonly Path[], x: number, y: number): number {
  let total = 0;
  for (const path of paths) {
    const points = path.points;
    if (points.length < 3) continue;
    for (let index = 0; index < points.length; index++) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if (a.y <= y) {
        if (b.y > y && (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y) > 0) total++;
      } else if (b.y <= y && (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y) < 0) {
        total--;
      }
    }
  }
  return total;
}

function fillPaths(
  image: RgbaImage,
  paths: readonly Path[],
  color: Rgba,
  alpha: number,
): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (const point of path.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) return;
  const left = Math.max(0, Math.floor(minX));
  const top = Math.max(0, Math.floor(minY));
  const right = Math.min(image.width - 1, Math.ceil(maxX));
  const bottom = Math.min(image.height - 1, Math.ceil(maxY));
  for (let py = top; py <= bottom; py++) {
    for (let px = left; px <= right; px++) {
      let hits = 0;
      for (const [offsetX, offsetY] of SUBSAMPLES) {
        if (winding(paths, px + offsetX, py + offsetY) !== 0) hits++;
      }
      if (hits === 0) continue;
      blendPixel(image, px, py, color, alpha * (hits / SUBSAMPLES.length));
    }
  }
}

function distanceToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared));
  const cx = a.x + dx * t;
  const cy = a.y + dy * t;
  return Math.hypot(px - cx, py - cy);
}

function strokeSegment(
  image: RgbaImage,
  a: Point,
  b: Point,
  color: Rgba,
  alpha: number,
  halfWidth: number,
): void {
  const left = Math.max(0, Math.floor(Math.min(a.x, b.x) - halfWidth - 1));
  const top = Math.max(0, Math.floor(Math.min(a.y, b.y) - halfWidth - 1));
  const right = Math.min(image.width - 1, Math.ceil(Math.max(a.x, b.x) + halfWidth + 1));
  const bottom = Math.min(image.height - 1, Math.ceil(Math.max(a.y, b.y) + halfWidth + 1));
  for (let py = top; py <= bottom; py++) {
    for (let px = left; px <= right; px++) {
      let hits = 0;
      for (const [offsetX, offsetY] of SUBSAMPLES) {
        if (distanceToSegment(px + offsetX, py + offsetY, a, b) <= halfWidth) hits++;
      }
      if (hits === 0) continue;
      blendPixel(image, px, py, color, alpha * (hits / SUBSAMPLES.length));
    }
  }
}

function strokePaths(
  image: RgbaImage,
  paths: readonly Path[],
  color: Rgba,
  alpha: number,
  lineWidth: number,
): void {
  const halfWidth = Math.max(0.5, lineWidth) / 2;
  for (const path of paths) {
    const points = path.closed && path.points.length > 2
      ? [...path.points, path.points[0]]
      : path.points;
    for (let index = 0; index + 1 < points.length; index++) {
      strokeSegment(image, points[index], points[index + 1], color, alpha, halfWidth);
    }
    if (points.length === 1) {
      // A lone point paints nothing; canvas only dots it with a round line cap.
      strokeSegment(image, points[0], points[0], color, alpha, halfWidth);
    }
  }
}

/**
 * A `Context2D` that draws into an `RgbaImage`. Colours, alpha and paths behave like the
 * real canvas API; see the module header for what is intentionally missing.
 */
export function createRasterSurface(width: number, height: number): RasterSurface {
  const image = createRgbaImage(width, height);
  const unsupported: string[] = [];
  let matrix: Matrix = { ...IDENTITY };
  let fillStyle: unknown = "#000000";
  let strokeStyle: unknown = "#000000";
  let lineWidth = 1;
  let globalAlpha = 1;
  let font = "16px sans-serif";
  let textAlign = "start";
  let textBaseline = "alphabetic";
  const stack: Array<{
    matrix: Matrix;
    fillStyle: unknown;
    strokeStyle: unknown;
    lineWidth: number;
    globalAlpha: number;
  }> = [];
  let paths: Path[] = [];
  let current: Path | null = null;
  // Strokes are built from already-transformed points, so remember the scale they had.
  let strokeScale = 1;

  function surfacePoint(x: number, y: number): Point {
    return applyMatrix(matrix, { x, y });
  }

  function rectPath(x: number, y: number, w: number, h: number): Path {
    return {
      points: [
        surfacePoint(x, y),
        surfacePoint(x + w, y),
        surfacePoint(x + w, y + h),
        surfacePoint(x, y + h),
      ],
      closed: true,
    };
  }

  function beginPath(): void {
    paths = [];
    current = null;
    strokeScale = matrixScale(matrix);
  }

  function startSubpath(point: Point): Path {
    const path: Path = { points: [point], closed: false };
    paths.push(path);
    current = path;
    return path;
  }

  function addPoint(point: Point): void {
    const path = current ?? startSubpath(point);
    path.points.push(point);
  }

  function addCurve(
    cx: number,
    cy: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
  ): void {
    const segments = Math.max(12, Math.min(96, Math.ceil(Math.max(radiusX, radiusY) * 4)));
    const points: Point[] = [];
    for (let index = 0; index <= segments; index++) {
      const angle = startAngle + ((endAngle - startAngle) * index) / segments;
      const local = rotatePoint(
        { x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY },
        rotation,
      );
      points.push(surfacePoint(cx + local.x, cy + local.y));
    }
    if (!current) {
      startSubpath(points[0]);
      points.shift();
    }
    for (const point of points) addPoint(point);
  }

  const ctx: Context2D & { image: RgbaImage } = {
    image,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value) {
      fillStyle = value;
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(value) {
      strokeStyle = value;
    },
    get lineWidth() {
      return lineWidth;
    },
    set lineWidth(value) {
      lineWidth = Math.max(0, Number.isFinite(value) ? value : 0);
    },
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(value) {
      globalAlpha = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
    },
    get font() {
      return font;
    },
    set font(value) {
      font = value;
    },
    get textAlign() {
      return textAlign;
    },
    set textAlign(value) {
      textAlign = value;
    },
    get textBaseline() {
      return textBaseline;
    },
    set textBaseline(value) {
      textBaseline = value;
    },
    save(): void {
      stack.push({ matrix: { ...matrix }, fillStyle, strokeStyle, lineWidth, globalAlpha });
    },
    restore(): void {
      const previous = stack.pop();
      if (!previous) return;
      matrix = previous.matrix;
      fillStyle = previous.fillStyle;
      strokeStyle = previous.strokeStyle;
      lineWidth = previous.lineWidth;
      globalAlpha = previous.globalAlpha;
    },
    translate(x: number, y: number): void {
      matrix = {
        ...matrix,
        e: matrix.e + matrix.a * x + matrix.c * y,
        f: matrix.f + matrix.b * x + matrix.d * y,
      };
    },
    rotate(angle: number): void {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      matrix = {
        a: matrix.a * cos + matrix.c * sin,
        b: matrix.b * cos + matrix.d * sin,
        c: matrix.c * cos - matrix.a * sin,
        d: matrix.d * cos - matrix.b * sin,
        e: matrix.e,
        f: matrix.f,
      };
    },
    clearRect(x: number, y: number, w: number, h: number): void {
      const path = rectPath(x, y, w, h);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const point of path.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
      const left = Math.max(0, Math.round(minX));
      const top = Math.max(0, Math.round(minY));
      const right = Math.min(image.width, Math.round(maxX));
      const bottom = Math.min(image.height, Math.round(maxY));
      for (let py = top; py < bottom; py++) {
        for (let px = left; px < right; px++) {
          const index = (py * image.width + px) * 4;
          image.pixels[index] = 0;
          image.pixels[index + 1] = 0;
          image.pixels[index + 2] = 0;
          image.pixels[index + 3] = 0;
        }
      }
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      const color = colorOf(fillStyle);
      const path = rectPath(x, y, w, h);
      if (!color) return;
      fillPaths(image, [path], color, globalAlpha);
    },
    strokeRect(x: number, y: number, w: number, h: number): void {
      const color = colorOf(strokeStyle);
      const path = rectPath(x, y, w, h);
      if (!color) return;
      strokePaths(image, [path], color, globalAlpha, lineWidth * matrixScale(matrix));
    },
    beginPath,
    closePath(): void {
      if (current) current.closed = true;
    },
    moveTo(x: number, y: number): void {
      startSubpath(surfacePoint(x, y));
    },
    lineTo(x: number, y: number): void {
      addPoint(surfacePoint(x, y));
    },
    rect(x: number, y: number, w: number, h: number): void {
      const path = rectPath(x, y, w, h);
      paths.push(path);
      current = path;
    },
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void {
      addCurve(x, y, radius, radius, 0, startAngle, endAngle);
    },
    ellipse(
      x: number,
      y: number,
      radiusX: number,
      radiusY: number,
      rotation: number,
      startAngle: number,
      endAngle: number,
    ): void {
      addCurve(x, y, radiusX, radiusY, rotation, startAngle, endAngle);
    },
    fill(): void {
      const color = colorOf(fillStyle);
      if (!color || paths.length === 0) return;
      fillPaths(image, paths, color, globalAlpha);
    },
    stroke(): void {
      const color = colorOf(strokeStyle);
      if (!color || paths.length === 0) return;
      strokePaths(image, paths, color, globalAlpha, lineWidth * strokeScale);
    },
    fillText(): void {
      unsupported.push("fillText");
    },
    drawImage(): void {
      unsupported.push("drawImage");
    },
  };

  return { ctx, image, unsupported };
}

export interface SpriteSample {
  /** Source rect in normalized texture coordinates (`SpriteCommand.uv`). */
  uv: UvRect;
  /** Destination size in device pixels (already scaled by the viewport mapping). */
  width: number;
  height: number;
  /** Colour multiplied over the texture; omit or use white to draw it unmodified. */
  tint?: Color;
  /** Extra alpha multiplied into every pixel. */
  alpha?: number;
  flipX?: boolean;
  /** Rotation in radians around the sprite's anchor point. */
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
}

export interface SampledSprite {
  /** The transformed sprite; transparent outside the source rect. */
  image: RgbaImage;
  /** Offset of the image's top-left from the sprite's unrotated anchor position. */
  offsetX: number;
  offsetY: number;
}

/**
 * Draws a sprite into its own RGBA buffer: nearest-neighbour sampling (textures are pixel
 * art), tint and alpha multiplied in, optional horizontal flip, and rotation around the
 * anchor. The result is a ready-to-blit buffer plus where it goes, which is what a backend
 * without a transform stack needs.
 */
export function sampleSprite(source: RgbaImage, sample: SpriteSample): SampledSprite {
  const width = Math.max(1, Math.round(sample.width));
  const height = Math.max(1, Math.round(sample.height));
  const anchorX = sample.anchorX ?? 0.5;
  const anchorY = sample.anchorY ?? 0.5;
  const rotation = sample.rotation ?? 0;
  const tint = sample.tint ? colorOf(sample.tint) : null;
  const tintAlpha = (sample.alpha ?? 1) * (tint?.a ?? 1);

  const corners = [
    { x: -width * anchorX, y: -height * anchorY },
    { x: width * (1 - anchorX), y: -height * anchorY },
    { x: width * (1 - anchorX), y: height * (1 - anchorY) },
    { x: -width * anchorX, y: height * (1 - anchorY) },
  ].map((point) => (rotation === 0 ? point : rotatePoint(point, rotation)));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const corner of corners) {
    minX = Math.min(minX, corner.x);
    minY = Math.min(minY, corner.y);
    maxX = Math.max(maxX, corner.x);
    maxY = Math.max(maxY, corner.y);
  }
  // Snap away floating-point noise: an exact quarter turn must give exact pixel bounds.
  const snap = (value: number, round: (n: number) => number): number => {
    const nearest = Math.round(value);
    return Math.abs(value - nearest) < 1e-9 ? nearest : round(value);
  };
  const left = snap(minX, Math.floor);
  const top = snap(minY, Math.floor);
  const right = snap(maxX, Math.ceil);
  const bottom = snap(maxY, Math.ceil);
  const offsetX = left;
  const offsetY = top;
  const image = createRgbaImage(Math.max(1, right - left), Math.max(1, bottom - top));

  const spanU = sample.uv.u1 - sample.uv.u0;
  const spanV = sample.uv.v1 - sample.uv.v0;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);

  for (let py = 0; py < image.height; py++) {
    for (let px = 0; px < image.width; px++) {
      // Device pixel centre, back in the sprite's unrotated frame.
      const deviceX = offsetX + px + 0.5;
      const deviceY = offsetY + py + 0.5;
      const localX = rotation === 0 ? deviceX : deviceX * cos - deviceY * sin;
      const localY = rotation === 0 ? deviceY : deviceX * sin + deviceY * cos;
      const u = (localX + width * anchorX) / width;
      const v = (localY + height * anchorY) / height;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const uu = sample.flipX ? 1 - u : u;
      const sourceX = Math.min(
        source.width - 1,
        Math.max(0, Math.floor((sample.uv.u0 + uu * spanU) * source.width)),
      );
      const sourceY = Math.min(
        source.height - 1,
        Math.max(0, Math.floor((sample.uv.v0 + v * spanV) * source.height)),
      );
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const alpha = (source.pixels[sourceIndex + 3] / 255) * tintAlpha;
      if (alpha <= 0) continue;
      const index = (py * image.width + px) * 4;
      const scale = tint ? 1 / 255 : 0;
      image.pixels[index] = tint
        ? Math.round(source.pixels[sourceIndex] * tint.r * scale)
        : source.pixels[sourceIndex];
      image.pixels[index + 1] = tint
        ? Math.round(source.pixels[sourceIndex + 1] * tint.g * scale)
        : source.pixels[sourceIndex + 1];
      image.pixels[index + 2] = tint
        ? Math.round(source.pixels[sourceIndex + 2] * tint.b * scale)
        : source.pixels[sourceIndex + 2];
      image.pixels[index + 3] = Math.round(alpha * 255);
    }
  }

  return { image, offsetX, offsetY };
}
