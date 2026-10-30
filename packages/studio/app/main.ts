/**
 * @ember/studio/app/main.ts — the editor's browser application.
 *
 * Owner: this file owns the editor shell: toolbar, scene list, hierarchy, viewport,
 * inspector and console, plus the keyboard shortcuts. Editing happens on a client-side copy
 * of the scene which is saved back through the studio API, so the server never has to hold
 * editor state.
 *
 * The viewport draws with the same renderer the game uses (`buildDrawList` + the canvas
 * backend), so the editor shows exactly what Play and the exported game will show.
 */

import {
  type Camera2DState,
  deserializeScene,
  type Entity,
  type Scene,
  Theme,
  Transform,
} from "@ember/core";
import { buildTextures, type TextureSources } from "@ember/assets";
import {
  buildDrawList,
  createCanvas2DRenderer,
  pickEntityAtPoint,
  worldToScreen,
  zoomAtScreenPoint,
} from "@ember/render2d";
import type { Game } from "@ember/runtime";
import { createDomCanvasFactory } from "@ember/player/app/canvas-factory";
import { type GameInfo, StudioApi } from "./api.ts";
import { button, clear, el, panel, select } from "./dom.ts";
import { renderInspector } from "./inspector.ts";
import { EditorSession } from "./session.ts";

/** Entity templates the hierarchy can add; mirrors `EditorSession.createEntity`'s switch. */
const ADD_ENTITY_TEMPLATES = [
  "add entity…",
  "player",
  "ground",
  "ember",
  "hazard",
  "gate",
  "sprite",
  "box",
  "label",
  "empty",
] as const;

export interface StudioAppOptions {
  createGame: (options: { scenes?: Map<string, Scene>; start?: string }) => Game;
  textureSources?: TextureSources;
  api?: StudioApi;
}

export interface StudioApp {
  api: StudioApi;
  session: EditorSession;
  info: GameInfo;
  save(): Promise<boolean>;
  loadScene(name: string): Promise<void>;
  refresh(): Promise<void>;
}

export async function startStudioApp(options: StudioAppOptions): Promise<StudioApp> {
  const api = options.api ?? new StudioApi();
  const info = await api.game();

  // Build the game from the scene files the server has on disk.
  const scenes = new Map<string, Scene>();
  for (const entry of info.scenes) {
    const payload = await api.scene(entry.name);
    const scene = deserializeScene(payload.scene);
    scene.name = entry.name;
    scenes.set(entry.name, scene);
  }
  if (scenes.size === 0) {
    throw new Error("this game has no scenes — create one in the editor first");
  }
  const game = options.createGame({ scenes, start: info.described.start ?? undefined });

  const textures = options.textureSources
    ? buildTextures(options.textureSources, createDomCanvasFactory())
    : null;

  const boot = document.getElementById("boot");
  boot?.remove();

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  const root = el("div", { className: "studio" });
  const toolbar = el("header", { className: "toolbar" });
  const body = el("div", { className: "studio-body" });
  const left = el("div", { className: "column left" });
  const center = el("div", { className: "column center" });
  const right = el("div", { className: "column right" });
  const status = el("footer", { className: "statusbar" });
  body.append(left, center, right);
  root.append(toolbar, body, status);
  document.body.append(root);

  const hierarchy = panel("Hierarchy", [], "flex");
  const scenePanel = panel("Scenes", [], "scenes");
  const assetsPanel = panel("Assets", [], "assets");
  const viewportPanel = panel("Viewport");
  const inspectorPanel = panel("Inspector");
  const consolePanel = panel("Console");
  left.append(scenePanel.root, hierarchy.root, assetsPanel.root);
  center.append(viewportPanel.root, consolePanel.root);
  right.append(inspectorPanel.root);

  const viewportMount = el("div", { className: "viewport" });
  viewportPanel.body.append(viewportMount);

  const canvas = el("canvas", { className: "viewport-canvas" });
  canvas.width = 960;
  canvas.height = 540;
  viewportMount.append(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("this browser does not expose a 2D canvas context");
  const renderer = createCanvas2DRenderer(ctx as never, {
    resolveTexture: textures ? textures.resolver() : undefined,
    width: canvas.width,
    height: canvas.height,
  });

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  const log = (line: string, kind: "info" | "warn" | "error" = "info") => {
    const entry = el("div", { className: `log-line ${kind}`, text: `${stamp()} ${line}` });
    consolePanel.body.append(entry);
    consolePanel.body.scrollTop = consolePanel.body.scrollHeight;
    while (consolePanel.body.childElementCount > 300) consolePanel.body.firstElementChild?.remove();
  };

  // The editing camera and view toggles are declared before the session because the
  // session's change events run during construction and read them (a TDZ crash otherwise).
  const startScene = scenes.get(info.described.start ?? "") ??
    (scenes.values().next().value as Scene);
  let showColliders = true;
  let editingCamera: Camera2DState = {
    position: { ...startScene.resources.camera.position },
    zoom: 1,
    smoothing: 0,
    bounds: null,
    follow: null,
  };

  const session = new EditorSession({
    game,
    scene: startScene,
    sceneName: info.described.start ?? scenes.keys().next().value as string,
    mount: viewportMount,
    resolveTexture: textures ? textures.resolver() : undefined,
    events: {
      onChange: (reason) => {
        renderHierarchy();
        if (reason !== "selection") renderInspectorPanel();
        updateStatus(reason);
      },
      onStatus: (message) => {
        status.textContent = message;
      },
    },
  });

  session.setScene(startScene, session.sceneName);

  function updateStatus(reason: string): void {
    const parts = [
      info.descriptor.id,
      session.sceneName + (session.dirty ? " *" : ""),
      `${session.scene.entityCount} entities`,
      session.selection === null
        ? "no selection"
        : `selected ${session.scene.labelOf(session.selection)}`,
      session.mode === "play" ? "PLAYING" : "editing",
      `zoom ${editingCamera.zoom.toFixed(2)}x`,
      reason,
    ];
    status.textContent = parts.join("  ·  ");
  }

  // ---------------------------------------------------------------------------
  // Viewport rendering
  // ---------------------------------------------------------------------------

  function drawEditView(): void {
    if (session.mode === "play") return;
    const viewport = { width: canvas.width, height: canvas.height };
    const drawList = buildDrawList(session.scene, {
      camera: editingCamera,
      viewport,
      cull: false,
      background: true,
      debugColliders: showColliders,
    });
    lastPickList = drawList;
    renderer.render(drawList.commands);
    drawSelectionMarker();
  }

  let lastPickList: ReturnType<typeof buildDrawList> | null = null;

  function drawSelectionMarker(): void {
    // `ctx` is checked once above, but closures do not keep that narrowing.
    if (!ctx) return;
    const entity = session.selection;
    if (entity === null || !session.scene.world.isAlive(entity)) return;
    const transform = session.scene.world.get(entity, Transform);
    if (!transform) return;
    const point = worldToScreen(
      editingCamera,
      { width: canvas.width, height: canvas.height },
      transform.position,
    );
    ctx.save();
    ctx.strokeStyle = Theme.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(point.x - 22, point.y - 22, 44, 44);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = Theme.accent;
    ctx.fill();
    ctx.restore();
  }

  function frameLoop(): void {
    // In play mode the mounted game owns the canvas (it draws into the same element).
    drawEditView();
    requestAnimationFrame(frameLoop);
  }

  // ---------------------------------------------------------------------------
  // Hierarchy
  // ---------------------------------------------------------------------------

  function renderHierarchy(): void {
    clear(hierarchy.body);
    const entities = session.scene.world.entities();
    hierarchy.setStatus(`${entities.length} entities`);
    // Without this a scene could only be edited, never grown: the first thing a new project
    // needs is a way to put an entity in it.
    hierarchy.body.append(el("div", { className: "scene-actions" }, [
      select("add entity…", ADD_ENTITY_TEMPLATES, (template) => {
        if (template === "add entity…") return;
        const created = session.createEntity(template);
        log(`added ${template} #${created} to ${session.sceneName}`);
      }),
    ]));
    for (const entity of entities) {
      const label = session.scene.labelOf(entity);
      const components = session.scene.world.componentsOf(entity);
      const row = el("button", {
        className: `hierarchy-row${entity === session.selection ? " selected" : ""}`,
        title: `${label}\n${components.join(", ")}`,
        on: { click: () => session.select(entity) },
      }, [
        el("span", { className: "hierarchy-name", text: label }),
        el("span", { className: "hierarchy-meta", text: summariseComponents(components) }),
      ]);
      hierarchy.body.append(row);
    }
  }

  function summariseComponents(components: string[]): string {
    const interesting = components.filter((name) =>
      ["Sprite", "RectShape", "CircleShape", "TextLabel", "Script", "BoxCollider", "RigidBody"]
        .includes(name)
    );
    const shown = interesting.slice(0, 3).join(" ");
    return interesting.length > 3 ? `${shown} +${interesting.length - 3}` : shown;
  }

  function renderInspectorPanel(): void {
    renderInspector(inspectorPanel.body, session, {
      onField: (component, path, value) => session.setField(component, path, value),
      onReplace: (component, value) => session.replaceComponent(component, value),
      onAddComponent: (name) => session.addComponent(name),
      onRemoveComponent: (name) => session.removeComponent(name),
      onRename: (name) => session.renameSelected(name),
    }, { scriptNames: info.described.scripts });
  }

  function renderSceneList(): void {
    clear(scenePanel.body);
    scenePanel.setStatus(`${info.scenes.length} files`);
    for (const entry of info.scenes) {
      const active = entry.name === session.sceneName;
      scenePanel.body.append(
        el("button", {
          className: `scene-row${active ? " selected" : ""}`,
          title: `${entry.entities} entities · ${entry.width}x${entry.height}`,
          on: {
            click: async () => {
              if (session.dirty && !confirm(`discard unsaved changes to ${session.sceneName}?`)) {
                return;
              }
              await loadSceneByName(entry.name);
            },
          },
        }, [
          el("span", { text: entry.name }),
          el("span", { className: "scene-meta", text: `${entry.entities}` }),
        ]),
      );
    }
    const newSceneButton = button("new scene…", async () => {
      const name = prompt("scene name (a-z, 0-9, dashes)");
      if (!name) return;
      const template = (prompt("template: empty, platformer, title", "platformer") ?? "empty")
        .trim();
      try {
        const created = await api.createScene(name, template);
        log(`created scene ${created.name} (${template})`);
        await refreshScenes();
        await loadSceneByName(created.name);
      } catch (error) {
        log(`create failed: ${(error as Error).message}`, "error");
      }
    });
    scenePanel.body.append(el("div", { className: "scene-actions" }, [newSceneButton]));
  }

  function renderAssets(assets: GameInfo["assets"]): void {
    clear(assetsPanel.body);
    assetsPanel.setStatus(`${assets.length} assets`);
    if (assets.length === 0) {
      assetsPanel.body.append(
        el("p", { className: "muted", text: "no files next to the game yet" }),
      );
      return;
    }
    for (const asset of assets.slice(0, 60)) {
      assetsPanel.body.append(
        el("div", { className: "asset-row", title: asset.path }, [
          el("span", { className: `asset-kind kind-${asset.kind}`, text: asset.kind }),
          el("span", { text: asset.path }),
        ]),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Scene loading and saving
  // ---------------------------------------------------------------------------

  async function loadSceneByName(name: string): Promise<void> {
    const payload = await api.scene(name);
    const scene = deserializeScene(payload.scene);
    scene.name = name;
    session.setScene(scene, name);
    editingCamera = {
      position: { ...scene.resources.camera.position },
      zoom: 1,
      smoothing: 0,
      bounds: null,
      follow: null,
    };
    log(`opened ${name} (${scene.entityCount} entities)`);
  }

  async function save(): Promise<boolean> {
    try {
      const written = await api.saveScene(session.sceneName, session.toSerialized());
      session.markSaved();
      log(`saved ${session.sceneName} (${written.entities} entities) → ${written.path}`);
      await refreshScenes();
      return true;
    } catch (error) {
      log(`save failed: ${(error as Error).message}`, "error");
      return false;
    }
  }

  async function refreshScenes(): Promise<void> {
    const listed = await api.game();
    info.scenes = listed.scenes;
    info.assets = listed.assets;
    info.described = listed.described;
    renderSceneList();
    renderAssets(info.assets);
  }

  // ---------------------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------------------

  const sceneSelect = select(
    session.sceneName,
    info.scenes.map((scene) => scene.name),
    async (name) => {
      await loadSceneByName(name);
      renderSceneList();
    },
  );

  const playButton = button("play", () => {
    session.togglePlay();
    playButton.textContent = session.mode === "play" ? "stop" : "play";
    updateStatus("play toggled");
  }, { kind: "primary", title: "F5" });

  toolbar.append(
    el("span", { className: "brand", text: "Ember Studio" }),
    el("span", {
      className: "game-title",
      text: `${info.descriptor.title} v${info.descriptor.version}`,
    }),
    sceneSelect,
    button("save", () => void save(), { title: "Ctrl+S", kind: "primary" }),
    button("reload", async () => {
      try {
        await api.reload();
        await refreshScenes();
        await loadSceneByName(session.sceneName);
        log("reloaded the game folder from disk");
      } catch (error) {
        log(`reload failed: ${(error as Error).message}`, "error");
      }
    }, { title: "re-read scene files and the game module" }),
    button("test run", async () => {
      try {
        const result = await api.simulate(session.sceneName, 3);
        const after = result.after as Record<string, unknown>;
        const run = after.runState as Record<string, unknown> | null;
        log(
          `test run ${result.scene}: ${result.frames} frames · ${after.entities} entities · ` +
            `${after.draws} draws · digest ${after.digest}` +
            (run ? ` · status=${run.status} score=${run.score} lives=${run.lives}` : ""),
        );
      } catch (error) {
        log(`test run failed: ${(error as Error).message}`, "error");
      }
    }, { title: "simulate this scene headlessly (3s)" }),
    button("export .exe", async () => {
      const destination = await askWhereToInstall(info.descriptor.title);
      if (destination === null) {
        log("export cancelled");
        return;
      }
      log("compiling… (this runs deno bundle + deno compile)");
      try {
        const response = await api.exportGame(true, destination || undefined);
        for (const step of response.export.steps) {
          log(`  ${step.name}: ${step.detail} (${step.ms.toFixed(0)}ms)`);
        }
        log(
          `exported ${response.export.exePath} (${
            (response.export.exeBytes / 1024 / 1024).toFixed(1)
          } MiB)`,
        );
        if (response.installed) log(`installed at ${response.installed}`);
        for (const check of response.verification?.checks ?? []) {
          log(
            `  ${check.ok ? "ok" : "FAIL"} ${check.name}: ${check.detail}`,
            check.ok ? "info" : "error",
          );
        }
      } catch (error) {
        log(`export failed: ${(error as Error).message}`, "error");
      }
    }, { title: "compile the game and choose where it is installed" }),
    playButton,
    button("step", () => session.stepPlay(1), { title: "advance one fixed step" }),
    button("colliders", () => {
      showColliders = !showColliders;
      log(`collider overlay ${showColliders ? "on" : "off"}`);
    }),
    button("undo", () => {
      if (!session.undo()) log("nothing to undo", "warn");
    }, { title: "Ctrl+Z" }),
    button("redo", () => {
      if (!session.redo()) log("nothing to redo", "warn");
    }, { title: "Ctrl+Y" }),
  );

  // ---------------------------------------------------------------------------
  // Viewport interaction
  // ---------------------------------------------------------------------------

  const viewportSize = () => ({ width: canvas.width, height: canvas.height });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (session.mode === "play") return;
    const rect = canvas.getBoundingClientRect();
    const anchor = {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
    editingCamera = zoomAtScreenPoint(
      editingCamera,
      viewportSize(),
      anchor,
      event.deltaY < 0 ? 1.12 : 1 / 1.12,
    );
    updateStatus("zoom");
  }, { passive: false });

  let dragStart: { x: number; y: number; entity: Entity; world: { x: number; y: number } } | null =
    null;
  let panStart: { x: number; y: number; camera: { x: number; y: number } } | null = null;

  canvas.addEventListener("mousedown", (event) => {
    if (session.mode === "play") return;
    const point = canvasPoint(event);
    if (event.button === 1 || event.shiftKey) {
      panStart = { x: point.x, y: point.y, camera: { ...editingCamera.position } };
      return;
    }
    if (event.button !== 0 || !lastPickList) return;
    const entity = pickEntityAtPoint(lastPickList, point);
    session.select(entity);
    if (entity === null) return;
    const transform = session.scene.world.get(entity, Transform);
    if (!transform) return;
    dragStart = { x: point.x, y: point.y, entity, world: { ...transform.position } };
  });

  window.addEventListener("mousemove", (event) => {
    if (panStart) {
      const point = canvasPoint(event);
      editingCamera = {
        ...editingCamera,
        position: {
          x: panStart.camera.x - (point.x - panStart.x) / editingCamera.zoom,
          y: panStart.camera.y - (point.y - panStart.y) / editingCamera.zoom,
        },
      };
      return;
    }
    if (!dragStart) return;
    const point = canvasPoint(event);
    const transform = session.scene.world.get(dragStart.entity, Transform);
    if (!transform) return;
    transform.position.x = Math.round(
      dragStart.world.x + (point.x - dragStart.x) / editingCamera.zoom,
    );
    transform.position.y = Math.round(
      dragStart.world.y + (point.y - dragStart.y) / editingCamera.zoom,
    );
  });

  window.addEventListener("mouseup", () => {
    if (panStart) panStart = null;
    if (dragStart) {
      // One undo step for the whole drag: commit once with the final position.
      const entity = dragStart.entity;
      dragStart = null;
      session.commit(`move #${entity}`);
    }
  });

  function canvasPoint(event: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    const meta = event.ctrlKey || event.metaKey;
    if (meta && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
      return;
    }
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      session.undo();
      return;
    }
    if (
      meta &&
      (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))
    ) {
      event.preventDefault();
      session.redo();
      return;
    }
    if (meta && event.key.toLowerCase() === "d") {
      event.preventDefault();
      session.duplicateSelected();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      session.deleteSelected();
      return;
    }
    if (event.key === "F5") {
      event.preventDefault();
      session.togglePlay();
      playButton.textContent = session.mode === "play" ? "stop" : "play";
    }
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  renderSceneList();
  renderAssets(info.assets);
  renderHierarchy();
  renderInspectorPanel();
  updateStatus("ready");
  log(`studio ready — ${info.scenes.length} scenes from ${info.sceneSource}`);
  log(`scenes on disk: ${info.scenes.map((scene) => scene.name).join(", ")}`);
  window.addEventListener("resize", () => {
    canvas.width = Math.max(320, Math.round(viewportMount.clientWidth || 960));
    canvas.height = Math.max(240, Math.round(viewportMount.clientHeight || 540));
  });
  canvas.width = Math.max(320, Math.round(viewportMount.clientWidth || 960));
  canvas.height = Math.max(240, Math.round(viewportMount.clientHeight || 540));
  requestAnimationFrame(frameLoop);

  const app: StudioApp = {
    api,
    session,
    info,
    save,
    loadScene: loadSceneByName,
    refresh: refreshScenes,
  };
  (window as unknown as { emberStudio?: unknown }).emberStudio = app;
  return app;
}

/**
 * The export dialog: a small in-page window that asks where the compiled game should be
 * installed. Resolves with the answer, an empty string for the default `dist/` location, or
 * null when the user cancels.
 */
function askWhereToInstall(gameTitle: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = el("input", { className: "dialog-input" });
    input.placeholder = "leave empty to keep dist/<game>.exe";
    input.spellcheck = false;

    const finish = (value: string | null) => {
      overlay.remove();
      resolve(value);
    };

    const overlay = el("div", { className: "dialog-overlay" }, [
      el("div", { className: "dialog" }, [
        el("h2", { text: `Export ${gameTitle}` }),
        el("p", {
          text: "Where should the game be installed? Type a folder, or a full path ending in .exe.",
        }),
        input,
        el("div", { className: "dialog-actions" }, [
          button("cancel", () => finish(null)),
          button("export here", () => finish(input.value.trim()), { kind: "primary" }),
        ]),
      ]),
    ]);

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(input.value.trim());
      if (event.key === "Escape") finish(null);
    });
    document.body.append(overlay);
    input.focus();
  });
}

function stamp(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${
    String(now.getMinutes()).padStart(2, "0")
  }:` +
    `${String(now.getSeconds()).padStart(2, "0")}`;
}
