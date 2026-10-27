/**
 * @ember/editor/native/app — the native authoring application.
 *
 * Owner: this file owns the editor's state, layout and interaction. It draws with GDI,
 * reads the same `Scene`/component data the game uses, previews through `buildFrame` and
 * runs play mode through `RuntimeHost`. A human can select, move, add and delete entities,
 * edit components and the 3D camera, switch scenes, save `.emberscene` files and play.
 *
 * No browser, no HTTP server and no second scene model are involved.
 */

import { join } from "node:path";
import {
  type Camera2DState,
  CircleShape,
  Colors,
  type ComponentType,
  componentByName,
  componentNames,
  type Entity,
  InputTracker,
  MeshRenderer,
  Name,
  Parent,
  readSceneFile,
  RectShape,
  Scene,
  sceneFileName,
  TextLabel,
  Transform,
  Transform3D,
  type Vec2,
  worldTransform,
  writeSceneFile,
} from "@ember/core";
import {
  type DrawCommand,
  type DrawList,
  pickEntityAtPoint,
  screenToWorld,
  zoomAtScreenPoint,
} from "@ember/render2d";
import { buildFrame } from "@ember/render3d";
import { meshNames } from "@ember/render3d";
import { type Game, RuntimeHost } from "@ember/runtime";
import {
  clientToScene,
  entitySceneBounds,
  previewMapping,
  type PreviewRect,
  renderCommandsGdi,
} from "./gdi-backend.ts";
import type { GdiCanvas } from "./gdi.ts";
import {
  openWindow,
  type Message,
  VK_BACK,
  VK_DOWN,
  VK_ESCAPE,
  VK_LEFT,
  VK_RETURN,
  VK_RIGHT,
  VK_UP,
  WM_CHAR,
  WM_KEYDOWN,
  WM_KEYUP,
  WM_KILLFOCUS,
  WM_LBUTTONDOWN,
  WM_LBUTTONUP,
  WM_MBUTTONDOWN,
  WM_MBUTTONUP,
  WM_MOUSEMOVE,
  WM_MOUSEWHEEL,
  WM_RBUTTONDOWN,
  WM_RBUTTONUP,
  type Win32Window,
} from "./win32.ts";

// ---------------------------------------------------------------------------
// Theme and layout
// ---------------------------------------------------------------------------

const T = {
  background: "#0b0e15",
  panel: "#0f1420",
  panelDeep: "#0a0e17",
  header: "#121a2a",
  border: "#222a3b",
  borderSoft: "#1a2130",
  text: "#dfe6f3",
  muted: "#8b93a7",
  faint: "#5b6478",
  accent: "#ff7a2f",
  accentSoft: "#3a2318",
  gold: "#ffc857",
  good: "#5ec27a",
  bad: "#e5484d",
  field: "#090d16",
  rowHover: "#182033",
  rowSelected: "#273250",
};

const TOOLBAR_HEIGHT = 46;
const STATUS_HEIGHT = 24;
const LEFT_WIDTH = 226;
const RIGHT_WIDTH = 340;
const ROW_HEIGHT = 20;
const FIELD_ROW = 23;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function clean(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// ---------------------------------------------------------------------------
// Inspector schema
// ---------------------------------------------------------------------------

type FieldKind = "number" | "text" | "color" | "boolean" | "enum" | "mesh";

interface FieldDefinition {
  path: string;
  label?: string;
  kind?: FieldKind;
  options?: readonly string[];
}

const COMPONENT_FIELDS: Record<string, readonly FieldDefinition[]> = {
  Transform: [
    { path: "position.x", label: "X" },
    { path: "position.y", label: "Y" },
    { path: "rotation", label: "Rotation" },
    { path: "scale.x", label: "Scale X" },
    { path: "scale.y", label: "Scale Y" },
  ],
  Transform3D: [
    { path: "position.x", label: "X" },
    { path: "position.y", label: "Y" },
    { path: "position.z", label: "Z" },
    { path: "rotation.x", label: "Rot X" },
    { path: "rotation.y", label: "Rot Y" },
    { path: "rotation.z", label: "Rot Z" },
    { path: "scale.x", label: "Scale X" },
    { path: "scale.y", label: "Scale Y" },
    { path: "scale.z", label: "Scale Z" },
  ],
  RectShape: [
    { path: "width", label: "Width" },
    { path: "height", label: "Height" },
    { path: "color", label: "Color", kind: "color" },
    { path: "layer", label: "Layer" },
    { path: "alpha", label: "Alpha" },
    { path: "filled", label: "Filled", kind: "boolean" },
    { path: "strokeWidth", label: "Stroke" },
  ],
  CircleShape: [
    { path: "radius", label: "Radius" },
    { path: "color", label: "Color", kind: "color" },
    { path: "layer", label: "Layer" },
    { path: "alpha", label: "Alpha" },
    { path: "filled", label: "Filled", kind: "boolean" },
    { path: "strokeWidth", label: "Stroke" },
  ],
  Sprite: [
    { path: "texture", label: "Texture" },
    { path: "width", label: "Width" },
    { path: "height", label: "Height" },
    { path: "tint", label: "Tint", kind: "color" },
    { path: "alpha", label: "Alpha" },
    { path: "layer", label: "Layer" },
    { path: "flipX", label: "Flip X", kind: "boolean" },
  ],
  TextLabel: [
    { path: "text", label: "Text" },
    { path: "size", label: "Size" },
    { path: "color", label: "Color", kind: "color" },
    {
      path: "align",
      label: "Align",
      kind: "enum",
      options: ["left", "center", "right"],
    },
    {
      path: "baseline",
      label: "Baseline",
      kind: "enum",
      options: ["top", "middle", "bottom"],
    },
    { path: "layer", label: "Layer" },
    { path: "alpha", label: "Alpha" },
  ],
  MeshRenderer: [
    { path: "mesh", label: "Mesh", kind: "mesh" },
    { path: "color", label: "Color", kind: "color" },
    { path: "alpha", label: "Alpha" },
    { path: "layer", label: "Layer" },
    { path: "doubleSided", label: "Double sided", kind: "boolean" },
    { path: "wireframe", label: "Wireframe", kind: "boolean" },
  ],
  BoxCollider: [
    { path: "width", label: "Width" },
    { path: "height", label: "Height" },
    { path: "offset.x", label: "Offset X" },
    { path: "offset.y", label: "Offset Y" },
    { path: "solid", label: "Solid", kind: "boolean" },
    { path: "trigger", label: "Trigger", kind: "boolean" },
    { path: "enabled", label: "Enabled", kind: "boolean" },
  ],
  RigidBody: [
    {
      path: "type",
      label: "Body type",
      kind: "enum",
      options: ["dynamic", "static", "kinematic"],
    },
    { path: "gravityScale", label: "Gravity scale" },
    { path: "friction", label: "Friction" },
    { path: "maxSpeed", label: "Max speed" },
    { path: "restitution", label: "Restitution" },
    { path: "grounded", label: "Grounded", kind: "boolean" },
  ],
  Velocity: [
    { path: "x", label: "X" },
    { path: "y", label: "Y" },
    { path: "angular", label: "Angular" },
  ],
  Tag: [{ path: "value", label: "Tag" }],
  Visibility: [{ path: "visible", label: "Visible", kind: "boolean" }],
  Parent: [{ path: "entity", label: "Parent id" }],
  Name: [{ path: "value", label: "Name" }],
};

const SECTION_ORDER = [
  "Transform",
  "Transform3D",
  "MeshRenderer",
  "RectShape",
  "CircleShape",
  "Sprite",
  "TextLabel",
  "BoxCollider",
  "RigidBody",
  "Velocity",
  "Tag",
  "Visibility",
  "Parent",
];

interface FieldSpec {
  id: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  get(): unknown;
  set(value: unknown): void;
}

type Mode = "edit" | "play" | "paused";

interface Hit<T> {
  rect: Rect;
  action: T;
}

interface Editing {
  id: string;
  spec: FieldSpec;
  text: string;
}

interface DragState {
  entity: Entity;
  startWorld: Vec2;
  startPosition: Vec2;
}

interface PanState {
  startX: number;
  startY: number;
  startCamera: Vec2;
}

export interface NativeEditorOptions {
  game: Game;
  sceneDirectory: string;
  title?: string;
  savedScenes?: Iterable<string>;
  startScene?: string;
}

function readPath(target: Record<string, unknown>, path: string): unknown {
  let current: unknown = target;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let current: Record<string, unknown> = target;
  for (let index = 0; index < segments.length - 1; index++) {
    const next = current[segments[index]];
    if (!next || typeof next !== "object") return;
    current = next as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

function inferKind(path: string, value: unknown): FieldKind {
  const key = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (key.includes("color") || key === "tint" || key === "background") return "color";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "text";
}

function displayValue(value: unknown): string {
  if (typeof value === "number") return String(clean(value));
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

export class NativeEditor {
  private readonly game: Game;
  private readonly sceneDirectory: string;
  private readonly projectTitle: string;
  private readonly savedScenes: Set<string>;
  private scene: Scene;
  private sceneName: string;
  private camera: Camera2DState;
  private selected: Entity | null = null;
  private hover: Entity | null = null;
  private mode: Mode = "edit";
  private host: RuntimeHost | null = null;
  private tracker: InputTracker | null = null;
  private window: Win32Window | null = null;
  private dirty = false;
  private needsPaint = true;
  private lastPaint = 0;
  private status = "";
  private statusKind: "info" | "error" = "info";
  private statusUntil = 0;
  private hierarchyScroll = 0;
  private inspectorScroll = 0;
  private inspectorContentHeight = 0;
  private editing: Editing | null = null;
  private buttons: Array<Hit<() => void>> = [];
  private fields: Array<Hit<FieldSpec>> = [];
  private entityRows: Array<Hit<Entity>> = [];
  private menuHits: Array<Hit<() => void>> = [];
  private sceneMenuOpen = false;
  private componentMenuOpen = false;
  private previewRect: PreviewRect | null = null;
  private commands: DrawCommand[] = [];
  private drag: DragState | null = null;
  private pan: PanState | null = null;
  private mouse = { x: 0, y: 0 };

  constructor(options: NativeEditorOptions) {
    this.game = options.game;
    this.sceneDirectory = options.sceneDirectory;
    this.projectTitle = options.title ?? this.game.title;
    this.savedScenes = new Set(options.savedScenes ?? []);
    const names = this.game.sceneNames();
    if (names.length === 0) {
      const scene = new Scene({ name: "scene", background: Colors.ink });
      this.game.registerScene("scene", () => scene.clone());
      names.push("scene");
    }
    const start = options.startScene && names.includes(options.startScene)
      ? options.startScene
      : this.game.startScene;
    this.sceneName = start;
    this.scene = this.game.createScene(start);
    this.camera = this.cameraFor(this.scene);
  }

  /** Loads authored scene files and runs until the window closes. */
  static async launch(options: NativeEditorOptions): Promise<void> {
    const loaded = await options.game.loadSceneDirectory(options.sceneDirectory).catch(() => []);
    const editor = new NativeEditor({
      ...options,
      savedScenes: new Set([...(options.savedScenes ?? []), ...loaded]),
    });
    await editor.run();
  }

  private cameraFor(scene: Scene): Camera2DState {
    return {
      ...scene.resources.camera,
      position: { ...scene.resources.camera.position },
      bounds: null,
      follow: null,
    };
  }

  async run(): Promise<void> {
    this.window = openWindow({
      title: this.windowTitle(),
      onPaint: (canvas, width, height) => this.paint(canvas, width, height),
      onMessage: (message) => this.handleMessage(message),
      onClose: () =>
        !this.dirty ||
        (this.window?.confirm("Discard unsaved changes and close the editor?") ?? true),
    });

    let last = performance.now();
    while (this.window.pump()) {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (this.mode === "play" && this.host) {
        this.host.advance(dt, this.tracker?.snapshot());
        if (now - this.lastPaint > 15) this.window.repaint();
      } else if (this.needsPaint && now - this.lastPaint > 4) {
        this.window.repaint();
      }
      await new Promise((resolve) => setTimeout(resolve, 6));
    }
    this.window.dispose();
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  private handleMessage(message: Message): boolean {
    this.mouse = { x: message.mouseX, y: message.mouseY };
    switch (message.msg) {
      case WM_KILLFOCUS:
        this.releasePlayKeys();
        this.drag = null;
        this.pan = null;
        return false;
      case WM_MOUSEMOVE:
        this.onMouseMove(message.mouseX, message.mouseY);
        return true;
      case WM_LBUTTONDOWN:
        this.onLeftDown(message.mouseX, message.mouseY);
        return true;
      case WM_LBUTTONUP:
        this.onLeftUp();
        return true;
      case WM_RBUTTONDOWN:
      case WM_MBUTTONDOWN:
        this.beginPan(message.mouseX, message.mouseY);
        return true;
      case WM_RBUTTONUP:
      case WM_MBUTTONUP:
        this.endPan();
        return true;
      case WM_MOUSEWHEEL:
        this.onWheel(message.mouseX, message.mouseY, message.wheelDelta);
        return true;
      case WM_KEYDOWN:
        return this.onKeyDown(message.wParam);
      case WM_KEYUP:
        this.onKeyUp(message.wParam);
        return true;
      case WM_CHAR:
        return this.onChar(message.wParam);
      default:
        return false;
    }
  }

  private onLeftDown(x: number, y: number): void {
    this.commitEditing();
    if (this.sceneMenuOpen) {
      const hit = this.menuHits.find((entry) => contains(entry.rect, x, y));
      this.sceneMenuOpen = false;
      this.componentMenuOpen = false;
      this.needsPaint = true;
      if (hit) {
        hit.action();
        return;
      }
      return;
    }
    if (this.componentMenuOpen) {
      const hit = this.menuHits.find((entry) => contains(entry.rect, x, y));
      this.componentMenuOpen = false;
      this.needsPaint = true;
      if (hit) hit.action();
      return;
    }

    const button = this.buttons.find((entry) => contains(entry.rect, x, y));
    if (button) {
      button.action();
      return;
    }
    const field = this.fields.find((entry) => contains(entry.rect, x, y));
    if (field) {
      this.beginField(field.action);
      return;
    }
    const row = this.entityRows.find((entry) => contains(entry.rect, x, y));
    if (row) {
      this.selected = row.action;
      this.inspectorScroll = 0;
      this.needsPaint = true;
      return;
    }

    const preview = this.previewRect;
    if (preview && contains(preview, x, y)) {
      if (this.mode === "play") {
        this.tracker?.pressMouse("left");
        return;
      }
      const scenePoint = clientToScene(preview, x, y);
      const entity = this.pick(scenePoint);
      this.selected = entity;
      this.inspectorScroll = 0;
      if (entity !== null) {
        const transform = this.scene.world.get(entity, Transform);
        if (transform) {
          this.drag = {
            entity,
            startWorld: screenToWorld(this.camera, this.scene.resources.viewport, scenePoint),
            startPosition: { ...transform.position },
          };
          this.window?.captureMouse();
        }
      }
      this.needsPaint = true;
    }
  }

  private onLeftUp(): void {
    if (this.mode === "play") this.tracker?.releaseMouse("left");
    if (this.drag) {
      this.drag = null;
      this.window?.releaseMouse();
    }
  }

  private beginPan(x: number, y: number): void {
    if (this.mode === "play") return;
    const preview = this.previewRect;
    if (!preview || !contains(preview, x, y)) return;
    this.pan = {
      startX: x,
      startY: y,
      startCamera: { ...this.camera.position },
    };
    this.window?.captureMouse();
  }

  private endPan(): void {
    if (!this.pan) return;
    this.pan = null;
    this.window?.releaseMouse();
  }

  private onMouseMove(x: number, y: number): void {
    if (this.mode === "play" && this.previewRect && contains(this.previewRect, x, y)) {
      const point = clientToScene(this.previewRect, x, y);
      this.tracker?.moveMouse(point.x, point.y);
    }
    if (this.drag) {
      const preview = this.previewRect;
      if (!preview) return;
      const point = clientToScene(preview, x, y);
      const world = screenToWorld(this.camera, this.scene.resources.viewport, point);
      const transform = this.scene.world.get(this.drag.entity, Transform);
      if (transform) {
        transform.position = {
          x: this.drag.startPosition.x + (world.x - this.drag.startWorld.x),
          y: this.drag.startPosition.y + (world.y - this.drag.startWorld.y),
        };
        this.markDirty();
      }
      return;
    }
    if (this.pan) {
      const scale = this.camera.zoom;
      this.camera.position = {
        x: this.pan.startCamera.x - (x - this.pan.startX) / scale,
        y: this.pan.startCamera.y - (y - this.pan.startY) / scale,
      };
      this.needsPaint = true;
      return;
    }
    if (this.mode !== "play" && this.previewRect && contains(this.previewRect, x, y)) {
      const point = clientToScene(this.previewRect, x, y);
      const entity = this.pick(point);
      if (entity !== this.hover) {
        this.hover = entity;
        this.needsPaint = true;
      }
    } else if (this.hover !== null) {
      this.hover = null;
      this.needsPaint = true;
    }
  }

  private onWheel(x: number, y: number, delta: number): void {
    if (this.mode === "play") return;
    const preview = this.previewRect;
    if (preview && contains(preview, x, y)) {
      const point = clientToScene(preview, x, y);
      this.camera = zoomAtScreenPoint(
        this.camera,
        this.scene.resources.viewport,
        point,
        delta > 0 ? 1.12 : 0.89,
        { min: 0.12, max: 8 },
      );
      this.camera.bounds = null;
      this.camera.follow = null;
      this.needsPaint = true;
      return;
    }
    const height = this.window?.clientSize().height ?? 0;
    const contentHeight = height - TOOLBAR_HEIGHT - STATUS_HEIGHT;
    if (y < TOOLBAR_HEIGHT || y > TOOLBAR_HEIGHT + contentHeight) return;
    if (x < LEFT_WIDTH) {
      this.hierarchyScroll = Math.max(0, this.hierarchyScroll - delta * 60);
      this.needsPaint = true;
    } else if (x > (this.window?.clientSize().width ?? 0) - RIGHT_WIDTH) {
      this.inspectorScroll = Math.max(0, this.inspectorScroll - delta * 60);
      this.needsPaint = true;
    }
  }

  private onKeyDown(vk: number): boolean {
    if (this.editing) {
      if (vk === VK_RETURN) {
        this.commitEditing();
        return true;
      }
      if (vk === VK_ESCAPE) {
        this.editing = null;
        this.needsPaint = true;
        return true;
      }
      if (vk === VK_BACK) {
        this.editing.text = this.editing.text.slice(0, -1);
        this.needsPaint = true;
        return true;
      }
      return true;
    }
    if (this.mode === "play") {
      if (vk === VK_ESCAPE) {
        this.stopPlay();
        return true;
      }
      const key = keyName(vk);
      if (key) {
        this.tracker?.press(key);
        return true;
      }
      return false;
    }
    if (this.mode === "paused") {
      if (vk === VK_ESCAPE) this.stopPlay();
      return true;
    }
    if (vk === VK_ESCAPE) {
      this.selected = null;
      this.sceneMenuOpen = false;
      this.componentMenuOpen = false;
      this.needsPaint = true;
      return true;
    }
    if (this.selected !== null) {
      const transform = this.scene.world.get(this.selected, Transform);
      if (transform) {
        const step = 1;
        if (vk === VK_LEFT) transform.position.x -= step;
        else if (vk === VK_RIGHT) transform.position.x += step;
        else if (vk === VK_UP) transform.position.y -= step;
        else if (vk === VK_DOWN) transform.position.y += step;
        else return false;
        this.markDirty();
        return true;
      }
    }
    return false;
  }

  private onKeyUp(vk: number): void {
    if (this.mode !== "play") return;
    const key = keyName(vk);
    if (key) this.tracker?.release(key);
  }

  private onChar(code: number): boolean {
    if (!this.editing) return false;
    if (code >= 32 && code !== 127) {
      this.editing.text += String.fromCharCode(code);
      this.needsPaint = true;
    }
    return true;
  }

  private releasePlayKeys(): void {
    if (!this.tracker) return;
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS"]) {
      this.tracker.release(key);
    }
    this.tracker.releaseMouse("left");
  }

  // -------------------------------------------------------------------------
  // Editing operations
  // -------------------------------------------------------------------------

  private pick(point: Vec2): Entity | null {
    const list: DrawList = {
      commands: this.commands,
      stats: { considered: 0, drawn: 0, culled: 0 },
      camera: this.camera,
      viewport: this.scene.resources.viewport,
    };
    return pickEntityAtPoint(list, point);
  }

  private beginField(spec: FieldSpec): void {
    if (spec.kind === "boolean") {
      spec.set(!spec.get());
      this.markDirty();
      return;
    }
    if (spec.kind === "enum" || spec.kind === "mesh") {
      const options = spec.kind === "mesh" ? meshNames() : spec.options ?? [];
      if (options.length === 0) return;
      const current = String(spec.get() ?? "");
      const index = options.indexOf(current);
      spec.set(options[(index + 1 + options.length) % options.length]);
      this.markDirty();
      return;
    }
    this.editing = {
      id: spec.id,
      spec,
      text: displayValue(spec.get()),
    };
    this.needsPaint = true;
  }

  private commitEditing(): void {
    if (!this.editing) return;
    const { spec, text } = this.editing;
    this.editing = null;
    if (spec.kind === "number") {
      const value = Number(text);
      if (!Number.isFinite(value)) {
        this.toast(`"${text}" is not a number`, "error");
        this.needsPaint = true;
        return;
      }
      spec.set(value);
    } else {
      spec.set(text);
    }
    this.markDirty();
  }

  private markDirty(): void {
    this.dirty = true;
    this.needsPaint = true;
    this.window?.setTitle(this.windowTitle());
  }

  private windowTitle(): string {
    return `EmberEngine — ${this.projectTitle} — ${this.sceneName}${this.dirty ? " *" : ""}`;
  }

  private toast(message: string, kind: "info" | "error" = "info"): void {
    this.status = message;
    this.statusKind = kind;
    this.statusUntil = performance.now() + 3500;
    this.needsPaint = true;
  }

  private select(entity: Entity | null): void {
    this.selected = entity;
    this.inspectorScroll = 0;
    this.needsPaint = true;
  }

  private addEntity(kind: "rect" | "circle" | "text" | "cube"): void {
    const viewport = this.scene.resources.viewport;
    const center = screenToWorld(this.camera, viewport, {
      x: viewport.width / 2,
      y: viewport.height / 2,
    });
    if (kind === "cube") {
      const entity = this.scene.world.spawn();
      this.scene.world.add(entity, Name, { value: "Cube" });
      this.scene.world.add(entity, Transform3D, {
        position: { x: 0, y: 0, z: 0 },
        scale: { x: 90, y: 90, z: 90 },
      });
      this.scene.world.add(entity, MeshRenderer, { mesh: "cube", color: Colors.sky });
      this.select(entity);
      this.markDirty();
      return;
    }
    const label = kind === "rect" ? "Rectangle" : kind === "circle" ? "Circle" : "Text";
    const entity = this.scene.createEntity({ name: label, position: center });
    if (kind === "rect") {
      this.scene.world.add(entity, RectShape, {
        width: 140,
        height: 48,
        color: Colors.ember,
        alpha: 1,
      });
    } else if (kind === "circle") {
      this.scene.world.add(entity, CircleShape, {
        radius: 32,
        color: Colors.gold,
        alpha: 1,
      });
    } else {
      this.scene.world.add(entity, TextLabel, {
        text: "Text",
        size: 22,
        color: Colors.white,
        align: "left",
        baseline: "top",
      });
    }
    this.select(entity);
    this.markDirty();
  }

  private addComponent(name: string): void {
    if (this.selected === null) return;
    const type = componentByName(name);
    if (!type) return;
    this.scene.world.add(this.selected, type as ComponentType<object>);
    this.markDirty();
  }

  private removeComponent(name: string): void {
    if (this.selected === null) return;
    const type = componentByName(name);
    if (!type) return;
    this.scene.world.remove(this.selected, type as ComponentType<object>);
    this.markDirty();
  }

  private deleteSelected(): void {
    if (this.selected === null) return;
    const entity = this.selected;
    for (const other of this.scene.world.entities()) {
      const parent = this.scene.world.get(other, Parent);
      if (parent && parent.entity === entity) this.scene.world.remove(other, Parent);
    }
    this.scene.world.despawn(entity);
    this.selected = null;
    this.markDirty();
  }

  private async saveScene(): Promise<boolean> {
    try {
      const path = this.scenePath();
      await writeSceneFile(path, this.scene);
      this.game.registerScene(this.scene.name, () => this.scene.clone());
      this.savedScenes.add(this.scene.name);
      this.dirty = false;
      this.window?.setTitle(this.windowTitle());
      this.toast(`Saved ${path}`);
      this.needsPaint = true;
      return true;
    } catch (error) {
      this.toast(`Save failed: ${(error as Error).message}`, "error");
      this.needsPaint = true;
      return false;
    }
  }

  private scenePath(): string {
    return join(this.sceneDirectory, sceneFileName(this.scene.name));
  }

  private async switchScene(name: string): Promise<void> {
    if (name === this.sceneName) return;
    if (this.dirty && !(await this.saveScene())) return;
    if (this.mode !== "edit") this.stopPlay();
    this.scene = this.game.createScene(name);
    this.sceneName = name;
    this.camera = this.cameraFor(this.scene);
    this.selected = null;
    this.hover = null;
    this.editing = null;
    this.dirty = false;
    this.hierarchyScroll = 0;
    this.inspectorScroll = 0;
    this.window?.setTitle(this.windowTitle());
    this.toast(`Opened ${name}`);
  }

  private newScene(): void {
    let index = 2;
    let name = `scene-${index}`;
    while (this.game.hasScene(name)) {
      index += 1;
      name = `scene-${index}`;
    }
    const scene = new Scene({
      name,
      viewport: { ...this.scene.resources.viewport },
      background: this.scene.resources.background,
    });
    this.game.registerScene(name, () => scene.clone());
    this.scene = scene;
    this.sceneName = name;
    this.camera = this.cameraFor(scene);
    this.selected = null;
    this.dirty = true;
    this.hierarchyScroll = 0;
    this.inspectorScroll = 0;
    this.window?.setTitle(this.windowTitle());
    this.toast(`Created ${name} (save to write it to disk)`);
  }

  private async revertScene(): Promise<void> {
    if (!this.savedScenes.has(this.sceneName)) {
      this.toast("No saved scene to revert", "error");
      return;
    }
    if (!this.window?.confirm(`Discard unsaved changes and reload "${this.sceneName}" from disk?`)) {
      return;
    }
    try {
      const scene = await readSceneFile(this.scenePath());
      scene.name = this.sceneName;
      this.game.registerScene(this.sceneName, () => scene.clone());
      this.scene = scene;
      this.camera = this.cameraFor(scene);
      this.selected = null;
      this.hover = null;
      this.editing = null;
      this.dirty = false;
      this.inspectorScroll = 0;
      this.window?.setTitle(this.windowTitle());
      this.toast(`Reverted ${this.sceneName} to the saved file`);
    } catch (error) {
      this.toast(`Revert failed: ${(error as Error).message}`, "error");
    }
    this.needsPaint = true;
  }

  private startPlay(): void {
    this.commitEditing();
    this.game.registerScene(this.scene.name, () => this.scene.clone());
    this.host = new RuntimeHost(this.game.createSession(this.scene.name));
    this.tracker = new InputTracker();
    this.mode = "play";
    this.needsPaint = true;
    this.toast("Play mode — Esc stops");
  }

  private togglePlay(): void {
    if (this.mode === "edit") this.startPlay();
    else if (this.mode === "play") {
      this.mode = "paused";
      this.releasePlayKeys();
      this.needsPaint = true;
    } else {
      this.mode = "play";
      this.needsPaint = true;
    }
  }

  private stopPlay(): void {
    this.releasePlayKeys();
    this.host = null;
    this.tracker = null;
    this.mode = "edit";
    this.needsPaint = true;
  }

  // -------------------------------------------------------------------------
  // Painting
  // -------------------------------------------------------------------------

  private paint(canvas: GdiCanvas, width: number, height: number): void {
    this.lastPaint = performance.now();
    this.buttons = [];
    this.fields = [];
    this.entityRows = [];
    this.menuHits = [];
    const sceneWidth = this.mode === "edit"
      ? this.scene.resources.viewport.width
      : this.host?.session.camera.viewport.width ?? 960;
    const sceneHeight = this.mode === "edit"
      ? this.scene.resources.viewport.height
      : this.host?.session.camera.viewport.height ?? 540;
    this.previewRect = {
      x: LEFT_WIDTH,
      y: TOOLBAR_HEIGHT,
      w: Math.max(240, width - LEFT_WIDTH - RIGHT_WIDTH),
      h: Math.max(200, height - TOOLBAR_HEIGHT - STATUS_HEIGHT),
      sceneWidth,
      sceneHeight,
    };
    this.drawToolbar(canvas, width);
    this.drawHierarchy(canvas, height);
    this.drawInspector(canvas, width, height);
    this.drawPreview(canvas);
    this.drawStatus(canvas, width, height);
    this.drawMenus(canvas, width, height);
    this.needsPaint = false;
  }

  private drawToolbar(canvas: GdiCanvas, width: number): void {
    canvas.fillRect(0, 0, width, TOOLBAR_HEIGHT, T.header);
    canvas.fillRect(0, TOOLBAR_HEIGHT - 1, width, 1, T.border);
    canvas.text(14, 13, "EMBER", 16, T.accent, "left", "top", true);
    canvas.text(70, 15, "ENGINE", 12, T.muted);
    const title = `${this.projectTitle} / ${this.sceneName}`;
    canvas.text(130, 14, title, 13, T.text);
    if (this.dirty) canvas.fillRect(122, 14, 5, 5, T.gold);

    const sceneLabel = `Scene: ${this.sceneName} ▾`;
    const sceneX = Math.min(width - 560, 390);
    this.button(canvas, sceneLabel, sceneX, 9, 170, 28, {
      active: this.sceneMenuOpen,
      action: () => {
        this.sceneMenuOpen = !this.sceneMenuOpen;
        this.componentMenuOpen = false;
        this.needsPaint = true;
      },
    });

    let right = width - 14;
    right = this.toolbarButton(canvas, "Fit", right, 50, () => {
      this.camera = this.cameraFor(this.scene);
      this.camera.zoom = 1;
      this.camera.position = {
        x: this.scene.resources.viewport.width / 2,
        y: this.scene.resources.viewport.height / 2,
      };
      this.needsPaint = true;
    });
    right = this.toolbarButton(canvas, "Stop", right, 56, () => this.stopPlay(), this.mode === "edit");
    right = this.toolbarButton(
      canvas,
      this.mode === "play" ? "Pause" : this.mode === "paused" ? "Resume" : "Play",
      right,
      68,
      () => this.togglePlay(),
    );
    this.toolbarButton(
      canvas,
      this.dirty ? "Save *" : "Save",
      right,
      76,
      () => void this.saveScene(),
      false,
      this.dirty,
    );
  }

  private toolbarButton(
    canvas: GdiCanvas,
    label: string,
    right: number,
    width: number,
    action: () => void,
    disabled = false,
    accent = false,
  ): number {
    const x = right - width;
    this.button(canvas, label, x, 9, width, 28, { action, disabled, accent });
    return x - 8;
  }

  private drawHierarchy(canvas: GdiCanvas, height: number): void {
    const panelH = height - TOOLBAR_HEIGHT - STATUS_HEIGHT;
    canvas.fillRect(0, TOOLBAR_HEIGHT, LEFT_WIDTH, panelH, T.panel);
    canvas.fillRect(LEFT_WIDTH - 1, TOOLBAR_HEIGHT, 1, panelH, T.border);
    canvas.text(12, TOOLBAR_HEIGHT + 11, "HIERARCHY", 11, T.muted, "left", "top", true);
    const count = this.scene.world.entityCount;
    canvas.text(LEFT_WIDTH - 12, TOOLBAR_HEIGHT + 11, String(count), 11, T.faint, "right");

    const addY = TOOLBAR_HEIGHT + 30;
    const addButtons: Array<[string, "rect" | "circle" | "text" | "cube", number]> = [
      ["Rect", "rect", 44],
      ["Circle", "circle", 50],
      ["Text", "text", 42],
      ["3D", "cube", 36],
    ];
    let x = 10;
    for (const [label, kind, width] of addButtons) {
      this.button(canvas, label, x, addY, width, 22, {
        action: () => this.addEntity(kind),
        small: true,
      });
      x += width + 5;
    }

    const listTop = addY + 30;
    const listHeight = height - STATUS_HEIGHT - listTop - 6;
    const entities = this.scene.world.entities();
    const maxScroll = Math.max(0, entities.length * ROW_HEIGHT - listHeight);
    this.hierarchyScroll = clamp(this.hierarchyScroll, 0, maxScroll);
    canvas.clip(0, listTop, LEFT_WIDTH - 1, listHeight);
    for (let index = 0; index < entities.length; index++) {
      const entity = entities[index];
      const y = listTop + index * ROW_HEIGHT - this.hierarchyScroll;
      if (y < listTop - ROW_HEIGHT || y > listTop + listHeight) continue;
      const row: Rect = { x: 0, y, w: LEFT_WIDTH - 1, h: ROW_HEIGHT };
      if (entity === this.selected) canvas.fillRect(row.x, row.y, row.w, row.h, T.rowSelected);
      else if (entity === this.hover) canvas.fillRect(row.x, row.y, row.w, row.h, T.rowHover);
      const label = this.scene.labelOf(entity);
      canvas.text(10, y + 4, truncate(canvas, label, LEFT_WIDTH - 82, 12), 12, T.text);
      const tags = componentTags(this.scene, entity);
      canvas.text(LEFT_WIDTH - 10, y + 5, tags, 10, T.faint, "right");
      this.entityRows.push({ rect: row, action: entity });
    }
    canvas.restore();
  }

  private drawInspector(canvas: GdiCanvas, width: number, height: number): void {
    const x = width - RIGHT_WIDTH;
    const panelH = height - TOOLBAR_HEIGHT - STATUS_HEIGHT;
    canvas.fillRect(x, TOOLBAR_HEIGHT, RIGHT_WIDTH, panelH, T.panel);
    canvas.fillRect(x, TOOLBAR_HEIGHT, 1, panelH, T.border);
    canvas.text(x + 12, TOOLBAR_HEIGHT + 11, "INSPECTOR", 11, T.muted, "left", "top", true);

    const contentTop = TOOLBAR_HEIGHT + 30;
    const contentBottom = height - STATUS_HEIGHT - 6;
    const contentHeight = contentBottom - contentTop;
    canvas.clip(x + 1, contentTop, RIGHT_WIDTH - 1, contentHeight);

    if (this.selected === null) {
      this.drawSceneInspector(canvas, x, contentTop);
    } else {
      this.drawEntityInspector(canvas, x, contentTop);
    }
    canvas.restore();
    const maxScroll = Math.max(0, this.inspectorContentHeight - contentHeight);
    const clamped = clamp(this.inspectorScroll, 0, maxScroll);
    if (clamped !== this.inspectorScroll) {
      this.inspectorScroll = clamped;
      this.needsPaint = true;
    }
  }

  private drawSceneInspector(canvas: GdiCanvas, x: number, top: number): void {
    const panelWidth = RIGHT_WIDTH - 24;
    let y = top + 4 - this.inspectorScroll;
    y = this.section(canvas, x + 12, y, panelWidth, "SCENE");
    y = this.field(canvas, x + 12, y, panelWidth, {
      id: "scene:name",
      label: "Name",
      kind: "text",
      get: () => this.sceneName,
      set: (value) => {
        this.sceneName = String(value);
        this.scene.name = this.sceneName;
      },
    });
    y = this.field(canvas, x + 12, y, panelWidth, {
      id: "scene:background",
      label: "Background",
      kind: "color",
      get: () => this.scene.resources.background,
      set: (value) => {
        this.scene.resources.background = String(value);
      },
    });
    y = this.field(canvas, x + 12, y, panelWidth, {
      id: "scene:viewport.width",
      label: "Viewport W",
      kind: "number",
      get: () => this.scene.resources.viewport.width,
      set: (value) => {
        this.scene.resources.viewport.width = Math.max(64, Number(value));
      },
    });
    y = this.field(canvas, x + 12, y, panelWidth, {
      id: "scene:viewport.height",
      label: "Viewport H",
      kind: "number",
      get: () => this.scene.resources.viewport.height,
      set: (value) => {
        this.scene.resources.viewport.height = Math.max(64, Number(value));
      },
    });
    y = this.field(canvas, x + 12, y, panelWidth, {
      id: "scene:gravity.x",
      label: "Gravity X",
      kind: "number",
      get: () => this.scene.resources.gravity.x,
      set: (value) => {
        this.scene.resources.gravity.x = Number(value);
      },
    });
    y = this.field(canvas, x + 12, y, panelWidth, {
      id: "scene:gravity.y",
      label: "Gravity Y",
      kind: "number",
      get: () => this.scene.resources.gravity.y,
      set: (value) => {
        this.scene.resources.gravity.y = Number(value);
      },
    });

    y += 6;
    y = this.section(canvas, x + 12, y, panelWidth, "3D CAMERA");
    const camera3d = this.scene.resources.camera3d;
    const cameraField = (
      label: string,
      id: string,
      get: () => number,
      set: (value: number) => void,
    ): void => {
      y = this.field(canvas, x + 12, y, panelWidth, {
        id: `scene:camera3d.${id}`,
        label,
        kind: "number",
        get,
        set: (value) => set(Number(value)),
      });
    };
    cameraField("Position X", "px", () => camera3d.position.x, (v) => camera3d.position.x = v);
    cameraField("Position Y", "py", () => camera3d.position.y, (v) => camera3d.position.y = v);
    cameraField("Position Z", "pz", () => camera3d.position.z, (v) => camera3d.position.z = v);
    cameraField("Target X", "tx", () => camera3d.target.x, (v) => camera3d.target.x = v);
    cameraField("Target Y", "ty", () => camera3d.target.y, (v) => camera3d.target.y = v);
    cameraField("Target Z", "tz", () => camera3d.target.z, (v) => camera3d.target.z = v);
    cameraField("FOV (rad)", "fov", () => camera3d.fov, (v) => camera3d.fov = Math.max(0.1, Math.min(3, v)));
    cameraField("Near", "near", () => camera3d.near, (v) => camera3d.near = Math.max(0.01, v));
    cameraField("Far", "far", () => camera3d.far, (v) => camera3d.far = Math.max(camera3d.near + 1, v));

    y += 8;
    if (this.savedScenes.has(this.sceneName) && this.dirty) {
      this.button(canvas, "Revert to saved file", x + 12, y, panelWidth, 24, {
        action: () => void this.revertScene(),
        danger: true,
      });
      y += 30;
    }
    canvas.text(
      x + 12,
      y + 4,
      "Select an entity in the hierarchy or viewport to edit it.",
      11,
      T.faint,
    );
    this.inspectorContentHeight = y + 24 - (top - this.inspectorScroll);
  }

  private drawEntityInspector(canvas: GdiCanvas, x: number, top: number): void {
    const entity = this.selected as Entity;
    const panelWidth = RIGHT_WIDTH - 24;
    let y = top + 2 - this.inspectorScroll;
    const label = this.scene.labelOf(entity);
    canvas.text(x + 12, y + 2, truncate(canvas, label, panelWidth - 70, 14), 14, T.text, "left", "top", true);
    this.button(canvas, "Delete", x + RIGHT_WIDTH - 12 - 58, y - 2, 58, 20, {
      action: () => this.deleteSelected(),
      danger: true,
      small: true,
    });
    canvas.text(x + 12, y + 22, `entity ${entity}`, 10, T.faint);
    y += 40;

    y = this.field(canvas, x + 12, y, panelWidth, {
      id: `${entity}:name`,
      label: "Name",
      kind: "text",
      get: () => this.scene.world.get(entity, Name)?.value ?? "",
      set: (value) => {
        const name = this.scene.world.get(entity, Name);
        if (name) name.value = String(value);
        else this.scene.world.add(entity, Name, { value: String(value) });
      },
    });

    const components = this.scene.world.componentsOf(entity).filter((name) => name !== "Name");
    components.sort((a, b) => {
      const ai = SECTION_ORDER.indexOf(a);
      const bi = SECTION_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    for (const name of components) {
      const specs = this.componentFields(entity, name);
      if (specs.length === 0) continue;
      y += 4;
      y = this.section(canvas, x + 12, y, panelWidth, name, () =>
        this.removeComponent(name));
      for (const spec of specs) {
        y = this.field(canvas, x + 12, y, panelWidth, spec);
      }
    }

    y += 8;
    this.button(canvas, "＋ Add component", x + 12, y, panelWidth, 24, {
      action: () => {
        this.componentMenuOpen = !this.componentMenuOpen;
        this.sceneMenuOpen = false;
        this.needsPaint = true;
      },
      small: true,
    });
    y += 32;
    this.inspectorContentHeight = y - (top - this.inspectorScroll);
  }

  private componentFields(entity: Entity, name: string): FieldSpec[] {
    const type = componentByName(name);
    if (!type) return [];
    const data = this.scene.world.get(
      entity,
      type as unknown as ComponentType<Record<string, unknown>>,
    );
    if (!data) return [];
    const definitions = COMPONENT_FIELDS[name] ?? genericFields(data);
    return definitions.map((definition) => {
      const value = readPath(data, definition.path);
      const kind = definition.kind ?? inferKind(definition.path, value);
      return {
        id: `${entity}:${name}:${definition.path}`,
        label: definition.label ?? definition.path,
        kind,
        options: definition.options,
        get: () => readPath(data, definition.path),
        set: (next) => writePath(data, definition.path, next),
      };
    });
  }

  private section(
    canvas: GdiCanvas,
    x: number,
    y: number,
    width: number,
    title: string,
    remove?: () => void,
  ): number {
    canvas.fillRect(x, y, width, 20, T.header);
    canvas.text(x + 8, y + 4, title, 11, T.gold, "left", "top", true);
    if (remove) {
      this.button(canvas, "×", x + width - 22, y + 2, 16, 16, {
        action: remove,
        danger: true,
        small: true,
      });
    }
    return y + 22;
  }

  private field(
    canvas: GdiCanvas,
    x: number,
    y: number,
    width: number,
    spec: FieldSpec,
  ): number {
    const active = this.editing?.id === spec.id;
    canvas.text(x, y + 6, truncate(canvas, spec.label, 98, 11), 11, T.muted);
    const boxX = x + 104;
    const boxW = width - 104;
    canvas.fillRect(boxX, y + 2, boxW, 18, active ? "#161d2c" : T.field);
    canvas.strokeRect(boxX, y + 2, boxW, 18, active ? T.accent : T.borderSoft);
    const value = spec.get();

    if (spec.kind === "boolean") {
      const on = Boolean(value);
      canvas.fillRect(boxX + 3, y + 5, 12, 12, on ? T.accent : "#1c2436");
      canvas.strokeRect(boxX + 3, y + 5, 12, 12, on ? T.accent : T.border);
      canvas.text(boxX + 20, y + 6, on ? "true" : "false", 11, T.text);
    } else if (spec.kind === "enum" || spec.kind === "mesh") {
      canvas.text(boxX + 6, y + 6, truncate(canvas, String(value), boxW - 26, 11), 11, T.text);
      canvas.text(boxX + boxW - 12, y + 6, "▾", 10, T.faint);
    } else if (spec.kind === "color") {
      canvas.fillRect(boxX + 3, y + 5, 12, 12, String(value));
      canvas.strokeRect(boxX + 3, y + 5, 12, 12, T.border);
      canvas.text(
        boxX + 20,
        y + 6,
        truncate(canvas, String(value), boxW - 26, 11),
        11,
        T.text,
      );
    } else {
      const text = active ? this.editing?.text ?? "" : displayValue(value);
      canvas.text(boxX + 6, y + 6, truncate(canvas, text, boxW - 12, 11), 11, T.text);
      if (active) {
        const textWidth = Math.min(
          boxW - 12,
          canvas.measureText(text, 11),
        );
        canvas.fillRect(boxX + 6 + textWidth, y + 5, 1, 12, T.accent);
      }
    }

    this.fields.push({ rect: { x, y: y + 1, w: width, h: FIELD_ROW - 2 }, action: spec });
    return y + FIELD_ROW;
  }

  private drawPreview(canvas: GdiCanvas): void {
    const rect = this.previewRect;
    if (!rect) return;
    let sceneWidth = this.scene.resources.viewport.width;
    let sceneHeight = this.scene.resources.viewport.height;

    if ((this.mode === "play" || this.mode === "paused") && this.host) {
      const session = this.host.session;
      sceneWidth = session.camera.viewport.width;
      sceneHeight = session.camera.viewport.height;
      this.commands = session.drawList().commands;
    } else {
      const frame = buildFrame(this.scene, {
        camera2d: this.camera,
        viewport: this.scene.resources.viewport,
        cull2d: false,
        background: true,
        debugColliders: true,
      });
      this.commands = frame.commands;
    }

    renderCommandsGdi(canvas, this.commands, {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      sceneWidth,
      sceneHeight,
    });

    if (this.mode === "edit") {
      if (this.selected !== null) this.drawSelection(canvas, this.selected, true);
      else if (this.hover !== null) this.drawSelection(canvas, this.hover, false);
      canvas.text(rect.x + 10, rect.y + rect.h - 18, "right-drag pan · wheel zoom · click select", 11, T.faint);
    } else {
      const label = this.mode === "play" ? "PLAYING" : "PAUSED";
      const color = this.mode === "play" ? T.good : T.gold;
      canvas.fillRect(rect.x + 10, rect.y + 10, 76, 20, "#0b0f18");
      canvas.text(rect.x + 16, rect.y + 14, label, 11, color, "left", "top", true);
      canvas.text(rect.x + 94, rect.y + 15, "Esc stop · Space jump", 11, T.muted);
    }
  }

  private drawSelection(canvas: GdiCanvas, entity: Entity, strong: boolean): void {
    const rect = this.previewRect;
    if (!rect) return;
    const bounds = entitySceneBounds(this.commands, entity);
    const sceneWidth = this.mode === "edit"
      ? this.scene.resources.viewport.width
      : this.host?.session.camera.viewport.width ?? 960;
    const sceneHeight = this.mode === "edit"
      ? this.scene.resources.viewport.height
      : this.host?.session.camera.viewport.height ?? 540;
    const mapping = previewMapping({
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      sceneWidth,
      sceneHeight,
    });
    const color = strong ? T.accent : T.gold;
    if (bounds) {
      const x = mapping.originX + bounds.x * mapping.scale;
      const y = mapping.originY + bounds.y * mapping.scale;
      const w = Math.max(2, bounds.w * mapping.scale);
      const h = Math.max(2, bounds.h * mapping.scale);
      canvas.strokeRect(x - 2, y - 2, w + 4, h + 4, color, strong ? 2 : 1);
      if (strong) {
        const label = this.scene.labelOf(entity);
        const width = canvas.measureText(label, 10) + 10;
        canvas.fillRect(x - 2, y - 18, width, 15, color);
        canvas.text(x + 3, y - 16, label, 10, "#0b0e15");
      }
      return;
    }
    const transform = worldTransform(this.scene.world, entity);
    if (!transform) return;
    const viewport = this.scene.resources.viewport;
    const screen = {
      x: (transform.position.x - this.camera.position.x) * this.camera.zoom + viewport.width / 2,
      y: (transform.position.y - this.camera.position.y) * this.camera.zoom + viewport.height / 2,
    };
    const x = mapping.originX + screen.x * mapping.scale;
    const y = mapping.originY + screen.y * mapping.scale;
    canvas.line(x - 8, y, x + 8, y, color, 2);
    canvas.line(x, y - 8, x, y + 8, color, 2);
  }

  private drawStatus(canvas: GdiCanvas, width: number, height: number): void {
    const y = height - STATUS_HEIGHT;
    canvas.fillRect(0, y, width, STATUS_HEIGHT, T.panelDeep);
    canvas.fillRect(0, y, width, 1, T.border);
    const modeLabel = this.mode.toUpperCase();
    const modeColor = this.mode === "play" ? T.good : this.mode === "paused" ? T.gold : T.accent;
    canvas.fillRect(8, y + 6, 52, 13, "#161d2c");
    canvas.text(12, y + 7, modeLabel, 10, modeColor, "left", "top", true);
    const fresh = performance.now() < this.statusUntil;
    const message = fresh
      ? this.status
      : "Click an entity to select · drag to move · Save writes .emberscene";
    canvas.text(
      70,
      y + 7,
      truncate(canvas, message, width - 360, 11),
      11,
      fresh && this.statusKind === "error" ? "#ffb3c0" : T.muted,
    );
    const fps = this.mode === "play" || this.mode === "paused" ? this.host?.fps.fps ?? 0 : 0;
    const right = `${this.scene.world.entityCount} entities · ${
      this.savedScenes.has(this.sceneName) ? "saved" : "not saved"
    }${this.dirty ? " · modified" : ""}${fps > 0 ? ` · ${Math.round(fps)} fps` : ""}`;
    canvas.text(width - 10, y + 7, right, 11, T.faint, "right");
  }

  private drawMenus(canvas: GdiCanvas, width: number, height: number): void {
    if (this.sceneMenuOpen) {
      const scenes = this.game.sceneNames();
      const x = Math.min(width - 560, 390);
      const y = TOOLBAR_HEIGHT + 2;
      const rowHeight = 22;
      const menuHeight = (scenes.length + 1) * rowHeight + 8;
      canvas.fillRect(x, y, 220, menuHeight, T.header);
      canvas.strokeRect(x, y, 220, menuHeight, T.border);
      let rowY = y + 4;
      for (const name of scenes) {
        const rect = { x: x + 4, y: rowY, w: 212, h: rowHeight };
        if (name === this.sceneName) canvas.fillRect(rect.x, rect.y, rect.w, rect.h, T.rowSelected);
        canvas.text(rect.x + 8, rect.y + 5, name, 12, T.text);
        if (this.savedScenes.has(name)) canvas.fillRect(rect.x + rect.w - 12, rect.y + 8, 6, 6, T.good);
        this.menuHits.push({ rect, action: () => void this.switchScene(name) });
        rowY += rowHeight;
      }
      const rect = { x: x + 4, y: rowY, w: 212, h: rowHeight };
      canvas.text(rect.x + 8, rect.y + 5, "＋ New scene", 12, T.gold);
      this.menuHits.push({ rect, action: () => this.newScene() });
      canvas.text(x + 8, y + menuHeight - 16, "switching saves the current scene", 9, T.faint);
      void height;
    }

    if (this.componentMenuOpen && this.selected !== null) {
      const existing = new Set(this.scene.world.componentsOf(this.selected));
      const available = componentNames().filter((name) => !existing.has(name));
      const x = width - RIGHT_WIDTH + 12;
      const widthAvailable = RIGHT_WIDTH - 24;
      const rowHeight = 20;
      const menuHeight = Math.min(available.length * rowHeight + 8, height - TOOLBAR_HEIGHT - STATUS_HEIGHT - 20);
      const y = height - STATUS_HEIGHT - menuHeight - 8;
      canvas.fillRect(x, y, widthAvailable, menuHeight, T.header);
      canvas.strokeRect(x, y, widthAvailable, menuHeight, T.border);
      canvas.clip(x, y, widthAvailable, menuHeight);
      let rowY = y + 4;
      for (const name of available) {
        if (rowY > y + menuHeight - rowHeight) break;
        const rect = { x: x + 4, y: rowY, w: widthAvailable - 8, h: rowHeight };
        if (this.containsMouse(rect)) canvas.fillRect(rect.x, rect.y, rect.w, rect.h, T.rowHover);
        canvas.text(rect.x + 8, rect.y + 4, name, 11, T.text);
        this.menuHits.push({ rect, action: () => this.addComponent(name) });
        rowY += rowHeight;
      }
      canvas.restore();
    }
  }

  private containsMouse(rect: Rect): boolean {
    return contains(rect, this.mouse.x, this.mouse.y);
  }

  private button(
    canvas: GdiCanvas,
    label: string,
    x: number,
    y: number,
    width: number,
    height: number,
    options: {
      action: () => void;
      active?: boolean;
      accent?: boolean;
      danger?: boolean;
      disabled?: boolean;
      small?: boolean;
    },
  ): void {
    const hover = this.containsMouse({ x, y, w: width, h: height });
    let background = options.active ? T.rowSelected : "#192132";
    if (options.accent) background = T.accent;
    if (options.danger) background = hover ? "#5a1f27" : "#38151b";
    else if (options.active) background = T.rowSelected;
    else if (hover && !options.disabled) background = "#222c42";
    if (options.disabled) background = "#111622";
    canvas.fillRect(x, y, width, height, background);
    canvas.strokeRect(x, y, width, height, options.accent ? T.accent : T.border);
    const color = options.disabled
      ? T.faint
      : options.accent
      ? "#0b0e15"
      : options.danger
      ? "#ffb3c0"
      : T.text;
    canvas.text(
      x + width / 2,
      y + height / 2,
      label,
      options.small ? 10 : 12,
      color,
      "center",
      "middle",
      options.accent,
    );
    if (!options.disabled) {
      this.buttons.push({ rect: { x, y, w: width, h: height }, action: options.action });
    }
  }
}

function componentTags(scene: Scene, entity: Entity): string {
  const names = scene.world.componentsOf(entity);
  const tags: string[] = [];
  if (names.includes("Transform3D")) tags.push("3D");
  if (names.includes("MeshRenderer")) tags.push("M");
  if (names.includes("RectShape")) tags.push("R");
  if (names.includes("CircleShape")) tags.push("C");
  if (names.includes("TextLabel")) tags.push("T");
  if (names.includes("BoxCollider")) tags.push("B");
  if (names.includes("RigidBody")) tags.push("RB");
  if (names.includes("Tag")) tags.push("#");
  return tags.join(" ");
}

function genericFields(data: Record<string, unknown>): FieldDefinition[] {
  const definitions: FieldDefinition[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      definitions.push({ path: key });
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [child, childValue] of Object.entries(value as Record<string, unknown>)) {
      if (typeof childValue === "number" || typeof childValue === "string" || typeof childValue === "boolean") {
        definitions.push({ path: `${key}.${child}` });
      }
    }
  }
  return definitions;
}

function truncate(canvas: GdiCanvas, text: string, width: number, size: number): string {
  if (canvas.measureText(text, size) <= width) return text;
  let result = text;
  while (result.length > 1 && canvas.measureText(`${result}…`, size) > width) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function keyName(vk: number): string | null {
  switch (vk) {
    case 0x25:
      return "ArrowLeft";
    case 0x26:
      return "ArrowUp";
    case 0x27:
      return "ArrowRight";
    case 0x28:
      return "ArrowDown";
    case 0x20:
      return "Space";
    case 0x41:
      return "KeyA";
    case 0x44:
      return "KeyD";
    case 0x57:
      return "KeyW";
    case 0x53:
      return "KeyS";
    default:
      return null;
  }
}

/** Loads scenes and runs the editor until its window closes. */
export async function runNativeEditor(options: NativeEditorOptions): Promise<void> {
  await NativeEditor.launch(options);
}


