/**
 * games/ember-runner — entity behaviours.
 *
 * Owner: this file owns per-entity gameplay logic (the player's movement, pickups, hazards,
 * the exit gate, HUD text and the title screen). Scene files reference these by name
 * (`Script.name`), which is why the behaviours are registered in a registry rather than
 * attached as functions.
 */

import {
  BoxCollider,
  RigidBody,
  Sprite,
  TextLabel,
  Transform,
  Velocity,
  clamp,
  colliderWorldRect,
  rectIntersects,
} from "@ember/core";
import { type ScriptRegistry, ScriptRegistry as Registry, numberProp, stringProp } from "@ember/runtime";
import { GOTO_SCENE, type RunState, RUN_STATE, award } from "./state.ts";

export const PLAYER_SCRIPT = "runner.player";
export const PICKUP_SCRIPT = "runner.pickup";
export const HAZARD_SCRIPT = "runner.hazard";
export const GOAL_SCRIPT = "runner.goal";
export const HUD_SCRIPT = "runner.hud";
export const TITLE_SCRIPT = "runner.title";

export const scriptNames = [
  PLAYER_SCRIPT,
  PICKUP_SCRIPT,
  HAZARD_SCRIPT,
  GOAL_SCRIPT,
  HUD_SCRIPT,
  TITLE_SCRIPT,
].sort();

function runStateOf(ctx: { services: Record<string, unknown> }): RunState {
  const state = ctx.services[RUN_STATE] as RunState | undefined;
  if (!state) throw new Error("the runner run state service is missing from this session");
  return state;
}

/** Alternates between the sprite animation frames while moving. */
function animate(sprite: { frame: number; framesPerSecond: number; frameCount: number }, moving: boolean, dt: number): void {
  const speed = moving ? sprite.framesPerSecond : sprite.framesPerSecond / 3;
  sprite.frame = (sprite.frame + dt * speed) % Math.max(1, sprite.frameCount);
}

export function registerRunnerScripts(registry: ScriptRegistry): ScriptRegistry {
  registry.override(PLAYER_SCRIPT, (props) => {
    const speed = numberProp(props, "speed", 260);
    const jump = numberProp(props, "jump", 780);
    const coyote = numberProp(props, "coyote", 0.12);
    let airborneFor = 0;
    let facing = 1;
    let jumpLatch = false;

    return {
      update(ctx) {
        const state = runStateOf(ctx);
        const world = ctx.scene.world;
        const transform = world.get(ctx.entity, Transform);
        const velocity = world.get(ctx.entity, Velocity);
        const body = world.get(ctx.entity, RigidBody);
        if (!transform || !velocity || !body) return;

        if (state.status !== "playing") {
          // Freeze the runner while the run is over, but keep gravity honest.
          velocity.x *= 0.8;
          ctx.queue.push("runner.frozen", { entity: ctx.entity, status: state.status });
          return;
        }

        const left = ctx.input.isAnyDown(["ArrowLeft", "KeyA"]);
        const right = ctx.input.isAnyDown(["ArrowRight", "KeyD"]);
        const jumpHeld = ctx.input.isAnyDown(["ArrowUp", "Space", "KeyW"]);

        const direction = (right ? 1 : 0) - (left ? 1 : 0);
        if (direction !== 0) facing = direction;
        const target = direction * speed;
        const accel = body.grounded ? 2200 : 1200;
        velocity.x += clamp(target - velocity.x, -accel * ctx.dt, accel * ctx.dt);
        if (direction === 0 && body.grounded) velocity.x *= 1 - Math.min(1, 12 * ctx.dt);

        // Coyote time: a jump stays available briefly after walking off a ledge.
        airborneFor = body.grounded ? 0 : airborneFor + ctx.dt;
        const canJump = body.grounded || airborneFor <= coyote;
        if (jumpHeld && canJump && !jumpLatch) {
          velocity.y = -jump;
          body.grounded = false;
          airborneFor = coyote + 1;
          jumpLatch = true;
          ctx.queue.push("runner.jump", { entity: ctx.entity, vy: velocity.y });
        }
        if (!jumpHeld) jumpLatch = false;

        const sprite = world.get(ctx.entity, Sprite);
        if (sprite) {
          sprite.flipX = facing < 0;
          animate(sprite, Math.abs(velocity.x) > 20, ctx.dt);
        }
      },
    };
  });

  registry.override(PICKUP_SCRIPT, (props) => {
    const points = numberProp(props, "points", 25);
    const tag = stringProp(props, "tag", "coin");
    const bounce = numberProp(props, "bounce", 0.65);
    let collected = false;

    return {
      update(ctx) {
        const state = runStateOf(ctx);
        const world = ctx.scene.world;
        const transform = world.get(ctx.entity, Transform);
        const velocity = world.get(ctx.entity, Velocity);
        const collider = world.get(ctx.entity, BoxCollider);
        if (!transform || !collider || collected) return;

        // Embers bob gently so the level feels alive without any randomness.
        if (velocity) velocity.y = Math.sin((ctx.time + ctx.entity) * 2) * 12;
        if (bounce !== 0) transform.rotation = Math.sin((ctx.time + ctx.entity) * 1.5) * 0.15;

        const player = ctx.api.entitiesWithTag("player")[0];
        if (player === undefined) return;
        const playerRect = colliderWorldRect(world, player);
        const ownRect = colliderWorldRect(world, ctx.entity);
        if (!playerRect || !ownRect || !rectIntersects(playerRect, ownRect)) return;

        collected = true;
        state.coins += 1;
        award(state, points);
        state.message = `+${points}`;
        ctx.queue.push("runner.pickup", { entity: ctx.entity, tag, points, total: state.score });
        ctx.api.despawn(ctx.entity);
      },
    };
  });

  registry.override(HAZARD_SCRIPT, (props) => {
    const patrol = numberProp(props, "patrol", 0);
    const speed = numberProp(props, "speed", 90);
    let direction = numberProp(props, "direction", 1) >= 0 ? 1 : -1;
    let originX: number | null = null;

    return {
      start(ctx) {
        const transform = ctx.scene.world.get(ctx.entity, Transform);
        originX = transform ? transform.position.x : null;
      },
      update(ctx) {
        const state = runStateOf(ctx);
        const world = ctx.scene.world;
        const transform = world.get(ctx.entity, Transform);
        const velocity = world.get(ctx.entity, Velocity);
        if (!transform || !velocity) return;

        if (patrol > 0 && originX !== null) {
          velocity.x = direction * speed;
          if (transform.position.x > originX + patrol) direction = -1;
          if (transform.position.x < originX - patrol) direction = 1;
        }

        if (state.status !== "playing") return;
        const player = ctx.api.entitiesWithTag("player")[0];
        if (player === undefined) return;
        const playerRect = colliderWorldRect(world, player);
        const ownRect = colliderWorldRect(world, ctx.entity);
        if (!playerRect || !ownRect || !rectIntersects(playerRect, ownRect)) return;

        // A hit costs a life and knocks the player back; it never resolves as physics.
        state.lives -= 1;
        state.hits += 1;
        const playerTransform = world.get(player, Transform);
        const playerVelocity = world.get(player, Velocity);
        if (playerTransform && playerVelocity) {
          const push = playerTransform.position.x >= transform.position.x ? 1 : -1;
          playerVelocity.x = push * 260;
          playerVelocity.y = -420;
        }
        state.message = state.lives > 0 ? `hit! ${state.lives} lives left` : "the ember went out";
        if (state.lives <= 0) {
          state.status = "dead";
          state.best = Math.max(state.best, state.score);
        }
        ctx.queue.push("runner.hit", { entity: ctx.entity, player, lives: state.lives });
      },
    };
  });

  registry.override(GOAL_SCRIPT, (props) => {
    const bonus = numberProp(props, "bonus", 100);
    return {
      update(ctx) {
        const state = runStateOf(ctx);
        if (state.status !== "playing") return;
        const world = ctx.scene.world;
        const player = ctx.api.entitiesWithTag("player")[0];
        if (player === undefined) return;
        const playerRect = colliderWorldRect(world, player);
        const ownRect = colliderWorldRect(world, ctx.entity);
        if (!playerRect || !ownRect || !rectIntersects(playerRect, ownRect)) return;

        const timeBonus = Math.max(0, Math.round((60 - state.time) * 2));
        award(state, bonus + timeBonus);
        state.status = "won";
        state.message = `gate reached! +${bonus + timeBonus}`;
        ctx.queue.push("runner.won", { score: state.score, time: state.time });
      },
    };
  });

  registry.override(HUD_SCRIPT, () => {
    const lines: string[] = [];
    let hud: { text: string; color: string } | null = null;
    return {
      start(ctx) {
        const label = ctx.scene.world.get(ctx.entity, TextLabel);
        if (label) hud = { text: label.text, color: label.color };
      },
      update(ctx) {
        const label = ctx.scene.world.get(ctx.entity, TextLabel);
        if (!label) return;
        const state = runStateOf(ctx);
        const colour = state.status === "dead"
          ? "#e5484d"
          : state.status === "won"
          ? "#5ec27a"
          : "#ffc857";
        const text = `score ${state.score}  ·  best ${state.best}  ·  ${state.lives} ♥  ·  ` +
          `${state.time.toFixed(1)}s  ·  ${state.message}`;
        if (label.text !== text || label.color !== colour) {
          label.text = text;
          label.color = colour;
          lines.push(text);
        }
      },
      destroy(ctx) {
        const label = ctx.scene.world.get(ctx.entity, TextLabel);
        if (label && hud) label.text = hud.text;
      },
    };
  });

  registry.override(TITLE_SCRIPT, (props) => {
    const target = stringProp(props, "target", "level-1");
    return {
      update(ctx) {
        const start = ctx.input.wasPressed("Enter") || ctx.input.wasMousePressed("left") ||
          ctx.input.wasPressed("Space");
        if (!start) return;
        const goto = ctx.services[GOTO_SCENE] as ((scene: string) => void) | undefined;
        if (!goto) return;
        ctx.queue.push("runner.start", { target });
        goto(target);
      },
    };
  });

  return registry;
}

/** Convenience for tests: a registry with only the runner scripts. */
export function createRunnerScripts(): ScriptRegistry {
  return registerRunnerScripts(new Registry());
}
