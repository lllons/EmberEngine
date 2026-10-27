/**
 * @ember/core/ecs — entity/component storage.
 *
 * Owner: this file owns entity identity and component storage for the whole engine.
 * Component data is plain JSON (see `components.ts`), which is what makes scene
 * save/load, undo and export mechanical rather than special-cased.
 */

export type Entity = number;

export interface ComponentType<T> {
  /** Stable identifier; also the key used in `.emberscene` files. */
  readonly name: string;
  /** Fresh component value, with `init` applied over the defaults. */
  create(init?: Partial<T>): T;
}

export function defineComponent<T extends object>(
  name: string,
  defaults: () => T,
): ComponentType<T> {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`component name must be alphanumeric, got "${name}"`);
  }
  const registered = registry.get(name);
  if (registered) {
    throw new Error(`component "${name}" is already defined`);
  }
  const type: ComponentType<T> = {
    name,
    create(init?: Partial<T>): T {
      const value = defaults();
      if (init) Object.assign(value, init);
      return value;
    },
  };
  registry.set(name, type as ComponentType<object>);
  return type;
}

/** Lookup by name; used by deserialization and the editor inspector. */
const registry = new Map<string, ComponentType<object>>();

export function componentByName(name: string): ComponentType<object> | undefined {
  return registry.get(name);
}

export function componentNames(): string[] {
  return [...registry.keys()].sort();
}

/** Deep copy of plain component data (arrays/objects/numbers/strings/booleans/null). */
export function cloneComponentData<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => cloneComponentData(item)) as unknown as T;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    copy[key] = cloneComponentData(item);
  }
  return copy as T;
}

export interface WorldStats {
  entities: number;
  components: number;
  componentTypes: number;
}

/**
 * Flat entity/component container. Component maps are created lazily per type and
 * pruned on despawn, so an empty world holds no per-type bookkeeping.
 */
export class World {
  private alive = new Set<Entity>();
  private stores = new Map<string, Map<Entity, object>>();
  private nextId: Entity = 1;

  get entityCount(): number {
    return this.alive.size;
  }

  /** Allocates a new entity id. Ids are never reused, so stale references stay invalid. */
  spawn(): Entity {
    const entity = this.nextId++;
    this.alive.add(entity);
    return entity;
  }

  /** Creates an entity with a specific id (scene loading, replay). Throws on collision. */
  adopt(id: Entity): Entity {
    if (!Number.isInteger(id) || id < 1) throw new Error(`invalid entity id ${id}`);
    if (this.alive.has(id)) throw new Error(`entity ${id} already exists`);
    this.alive.add(id);
    if (id >= this.nextId) this.nextId = id + 1;
    return id;
  }

  /** Reserves the next id without creating an entity (used by tests and prefabs). */
  reserveId(): Entity {
    return this.nextId++;
  }

  isAlive(entity: Entity): boolean {
    return this.alive.has(entity);
  }

  /** Removes the entity and all of its components. Returns false for unknown entities. */
  despawn(entity: Entity): boolean {
    if (!this.alive.delete(entity)) return false;
    for (const store of this.stores.values()) store.delete(entity);
    return true;
  }

  /** Adds a component from the type's defaults plus `init`. */
  add<T extends object>(entity: Entity, type: ComponentType<T>, init?: Partial<T>): T {
    this.assertAlive(entity);
    const value = type.create(init);
    this.store(type.name).set(entity, value);
    return value;
  }

  /** Adds a fully-formed component value (deserialization, cloning, tests). */
  attach<T extends object>(entity: Entity, type: ComponentType<T>, value: T): T {
    this.assertAlive(entity);
    this.store(type.name).set(entity, value);
    return value;
  }

  get<T extends object>(entity: Entity, type: ComponentType<T>): T | undefined {
    const value = this.stores.get(type.name)?.get(entity);
    return value as T | undefined;
  }

  /** Like `get`, but throws when the component is missing. */
  require<T extends object>(entity: Entity, type: ComponentType<T>): T {
    const value = this.get(entity, type);
    if (!value) {
      throw new Error(`entity ${entity} has no ${type.name} component`);
    }
    return value;
  }

  has(entity: Entity, type: ComponentType<object>): boolean {
    return this.stores.get(type.name)?.has(entity) ?? false;
  }

  hasAll(entity: Entity, types: readonly ComponentType<object>[]): boolean {
    return types.every((type) => this.has(entity, type));
  }

  /** Shallow-merges `patch` into the component's data. */
  set<T extends object>(
    entity: Entity,
    type: ComponentType<T>,
    patch: Partial<T>,
  ): T {
    const value = this.require(entity, type);
    Object.assign(value, patch);
    return value;
  }

  /** Replaces the component's value wholesale, creating it when absent. */
  replace<T extends object>(entity: Entity, type: ComponentType<T>, value: T): T {
    this.assertAlive(entity);
    this.store(type.name).set(entity, value);
    return value;
  }

  remove<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
    return this.stores.get(type.name)?.delete(entity) ?? false;
  }

  /** Entities that have every listed component, ascending by id. */
  query(...types: readonly ComponentType<object>[]): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.entities()) {
      if (this.hasAll(entity, types)) result.push(entity);
    }
    return result;
  }

  /** All live entities, ascending by id. */
  entities(): Entity[] {
    return [...this.alive].sort((a, b) => a - b);
  }

  /** Component type names present on an entity, alphabetical. */
  componentsOf(entity: Entity): string[] {
    const names: string[] = [];
    for (const [name, store] of this.stores) {
      if (store.has(entity)) names.push(name);
    }
    return names.sort();
  }

  /** Live entities that carry any component, paired with their names, ascending by id. */
  entityEntries(): Array<{ id: Entity; components: string[] }> {
    return this.entities().map((id) => ({ id, components: this.componentsOf(id) }));
  }

  stats(): WorldStats {
    let components = 0;
    for (const store of this.stores.values()) components += store.size;
    return { entities: this.alive.size, components, componentTypes: this.stores.size };
  }

  /** Fast path for systems: iterate the entities in `query` order. */
  each(
    types: readonly ComponentType<object>[],
    visit: (entity: Entity, index: number) => void,
  ): void {
    const entities = this.query(...types);
    for (let i = 0; i < entities.length; i++) visit(entities[i], i);
    return;
  }

  clear(): void {
    this.alive.clear();
    this.stores.clear();
    this.nextId = 1;
  }

  /** Deep-copies the whole world, preserving ids. */
  clone(): World {
    const copy = new World();
    copy.nextId = this.nextId;
    for (const entity of this.alive) copy.alive.add(entity);
    for (const [name, store] of this.stores) {
      const cloned = new Map<Entity, object>();
      for (const [entity, value] of store) cloned.set(entity, cloneComponentData(value));
      copy.stores.set(name, cloned);
    }
    return copy;
  }

  private store(name: string): Map<Entity, object> {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    return store;
  }

  private assertAlive(entity: Entity): void {
    if (!this.alive.has(entity)) {
      throw new Error(`entity ${entity} is not alive`);
    }
  }
}
