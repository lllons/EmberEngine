/**
 * @ember/runtime/scripting — the behaviour registry.
 *
 * Owner: this file owns "how game logic attaches to entities". A `Script` component stores
 * a script *name* plus JSON props; this registry maps that name to behaviour objects, which
 * is what makes scripted scenes save, load and export cleanly (no functions on entities).
 *
 * Behaviours receive the full step context (input, RNG, services, spawn API) plus their own
 * entity and props, so gameplay code never needs a global singleton.
 */

import {
  BoxCollider,
  CircleShape,
  clamp,
  colliderWorldRect,
  Colors,
  type Entity,
  Lifetime,
  MeshRenderer,
  Name,
  Parent,
  rect,
  RectShape,
  RigidBody,
  Sprite,
  Tag,
  TextLabel,
  Transform,
  Transform3D,
  vec2,
  vec3,
  Velocity,
  Visibility,
  worldTransform,
  worldTransform3D,
} from "@ember/core";
import type { SystemContext } from "./session.ts";

export interface ScriptContext extends SystemContext {
  /** The entity carrying the script. */
  entity: Entity;
  /** Props from the `Script` component (plain JSON, part of the scene). */
  props: Record<string, unknown>;
}

export interface ScriptBehaviour {
  /** Called once, before the first `update`. */
  start?(ctx: ScriptContext): void;
  /** Called every fixed step; `ctx.dt` is the step length. */
  update?(ctx: ScriptContext): void;
  /** Called when the entity is despawned or its script changes. */
  destroy?(ctx: ScriptContext): void;
}

export type ScriptFactory = (props: Record<string, unknown>, entity: Entity) => ScriptBehaviour;

export class ScriptRegistry {
  private factories = new Map<string, ScriptFactory>();

  define(name: string, factory: ScriptFactory): this {
    if (!name) throw new Error("script name must not be empty");
    if (this.factories.has(name)) throw new Error(`script "${name}" is already defined`);
    this.factories.set(name, factory);
    return this;
  }

  /** Defines the script, or replaces it when the name exists (hot reload, editor remap). */
  override(name: string, factory: ScriptFactory): this {
    this.factories.set(name, factory);
    return this;
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }

  factory(name: string): ScriptFactory | undefined {
    return this.factories.get(name);
  }

  names(): string[] {
    return [...this.factories.keys()].sort();
  }

  get size(): number {
    return this.factories.size;
  }

  create(name: string, props: Record<string, unknown>, entity: Entity): ScriptBehaviour {
    const factory = this.factories.get(name);
    if (!factory) throw new Error(`unknown script "${name}"`);
    return factory(props, entity) ?? {};
  }

  /** Merges another registry, incoming definitions winning on conflicts. */
  merge(other: ScriptRegistry): this {
    for (const name of other.names()) {
      this.factories.set(name, other.factory(name)!);
    }
    return this;
  }
}

/** Registry game code populates at import time; games may also use private instances. */
export const defaultScripts = new ScriptRegistry();

export function defineScript(
  name: string,
  factory: ScriptFactory,
  registry: ScriptRegistry = defaultScripts,
): void {
  registry.override(name, factory);
}

/** Convenience for object-literal behaviours: `script({ update(ctx) { … } })`. */
export function script(behaviour: ScriptBehaviour): ScriptBehaviour {
  return behaviour;
}

/** Reads a script prop with a fallback and a type check (props come from JSON files). */
export function prop<T>(props: Record<string, unknown>, key: string, fallback: T): T {
  const value = props[key];
  return (typeof value === typeof fallback && value !== null ? value : fallback) as T;
}

export function numberProp(props: Record<string, unknown>, key: string, fallback: number): number {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function stringProp(props: Record<string, unknown>, key: string, fallback: string): string {
  const value = props[key];
  return typeof value === "string" ? value : fallback;
}

// ---------------------------------------------------------------------------
// Inline scripts (scene-authored JavaScript)
// ---------------------------------------------------------------------------

/**
 * The identifiers an inline script can use without imports. Kept intentionally small:
 * component types for reading/writing entity data, math helpers, prop readers and colours.
 * `ctx` is supplied by the runtime at call time.
 */
const INLINE_SCRIPT_API = {
  Transform,
  Transform3D,
  Velocity,
  RigidBody,
  BoxCollider,
  CircleShape,
  RectShape,
  Sprite,
  TextLabel,
  MeshRenderer,
  Tag,
  Name,
  Parent,
  Visibility,
  Lifetime,
  vec2,
  vec3,
  rect,
  clamp,
  Colors,
  prop,
  numberProp,
  stringProp,
  worldTransform,
  worldTransform3D,
  colliderWorldRect,
} as const;

const INLINE_API_NAMES = Object.keys(INLINE_SCRIPT_API);
const INLINE_API_VALUES = Object.values(INLINE_SCRIPT_API);

/** Names available inside inline script source, for the editor's help text and tests. */
export function inlineScriptApiNames(): string[] {
  return [...INLINE_API_NAMES];
}

function asBehaviour(value: unknown): ScriptBehaviour {
  if (typeof value === "function") {
    return { update: value as (ctx: ScriptContext) => void };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "inline script must evaluate to an object with start/update/destroy, or to an update function",
    );
  }
  const behaviour = value as ScriptBehaviour;
  for (const key of ["start", "update", "destroy"] as const) {
    if (behaviour[key] !== undefined && typeof behaviour[key] !== "function") {
      throw new Error(`inline script ${key} must be a function`);
    }
  }
  return behaviour;
}

/**
 * Compiles scene-authored JavaScript into a factory. The source is a JavaScript expression:
 *
 *   ({
 *     start(ctx) { ... },
 *     update(ctx) {
 *       const body = ctx.scene.world.get(ctx.entity, RigidBody);
 *       ...
 *     },
 *   })
 *
 * A bare function is treated as `update`. The factory is cached by the script system, and a
 * fresh behaviour object is created for every entity so per-entity state never leaks.
 */
export function compileInlineScriptFactory(source: string): ScriptFactory {
  if (source.trim().length === 0) throw new Error("inline script source is empty");
  let evaluate: (...args: unknown[]) => unknown;
  try {
    evaluate = new Function(
      ...INLINE_API_NAMES,
      `"use strict";\nreturn (\n${source}\n);`,
    ) as (...args: unknown[]) => unknown;
  } catch (error) {
    throw new Error(`inline script syntax error: ${(error as Error).message}`);
  }
  return (_props: Record<string, unknown>, _entity: Entity) =>
    asBehaviour(evaluate(...INLINE_API_VALUES));
}

/** Compiles and instantiates one behaviour (editor validation, tests). */
export function compileInlineScript(source: string): ScriptBehaviour {
  return compileInlineScriptFactory(source)({}, 0);
}
