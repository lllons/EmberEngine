/**
 * games/flappy — per-step rules.
 *
 * Owner: this file owns everything that happens across entities: the run clock, pipe
 * spawning, scoring through trigger zones, collision deaths, the restart guard and the HUD.
 * One-entity behaviour lives in `scripts.ts`; motion, gravity and collision come from the
 * engine.
 */

import { RigidBody, Tag, TextLabel, Theme, Transform, Velocity } from "@ember/core";
import { defineSystem, type System, SystemOrder } from "@ember/runtime";
import { createPipePair } from "./entities.ts";
import { BIRD_TAG, GROUND_TAG, PIPE_TAG, SCORE_TAG } from "./entities.ts";
import {
  FIRST_PIPE_DELAY,
  GAP_MAX,
  GAP_MIN,
  GROUND_TOP,
  PIPE_GAP,
  PIPE_INTERVAL,
  PIPE_SPEED,
  VIEWPORT,
} from "./names.ts";
import { awardPoint, endRun, type FlappyState, RESTART, RUN_STATE } from "./state.ts";

const RESTART_GUARD = 0.45;

/** Keeps a new gap within reach of the previous one. */
function clampCenter(value: number, previous: number, maxStep: number): number {
  return Math.min(previous + maxStep, Math.max(previous - maxStep, value));
}

function stateOf(ctx: { services: Record<string, unknown> }): FlappyState {
  const state = ctx.services[RUN_STATE] as FlappyState | undefined;
  if (!state) throw new Error("the Flappy run state is not registered on this session");
  return state;
}

function birdOf(ctx: { api: { entitiesWithTag(tag: string): number[] } }): number | undefined {
  return ctx.api.entitiesWithTag(BIRD_TAG)[0];
}

/** Counts seconds survived while the bird is alive. */
export function timerSystem(): System {
  return defineSystem("flappy.timer", (ctx) => {
    const state = stateOf(ctx);
    if (state.status !== "playing") return;
    state.time += ctx.dt;
  }, SystemOrder.gameplay - 1);
}

export interface PipeSpawnerOptions {
  interval?: number;
  firstDelay?: number;
  gap?: number;
  speed?: number;
  minCenter?: number;
  maxCenter?: number;
  /**
   * Largest vertical jump between consecutive gaps. A run that teleports the gap from the
   * floor to the ceiling is technically passable but unfair; clamping the step keeps every
   * pipe reachable from the previous one at the bird's fall rate.
   */
  maxStep?: number;
}

/**
 * Spawns one pipe pair at a time, on a fixed cadence, with the gap placed by the session
 * RNG. The spawn band is inside the playable area, so every pipe is passable by design.
 */
export function pipeSpawnerSystem(options: PipeSpawnerOptions = {}): System {
  const interval = options.interval ?? PIPE_INTERVAL;
  const firstDelay = options.firstDelay ?? FIRST_PIPE_DELAY;
  const gap = options.gap ?? PIPE_GAP;
  const speed = options.speed ?? PIPE_SPEED;
  const minCenter = options.minCenter ?? GAP_MIN;
  const maxCenter = options.maxCenter ?? GAP_MAX;
  const maxStep = options.maxStep ?? 110;
  let sinceLast = 0;
  let next = firstDelay;
  let lastCenter: number | null = null;

  return defineSystem("flappy.pipes", (ctx) => {
    const state = stateOf(ctx);
    if (state.status !== "playing") return;
    // The title scene has no bird and must stay quiet.
    if (birdOf(ctx) === undefined) return;

    sinceLast += ctx.dt;
    if (sinceLast < next) return;
    sinceLast = 0;
    next = interval;

    const roll = ctx.rng.float(minCenter, maxCenter);
    const center = lastCenter === null
      ? roll
      : Math.min(maxCenter, Math.max(minCenter, clampCenter(roll, lastCenter, maxStep)));
    lastCenter = center;
    createPipePair(ctx.scene, VIEWPORT.width + 40, center, gap, { speed, floor: GROUND_TOP });
    ctx.queue.push("flappy.pipe", { center, speed });
  }, SystemOrder.gameplay);
}

/**
 * Scores a pipe when the bird passes through its gap trigger. The zone is a non-solid
 * trigger, so it reports the crossing without stopping the bird.
 */
export function scoringSystem(): System {
  // Scored zones stay alive until they scroll off: the zone is also the readable target
  // for the gap, so removing it at the moment of scoring would make the bird look ahead
  // to the next pipe while it is still inside the current one.
  const scored = new Set<number>();
  let currentWorld: unknown = null;
  return defineSystem("flappy.score", (ctx) => {
    // Entity ids restart at 1 in every scene, so a restarted run must forget old ids.
    if (ctx.scene.world !== currentWorld) {
      currentWorld = ctx.scene.world;
      scored.clear();
    }
    const state = stateOf(ctx);
    if (state.status !== "playing") return;
    const bird = birdOf(ctx);
    if (bird === undefined) return;

    for (const record of ctx.collisions) {
      if (!record.trigger) continue;
      const pair: Array<[number, number]> = [[record.a, record.b], [record.b, record.a]];
      for (const [self, other] of pair) {
        if (other !== bird || scored.has(self)) continue;
        const tag = ctx.scene.world.get(self, Tag);
        if (tag?.value !== SCORE_TAG) continue;
        scored.add(self);
        const score = awardPoint(state);
        ctx.queue.push("flappy.point", { entity: self, score });
      }
    }
  }, SystemOrder.postCollision);
}

/**
 * Ends the run when the bird touches a pipe or the ground, or leaves through the ceiling.
 * On death everything in the play scene stops, so the game-over card is readable.
 */
export function collisionDeathSystem(): System {
  return defineSystem("flappy.death", (ctx) => {
    const state = stateOf(ctx);
    const bird = birdOf(ctx);
    if (bird === undefined) return;
    const world = ctx.scene.world;

    if (state.status === "playing") {
      let reason: string | null = null;
      for (const record of ctx.collisions) {
        if (record.trigger) continue;
        const other = record.a === bird ? record.b : record.b === bird ? record.a : null;
        if (other === null) continue;
        const tag = world.get(other, Tag)?.value;
        if (tag === PIPE_TAG) reason = "hit a pipe";
        else if (tag === GROUND_TAG) reason = "hit the ground";
        if (reason) break;
      }
      const transform = world.get(bird, Transform);
      if (!reason && transform && transform.position.y < 12) reason = "hit the ceiling";

      if (reason) {
        endRun(state, reason);
        ctx.queue.push("flappy.dead", { score: state.score, best: state.best, reason });
      }
    }

    if (state.status !== "playing") {
      // Freeze the world behind the card.
      for (const entity of world.query(Tag)) {
        const value = world.require(entity, Tag).value;
        if (value !== PIPE_TAG && value !== SCORE_TAG) continue;
        const velocity = world.get(entity, Velocity);
        if (velocity) velocity.x = 0;
      }
      const body = world.get(bird, RigidBody);
      if (body) body.gravityScale = 0;
      const velocity = world.get(bird, Velocity);
      if (velocity) {
        velocity.x = 0;
        velocity.y = 0;
      }
    }
  }, SystemOrder.postCollision + 1);
}

/** A short guard keeps the death press from instantly restarting the run. */
export function restartSystem(): System {
  return defineSystem("flappy.restart", (ctx) => {
    const state = stateOf(ctx);
    if (state.status !== "dead") return;
    state.deadFor += ctx.dt;
    if (state.deadFor < RESTART_GUARD) return;

    const wants = ctx.input.wasPressed("Space") ||
      ctx.input.wasPressed("Enter") ||
      ctx.input.wasPressed("ArrowUp") ||
      ctx.input.wasMousePressed("left");
    if (!wants) return;

    const restart = ctx.services[RESTART] as (() => void) | undefined;
    if (!restart) return;
    ctx.queue.push("flappy.restart", { score: state.score, best: state.best });
    restart();
  }, SystemOrder.gameplay + 2);
}

/** Removes pipes and score zones once they have scrolled past the bird. */
export function cleanupSystem(): System {
  return defineSystem("flappy.cleanup", (ctx) => {
    const world = ctx.scene.world;
    for (const tag of [PIPE_TAG, SCORE_TAG]) {
      for (const entity of ctx.api.entitiesWithTag(tag)) {
        const transform = world.get(entity, Transform);
        if (transform && transform.position.x < -120) ctx.api.despawn(entity);
      }
    }
  }, SystemOrder.lifetime);
}

/** Keeps the score, best score and game-over card in sync with the run state. */
export function hudSystem(): System {
  return defineSystem("flappy.hud", (ctx) => {
    const state = stateOf(ctx);
    const world = ctx.scene.world;
    const text = (name: string, value: string, color?: string, alpha?: number): void => {
      const entity = ctx.api.findByName(name);
      if (entity === undefined) return;
      const label = world.get(entity, TextLabel);
      if (!label) return;
      if (label.text !== value) label.text = value;
      if (color !== undefined && label.color !== color) label.color = color;
      if (alpha !== undefined && label.alpha !== alpha) label.alpha = alpha;
    };

    const playing = state.status === "playing";
    text("score", String(state.score), playing ? Theme.highlight : Theme.accent);
    text("best", `BEST ${state.best}`, Theme.muted);
    text("overlay", "GAME OVER", Theme.accent, playing ? 0 : 1);
    text(
      "overlay-detail",
      `score ${state.score}  ·  best ${state.best}`,
      Theme.text,
      playing ? 0 : 1,
    );
    text(
      "overlay-prompt",
      `${state.message}  ·  SPACE / CLICK to retry`,
      Theme.muted,
      playing ? 0 : 1,
    );
  }, SystemOrder.gameplay + 3);
}

/** Every system the game adds, in registration order. */
export function flappySystems(): System[] {
  return [
    timerSystem(),
    pipeSpawnerSystem(),
    restartSystem(),
    scoringSystem(),
    collisionDeathSystem(),
    cleanupSystem(),
    hudSystem(),
  ];
}
