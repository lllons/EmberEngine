/**
 * games/flappy — entity behaviours.
 *
 * Owner: this file owns the bird's one-button control and the title screen's start
 * gesture. Scene files reference these by name, so the behaviours live in a registry
 * instead of being attached as functions.
 */

import { clamp, RigidBody, Sprite, Transform, Velocity } from "@ember/core";
import {
  numberProp,
  type ScriptRegistry,
  ScriptRegistry as Registry,
  stringProp,
} from "@ember/runtime";
import { type FlappyState, GOTO_SCENE, RUN_STATE } from "./state.ts";

export const BIRD_SCRIPT = "flappy.bird";
export const TITLE_SCRIPT = "flappy.title";

function runStateOf(ctx: { services: Record<string, unknown> }): FlappyState {
  const state = ctx.services[RUN_STATE] as FlappyState | undefined;
  if (!state) throw new Error("the Flappy run state service is missing from this session");
  return state;
}

export function createFlappyScripts(registry = new Registry()): ScriptRegistry {
  registry.override(BIRD_SCRIPT, (props) => {
    const flap = numberProp(props, "flap", 380);
    const maxFall = numberProp(props, "maxFall", 460);

    return {
      update(ctx) {
        const state = runStateOf(ctx);
        const world = ctx.scene.world;
        const transform = world.get(ctx.entity, Transform);
        const velocity = world.get(ctx.entity, Velocity);
        const body = world.get(ctx.entity, RigidBody);
        if (!transform || !velocity || !body) return;

        if (state.status !== "playing") {
          // Freeze on the game-over card; gravity must not keep dragging the bird down.
          body.gravityScale = 0;
          velocity.x = 0;
          velocity.y = 0;
          return;
        }

        const pressed = ctx.input.wasPressed("Space") ||
          ctx.input.wasPressed("ArrowUp") ||
          ctx.input.wasPressed("KeyW") ||
          ctx.input.wasMousePressed("left");

        if (pressed) {
          velocity.y = -flap;
          ctx.queue.push("flappy.flap", { entity: ctx.entity, vy: velocity.y });
        }

        if (velocity.y > maxFall) velocity.y = maxFall;

        // Nose down while falling, nose up while rising. Sprite rotation is cosmetic, so
        // the hitbox stays axis-aligned while the bird banks.
        const sprite = world.get(ctx.entity, Sprite);
        if (sprite) sprite.rotation = clamp(velocity.y / 650, -0.45, 0.9);
      },
    };
  });

  registry.override(TITLE_SCRIPT, (props) => {
    const target = stringProp(props, "target", "play");
    return {
      update(ctx) {
        const start = ctx.input.wasPressed("Space") ||
          ctx.input.wasPressed("Enter") ||
          ctx.input.wasPressed("ArrowUp") ||
          ctx.input.wasMousePressed("left");
        if (!start) return;
        const goto = ctx.services[GOTO_SCENE] as ((scene: string) => void) | undefined;
        if (!goto) return;
        ctx.queue.push("flappy.start", { target });
        goto(target);
      },
    };
  });

  return registry;
}
