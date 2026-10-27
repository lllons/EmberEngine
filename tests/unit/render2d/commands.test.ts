/**
 * @ember/render2d/commands — the draw command vocabulary and its helpers.
 */

import { assert, assertEquals } from "@std/assert";
import {
  type CircleCommand,
  type ClearCommand,
  type DrawCommand,
  FULL_UV,
  type RectCommand,
  type ShapeCommand,
  type SpriteCommand,
  type TextCommand,
  commandBounds,
  commandHistogram,
  commandsToJSON,
  isShapeCommand,
} from "@ember/render2d";

const clear: ClearCommand = { kind: "clear", color: "#000000" };

function rectCommand(overrides: Partial<RectCommand> = {}): RectCommand {
  return {
    kind: "rect",
    x: 100,
    y: 50,
    w: 20,
    h: 10,
    color: "#ffffff",
    alpha: 1,
    rotation: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    filled: true,
    strokeWidth: 1,
    entity: 1,
    layer: 0,
    ...overrides,
  };
}

function circleCommand(overrides: Partial<CircleCommand> = {}): CircleCommand {
  return {
    kind: "circle",
    x: 10,
    y: 20,
    radius: 5,
    color: "#ffffff",
    alpha: 1,
    filled: true,
    strokeWidth: 1,
    entity: 2,
    layer: 0,
    ...overrides,
  };
}

function spriteCommand(overrides: Partial<SpriteCommand> = {}): SpriteCommand {
  return {
    kind: "sprite",
    x: 40,
    y: 60,
    width: 32,
    height: 16,
    texture: "player",
    uv: FULL_UV,
    tint: "#ffffff",
    alpha: 1,
    rotation: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    flipX: false,
    entity: 3,
    layer: 0,
    ...overrides,
  };
}

function textCommand(overrides: Partial<TextCommand> = {}): TextCommand {
  return {
    kind: "text",
    text: "hello",
    x: 0,
    y: 0,
    size: 10,
    color: "#ffffff",
    alpha: 1,
    align: "left",
    baseline: "top",
    entity: 4,
    layer: 0,
    ...overrides,
  };
}

Deno.test("isShapeCommand separates shapes from the background clear", () => {
  assert(!isShapeCommand(clear));
  assert(isShapeCommand(rectCommand()));
  assert(isShapeCommand(circleCommand()));
  assert(isShapeCommand(spriteCommand()));
  assert(isShapeCommand(textCommand()));
});

Deno.test("FULL_UV covers the whole texture", () => {
  assertEquals(FULL_UV, { u0: 0, v0: 0, u1: 1, v1: 1 });
});

Deno.test("commandBounds: centred rect", () => {
  assertEquals(commandBounds(rectCommand({ x: 100, y: 50, w: 20, h: 10 })), { x: 90, y: 45, w: 20, h: 10 });
});

Deno.test("commandBounds: rect anchored at its top-left", () => {
  assertEquals(commandBounds(rectCommand({ anchorX: 0, anchorY: 0 })), { x: 100, y: 50, w: 20, h: 10 });
});

Deno.test("commandBounds: rect anchored at its bottom-right", () => {
  assertEquals(commandBounds(rectCommand({ anchorX: 1, anchorY: 1 })), { x: 80, y: 40, w: 20, h: 10 });
});

Deno.test("commandBounds: circle is the bounding square", () => {
  assertEquals(commandBounds(circleCommand({ x: 10, y: 20, radius: 5 })), { x: 5, y: 15, w: 10, h: 10 });
});

Deno.test("commandBounds: sprite uses its anchor", () => {
  assertEquals(commandBounds(spriteCommand({ x: 40, y: 60, width: 32, height: 16 })), {
    x: 24,
    y: 52,
    w: 32,
    h: 16,
  });
  assertEquals(commandBounds(spriteCommand({ x: 40, y: 60, anchorX: 0, anchorY: 0 })), {
    x: 40,
    y: 60,
    w: 32,
    h: 16,
  });
});

Deno.test("commandBounds: text grows to the right when left-aligned", () => {
  assertEquals(commandBounds(textCommand({ text: "abc", size: 10 })), { x: 0, y: 0, w: 30, h: 10 });
});

Deno.test("commandBounds: text is centred when centre-aligned", () => {
  assertEquals(commandBounds(textCommand({ text: "abcd", size: 10, align: "center" })), {
    x: -20,
    y: 0,
    w: 40,
    h: 10,
  });
});

Deno.test("commandBounds: text is right-aligned", () => {
  assertEquals(commandBounds(textCommand({ text: "abc", size: 10, align: "right" })), {
    x: -30,
    y: 0,
    w: 30,
    h: 10,
  });
});

Deno.test("commandBounds: middle baseline lifts the box by half its height", () => {
  assertEquals(commandBounds(textCommand({ baseline: "middle", size: 10 })).y, -5);
});

Deno.test("commandBounds: empty text is a zero-width box", () => {
  assertEquals(commandBounds(textCommand({ text: "" })).w, 0);
});

Deno.test("commandHistogram counts commands per kind", () => {
  const commands: DrawCommand[] = [
    clear,
    rectCommand(),
    rectCommand({ entity: 2 }),
    circleCommand(),
    textCommand(),
  ];
  assertEquals(commandHistogram(commands), { clear: 1, rect: 2, circle: 1, text: 1 });
});

Deno.test("commandHistogram of an empty list is empty", () => {
  assertEquals(commandHistogram([]), {});
});

Deno.test("commandsToJSON copies commands rather than aliasing them", () => {
  const commands: DrawCommand[] = [clear, rectCommand()];
  const copies = commandsToJSON(commands);
  assertEquals(copies.length, 2);
  assert(copies[0] !== commands[0]);
  assert(copies[1] !== commands[1]);
  assert("layer" in copies[1] ? (copies[1] as RectCommand).layer === 0 : false);
});

Deno.test("commandsToJSON output is JSON-serializable", () => {
  const commands: DrawCommand[] = [clear, rectCommand(), spriteCommand(), textCommand()];
  const text = JSON.stringify(commandsToJSON(commands));
  assertEquals(JSON.parse(text).length, 4);
});

Deno.test("command bounds are finite numbers for every kind", () => {
  const shapes: ShapeCommand[] = [
    rectCommand(),
    circleCommand(),
    spriteCommand(),
    textCommand(),
  ];
  for (const shape of shapes) {
    const bounds = commandBounds(shape);
    assert(Number.isFinite(bounds.x + bounds.y + bounds.w + bounds.h), `${shape.kind} bounds are not finite`);
  }
});
