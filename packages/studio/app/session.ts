/**
 * @ember/studio/app/session.ts — the editor's document model.
 *
 * Owner: this file owns "what is being edited": the current scene, the selection, undo/redo,
 * dirty tracking and the play session. Panels call methods here and re-render; nothing else
 * mutates the scene, which is what keeps undo reliable.
 */

import {
  BoxCollider,
  type ComponentType,
  type Entity,
  Name,
  Parent,
  RectShape,
  RigidBody,
  type Scene,
  Script,
  type SerializedScene,
  TextLabel,
  Transform,
  Velocity,
  cloneComponentData,
  componentByName,
  componentNames,
  deserializeScene,
  serializeScene,
} from "@ember/core";
import type { Game } from "@ember/runtime";
import type { TextureResolver } from "@ember/render2d";
import { type MountedGame, mountGame } from "@ember/player/app/host";

export type EditorMode = "edit" | "play";

export interface SessionEvents {
  onChange(reason: string): void;
  onStatus(message: string, kind?: "info" | "warn" | "error"): void;
}

export interface EditorSessionOptions {
  game: Game;
  scene: Scene;
  sceneName: string;
  mount: HTMLElement;
  resolveTexture?: TextureResolver;
  events: SessionEvents;
}

export class EditorSession {
  game: Game;
  scene: Scene;
  sceneName: string;
  selection: Entity | null = null;
  mode: EditorMode = "edit";
  dirty = false;
  mounted: MountedGame | null = null;
  /** Camera used while editing (play mode has its own, owned by the runtime). */
  editCamera: { position: { x: number; y: number }; zoom: number };

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private mount: HTMLElement;
  private events: SessionEvents;
  private resolveTexture?: TextureResolver;

  constructor(options: EditorSessionOptions) {
    this.game = options.game;
    this.scene = options.scene;
    this.sceneName = options.sceneName;
    this.mount = options.mount;
    this.events = options.events;
    this.resolveTexture = options.resolveTexture;
    this.editCamera = {
      position: { ...options.scene.resources.camera.position },
      zoom: options.scene.resources.camera.zoom,
    };
  }

  // -------------------------------------------------------------------------
  // Document
  // -------------------------------------------------------------------------

  /** Replaces the edited scene (scene switch, reload, template). */
  setScene(scene: Scene, sceneName: string, options: { keepHistory?: boolean } = {}): void {
    this.stopPlay();
    this.scene = scene;
    this.sceneName = sceneName;
    this.selection = scene.world.entities()[0] ?? null;
    this.dirty = false;
    this.editCamera = {
      position: { ...scene.resources.camera.position },
      zoom: scene.resources.camera.zoom,
    };
    if (!options.keepHistory) {
      this.undoStack = [];
      this.redoStack = [];
    }
    this.events.onChange("scene");
  }

  toSerialized(): SerializedScene {
    return serializeScene(this.scene);
  }

  /** Undo entry point: snapshots the scene before a change so undo is exact. */
  commit(label: string): void {
    this.undoStack.push(JSON.stringify(this.toSerialized()));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.dirty = true;
    this.events.onChange(label);
  }

  /** Applies a mutation and records it for undo. */
  mutate(label: string, apply: (scene: Scene) => void): void {
    const before = JSON.stringify(this.toSerialized());
    apply(this.scene);
    if (JSON.stringify(this.toSerialized()) === before) return;
    this.undoStack.push(before);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.dirty = true;
    this.events.onChange(label);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (previous === undefined) return false;
    this.redoStack.push(JSON.stringify(this.toSerialized()));
    this.restore(previous);
    this.events.onChange("undo");
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (next === undefined) return false;
    this.undoStack.push(JSON.stringify(this.toSerialized()));
    this.restore(next);
    this.events.onChange("redo");
    return true;
  }

  private restore(snapshot: string): void {
    const restored = deserializeScene(JSON.parse(snapshot));
    restored.name = this.sceneName;
    this.scene = restored;
    if (this.selection !== null && !this.scene.world.isAlive(this.selection)) this.selection = null;
    this.dirty = true;
  }

  markSaved(): void {
    this.dirty = false;
    this.events.onChange("saved");
  }

  // -------------------------------------------------------------------------
  // Entity operations
  // -------------------------------------------------------------------------

  select(entity: Entity | null): void {
    this.selection = entity;
    this.events.onChange("selection");
  }

  get selectedName(): string {
    return this.selection === null ? "" : this.scene.labelOf(this.selection);
  }

  /** Creates an entity from a named template and selects it. */
  createEntity(template: string): Entity {
    let created = 0;
    this.mutate(`add ${template}`, (scene) => {
      const entity = scene.world.spawn();
      const mid = {
        x: Math.round(this.editCamera.position.x),
        y: Math.round(this.editCamera.position.y),
      };
      scene.world.add(entity, Transform, { position: { ...mid }, rotation: 0, scale: { x: 1, y: 1 } });
      scene.world.add(entity, Name, { value: template });
      created = entity;
      switch (template) {
        case "sprite":
          scene.world.add(entity, SpriteComponent(), { texture: "player", width: 32, height: 32 });
          break;
        case "box":
          scene.world.add(entity, RectShape, { width: 64, height: 64, color: "#7fb2ff" });
          break;
        case "label":
          scene.world.add(entity, TextLabel, { text: "text", size: 20, align: "center" });
          break;
        case "player":
          scene.world.add(entity, SpriteComponent(), { texture: "player", width: 28, height: 36, layer: 20 });
          scene.world.add(entity, RigidBody, { type: "dynamic" });
          scene.world.add(entity, Velocity, { x: 0, y: 0 });
          scene.world.add(entity, BoxCollider, { width: 26, height: 34 });
          scene.world.add(entity, Script, { name: "runner.player", props: { speed: 260, jump: 780 } });
          scene.world.add(entity, TagComponent(), { value: "player" });
          break;
        case "ground":
          scene.world.add(entity, RectShape, { width: 240, height: 32, color: "#1b2030" });
          scene.world.add(entity, RigidBody, { type: "static", gravityScale: 0 });
          scene.world.add(entity, BoxCollider, { width: 240, height: 32 });
          break;
        case "ember":
          scene.world.add(entity, SpriteComponent(), { texture: "coin", width: 18, height: 18, frameCount: 4 });
          scene.world.add(entity, BoxCollider, { width: 18, height: 18, trigger: true });
          scene.world.add(entity, Script, { name: "runner.pickup", props: { points: 25 } });
          scene.world.add(entity, TagComponent(), { value: "coin" });
          break;
        case "hazard":
          scene.world.add(entity, SpriteComponent(), { texture: "hazard", width: 26, height: 26 });
          scene.world.add(entity, RigidBody, { type: "kinematic", gravityScale: 0 });
          scene.world.add(entity, Velocity, { x: 0, y: 0 });
          scene.world.add(entity, BoxCollider, { width: 24, height: 24, trigger: true });
          scene.world.add(entity, Script, { name: "runner.hazard", props: { patrol: 80, speed: 80 } });
          scene.world.add(entity, TagComponent(), { value: "hazard" });
          break;
        case "gate":
          scene.world.add(entity, SpriteComponent(), { texture: "goal", width: 48, height: 96 });
          scene.world.add(entity, BoxCollider, { width: 48, height: 96, trigger: true });
          scene.world.add(entity, Script, { name: "runner.goal", props: { bonus: 150 } });
          scene.world.add(entity, TagComponent(), { value: "goal" });
          break;
        case "empty":
        default:
          break;
      }
    });
    if (created !== 0) this.selection = created;
    return created;
  }

  deleteSelected(): boolean {
    const entity = this.selection;
    if (entity === null) return false;
    this.mutate("delete", (scene) => {
      // Children whose Parent points at the deleted entity are re-parented to nothing.
      for (const candidate of scene.world.query(Parent)) {
        const parent = scene.world.require(candidate, Parent);
        if (parent.entity === entity) scene.world.remove(candidate, Parent);
      }
      scene.world.despawn(entity);
    });
    this.selection = null;
    return true;
  }

  duplicateSelected(): Entity | null {
    const entity = this.selection;
    if (entity === null) return null;
    const copy = this.scene.duplicateEntity(entity);
    if (copy === null) return null;
    this.commit("duplicate");
    this.selection = copy;
    return copy;
  }

  renameSelected(name: string): void {
    const entity = this.selection;
    if (entity === null) return;
    this.mutate("rename", (scene) => {
      if (scene.world.has(entity, Name)) scene.world.set(entity, Name, { value: name });
      else scene.world.add(entity, Name, { value: name });
    });
  }

  // -------------------------------------------------------------------------
  // Component editing
  // -------------------------------------------------------------------------

  /** Components on the selected entity, in the registry's canonical order. */
  selectedComponents(): Array<{ name: string; type: ComponentType<object>; value: object }> {
    const entity = this.selection;
    if (entity === null) return [];
    const names = this.scene.world.componentsOf(entity);
    const entries: Array<{ name: string; type: ComponentType<object>; value: object }> = [];
    for (const name of names) {
      const type = componentByName(name);
      if (!type) continue;
      const value = this.scene.world.get(entity, type);
      if (value) entries.push({ name, type, value });
    }
    // Transform first, then alphabetical: the inspector reads like the engine's own docs.
    return entries.sort((a, b) =>
      a.name === "Transform" ? -1 : b.name === "Transform" ? 1 : a.name.localeCompare(b.name)
    );
  }

  /** Adds a component of the given registered type to the selection. */
  addComponent(name: string): void {
    const entity = this.selection;
    const type = componentByName(name);
    if (entity === null || !type) return;
    if (this.scene.world.has(entity, type)) return;
    this.mutate(`add ${name}`, (scene) => {
      scene.world.add(entity, type, {} as Partial<object>);
    });
  }

  removeComponent(name: string): void {
    const entity = this.selection;
    const type = componentByName(name);
    if (entity === null || !type) return;
    this.mutate(`remove ${name}`, (scene) => {
      scene.world.remove(entity, type);
    });
  }

  /** Merges a patch into one component field, e.g. `Transform.position.x`. */
  setField(componentName: string, path: string, value: unknown): void {
    const entity = this.selection;
    const type = componentByName(componentName);
    if (entity === null || !type) return;
    this.mutate(`edit ${componentName}.${path}`, (scene) => {
      const component = scene.world.get(entity, type) as Record<string, unknown> | undefined;
      if (!component) return;
      assignPath(component, path.split("."), value);
    });
  }

  replaceComponent(name: string, value: object): void {
    const entity = this.selection;
    const type = componentByName(name);
    if (entity === null || !type) return;
    this.mutate(`set ${name}`, (scene) => {
      const existing = scene.world.get(entity, type);
      if (existing) scene.world.replace(entity, type, cloneComponentData(value) as object);
      else scene.world.attach(entity, type, cloneComponentData(value) as object);
    });
  }

  sceneComponents(): string[] {
    return componentNames();
  }

  // -------------------------------------------------------------------------
  // Play mode
  // -------------------------------------------------------------------------

  play(): boolean {
    if (this.mode === "play") return false;
    // Play what is on screen, not the copy that was on disk when the editor opened: new
    // scenes and unsaved edits are otherwise not in the game's registry yet.
    this.game.registerScene(this.sceneName, () => this.scene.clone());
    this.mounted = mountGame({
      mount: this.mount,
      game: this.game,
      sceneName: this.sceneName,
      resolveTexture: this.resolveTexture,
      autoplay: true,
      onStats: (stats) => {
        this.events.onStatus(
          `play · ${stats.fps.toFixed(0)} fps · ${stats.entityCount} entities · ${stats.drawCommands} draws`,
        );
      },
    });
    this.mode = "play";
    this.events.onChange("play");
    return true;
  }

  stopPlay(): boolean {
    if (this.mode !== "play") return false;
    this.mounted?.stop();
    this.mounted = null;
    this.mode = "edit";
    this.events.onChange("stop");
    return true;
  }

  togglePlay(): void {
    if (this.mode === "play") this.stopPlay();
    else this.play();
  }

  /** Single-steps the running play session (edit mode first starts it). */
  stepPlay(steps = 1): void {
    if (this.mode !== "play") this.play();
    this.mounted?.step(steps);
  }

  dispose(): void {
    this.stopPlay();
  }
}

/** Path assignment used by the inspector (`position.x`). */
export function assignPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  let cursor = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = cursor[key];
    if (!next || typeof next !== "object") cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

/** Component type lookups used by templates (kept local to avoid import cycles). */
function SpriteComponent(): ComponentType<object> {
  return componentByName("Sprite") as ComponentType<object>;
}

function TagComponent(): ComponentType<object> {
  return componentByName("Tag") as ComponentType<object>;
}
