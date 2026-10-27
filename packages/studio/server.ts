/**
 * @ember/studio/server — the editor's local server and JSON API.
 *
 * Owner: this file owns the *host side* of the editor: static files for the UI, scene file
 * I/O, headless play-throughs and exports. The UI itself (`app/*`) runs in the browser and
 * only talks to this API, so the editor can be driven (and tested) entirely over HTTP.
 *
 * Endpoints:
 *   GET    /                    the editor page
 *   GET    /studio.js           the bundled editor app (engine + game + UI)
 *   GET    /api/game            descriptor, scenes, assets, systems and scripts
 *   GET    /api/scenes          scene file list
 *   GET    /api/scenes/:name    one scene, serialized
 *   PUT    /api/scenes/:name    save a scene (validated before writing)
 *   POST   /api/scenes          create a scene (empty/title/level templates)
 *   DELETE /api/scenes/:name    delete a scene file
 *   GET    /api/assets          asset manifest for the game folder
 *   POST   /api/reload          re-read the game folder from disk
 *   POST   /api/simulate        headless run of one scene; returns digest + run state
 *   POST   /api/export          build the game's .exe and verify it
 *   GET    /api/logs            recent server log lines
 */

import {
  BoxCollider,
  deserializeScene,
  RigidBody,
  type Scene,
  Scene as SceneClass,
  Script,
  serializeScene,
  Sprite,
  Tag,
  TextLabel,
  Theme,
  validateSceneFile,
  Velocity,
} from "@ember/core";
import {
  exportGame,
  type ExportResult,
  type ExportVerification,
  placeExportedGame,
  resolveExportTarget,
  verifyExport,
} from "@ember/packager";
import type { Game, RuntimeSession } from "@ember/runtime";
import { sceneDigest } from "@ember/runtime";
import { assetKindOf, type AssetManifest, scanAssetFolder } from "@ember/assets";
import {
  type GameDescriptor,
  listGameSceneFiles,
  loadGame,
  readScene,
  writeScene,
} from "@ember/gameloader";

export interface StudioOptions {
  /** Game to edit. The server re-loads it from disk on `/api/reload`. */
  descriptor: GameDescriptor;
  workspaceRoot: string;
  sceneSource: "files" | "code";
  port?: number;
  hostname?: string;
  /** Build the browser bundle at startup (default true; tests pass false). */
  bundleApp?: boolean;
  /** Called with every server-side action, for the CLI's log. */
  onLog?: (line: string) => void;
}

export interface StudioServer {
  url: string;
  port: number;
  hostname: string;
  readonly requests: number;
  readonly logs: string[];
  /** The bundled editor app source, once built. */
  appSource(): string;
  /** Reloads the game from disk (scenes, module, assets). */
  reload(): Promise<void>;
  handle(request: Request): Promise<Response>;
  stop(): Promise<void>;
}

interface StudioState {
  game: Game;
  scenes: Map<string, Scene>;
  sceneSource: "files" | "code";
  manifest: AssetManifest;
  warnings: string[];
  descriptor: GameDescriptor;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export async function startStudio(options: StudioOptions): Promise<StudioServer> {
  const logs: string[] = [];
  const log = (line: string) => {
    const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
    logs.push(stamped);
    if (logs.length > 400) logs.splice(0, logs.length - 400);
    options.onLog?.(line);
  };

  let state: StudioState = {
    game: undefined as unknown as Game,
    scenes: new Map(),
    sceneSource: options.sceneSource,
    manifest: {
      format: "emberassets",
      version: 1,
      root: options.descriptor.directory,
      entries: [],
    },
    warnings: [],
    descriptor: options.descriptor,
  };

  async function reload(): Promise<void> {
    const loaded = await loadGame(state.descriptor.directory);
    state = {
      game: loaded.game,
      scenes: loaded.scenes,
      sceneSource: loaded.sceneSource,
      manifest: await scanAssetFolder(state.descriptor.directory, {
        ignore: ["build", "dist", "scenes"],
      }),
      warnings: loaded.warnings,
      descriptor: loaded.descriptor,
    };
    log(
      `loaded ${loaded.descriptor.id}: ${loaded.game.sceneNames().length} scene(s) from ${loaded.sceneSource}`,
    );
  }

  await reload();

  let appSource = "";
  if (options.bundleApp ?? true) {
    appSource = await buildStudioApp(options.workspaceRoot, state.descriptor, log);
  }

  // `onListen` runs while `Deno.serve` is still executing, so it may only resolve the
  // address; reading the server handle inside it hits the temporal dead zone.
  let httpServer: Deno.HttpServer | undefined;
  const address = await new Promise<Deno.NetAddr>((resolve) => {
    httpServer = Deno.serve(
      {
        hostname: options.hostname ?? "127.0.0.1",
        port: options.port ?? 0,
        onListen: (addr) => resolve(addr as Deno.NetAddr),
      },
      (request) => handleRequest(request),
    );
  });
  const server = httpServer;
  if (!server) throw new Error("editor server failed to start");

  let requests = 0;

  async function handleRequest(request: Request): Promise<Response> {
    requests++;
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (request.method === "GET" && (path === "/" || path === "/index.html")) {
        return html(pageHtml(state.descriptor.title));
      }
      if (request.method === "GET" && path === "/studio.js") {
        return new Response(appSource, {
          headers: {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      if (path.startsWith("/api/")) {
        return await handleApi(request, path);
      }
      return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    } catch (error) {
      const message = (error as Error).message;
      log(`error: ${message}`);
      return json({ error: message }, 500);
    }
  }

  async function handleApi(request: Request, path: string): Promise<Response> {
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/api/game") {
      const described = state.game.describe();
      return json({
        descriptor: {
          id: state.descriptor.id,
          title: state.descriptor.title,
          version: state.descriptor.version,
          directory: state.descriptor.directory,
          scenesDirectory: state.descriptor.scenesDirectory,
          start: state.descriptor.start,
        },
        described,
        sceneSource: state.sceneSource,
        scenes: [...state.scenes.entries()].map(([name, scene]) => ({
          name,
          entities: scene.entityCount,
          width: scene.resources.viewport.width,
          height: scene.resources.viewport.height,
        })),
        assets: state.manifest.entries.map((entry) => ({
          ...entry,
          kind: assetKindOf(entry.path),
        })),
        warnings: state.warnings,
      });
    }

    if (method === "GET" && path === "/api/scenes") {
      const files = await listGameSceneFiles(state.descriptor);
      return json({
        directory: state.descriptor.scenesDirectory,
        scenes: files.map((file) => file.name),
      });
    }

    if (path.startsWith("/api/scenes/")) {
      const name = decodeURIComponent(path.slice("/api/scenes/".length));
      if (method === "GET") {
        const scene = state.scenes.get(name) ?? await readScene(state.descriptor, name);
        if (!scene) return json({ error: `no scene "${name}"` }, 404);
        return json({ scene: serializeScene(scene), name });
      }
      if (method === "PUT") {
        const body = await request.json() as { scene?: unknown };
        if (!body?.scene) return json({ error: "body must contain a scene" }, 400);
        const problems = validateSceneFile(body.scene);
        if (problems.length > 0) return json({ error: "invalid scene", problems }, 400);
        const scene = deserializeScene(body.scene);
        scene.name = name;
        const filePath = await writeScene(state.descriptor, name, scene);
        state.scenes.set(name, scene);
        // Keep the live game in step with the editor so `/api/simulate` and play use the
        // saved content instead of the copy that existed when the server started.
        state.game.registerScene(name, scene);
        log(`saved ${name} -> ${filePath.replace(/\\/g, "/")}`);
        return json({ ok: true, name, path: filePath, entities: scene.entityCount });
      }
      if (method === "DELETE") {
        const files = await listGameSceneFiles(state.descriptor);
        const file = files.find((entry) => entry.name === name);
        if (!file) return json({ error: `no scene file "${name}"` }, 404);
        await Deno.remove(file.path);
        state.scenes.delete(name);
        state.game.removeScene(name);
        log(`deleted ${name}`);
        return json({ ok: true, name });
      }
    }

    if (method === "POST" && path === "/api/scenes") {
      const body = await request.json() as { name?: string; template?: string };
      const name = (body.name ?? "").trim();
      if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
        return json({ error: "scene names must be alphanumeric with dashes" }, 400);
      }
      const existing = await listGameSceneFiles(state.descriptor);
      if (existing.some((file) => file.name === name)) {
        return json({ error: `scene "${name}" already exists` }, 409);
      }
      const scene = createSceneTemplate(name, body.template ?? "empty", state);
      const filePath = await writeScene(state.descriptor, name, scene);
      state.scenes.set(name, scene);
      state.game.registerScene(name, scene);
      log(`created ${name} (${body.template ?? "empty"})`);
      return json({ ok: true, name, path: filePath, scene: serializeScene(scene) }, 201);
    }

    if (method === "GET" && path === "/api/assets") {
      return json({ manifest: state.manifest, root: state.descriptor.directory });
    }

    if (method === "POST" && path === "/api/reload") {
      await reload();
      return json({ ok: true, scenes: [...state.scenes.keys()], sceneSource: state.sceneSource });
    }

    if (method === "POST" && path === "/api/simulate") {
      const body = await request.json().catch(() => ({})) as {
        scene?: string;
        seconds?: number;
        seed?: number | string;
        keys?: string[];
      };
      const sceneName = body.scene ?? state.game.startScene;
      const seconds = Math.min(120, Math.max(0.1, body.seconds ?? 3));
      if (!state.game.hasScene(sceneName)) return json({ error: `no scene "${sceneName}"` }, 404);
      const session = state.game.createSession(sceneName, { seed: body.seed ?? "studio" });
      const frames = Math.max(1, Math.round(seconds / session.fixedDt));
      const pressed = body.keys ?? [];
      const before = summarize(session);
      for (let frame = 0; frame < frames; frame++) {
        session.step(
          session.fixedDt,
          frame === 0 && pressed.length > 0
            ? {
              held: pressed,
              pressed,
              released: [],
              mouse: { x: 0, y: 0 },
              mouseHeld: [],
              mousePressed: [],
              mouseReleased: [],
            }
            : undefined,
        );
      }
      const after = summarize(session);
      log(`simulated ${sceneName} for ${seconds}s (digest ${after.digest})`);
      return json({ scene: sceneName, seconds, frames, before, after });
    }

    if (method === "POST" && path === "/api/export") {
      const body = await request.json().catch(() => ({})) as {
        verify?: boolean;
        /** Folder or `.exe` path the player asked to install the game into. */
        destination?: string;
      };
      const result = await runExport(state, options.workspaceRoot, log);
      let installed: string | null = null;
      if (body.destination && result.exePath) {
        const target = resolveExportTarget(body.destination, {
          workspaceRoot: options.workspaceRoot,
          gameId: state.descriptor.id,
          fallback: result.exePath,
        });
        installed = await placeExportedGame(result.exePath, target);
        log(`installed ${installed}`);
      }
      const verification = body.verify === false
        ? null
        : result.exePath
        ? await verifyExport(result.exePath, { expectScenes: result.scenes })
        : null;
      return json({ export: describeExport(result), verification, installed });
    }

    if (method === "GET" && path === "/api/logs") {
      return json({ logs: logs.slice(-200) });
    }

    return json({ error: `unknown endpoint ${method} ${path}` }, 404);
  }

  return {
    get url() {
      return `http://${options.hostname ?? "127.0.0.1"}:${address.port}`;
    },
    port: address.port,
    hostname: options.hostname ?? "127.0.0.1",
    get requests() {
      return requests;
    },
    get logs() {
      return logs;
    },
    appSource: () => appSource,
    reload,
    handle: (request: Request) => handleRequest(request),
    stop: () => server.shutdown(),
  };
}

// ---------------------------------------------------------------------------
// Scene templates
// ---------------------------------------------------------------------------

function createSceneTemplate(name: string, template: string, state: StudioState): Scene {
  const reference = state.scenes.values().next().value as Scene | undefined;
  const width = reference?.resources.viewport.width ?? 960;
  const height = reference?.resources.viewport.height ?? 540;
  const scene = new SceneClass({ name });
  scene.resources.viewport = { width, height };
  scene.resources.camera = {
    position: { x: width / 2, y: height / 2 },
    zoom: 1,
    smoothing: 0.12,
    bounds: null,
    follow: null,
  };
  scene.metadata = { template, createdBy: "ember studio" };

  if (template === "platformer") {
    const ground = scene.createEntity({
      name: "ground",
      position: { x: width / 2, y: height - 40 },
    });
    scene.world.add(ground, RigidBody, { type: "static", gravityScale: 0 });
    scene.world.add(ground, BoxCollider, { width, height: 80, solid: true });
    scene.world.add(ground, Sprite, { texture: "ground", width, height: 80, layer: 5 });

    const player = scene.createEntity({ name: "player", position: { x: 90, y: height - 120 } });
    scene.world.add(player, Sprite, { texture: "player", width: 28, height: 36, layer: 20 });
    scene.world.add(player, RigidBody, { type: "dynamic" });
    scene.world.add(player, Velocity, { x: 0, y: 0 });
    scene.world.add(player, BoxCollider, { width: 26, height: 34 });
    scene.world.add(player, Script, { name: "runner.player", props: { speed: 260, jump: 780 } });
    scene.world.add(player, Tag, { value: "player" });
    scene.resources.camera.follow = player;
  } else if (template === "title") {
    const title = scene.createEntity({ name: "title", position: { x: width / 2, y: height / 3 } });
    scene.world.add(title, TextLabel, { text: "NEW GAME", size: 48, align: "center", layer: 100 });
    const hint = scene.createEntity({ name: "hint", position: { x: width / 2, y: height / 2 } });
    scene.world.add(hint, TextLabel, {
      text: "press ENTER to start",
      size: 20,
      align: "center",
      layer: 100,
    });
    const trigger = scene.createEntity({
      name: "start-trigger",
      position: { x: width / 2, y: height / 2 },
    });
    scene.world.add(trigger, Script, {
      name: "runner.title",
      props: { target: state.descriptor.start },
    });
  }
  return scene;
}

// ---------------------------------------------------------------------------
// Export + simulate helpers (shared with the CLI and the tests)
// ---------------------------------------------------------------------------

export async function runExport(
  state: { descriptor: GameDescriptor; game: Game; scenes: Map<string, Scene> },
  workspaceRoot: string,
  log: (line: string) => void,
): Promise<ExportResult> {
  log(`exporting ${state.descriptor.id}…`);
  const result = await exportGame({
    game: state.game,
    scenes: state.scenes,
    startScene: state.game.startScene,
    gameModulePath: state.descriptor.entryPath,
    gameDirectory: state.descriptor.directory,
    workspaceRoot,
    onStep: (step) => log(`  ${step.name}: ${step.detail} (${step.ms.toFixed(0)}ms)`),
  });
  log(`exported ${result.exePath ?? "(compile skipped)"}`);
  return result;
}

export function describeExport(result: ExportResult): Record<string, unknown> {
  return {
    gameId: result.gameId,
    title: result.title,
    scenes: result.scenes,
    startScene: result.startScene,
    exePath: result.exePath,
    exeBytes: result.exeBytes,
    bundlePath: result.bundlePath,
    bundleBytes: result.bundleBytes,
    appBytes: result.appBytes,
    assetCount: result.assetCount,
    steps: result.steps,
    warnings: result.warnings,
  };
}

/** Snapshot of a session used by `/api/simulate` and by the editor's status bar. */
export function summarize(session: RuntimeSession): Record<string, unknown> {
  const drawList = session.drawList();
  const runState = session.service<Record<string, unknown>>("runState");
  return {
    scene: session.scene.name,
    frame: session.frame,
    time: Number(session.time.toFixed(3)),
    entities: session.entityCount,
    draws: drawList.commands.length,
    culled: drawList.stats.culled,
    digest: sceneDigest(session.scene),
    runState: runState
      ? {
        status: runState.status,
        score: runState.score,
        coins: runState.coins,
        lives: runState.lives,
        attempts: runState.attempts,
      }
      : null,
    diagnostics: session.diagnostics.toLines().slice(-8),
  };
}

// ---------------------------------------------------------------------------
// The page and the app bundle
// ---------------------------------------------------------------------------

export function pageHtml(title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — Ember Studio</title>
<style>
  :root {
    --bg: ${Theme.background}; --panel: ${Theme.panel}; --panel-2: ${Theme.panelDeep}; --line: ${Theme.border};
    --text: ${Theme.text}; --muted: ${Theme.muted}; --accent: ${Theme.accent}; --gold: ${Theme.accent}; --ok: ${Theme.highlight}; --bad: ${Theme.danger};
  }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); }
  body { font: 13px/1.45 "Segoe UI", system-ui, sans-serif; overflow: hidden; }
  .boot { position: fixed; inset: 0; display: grid; place-items: center; color: var(--muted); }
  .studio { position: fixed; inset: 0; display: flex; flex-direction: column; }
  .toolbar {
    display: flex; align-items: center; gap: 8px; padding: 6px 10px;
    background: var(--panel); border-bottom: 1px solid var(--line); flex: 0 0 auto;
  }
  .brand { font-weight: 700; color: var(--accent); letter-spacing: 0.3px; }
  .game-title { color: var(--muted); margin-right: 6px; }
  .studio-body { flex: 1; display: flex; min-height: 0; }
  .column { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .column.left { width: 240px; border-right: 1px solid var(--line); background: var(--panel-2); }
  .column.center { flex: 1; }
  .column.right { width: 320px; border-left: 1px solid var(--line); background: var(--panel-2); }
  .panel { display: flex; flex-direction: column; min-height: 0; border-bottom: 1px solid var(--line); }
  .panel.flex { flex: 1; }
  .panel.scenes { flex: 0 0 auto; max-height: 26%; overflow: auto; }
  .panel.assets { flex: 0 0 auto; max-height: 20%; overflow: auto; }
  .panel-header {
    display: flex; align-items: center; gap: 8px; padding: 5px 9px;
    background: var(--panel); border-bottom: 1px solid var(--line); flex: 0 0 auto;
  }
  .panel-title { font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); }
  .panel-status { margin-left: auto; color: var(--muted); font-size: 11px; }
  .panel-body { padding: 6px 8px; overflow: auto; min-height: 0; }
  .column.center > .panel:first-child .panel-body { padding: 0; }
  .viewport {
    position: relative; display: grid; place-items: center; background: var(--bg);
    min-height: 320px; overflow: hidden;
  }
  .viewport-canvas { display: block; max-width: 100%; max-height: 100%; background: var(--bg); }
  .btn {
    font: inherit; padding: 4px 9px; border-radius: 4px; border: 1px solid var(--line);
    background: var(--panel-2); color: var(--text); cursor: pointer;
  }
  .btn:hover { background: var(--line); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
  .btn.danger { background: transparent; border-color: ${Theme.dangerDeep}; color: ${Theme.dangerLight}; padding: 2px 7px; }
  .hierarchy-row, .scene-row {
    display: flex; width: 100%; gap: 6px; align-items: center; text-align: left;
    background: transparent; border: 0; border-radius: 3px; color: var(--text);
    font: inherit; padding: 3px 6px; cursor: pointer;
  }
  .hierarchy-row:hover, .scene-row:hover { background: var(--panel-2); }
  .hierarchy-row.selected, .scene-row.selected { background: ${Theme.rowSelected}; outline: 1px solid ${Theme.border}; }
  .hierarchy-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hierarchy-meta, .scene-meta { color: var(--muted); font-size: 11px; }
  .scene-actions { padding: 4px 2px; }
  .asset-row { display: flex; gap: 6px; padding: 2px 4px; color: var(--muted); font-size: 12px; }
  .asset-kind { text-transform: uppercase; font-size: 10px; padding: 0 4px; border-radius: 3px; background: var(--line); color: var(--text); }
  .kind-image { background: ${Theme.accentSoft}; } .kind-json, .kind-scene { background: var(--panel-2); } .kind-audio { background: ${Theme.dangerSoft}; }
  .component { border: 1px solid var(--line); border-radius: 4px; margin-bottom: 7px; background: var(--panel-2); }
  .component-head { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-bottom: 1px solid var(--line); }
  .component-title { font-weight: 600; font-size: 12px; }
  .component-head .btn { margin-left: auto; }
  .component.add { padding: 6px; border-style: dashed; }
  .row { display: flex; align-items: center; gap: 6px; padding: 2px 6px; }
  .row-label { width: 96px; color: var(--muted); font-size: 12px; flex: 0 0 auto; }
  .field {
    font: inherit; flex: 1; min-width: 0; padding: 3px 5px; border-radius: 3px;
    border: 1px solid var(--line); background: var(--bg); color: var(--text);
  }
  .field.json { width: 100%; min-height: 74px; font: 12px/1.4 Consolas, monospace; }
  .field.color { padding: 1px; height: 22px; }
  .check { accent-color: var(--accent); }
  .entity-head { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
  .entity-id { color: var(--muted); font-size: 12px; }
  .muted { color: var(--muted); }
  .panel:last-child .panel-body { }
  .console .panel-body, .column.center > .panel:last-child .panel-body {
    font: 12px/1.5 Consolas, monospace; background: var(--bg); max-height: 210px;
  }
  .log-line { white-space: pre-wrap; }
  .log-line.warn { color: var(--gold); }
  .log-line.error { color: ${Theme.dangerLight}; }
  .dialog-overlay {
    position: fixed; inset: 0; z-index: 50; display: grid; place-items: center;
    background: rgba(3, 6, 12, 0.72); backdrop-filter: blur(2px);
  }
  .dialog {
    width: min(520px, 92vw); padding: 18px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--panel); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
  }
  .dialog h2 { margin: 0 0 6px; font-size: 15px; }
  .dialog p { margin: 0 0 12px; color: var(--muted); }
  .dialog-input {
    width: 100%; box-sizing: border-box; font: inherit; padding: 7px 9px; border-radius: 4px;
    border: 1px solid var(--line); background: var(--bg); color: var(--text);
  }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  .statusbar {
    flex: 0 0 auto; padding: 4px 10px; background: var(--panel); border-top: 1px solid var(--line);
    color: var(--muted); font-size: 12px;
  }
</style>
</head>
<body>
<div id="boot" class="boot">loading Ember Studio…</div>
<script type="module" src="/studio.js"></script>
</body>
</html>
`;
}

/** Bundles the editor UI (engine + game + panels) into one browser module. */
export async function buildStudioApp(
  workspaceRoot: string,
  descriptor: GameDescriptor,
  log: (line: string) => void,
): Promise<string> {
  const buildDirectory = `${workspaceRoot}/build/studio`;
  await Deno.mkdir(buildDirectory, { recursive: true });
  const entryPath = `${buildDirectory}/entry-app.ts`;
  const gameModule = fileUrl(descriptor.entryPath);
  const studioApp = fileUrl(`${workspaceRoot}/packages/studio/app/main.ts`);
  await Deno.writeTextFile(
    entryPath,
    `// Generated by @ember/studio — the editor's browser entry.
import { startStudioApp } from ${JSON.stringify(studioApp)};
import { createGame, textureSources } from ${JSON.stringify(gameModule)};

startStudioApp({ createGame, textureSources }).catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  document.body.innerHTML = "";
  const pre = document.createElement("pre");
  pre.style.cssText = ${
      JSON.stringify(
        `color:${Theme.dangerLight};padding:16px;white-space:pre-wrap;font:13px monospace`,
      )
    };
  pre.textContent = "Ember Studio failed to start:\\n\\n" + message;
  document.body.append(pre);
  console.error(error);
});
`,
  );

  const command = new Deno.Command("deno", {
    args: [
      "bundle",
      "--platform",
      "browser",
      "--format",
      "esm",
      "--config",
      `${workspaceRoot}/deno.jsonc`,
      "--output",
      `${buildDirectory}/studio.js`,
      entryPath,
    ],
    stdout: "piped",
    stderr: "piped",
    stdin: "null",
  });
  const output = await command.output();
  const decoder = new TextDecoder();
  if (output.code !== 0) {
    throw new Error(
      `could not bundle the editor UI (exit ${output.code})\n${
        decoder.decode(output.stderr) || decoder.decode(output.stdout)
      }`,
    );
  }
  const source = await Deno.readTextFile(`${buildDirectory}/studio.js`);
  log(`editor UI bundled (${(source.length / 1024).toFixed(0)} KiB)`);
  return source;
}

function fileUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return `file://${normalized.startsWith("/") ? "" : "/"}${encodeURI(normalized)}`;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: JSON_HEADERS });
}

function html(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
        character,
  );
}
