/**
 * @ember/runtime/session — the running-scene container ("the engine loop's brain").
 *
 * Owner: this file owns the step sequence, the system contract and the runtime API that
 * scripts/systems use. It deliberately knows nothing about concrete systems (see
 * `systems.ts`) so there is no import cycle: the `Game` wires both together.
 *
 * One step is: apply input -> run systems in (order, name) order -> deliver queued events.
 */

import {
  type Camera2DState,
  clampDelta,
  createRng,
  Diagnostics,
  type Entity,
  EventBus,
  type EventMap,
  EventQueue,
  type InputSnapshot,
  InputState,
  Parent,
  type Rect,
  type Rng,
  type Scene,
  type Size,
  Tag,
  type Vec2,
  vec2,
} from "@ember/core";
import { type BuildOptions, Camera2DController, type DrawList } from "@ember/render2d";
import { buildFrame } from "@ember/render3d";

/** One resolved contact from the last collision pass. */
export interface CollisionRecord {
  a: Entity;
  b: Entity;
  /** Overlap rectangle in world space. */
  overlap: Rect;
  /** Push direction that separates `a` from `b` (unit vector, world space). */
  normal: Vec2;
  /** True when either collider is a trigger: reported, never resolved. */
  trigger: boolean;
}

/** Game-facing helpers handed to systems and scripts. */
export interface RuntimeApi {
  spawn(init?: {
    name?: string;
    position?: Vec2;
    rotation?: number;
    scale?: Vec2;
  }): Entity;
  despawn(entity: Entity): boolean;
  /** Despawns every entity whose `Parent` chain reaches `entity`. Returns the count. */
  despawnDescendants(entity: Entity): number;
  label(entity: Entity): string;
  findByName(name: string): Entity | undefined;
  entitiesWithTag(tag: string): Entity[];
  /** Reads or writes the session blackboard (score, flags, wave number…). */
  state<T = unknown>(key: string, value?: T): T | undefined;
  collisions(): readonly CollisionRecord[];
  /** Entities currently alive. */
  entities(): Entity[];
}

export interface SystemContext {
  scene: Scene;
  input: InputState;
  /** Contacts recorded so far in this step; collision-capable systems push here. */
  collisions: CollisionRecord[];
  diagnostics: Diagnostics;
  rng: Rng;
  events: EventBus<EventMap>;
  queue: EventQueue<EventMap>;
  camera: Camera2DController;
  api: RuntimeApi;
  /** Host-provided services (game systems, audio, asset registry…). */
  services: Record<string, unknown>;
  /** Seconds in this step. */
  dt: number;
  /** Simulated seconds since the session started. */
  time: number;
  /** Steps simulated so far (1-based inside a running step). */
  frame: number;
}

export interface System {
  readonly name: string;
  readonly order: number;
  update(ctx: SystemContext): void;
}

export function defineSystem(
  name: string,
  update: (ctx: SystemContext) => void,
  order = 0,
): System {
  if (!name) throw new Error("system name must not be empty");
  return { name, order, update };
}

/**
 * Named phases so games never guess at ordering. Lower runs earlier; ties break on name,
 * which keeps system order deterministic across runs and hosts.
 */
export const SystemOrder = {
  input: 50,
  animation: 100,
  script: 150,
  gravity: 200,
  velocity: 250,
  collision: 300,
  postCollision: 350,
  camera: 400,
  gameplay: 500,
  lifetime: 900,
  debug: 950,
} as const;

export interface StepResult {
  /** Steps actually simulated by this call. */
  steps: number;
  frame: number;
  time: number;
  entityCount: number;
  /** Contacts reported by collision-capable systems during the step. */
  collisions: number;
  /** Events delivered from the queue during the step. */
  events: number;
}

export interface RuntimeSessionOptions {
  scene: Scene;
  systems?: readonly System[];
  input?: InputState | InputSnapshot;
  seed?: number | string;
  diagnostics?: Diagnostics;
  services?: Record<string, unknown>;
  /** Fixed step length; systems always advance by exactly this. */
  fixedDt?: number;
  rng?: Rng;
}

/** Sorts systems by order then name — the one place run order is decided. */
export function sortSystems(systems: readonly System[]): System[] {
  return [...systems].sort((
    a,
    b,
  ) => (a.order === b.order ? a.name.localeCompare(b.name) : a.order - b.order));
}

export class RuntimeSession {
  scene: Scene;
  readonly input: InputState;
  readonly diagnostics: Diagnostics;
  readonly rng: Rng;
  readonly events: EventBus<EventMap>;
  readonly queue: EventQueue<EventMap>;
  readonly camera: Camera2DController;
  readonly services: Record<string, unknown>;
  readonly fixedDt: number;
  readonly api: RuntimeApi;

  systems: System[];
  frame = 0;
  time = 0;
  /** Contacts recorded by the most recent step; replaced (not appended) each step. */
  collisions: CollisionRecord[] = [];
  /** Entity the camera last framed, for editor follow indicators. */
  running = false;

  constructor(options: RuntimeSessionOptions) {
    this.scene = options.scene;
    this.input = options.input instanceof InputState ? options.input : InputState.fromSnapshot(
      options.input ??
        {
          held: [],
          pressed: [],
          released: [],
          mouse: vec2(0, 0),
          mouseHeld: [],
          mousePressed: [],
          mouseReleased: [],
        },
    );
    this.diagnostics = options.diagnostics ?? new Diagnostics({ minLevel: "info" });
    this.rng = options.rng ?? createRng(options.seed ?? 1);
    this.events = new EventBus<EventMap>();
    this.queue = new EventQueue<EventMap>();
    this.fixedDt = options.fixedDt ?? 1 / 60;
    this.camera = new Camera2DController(
      cloneCamera(this.scene.resources.camera),
      this.scene.resources.viewport,
    );
    this.services = { ...(options.services ?? {}) };
    this.systems = sortSystems(options.systems ?? []);
    this.api = createRuntimeApi(this);
  }

  /** Swaps in another scene, re-framing the camera on its configured state. */
  setScene(scene: Scene): void {
    this.scene = scene;
    this.camera.state = cloneCamera(scene.resources.camera);
    this.camera.setViewport(scene.resources.viewport);
    this.collisions = [];
  }

  get viewport(): Size {
    return this.camera.viewport;
  }

  get entityCount(): number {
    return this.scene.world.entityCount;
  }

  addSystem(system: System): void {
    if (this.systems.some((existing) => existing.name === system.name)) {
      throw new Error(`system "${system.name}" is already registered`);
    }
    this.systems.push(system);
    this.systems = sortSystems(this.systems);
  }

  /** Adds or replaces a service other systems/scripts read via `ctx.services`. */
  provide(name: string, value: unknown): void {
    this.services[name] = value;
  }

  service<T>(name: string): T | undefined {
    return this.services[name] as T | undefined;
  }

  /**
   * Advances the simulation by exactly `dt` (clamped for sanity). Pass an input snapshot
   * for the frame's key edges; omit it on extra fixed steps inside the same host frame.
   */
  step(dt: number, snapshot?: InputSnapshot): StepResult {
    const stepDt = clampDelta(dt, this.fixedDt * 4);
    if (snapshot) this.input.apply(snapshot);

    this.frame += 1;
    this.time += stepDt;
    this.collisions = [];

    const ctx: SystemContext = {
      scene: this.scene,
      input: this.input,
      collisions: this.collisions,
      diagnostics: this.diagnostics,
      rng: this.rng,
      events: this.events,
      queue: this.queue,
      camera: this.camera,
      api: this.api,
      services: this.services,
      dt: stepDt,
      time: this.time,
      frame: this.frame,
    };

    for (const system of this.systems) {
      try {
        system.update(ctx);
      } catch (error) {
        this.diagnostics.error(`system "${system.name}" threw`, {
          message: (error as Error).message,
        });
        throw error;
      }
    }

    this.input.endFrame();
    const events = this.queue.drain(this.events);
    this.diagnostics.increment("frame");

    return {
      steps: 1,
      frame: this.frame,
      time: this.time,
      entityCount: this.scene.world.entityCount,
      collisions: this.collisions.length,
      events,
    };
  }

  /** Deterministic helper for tests and cutscenes: run N fixed steps. */
  run(steps: number, dt = this.fixedDt, snapshots: readonly InputSnapshot[] = []): StepResult {
    let last: StepResult | null = null;
    for (let i = 0; i < steps; i++) last = this.step(dt, snapshots[i]);
    return last ?? {
      steps: 0,
      frame: this.frame,
      time: this.time,
      entityCount: this.scene.world.entityCount,
      collisions: 0,
      events: 0,
    };
  }

  /**
   * Draw commands for the current scene, honouring the live 2D camera. Runs both the 2D
   * and 3D pipelines through `buildFrame`, so play mode renders meshes as well as sprites;
   * `stats.drawn` is the total across both.
   */
  drawList(options: Omit<BuildOptions, "camera" | "viewport"> = {}): DrawList {
    const frame = buildFrame(this.scene, {
      cull2d: options.cull,
      background: options.background,
      debugColliders: options.debugColliders,
      camera2d: this.camera.state,
      viewport: this.camera.viewport,
    });
    return {
      commands: frame.commands,
      stats: {
        ...frame.stats.twoD,
        drawn: frame.stats.twoD.drawn + frame.stats.threeD.drawn,
      },
      camera: frame.camera2d,
      viewport: frame.viewport,
    };
  }

  /** Emits an event on the shared bus immediately (systems usually queue instead). */
  emit(type: string, payload: unknown): number {
    return this.events.emit(type, payload);
  }

  reset(): void {
    this.frame = 0;
    this.time = 0;
    this.collisions = [];
    this.input.clear();
  }
}

function cloneCamera(camera: Camera2DState): Camera2DState {
  return {
    position: vec2(camera.position.x, camera.position.y),
    zoom: camera.zoom,
    smoothing: camera.smoothing,
    bounds: camera.bounds ? { ...camera.bounds } : null,
    follow: camera.follow,
  };
}

/** Builds the `RuntimeApi`, kept here so `api` and `session` never drift apart. */
export function createRuntimeApi(session: RuntimeSession): RuntimeApi {
  const state = new Map<string, unknown>();

  return {
    spawn(init) {
      return session.scene.createEntity(init);
    },
    despawn(entity) {
      if (!session.scene.world.isAlive(entity)) return false;
      session.queue.push("despawned", { entity });
      return session.scene.world.despawn(entity);
    },
    despawnDescendants(entity) {
      const world = session.scene.world;
      const doomed: Entity[] = [];
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidate of world.entities()) {
          if (doomed.includes(candidate)) continue;
          const parent = world.get(candidate, Parent);
          if (parent && (parent.entity === entity || doomed.includes(parent.entity))) {
            doomed.push(candidate);
            changed = true;
          }
        }
      }
      for (const child of doomed) session.api.despawn(child);
      return doomed.length;
    },
    label(entity) {
      return session.scene.labelOf(entity);
    },
    findByName(name) {
      return session.scene.findByName(name);
    },
    entitiesWithTag(tag) {
      return session.scene.world.entities().filter((entity) => {
        const value = session.scene.world.get(entity, Tag);
        return value?.value === tag;
      });
    },
    state<T>(key: string, value?: T): T | undefined {
      if (value !== undefined) {
        state.set(key, value);
        return value;
      }
      return state.get(key) as T | undefined;
    },
    collisions() {
      return session.collisions;
    },
    entities() {
      return session.scene.world.entities();
    },
  };
}
