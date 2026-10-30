/**
 * @ember/assets — the asset pipeline.
 *
 * Owner: this file owns what an asset *is*: how files on disk are described in a manifest,
 * how a running game resolves asset keys to drawable images, how procedural textures are
 * built, and how assets are inlined into an exported game.
 *
 * Two kinds of assets are supported on purpose:
 * 1. **File assets** — discovered on disk by the editor's asset browser and inlined as data
 *    URIs into the exported `.exe` (so the executable is self-contained).
 * 2. **Procedural textures** — described in code (`TextureSource`) and rendered by the host's
 *    canvas factory. They need no files at all, yet still produce real sprite images in the
 *    browser and stubs headlessly, which keeps tests deterministic.
 */

import { createRasterSurface, type Context2D, type TextureLike } from "@ember/render2d";

export const ASSET_MANIFEST_FORMAT = "emberassets";
export const ASSET_MANIFEST_VERSION = 1;

export type AssetKind = "image" | "audio" | "json" | "text" | "scene" | "other";

export interface AssetEntry {
  /** Stable key the game refers to (usually the path relative to the game folder). */
  id: string;
  kind: AssetKind;
  /** Path relative to the game folder, POSIX separators. */
  path: string;
  bytes?: number;
  mime?: string;
  /** Set by the packager: the asset inlined as a `data:` URI. */
  dataUri?: string;
}

export interface AssetManifest {
  format: typeof ASSET_MANIFEST_FORMAT;
  version: number;
  /** Game folder this manifest describes (relative or absolute). */
  root: string;
  entries: AssetEntry[];
}

const KIND_BY_EXTENSION: Record<string, AssetKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  svg: "image",
  wav: "audio",
  mp3: "audio",
  ogg: "audio",
  json: "json",
  emberscene: "scene",
  txt: "text",
  md: "text",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  json: "application/json",
  emberscene: "application/json",
  txt: "text/plain",
  md: "text/markdown",
};

export function extensionOf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function assetKindOf(path: string): AssetKind {
  return KIND_BY_EXTENSION[extensionOf(path)] ?? "other";
}

export function mimeTypeOf(path: string): string {
  return MIME_BY_EXTENSION[extensionOf(path)] ?? "application/octet-stream";
}

export function isImagePath(path: string): boolean {
  return assetKindOf(path) === "image";
}

/** A path that is only a data URI has no on-disk file behind it. */
export function isDataUri(value: string): boolean {
  return value.startsWith("data:");
}

// ---------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------

export function createManifest(root = "."): AssetManifest {
  return { format: ASSET_MANIFEST_FORMAT, version: ASSET_MANIFEST_VERSION, root, entries: [] };
}

export function createEntry(path: string, options: { id?: string; bytes?: number } = {}): AssetEntry {
  const normalized = path.replace(/\\/g, "/");
  return {
    id: options.id ?? normalized,
    kind: assetKindOf(normalized),
    path: normalized,
    bytes: options.bytes,
    mime: mimeTypeOf(normalized),
  };
}

export function addEntry(manifest: AssetManifest, entry: AssetEntry): AssetEntry {
  const existing = manifest.entries.findIndex((item) => item.id === entry.id);
  if (existing >= 0) manifest.entries[existing] = entry;
  else manifest.entries.push(entry);
  return entry;
}

export function findEntry(manifest: AssetManifest, id: string): AssetEntry | undefined {
  return manifest.entries.find((entry) => entry.id === id || entry.path === id);
}

export function entriesOfKind(manifest: AssetManifest, kind: AssetKind): AssetEntry[] {
  return manifest.entries.filter((entry) => entry.kind === kind);
}

/** Total size of the manifest's inlined payloads, in bytes (rough export-size estimate). */
export function inlinedBytes(manifest: AssetManifest): number {
  let total = 0;
  for (const entry of manifest.entries) {
    if (entry.dataUri) total += entry.dataUri.length;
    else if (entry.bytes) total += entry.bytes;
  }
  return total;
}

/** Builds a manifest from relative file paths (as reported by a directory walk). */
export function manifestFromPaths(paths: readonly string[], root = "."): AssetManifest {
  const manifest = createManifest(root);
  for (const path of [...paths].sort()) addEntry(manifest, createEntry(path));
  return manifest;
}

/** Relative POSIX paths of every file under `directory` (recursive, ignores dot dirs). */
export async function walkFiles(
  directory: string,
  options: { ignore?: readonly string[] } = {},
): Promise<string[]> {
  const ignore = new Set(options.ignore ?? []);
  const results: string[] = [];
  const base = directory.replace(/[\\/]$/, "");

  async function visit(current: string, prefix: string): Promise<void> {
    let entries: Deno.DirEntry[];
    try {
      entries = [...Deno.readDirSync(current)];
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || ignore.has(entry.name)) continue;
      const absolute = `${current}/${entry.name}`;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory) await visit(absolute, relative);
      else if (entry.isFile) results.push(relative);
    }
  }

  await visit(base, "");
  return results.sort();
}

/** Manifest for a game folder, skipping build output and editor scratch files. */
export async function scanAssetFolder(
  directory: string,
  options: { ignore?: readonly string[] } = {},
): Promise<AssetManifest> {
  const ignore = options.ignore ?? ["build", "dist", "node_modules"];
  const files = await walkFiles(directory, { ignore });
  return manifestFromPaths(files, directory);
}

export function manifestToJSON(manifest: AssetManifest, pretty = true): string {
  return pretty ? JSON.stringify(manifest, null, 2) : JSON.stringify(manifest);
}

export function manifestFromJSON(text: string): AssetManifest {
  const parsed = JSON.parse(text) as AssetManifest;
  if (parsed.format !== ASSET_MANIFEST_FORMAT) {
    throw new Error(`not an asset manifest (format "${String(parsed.format)}")`);
  }
  return { ...parsed, entries: parsed.entries.map((entry) => ({ ...entry })) };
}

export async function readManifest(path: string): Promise<AssetManifest> {
  return manifestFromJSON(await Deno.readTextFile(path));
}

export async function writeManifest(path: string, manifest: AssetManifest): Promise<void> {
  await Deno.writeTextFile(path, manifestToJSON(manifest));
}

// ---------------------------------------------------------------------------
// Inlining (export)
// ---------------------------------------------------------------------------

const INLINE_KINDS: readonly AssetKind[] = ["image", "audio"];

/** Reads a file into a `data:` URI, inferring the mime type from its extension. */
export async function fileToDataUri(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  return bytesToDataUri(bytes, mimeTypeOf(path));
}

export function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${base64Encode(bytes)}`;
}

/** Inlines image/audio entries of a manifest so the exported game carries its own assets. */
export async function inlineManifestAssets(
  manifest: AssetManifest,
  directory: string,
): Promise<AssetManifest> {
  const inlined: AssetManifest = { ...manifest, entries: [] };
  for (const entry of manifest.entries) {
    const copy: AssetEntry = { ...entry };
    if (INLINE_KINDS.includes(entry.kind)) {
      try {
        copy.dataUri = await fileToDataUri(`${directory.replace(/[\\/]$/, "")}/${entry.path}`);
        copy.bytes = undefined;
      } catch {
        // A missing file is reported by the caller's own checks; keep the entry key valid.
      }
    }
    inlined.entries.push(copy);
  }
  return inlined;
}

/** Base64 encoder that works in Deno, the browser and the compiled `.exe`. */
export function base64Encode(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Runtime registry
// ---------------------------------------------------------------------------

/** What a running game resolves asset keys to. Populated by the host, read by the backend. */
export class AssetRegistry {
  private images = new Map<string, TextureLike>();
  private data = new Map<string, unknown>();
  manifest: AssetManifest | null;

  constructor(manifest: AssetManifest | null = null) {
    this.manifest = manifest;
  }

  get size(): number {
    return this.images.size + this.data.size;
  }

  setImage(key: string, texture: TextureLike): void {
    this.images.set(key, texture);
  }

  image(key: string): TextureLike | undefined {
    return this.images.get(key);
  }

  /** Checked lookup with a helpful failure — used by game code that requires an asset. */
  requireImage(key: string): TextureLike {
    const image = this.images.get(key);
    if (!image) throw new Error(`asset "${key}" is not loaded`);
    return image;
  }

  setData(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  data_(key: string): unknown {
    return this.data.get(key);
  }

  keys(): string[] {
    return [...this.images.keys(), ...this.data.keys()].sort();
  }

  get imageCount(): number {
    return this.images.size;
  }

  clear(): void {
    this.images.clear();
    this.data.clear();
  }

  /** The resolver shape `createCanvas2DRenderer` wants. */
  resolver(): (key: string) => TextureLike | undefined {
    return (key) => this.images.get(key);
  }
}

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

/** A canvas the texture factory can draw into (browser canvas or headless stub). */
export interface TextureCanvas {
  ctx: Context2D;
  /** Host-specific image object handed to the draw backend. */
  image: unknown;
  width: number;
  height: number;
}

export interface CanvasFactory {
  readonly name: string;
  create(width: number, height: number): TextureCanvas;
}

/** Draws one texture; receives the context plus the texture's own size. */
export type TextureDraw = (ctx: Context2D, size: { width: number; height: number }) => void;

export interface TextureSource {
  width: number;
  height: number;
  draw: TextureDraw;
}

export type TextureSources = Record<string, TextureSource>;

/**
 * Renders every `TextureSource` and returns a registry keyed by texture name,
 * so `Sprite.texture` values resolve without touching the file system.
 */
export function buildTextures(
  sources: TextureSources,
  factory: CanvasFactory,
): AssetRegistry {
  const registry = new AssetRegistry();
  for (const [key, source] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) {
    const canvas = factory.create(source.width, source.height);
    source.draw(canvas.ctx, { width: source.width, height: source.height });
    registry.setImage(key, { image: canvas.image });
  }
  return registry;
}

/** Texture source for a solid colour with a border — the workhorse for placeholder art. */
export function solidTexture(
  width: number,
  height: number,
  fill: string,
  border?: string,
): TextureSource {
  return {
    width,
    height,
    draw(ctx, size) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, size.width, size.height);
      if (border) {
        ctx.strokeStyle = border;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, size.width - 2, size.height - 2);
      }
    },
  };
}

/**
 * A canvas factory that rasterises in software: real pixels, no DOM, no FFI. The native
 * editor builds example textures with it, so its viewport draws the artwork the game ships
 * instead of placeholder boxes.
 */
export function createSoftwareCanvasFactory(): CanvasFactory {
  return {
    name: "software",
    create(width, height): TextureCanvas {
      const surface = createRasterSurface(width, height);
      return {
        ctx: surface.ctx,
        image: surface.image,
        width: surface.image.width,
        height: surface.image.height,
      };
    },
  };
}

/** A canvas factory for headless runs: real dimensions, no pixels. */
export function createHeadlessCanvasFactory(): CanvasFactory {
  return {
    name: "headless",
    create(width, height): TextureCanvas {
      const calls: string[] = [];
      const ctx = createRecordingContext(calls);
      return { ctx, image: { width, height, headless: true, calls }, width, height };
    },
  };
}

/** Records what a texture asked to draw — used by tests and by the editor's texture preview. */
export function createRecordingContext(calls: string[] = []): Context2D & { calls: string[] } {
  const record = (name: string) => {
    calls.push(name);
  };
  const ctx: Context2D & { calls: string[] } = {
    calls,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    globalAlpha: 1,
    font: "16px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    save: () => record("save"),
    restore: () => record("restore"),
    translate: (x, y) => record(`translate(${x},${y})`),
    rotate: (angle) => record(`rotate(${angle})`),
    clearRect: (x, y, w, h) => record(`clearRect(${x},${y},${w},${h})`),
    fillRect: (x, y, w, h) => record(`fillRect(${x},${y},${w},${h})`),
    strokeRect: (x, y, w, h) => record(`strokeRect(${x},${y},${w},${h})`),
    beginPath: () => record("beginPath"),
    closePath: () => record("closePath"),
    moveTo: (x, y) => record(`moveTo(${x},${y})`),
    lineTo: (x, y) => record(`lineTo(${x},${y})`),
    rect: (x, y, w, h) => record(`rect(${x},${y},${w},${h})`),
    arc: (x, y, r) => record(`arc(${x},${y},${r})`),
    ellipse: (x, y, rx, ry) => record(`ellipse(${x},${y},${rx},${ry})`),
    fill: () => record("fill"),
    stroke: () => record("stroke"),
    fillText: (text, x, y) => record(`fillText(${text},${x},${y})`),
    drawImage: () => record("drawImage"),
  };
  return ctx;
}
