/**
 * games/ember-runner — game systems.
 *
 * Owner: this file owns everything that happens per step across entities rather than per
 * entity: the level clock, survival score, spawn pressure, cleanup and restart handling.
 * One-entity behaviours live in `scripts.ts`; generic physics, animation and camera systems
 * live in `@ember/runtime`.
 */

import { type Entity, rectFromCenter, type Scene, Tag, Transform, vec2 } from "@ember/core";
import { defineSystem, type System, SystemOrder } from "@ember/runtime";
import { createEmber, createHazard, OVERLAY_BOTTOM, OVERLAY_TOP } from "./entities.ts";
import { RESTART, RUN_STATE, type RunState } from "./state.ts";

const SPAWNED_TAG = "spawned";

function runStateOf(ctx: { services: Record<string, unknown> }): RunState {
  const value = ctx.services[RUN_STATE] as RunState | undefined;
  if (!value) throw new Error("runner run state is not registered on this session");
  return value;
}

/** Advances the level clock while the run is live; running out of time is a loss. */
export function timerSystem(limitSeconds = 120): System {
  return defineSystem("runner.timer", (ctx) => {
    const run = runStateOf(ctx);
    // Menus have no runner, so idling on the title must not age the run or score it.
    if (run.status !== "playing" || ctx.api.entitiesWithTag("player").length === 0) return;
    run.time += ctx.dt;
    if (run.time >= limitSeconds) {
      run.status = "dead";
      run.message = "out of time";
      run.best = Math.max(run.best, run.score);
      ctx.queue.push("runner.timeout", { time: run.time });
    }
  }, SystemOrder.gameplay);
}

/** Survival points, awarded a whole point at a time so the score never jitters. */
export function survivalScoreSystem(pointsPerSecond = 4): System {
  return defineSystem("runner.survival", (ctx) => {
    const run = runStateOf(ctx);
    if (run.status !== "playing" || ctx.api.entitiesWithTag("player").length === 0) return;
    const before = Math.floor((run.time - ctx.dt) * pointsPerSecond);
    const after = Math.floor(run.time * pointsPerSecond);
    if (after > before) run.score += after - before;
  }, SystemOrder.gameplay + 1);
}

/** Restarts the level on `R`, and on `Enter` once a run has ended. */
export function restartSystem(): System {
  return defineSystem("runner.restart", (ctx) => {
    const run = runStateOf(ctx);
    // Menus have no player entity and no run to restart.
    if (ctx.api.entitiesWithTag("player").length === 0) return;
    const wants = ctx.input.wasPressed("KeyR") ||
      (run.status !== "playing" && ctx.input.wasPressed("Enter"));
    if (!wants) return;
    const restart = ctx.services[RESTART] as (() => void) | undefined;
    if (!restart) return;
    ctx.queue.push("runner.restart", { attempt: run.attempts, score: run.score });
    restart();
  }, SystemOrder.gameplay + 2);
}

export interface SpawnerOptions {
  /** Seconds between spawns at the start of a run. */
  interval?: number;
  /** Fastest interval the ramp reaches. */
  minInterval?: number;
  /** Seconds over which the interval ramps from `interval` to `minInterval`. */
  rampSeconds?: number;
  /** World band new entities appear in. */
  area?: { x: number; y: number; w: number; h: number };
  /** Chance a spawn is an ember (rises as the run gets harder to stay fair). */
  coinChance?: number;
  /** Hard cap on live spawned entities so a long run cannot flood the world. */
  maxLive?: number;
}

/**
 * Spawns embers and drifting hazards on a timer using the session RNG, so a seed reproduces
 * a run exactly — the property the determinism tests rely on. Spawned entities carry the
 * `spawned` tag, which is what `cleanupSystem` uses to prune them.
 */
export function spawnerSystem(options: SpawnerOptions = {}): System {
  const interval = options.interval ?? 0.9;
  const minInterval = options.minInterval ?? 0.45;
  const rampSeconds = options.rampSeconds ?? 25;
  const area = options.area ?? { x: 160, y: 150, w: 1900, h: 260 };
  const coinChance = options.coinChance ?? 0.7;
  const maxLive = options.maxLive ?? 36;
  let sinceLast = 0;
  let next = interval;

  return defineSystem("runner.spawner", (ctx) => {
    const run = runStateOf(ctx);
    if (run.status !== "playing") return;
    // Only levels with a runner spawn anything; menus stay quiet.
    if (ctx.api.entitiesWithTag("player").length === 0) return;
    sinceLast += ctx.dt;
    if (sinceLast < next) return;
    sinceLast = 0;
    const progress = Math.min(1, run.time / rampSeconds);
    next = interval - (interval - minInterval) * progress;
    if (ctx.api.entitiesWithTag(SPAWNED_TAG).length >= maxLive) return;

    const x = ctx.rng.float(area.x, area.x + area.w);
    const y = ctx.rng.float(area.y, area.y + area.h);
    const isEmber = ctx.rng.float(0, 1) < coinChance;
    const entity = isEmber
      ? createEmber(ctx.scene, x, y, 20)
      : createHazard(ctx.scene, x, y, { speed: Math.round(ctx.rng.float(60, 140)), direction: -1 });
    ctx.scene.world.add(entity, Tag, { value: SPAWNED_TAG });
    ctx.queue.push("runner.spawn", { isEmber, x, y, entity });
  }, SystemOrder.postCollision + 1);
}

/** Prunes spawned entities (and stray collectables) once they leave the level. */
export function cleanupSystem(area: { x: number; y: number; w: number; h: number }): System {
  const bounds = rectFromCenter(vec2(area.x + area.w / 2, area.y + area.h / 2), area.w, area.h);
  return defineSystem("runner.cleanup", (ctx) => {
    const tags = [SPAWNED_TAG, "coin", "hazard"];
    for (const tag of tags) {
      for (const entity of ctx.api.entitiesWithTag(tag)) {
        const transform = ctx.scene.world.get(entity, Transform);
        if (!transform) continue;
        const outside = transform.position.x < bounds.x ||
          transform.position.x > bounds.x + bounds.w ||
          transform.position.y < bounds.y ||
          transform.position.y > bounds.y + bounds.h;
        if (outside) ctx.api.despawn(entity);
      }
    }
  }, SystemOrder.lifetime + 1);
}

/**
 * Keeps overlay text on screen: the HUD and the hint line are screen furniture, not level
 * geometry, so a camera that follows the runner must not carry them away. The entity's own
 * x is ignored; only the tag decides the anchor.
 */
export function overlaySystem(): System {
  return defineSystem("runner.overlay", (ctx) => {
    const camera = ctx.camera.state.position;
    const half = ctx.camera.viewport.height / 2;
    for (const [tag, y] of [[OVERLAY_TOP, camera.y - half + 28], [OVERLAY_BOTTOM, camera.y + half - 22]] as const) {
      for (const entity of ctx.api.entitiesWithTag(tag)) {
        const transform = ctx.scene.world.get(entity, Transform);
        if (!transform) continue;
        transform.position.x = camera.x;
        transform.position.y = y;
      }
    }
  }, SystemOrder.camera + 1);
}

/** The runner's own systems, in registration order (stable ties break on name). */
export function runnerSystems(): System[] {
  return [
    timerSystem(),
    survivalScoreSystem(),
    restartSystem(),
    spawnerSystem(),
    overlaySystem(),
  ];
}

/** Entity factory used by the spawner; exported for tests that assert spawn behaviour. */
export function spawnKind(scene: Scene, kind: "ember" | "hazard", x: number, y: number): Entity {
  return kind === "ember" ? createEmber(scene, x, y, 20) : createHazard(scene, x, y, { speed: 80 });
}
