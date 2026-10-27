/**
 * @ember/packager — the export pipeline that turns a game into a standalone `.exe`.
 *
 * Owner: this file owns "how a game becomes an executable". Steps, in order:
 *
 *   1. serialize the game's scenes and inline its assets  -> player bundle
 *   2. generate the browser entry (game + startBrowserGame) and `deno bundle` it
 *   3. embed both the bundle and the app module in a generated `bundle.ts`
 *   4. `deno compile` a generated entry that calls `runPlayer`
 *   5. verify the executable by running its `--json` and `--headless` modes
 *
 * Generated files live in `build/<game>/`; the executable is written to `dist/<game>.exe`.
 * Nothing here writes outside those directories, and every command's output is captured so
 * a failed export reports the tool output rather than a bare exit code.
 */

import { type AssetManifest, inlineManifestAssets, scanAssetFolder } from "@ember/assets";
import { type Scene, Theme } from "@ember/core";
import type { Game } from "@ember/runtime";
import { createBundle, describeBundle, type PlayerBundle, validateBundle } from "@ember/player";

export const ENGINE_VERSION = "0.1.0";
export const PLAYER_FLAGS = ["--allow-net", "--allow-run"];

export interface ExportStep {
  name: string;
  detail: string;
  ms: number;
}

export interface ExportRequest {
  /** Fully wired game (scenes may also arrive through `scenes`). */
  game: Game;
  /** Scene instances to serialize into the bundle. */
  scenes: Map<string, Scene>;
  /** Scene the exported game starts in. */
  startScene: string;
  /** Absolute path of the module exporting `createGame` (and optionally `textureSources`). */
  gameModulePath: string;
  /** Absolute path of the game folder (asset discovery root). */
  gameDirectory: string;
  workspaceRoot: string;
  buildDirectory?: string;
  outputDirectory?: string;
  engineVersion?: string;
  /** Stop after bundling the browser app (used by tests and by `ember export --fast`). */
  skipCompile?: boolean;
  onStep?: (step: ExportStep) => void;
}

export interface ExportResult {
  gameId: string;
  title: string;
  startScene: string;
  bundlePath: string;
  appPath: string;
  entryPath: string;
  exePath: string | null;
  bundleBytes: number;
  appBytes: number;
  exeBytes: number;
  assetCount: number;
  scenes: string[];
  steps: ExportStep[];
  warnings: string[];
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  command: string;
  ms: number;
}

/**
 * Runs a command and captures its output. `deno bundle`/`deno compile` are invoked with the
 * workspace config so the engine's import map resolves exactly as it does in development.
 */
export async function runCommand(
  command: string,
  args: readonly string[],
  options: { cwd?: string } = {},
): Promise<CommandResult> {
  const started = performance.now();
  const child = new Deno.Command(command, {
    args: [...args],
    cwd: options.cwd,
    stdout: "piped",
    stderr: "piped",
    stdin: "null",
  });
  const output = await child.output();
  const decoder = new TextDecoder();
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
    command: `${command} ${args.join(" ")}`,
    ms: performance.now() - started,
  };
}

/** Fails loudly with the tool's own output, which is the only useful debugging context. */
function assertOk(result: CommandResult, what: string): CommandResult {
  if (result.code !== 0) {
    throw new Error(
      `${what} failed (exit ${result.code})\ncommand: ${result.command}\n${
        result.stderr || result.stdout
      }`,
    );
  }
  return result;
}

export function fileUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const withSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `file://${encodeURI(withSlash)}`;
}

function step(
  steps: ExportStep[],
  name: string,
  detail: string,
  started: number,
  onStep?: (step: ExportStep) => void,
): void {
  const entry = { name, detail, ms: performance.now() - started };
  steps.push(entry);
  onStep?.(entry);
}

/** Builds the player bundle for a game: scenes serialized, assets inlined. */
export async function buildPlayerBundle(
  request: Pick<
    ExportRequest,
    "game" | "scenes" | "startScene" | "gameDirectory" | "engineVersion"
  >,
  warnings: string[] = [],
): Promise<{ bundle: PlayerBundle; manifest: AssetManifest }> {
  const manifest = await scanAssetFolder(request.gameDirectory);
  const inlined = await inlineManifestAssets(manifest, request.gameDirectory);
  if (inlined.entries.some((entry) => entry.kind === "image" && !entry.dataUri)) {
    warnings.push("some image assets could not be read and were left as path references");
  }
  const scenes: Record<string, Scene> = {};
  for (const [name, scene] of request.scenes) scenes[name] = scene;
  const start = request.startScene;
  if (!scenes[start]) throw new Error(`start scene "${start}" is not loaded`);

  const viewport = scenes[start].resources.viewport;
  const bundle = createBundle({
    id: request.game.id,
    title: request.game.title,
    version: request.game.version,
    start,
    viewport: { width: viewport.width, height: viewport.height },
    scenes,
    manifest: inlined,
    engine: request.engineVersion ?? ENGINE_VERSION,
  });
  const validation = validateBundle(bundle);
  if (!validation.ok) {
    throw new Error(`bundle validation failed: ${validation.problems.join("; ")}`);
  }
  return { bundle, manifest: inlined };
}

/** Source of the generated browser entry (game + engine bundling to `app.js`). */
export function browserEntrySource(options: {
  gameModulePath: string;
  workspaceRoot: string;
  hasTextures: boolean;
}): string {
  const bootstrap = fileUrl(`${options.workspaceRoot}/packages/player/app/bootstrap.ts`);
  const gameModule = fileUrl(options.gameModulePath);
  return `// Generated by @ember/packager — the exported game's browser entry.
import { startBrowserGame } from ${JSON.stringify(bootstrap)};
import { createGame${options.hasTextures ? ", textureSources" : ""} } from ${
    JSON.stringify(gameModule)
  };

startBrowserGame({
  createGame,
  ${options.hasTextures ? "textureSources,\n  " : ""}chrome: true,
  onStats: (text) => {
    if (globalThis.console) console.debug(text);
  },
}).catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  if (typeof document !== "undefined") {
    document.body.innerHTML = "";
    const pre = document.createElement("pre");
    pre.style.cssText = "color:${Theme.dangerLight};padding:16px;white-space:pre-wrap;font:13px monospace";
    pre.textContent = "the exported game failed to start:\\n\\n" + message;
    document.body.append(pre);
  }
  console.error(error);
});
`;
}

/** Source of the generated executable entry: embed the payload, then run the player. */
export function executableEntrySource(
  options: { gameModulePath: string; workspaceRoot: string },
): string {
  const playerMain = fileUrl(`${options.workspaceRoot}/packages/player/main.ts`);
  const bundleModule = fileUrl(`${options.workspaceRoot}/packages/player/bundle.ts`);
  const gameModule = fileUrl(options.gameModulePath);
  return `// Generated by @ember/packager — the exported game's executable entry.
import { runPlayer } from ${JSON.stringify(playerMain)};
import { bundleFromJSON } from ${JSON.stringify(bundleModule)};
import { createGame } from ${JSON.stringify(gameModule)};
import { APP_SOURCE, BUNDLE_JSON } from "./bundle.ts";

const exitCode = await runPlayer({
  bundle: bundleFromJSON(BUNDLE_JSON),
  appSource: APP_SOURCE,
  createGame,
  args: Deno.args,
});
Deno.exit(exitCode);
`;
}

/** Source of the generated payload module (the bundle plus the browser app). */
export function payloadSource(bundle: PlayerBundle, appSource: string): string {
  return `// Generated by @ember/packager — do not edit.
export const BUNDLE_JSON = ${JSON.stringify(JSON.stringify(bundle))} as string;

export const APP_SOURCE = ${JSON.stringify(appSource)} as string;
`;
}

/** Runs the whole export pipeline and returns what was produced. */
export async function exportGame(request: ExportRequest): Promise<ExportResult> {
  const steps: ExportStep[] = [];
  const warnings: string[] = [];
  const workspaceRoot = request.workspaceRoot;
  const buildDirectory = request.buildDirectory ?? `${workspaceRoot}/build/${request.game.id}`;
  const outputDirectory = request.outputDirectory ?? `${workspaceRoot}/dist`;
  const configPath = `${workspaceRoot}/deno.jsonc`;

  if (!request.game.hasScene(request.startScene)) {
    throw new Error(`game "${request.game.id}" has no scene "${request.startScene}"`);
  }
  await Deno.mkdir(buildDirectory, { recursive: true });
  await Deno.mkdir(outputDirectory, { recursive: true });

  let started = performance.now();
  const { bundle, manifest } = await buildPlayerBundle(request, warnings);
  step(
    steps,
    "bundle",
    `${bundle.scenes.length} scenes, ${manifest.entries.length} assets`,
    started,
    request.onStep,
  );

  started = performance.now();
  const gameModule = await import(fileUrl(request.gameModulePath));
  const hasTextures = "textureSources" in gameModule;
  const entryAppPath = `${buildDirectory}/entry-app.ts`;
  await Deno.writeTextFile(
    entryAppPath,
    browserEntrySource({ gameModulePath: request.gameModulePath, workspaceRoot, hasTextures }),
  );
  step(
    steps,
    "entry",
    hasTextures ? "browser entry with textures" : "browser entry",
    started,
    request.onStep,
  );

  started = performance.now();
  const appPath = `${buildDirectory}/app.js`;
  assertOk(
    await runCommand("deno", [
      "bundle",
      "--platform",
      "browser",
      "--format",
      "esm",
      "--config",
      configPath,
      "--output",
      appPath,
      entryAppPath,
    ]),
    "deno bundle",
  );
  const appSource = await Deno.readTextFile(appPath);
  step(
    steps,
    "app",
    `${(appSource.length / 1024).toFixed(0)} KiB browser module`,
    started,
    request.onStep,
  );

  started = performance.now();
  const bundlePath = `${buildDirectory}/bundle.json`;
  await Deno.writeTextFile(bundlePath, JSON.stringify(bundle, null, 2));
  const payloadPath = `${buildDirectory}/bundle.ts`;
  await Deno.writeTextFile(payloadPath, payloadSource(bundle, appSource));
  const entryPath = `${buildDirectory}/entry.ts`;
  await Deno.writeTextFile(
    entryPath,
    executableEntrySource({ gameModulePath: request.gameModulePath, workspaceRoot }),
  );
  step(steps, "payload", describeBundle(bundle).split("\n")[0], started, request.onStep);

  let exePath: string | null = null;
  let exeBytes = 0;
  if (!request.skipCompile) {
    started = performance.now();
    const name = Deno.build.os === "windows" ? `${request.game.id}.exe` : request.game.id;
    exePath = `${outputDirectory}/${name}`;
    assertOk(
      await runCommand("deno", [
        "compile",
        "--config",
        configPath,
        ...PLAYER_FLAGS,
        "--output",
        exePath,
        entryPath,
      ]),
      "deno compile",
    );
    exeBytes = (await Deno.stat(exePath)).size;
    step(
      steps,
      "compile",
      `${(exeBytes / 1024 / 1024).toFixed(1)} MiB executable`,
      started,
      request.onStep,
    );
  }

  const bundleBytes = (await Deno.stat(payloadPath)).size;
  return {
    gameId: request.game.id,
    title: request.game.title,
    startScene: request.startScene,
    bundlePath,
    appPath,
    entryPath,
    exePath,
    bundleBytes,
    appBytes: appSource.length,
    exeBytes,
    assetCount: manifest.entries.length,
    scenes: bundle.scenes.map((scene) => scene.name),
    steps,
    warnings,
  };
}

export interface ExportVerification {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
}

/**
 * Runs the exported executable to prove it works: `--json` must list the scenes and
 * `--headless 1` must simulate a second and print a digest. This is the check that makes
 * "the .exe launches the scene" a verified claim rather than an assumption.
 */
export async function verifyExport(
  exePath: string,
  options: { seconds?: number; expectScenes?: readonly string[]; expectDigest?: string } = {},
): Promise<ExportVerification> {
  const checks: ExportVerification["checks"] = [];
  const seconds = options.seconds ?? 1;

  const json = await runCommand(exePath, ["--json"]);
  let jsonInfo: { scenes?: string[]; start?: string } = {};
  try {
    jsonInfo = JSON.parse(json.stdout);
  } catch {
    jsonInfo = {};
  }
  const scenes = jsonInfo.scenes ?? [];
  checks.push({
    name: "exe --json",
    ok: json.code === 0 && scenes.length > 0,
    detail: json.code === 0 ? `scenes: ${scenes.join(", ") || "none"}` : json.stderr.trim(),
  });

  if (options.expectScenes && options.expectScenes.length > 0) {
    const listed = jsonInfo.start ? [jsonInfo.start, ...scenes] : scenes;
    const missing = options.expectScenes.filter((name) => !listed.includes(name));
    checks.push({
      name: "bundle contains the exported scenes",
      ok: missing.length === 0,
      detail: missing.length === 0 ? "all scenes present" : `missing: ${missing.join(", ")}`,
    });
  }

  const headless = await runCommand(exePath, ["--headless", String(seconds)]);
  let headlessInfo: { entityCount?: number; digest?: string; frames?: number } = {};
  try {
    headlessInfo = JSON.parse(headless.stdout);
  } catch {
    headlessInfo = {};
  }
  checks.push({
    name: `exe --headless ${seconds}`,
    ok: headless.code === 0 && typeof headlessInfo.digest === "string",
    detail: headless.code === 0
      ? `${headlessInfo.frames ?? 0} frames, ${
        headlessInfo.entityCount ?? 0
      } entities, digest ${headlessInfo.digest}`
      : headless.stderr.trim(),
  });

  if (options.expectDigest) {
    checks.push({
      name: "headless digest matches the editor's play test",
      ok: headlessInfo.digest === options.expectDigest,
      detail: headlessInfo.digest === options.expectDigest
        ? headlessInfo.digest
        : `exe ${String(headlessInfo.digest)} != expected ${options.expectDigest}`,
    });
  }

  return { ok: checks.every((check) => check.ok), checks };
}

/** Where an export for `gameId` writes its executable. */
export function executablePath(workspaceRoot: string, gameId: string): string {
  return `${workspaceRoot}/dist/${executableName(gameId)}`;
}

/** File name an exported game uses for `gameId` on this platform. */
export function executableName(gameId: string): string {
  return Deno.build.os === "windows" ? `${gameId}.exe` : gameId;
}

function isAbsolutePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\");
}

function parentDirectory(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "." : normalized.slice(0, index);
}

function isDirectory(path: string): boolean {
  if (/[\\/]$/.test(path)) return true;
  try {
    return Deno.statSync(path).isDirectory;
  } catch {
    return false;
  }
}

/**
 * Resolves the destination a user typed into the export dialog into the final `.exe` path.
 *
 * Rules, in order: an empty answer keeps the default `dist/<game>.exe`; an existing folder or
 * a path ending in a separator gets the executable name appended; anything else is treated as
 * the file itself, with the platform extension added when missing. Relative answers resolve
 * against the workspace root.
 */
export function resolveExportTarget(
  destination: string,
  options: { workspaceRoot: string; gameId: string; fallback: string },
): string {
  const cleaned = destination.trim().replace(/^"(.*)"$/, "$1").trim();
  if (!cleaned) return options.fallback;
  const base = isAbsolutePath(cleaned) ? cleaned : `${options.workspaceRoot}/${cleaned}`;
  if (isDirectory(base)) {
    return `${base.replace(/[\\/]+$/, "")}/${executableName(options.gameId)}`;
  }
  const extension = executableName(options.gameId).slice(options.gameId.length);
  return extension && base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
}

/**
 * Copies a freshly compiled executable to `target`, creating parent folders. Returns the
 * path the game now lives at; copying onto the build output itself is a no-op.
 */
export async function placeExportedGame(source: string, target: string): Promise<string> {
  if (source.replace(/\\/g, "/") === target.replace(/\\/g, "/")) return target;
  await Deno.mkdir(parentDirectory(target), { recursive: true });
  await Deno.copyFile(source, target);
  return target;
}
