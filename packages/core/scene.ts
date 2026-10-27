/**
 * @ember/core/scene — the scene model: a world plus per-scene resources.
 *
 * Owner: this file owns what a scene *is*. The file format lives in
 * `serialization.ts`; simulation lives in `@ember/runtime`.
 */

import { type Color, Colors } from "./color.ts";
import { componentByName, type Entity, World } from "./ecs.ts";
import { Name, Transform } from "./components.ts";
import { type Rect, type Size, type Vec2, vec2 } from "./math.ts";
import { type Vec3, vec3 } from "./math3d.ts";

export interface Camera2DState {
  /** World-space point the camera looks at. */
  position: Vec2;
  zoom: number;
  /** Follow smoothing in seconds; 0 snaps instantly. */
  smoothing: number;
  /** When set, the camera centre is clamped so the view stays inside. */
  bounds: Rect | null;
  /** Entity the camera follows, or null for a free camera. */
  follow: Entity | null;
}

export interface SceneResources {
  gravity: Vec2;
  background: Color;
  viewport: Size;
  camera: Camera2DState;
  camera3d: Camera3DState;
}

export interface Camera3DState {
  /** World-space eye position. */
  position: Vec3;
  /** World-space point the camera looks at. */
  target: Vec3;
  /** Up vector; (0, 1, 0) for a level camera. */
  up: Vec3;
  /** Vertical field of view in radians. */
  fov: number;
  /** Near clip distance; triangles crossing it are dropped rather than clipped. */
  near: number;
  far: number;
}

export interface SceneInit {
  name?: string;
  gravity?: Vec2;
  background?: Color;
  viewport?: Size;
  camera?: Partial<Camera2DState>;
  camera3d?: Partial<Camera3DState>;
  metadata?: Record<string, unknown>;
}

export const DEFAULT_VIEWPORT: Size = { width: 960, height: 540 };

export function defaultResources(init: SceneInit = {}): SceneResources {
  const viewport = init.viewport ?? { ...DEFAULT_VIEWPORT };
  return {
    gravity: { ...(init.gravity ?? vec2(0, 1400)) },
    background: init.background ?? Colors.ink,
    viewport: { ...viewport },
    camera: {
      position: { ...(init.camera?.position ?? vec2(viewport.width / 2, viewport.height / 2)) },
      zoom: init.camera?.zoom ?? 1,
      smoothing: init.camera?.smoothing ?? 0.12,
      bounds: init.camera?.bounds ? { ...init.camera.bounds } : null,
      follow: init.camera?.follow ?? null,
    },
    camera3d: {
      position: { ...(init.camera3d?.position ?? vec3(0, 140, 620)) },
      target: { ...(init.camera3d?.target ?? vec3(0, 0, 0)) },
      up: { ...(init.camera3d?.up ?? vec3(0, 1, 0)) },
      fov: init.camera3d?.fov ?? Math.PI / 3,
      near: init.camera3d?.near ?? 0.5,
      far: init.camera3d?.far ?? 8000,
    },
  };
}

export class Scene {
  name: string;
  world: World;
  resources: SceneResources;
  metadata: Record<string, unknown>;

  constructor(init: SceneInit = {}, world: World = new World()) {
    this.name = init.name ?? "untitled";
    this.world = world;
    this.resources = defaultResources(init);
    this.metadata = { ...(init.metadata ?? {}) };
  }

  static create(init: SceneInit = {}): Scene {
    return new Scene(init);
  }

  get entityCount(): number {
    return this.world.entityCount;
  }

  /** Creates an entity with a Transform, and a Name when one is given. */
  createEntity(init: {
    name?: string;
    position?: Vec2;
    rotation?: number;
    scale?: Vec2;
  } = {}): Entity {
    const entity = this.world.spawn();
    this.world.add(entity, Transform, {
      position: { ...(init.position ?? vec2(0, 0)) },
      rotation: init.rotation ?? 0,
      scale: { ...(init.scale ?? vec2(1, 1)) },
    });
    if (init.name !== undefined) this.world.add(entity, Name, { value: init.name });
    return entity;
  }

  /** Copies an entity (and its components) into this scene. */
  duplicateEntity(entity: Entity): Entity | null {
    if (!this.world.isAlive(entity)) return null;
    const copy = this.world.spawn();
    for (const name of this.world.componentsOf(entity)) {
      const type = componentByName(name);
      if (!type) continue;
      const value = this.world.get(entity, type);
      if (value) this.world.attach(copy, type, structuredClone(value));
    }
    return copy;
  }

  /** Entity carrying the given display name, or undefined. */
  findByName(name: string): Entity | undefined {
    for (const entity of this.world.query(Name)) {
      if (this.world.require(entity, Name).value === name) return entity;
    }
    return undefined;
  }

  /** Name component when present, otherwise a stable `entity-<id>` label. */
  labelOf(entity: Entity): string {
    const name = this.world.get(entity, Name)?.value;
    if (name && name.length > 0) return name;
    return `entity-${entity}`;
  }

  /** World-space box of an entity's transform, given its local size. */
  worldPosition(entity: Entity): Vec2 | undefined {
    const transform = this.world.get(entity, Transform);
    if (!transform) return undefined;
    return { x: transform.position.x, y: transform.position.y };
  }

  clone(): Scene {
    const copy = new Scene({
      name: this.name,
      gravity: this.resources.gravity,
      background: this.resources.background,
      viewport: this.resources.viewport,
      camera: this.resources.camera,
      camera3d: this.resources.camera3d,
      metadata: this.metadata,
    }, this.world.clone());
    return copy;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      entities: this.entityCount,
      resources: this.resources,
    };
  }
}
