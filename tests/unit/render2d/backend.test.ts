/**
 * @ember/render2d/backends/canvas2d — executing draw commands on a recording context.
 *
 * The backend is verified by recording the calls it makes, which asserts on real drawing
 * behaviour (state handling, geometry, texture source rects) without needing a canvas.
 */

import { assert, assertEquals } from "@std/assert";
import {
  type CircleCommand,
  type Context2D,
  type DrawCommand,
  type RectCommand,
  type SpriteCommand,
  type TextCommand,
  createCanvas2DRenderer,
  renderCommands,
} from "@ember/render2d";

interface Harness {
  calls: string[];
  ctx: Context2D;
  images: Array<{ args: unknown[] }>;
}

function harness(width = 800, height = 600): Harness {
  const calls: string[] = [];
  const images: Array<{ args: unknown[] }> = [];
  // Mirrors CanvasRenderingContext2D: save/restore really do revert the style state, so a
  // test that asserts "alpha was restored" is testing the same thing a browser would.
  const stateStack: Array<Record<string, unknown>> = [];
  const ctx = {
    canvas: { width, height },
    fillStyle: "" as unknown,
    strokeStyle: "" as unknown,
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    save: () => {
      calls.push("save");
      stateStack.push({ fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth, globalAlpha: ctx.globalAlpha, font: ctx.font, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline });
    },
    restore: () => {
      calls.push("restore");
      const previous = stateStack.pop();
      if (!previous) return;
      ctx.fillStyle = previous.fillStyle as unknown;
      ctx.strokeStyle = previous.strokeStyle as unknown;
      ctx.lineWidth = previous.lineWidth as number;
      ctx.globalAlpha = previous.globalAlpha as number;
      ctx.font = previous.font as string;
      ctx.textAlign = previous.textAlign as string;
      ctx.textBaseline = previous.textBaseline as string;
    },
    translate: (x: number, y: number) => calls.push(`translate(${x},${y})`),
    rotate: (angle: number) => calls.push(`rotate(${angle.toFixed(3)})`),
    clearRect: (x: number, y: number, w: number, h: number) => calls.push(`clearRect(${x},${y},${w},${h})`),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect(${x},${y},${w},${h})`),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect(${x},${y},${w},${h})`),
    beginPath: () => calls.push("beginPath"),
    closePath: () => calls.push("closePath"),
    rect: (x: number, y: number, w: number, h: number) => calls.push(`rect(${x},${y},${w},${h})`),
    arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y},${r})`),
    ellipse: (x: number, y: number, rx: number, ry: number) => calls.push(`ellipse(${x},${y},${rx},${ry})`),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
    fillText: (text: string, x: number, y: number) => calls.push(`fillText(${text},${x},${y})`),
    drawImage: (...args: unknown[]) => {
      images.push({ args });
      calls.push(`drawImage(${args.length})`);
    },
  };
  return { calls, ctx: ctx as unknown as Context2D, images };
}

function rect(overrides: Partial<RectCommand> = {}): RectCommand {
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

function circle(overrides: Partial<CircleCommand> = {}): CircleCommand {
  return {
    kind: "circle",
    x: 10,
    y: 20,
    radius: 5,
    color: "#ff0000",
    alpha: 1,
    filled: true,
    strokeWidth: 1,
    entity: 2,
    layer: 0,
    ...overrides,
  };
}

function sprite(overrides: Partial<SpriteCommand> = {}): SpriteCommand {
  return {
    kind: "sprite",
    x: 40,
    y: 60,
    width: 32,
    height: 16,
    texture: "coin",
    uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
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

function text(overrides: Partial<TextCommand> = {}): TextCommand {
  return {
    kind: "text",
    text: "score",
    x: 10,
    y: 20,
    size: 18,
    color: "#ffc857",
    alpha: 1,
    align: "center",
    baseline: "middle",
    entity: 4,
    layer: 0,
    ...overrides,
  };
}

Deno.test("clear fills the surface with the background colour", () => {
  const { calls, ctx } = harness(400, 300);
  renderCommands(ctx, [{ kind: "clear", color: "#123456" }]);
  assertEquals(calls, ["fillRect(0,0,400,300)"]);
  assertEquals(ctx.fillStyle, "#123456");
});

Deno.test("clear uses an explicit surface size when given one", () => {
  const { calls, ctx } = harness(400, 300);
  renderCommands(ctx, [{ kind: "clear", color: "#000000" }], { width: 1920, height: 1080 });
  assertEquals(calls, ["fillRect(0,0,1920,1080)"]);
});

Deno.test("clear resets globalAlpha so a fade cannot leak into the background", () => {
  const { ctx } = harness();
  ctx.globalAlpha = 0.25;
  renderCommands(ctx, [{ kind: "clear", color: "#000000" }]);
  assertEquals(ctx.globalAlpha, 1);
});

Deno.test("a filled rect draws from its anchor with no state changes", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [rect({ x: 100, y: 50, w: 20, h: 10 })]);
  assertEquals(calls, ["fillRect(90,45,20,10)"]);
  assertEquals(ctx.fillStyle, "#ffffff");
});

Deno.test("an outlined rect strokes with the command's width and colour", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [rect({ filled: false, strokeWidth: 3, color: "#00ff00" })]);
  assertEquals(calls, ["strokeRect(90,45,20,10)"]);
  assertEquals(ctx.lineWidth, 3);
  assertEquals(ctx.strokeStyle, "#00ff00");
});

Deno.test("outline width has a sane minimum", () => {
  const { ctx } = harness();
  renderCommands(ctx, [rect({ filled: false, strokeWidth: 0 })]);
  assertEquals(ctx.lineWidth, 0.5);
});

Deno.test("a rotated rect saves, translates, rotates, draws and restores", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [rect({ rotation: Math.PI / 2 })]);
  assertEquals(calls[0], "save");
  assertEquals(calls[1], "translate(100,50)");
  assert(calls[2].startsWith("rotate("), calls[2]);
  assertEquals(calls[3], "fillRect(-10,-5,20,10)");
  assertEquals(calls[4], "restore");
  assertEquals(calls.length, 5);
});

Deno.test("alpha below 1 sets globalAlpha inside a save/restore pair", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [rect({ alpha: 0.5 })]);
  assertEquals(calls, ["save", "fillRect(90,45,20,10)", "restore"]);
  assertEquals(ctx.globalAlpha, 1, "globalAlpha must be restored");
});

Deno.test("alpha is visible while the shape draws", () => {
  const { ctx } = harness();
  const observed: number[] = [];
  const original = ctx.fillRect.bind(ctx);
  (ctx as unknown as Record<string, unknown>).fillRect = (x: number, y: number, w: number, h: number) => {
    observed.push(ctx.globalAlpha);
    original(x, y, w, h);
  };
  renderCommands(ctx, [rect({ alpha: 0.25 })]);
  assertEquals(observed, [0.25]);
  assertEquals(ctx.globalAlpha, 1);
});

Deno.test("an unrotated, opaque rect avoids save/restore entirely", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [rect()]);
  assert(!calls.includes("save"), "no state change should be needed");
});

Deno.test("a rect anchored at its corner draws from the corner", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [rect({ anchorX: 0, anchorY: 0 })]);
  assertEquals(calls, ["fillRect(100,50,20,10)"]);
});

Deno.test("a filled circle draws a full arc", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [circle({ x: 10, y: 20, radius: 5 })]);
  assertEquals(calls, ["beginPath", "arc(10,20,5)", "fill", "closePath"]);
  assertEquals(ctx.fillStyle, "#ff0000");
});

Deno.test("an outlined circle strokes with the command's width", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [circle({ filled: false, strokeWidth: 4 })]);
  assertEquals(calls, ["beginPath", "arc(10,20,5)", "stroke", "closePath"]);
  assertEquals(ctx.lineWidth, 4);
});

Deno.test("a circle with a negative radius is clamped to zero", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [circle({ radius: -5 })]);
  assert(calls.includes("arc(10,20,0)"), calls.join(","));
});

Deno.test("a sprite with a resolvable texture draws the image", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [sprite()], { resolveTexture: () => ({ image: { width: 64, height: 16 } }) });
  assert(calls.some((call) => call.startsWith("drawImage")), calls.join(","));
});

Deno.test("a sprite's source rect follows its uv window", () => {
  const { images, ctx } = harness();
  renderCommands(ctx, [sprite({ uv: { u0: 0.5, v0: 0, u1: 0.75, v1: 1 } })], {
    resolveTexture: () => ({ image: { width: 64, height: 16 } }),
  });
  assertEquals(images.length, 1);
  assertEquals(images[0].args.length, 9);
  assertEquals(images[0].args.slice(1, 6), [32, 0, 16, 16, 24]);
});

Deno.test("a rotated sprite draws from its anchor in local space", () => {
  const { images, ctx } = harness();
  renderCommands(ctx, [sprite({ rotation: 1, anchorX: 0.5, anchorY: 0.5 })], {
    resolveTexture: () => ({ image: { width: 64, height: 16 } }),
  });
  assertEquals(images[0].args.slice(5, 7), [-16, -8]);
});

Deno.test("an image without dimensions draws 1:1", () => {
  const { images, ctx } = harness();
  renderCommands(ctx, [sprite()], { resolveTexture: () => ({ image: { id: "bitmap" } }) });
  assertEquals(images[0].args.length, 5);
});

Deno.test("a missing texture falls back to a placeholder box", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [sprite({ texture: "missing" })], { resolveTexture: () => undefined });
  assertEquals(calls, ["fillRect(24,52,32,16)"]);
  assertEquals(ctx.fillStyle, "#ff00ff");
});

Deno.test("a sprite with no texture key is a placeholder too", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [sprite({ texture: "" })]);
  assertEquals(calls, ["fillRect(24,52,32,16)"]);
  assertEquals(ctx.fillStyle, "#ff00ff");
});

Deno.test("the placeholder colour is configurable", () => {
  const { ctx } = harness();
  renderCommands(ctx, [sprite({ texture: "missing" })], { placeholderColor: "#00ff00" });
  assertEquals(ctx.fillStyle, "#00ff00");
});

Deno.test("a tinted sprite without a texture uses the tint", () => {
  const { ctx } = harness();
  renderCommands(ctx, [sprite({ texture: "missing", tint: "#ff0000" })]);
  assertEquals(ctx.fillStyle, "#ff0000");
});

Deno.test("a rotated sprite saves and restores the transform", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [sprite({ rotation: 1 })], { resolveTexture: () => ({ image: { width: 8, height: 8 } }) });
  assertEquals(calls[0], "save");
  assertEquals(calls.at(-1), "restore");
});

Deno.test("text sets font, alignment, baseline and colour, then fills", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [text()]);
  assertEquals(calls, ["fillText(score,10,20)"]);
  assertEquals(ctx.fillStyle, "#ffc857");
  assertEquals(ctx.textAlign, "center");
  assertEquals(ctx.textBaseline, "middle");
  assert(ctx.font.startsWith("18px"), ctx.font);
});

Deno.test("text size is clamped to a drawable minimum", () => {
  const { ctx } = harness();
  renderCommands(ctx, [text({ size: 0 })]);
  assert(ctx.font.startsWith("1px"), ctx.font);
});

Deno.test("transparent text saves and restores alpha", () => {
  const { calls, ctx } = harness();
  renderCommands(ctx, [text({ alpha: 0.3 })]);
  assertEquals(calls[0], "save");
  assertEquals(calls.at(-1), "restore");
});

Deno.test("render stats count commands by kind", () => {
  const { ctx } = harness();
  const stats = renderCommands(ctx, [
    { kind: "clear", color: "#000000" },
    rect(),
    rect({ entity: 2 }),
    circle(),
    text(),
  ]);
  assertEquals(stats.commands, 5);
  assertEquals(stats.byKind, { clear: 1, rect: 2, circle: 1, text: 1 });
});

Deno.test("rendering an empty command list is a no-op", () => {
  const { calls, ctx } = harness();
  const stats = renderCommands(ctx, []);
  assertEquals(calls, []);
  assertEquals(stats.commands, 0);
});

Deno.test("the renderer can be reused across frames without state leaking", () => {
  const { calls, ctx } = harness();
  const renderer = createCanvas2DRenderer(ctx);
  renderer.render([rect({ alpha: 0.5, rotation: 0.3 })]);
  const afterFirst = calls.length;
  renderer.render([rect()]);
  assertEquals(calls.slice(afterFirst), ["fillRect(90,45,20,10)"]);
  assertEquals(ctx.globalAlpha, 1);
});

Deno.test("a resolver returning nothing never throws", () => {
  const { ctx } = harness();
  renderCommands(ctx, [sprite({ texture: "nope" })], { resolveTexture: () => undefined });
  renderCommands(ctx, [sprite({ texture: "nope" })], { resolveTexture: () => null as never });
});

Deno.test("every command kind renders without throwing", () => {
  const { ctx } = harness();
  const commands: DrawCommand[] = [
    { kind: "clear", color: "#000000" },
    rect(),
    rect({ filled: false }),
    circle(),
    circle({ filled: false }),
    sprite({ texture: "x" }),
    text(),
  ];
  const stats = renderCommands(ctx, commands, { resolveTexture: () => ({ image: { width: 8, height: 8 } }) });
  assertEquals(stats.commands, 7);
});

Deno.test("drawImage is called with nine arguments for a sized image", () => {
  const { images, ctx } = harness();
  renderCommands(ctx, [sprite()], { resolveTexture: () => ({ image: { width: 32, height: 32 } }) });
  const args = images[0].args;
  assertEquals(args.length, 9);
  assertEquals(args[0], (args[0] as { width: number }) && args[0]);
  assertEquals(typeof args[1], "number");
  assertEquals(typeof args[8], "number");
});

Deno.test("a larger sprite command scales the destination rect, not the source", () => {
  const { images, ctx } = harness();
  renderCommands(ctx, [sprite({ width: 128, height: 64 })], {
    resolveTexture: () => ({ image: { width: 32, height: 32 } }),
  });
  const args = images[0].args;
  assertEquals(args.slice(7, 9), [128, 64]);
});

Deno.test("the backend never mutates the commands it draws", () => {
  const { ctx } = harness();
  const command = rect({ alpha: 0.4, rotation: 0.2 });
  const snapshot = JSON.stringify(command);
  renderCommands(ctx, [command]);
  assertEquals(JSON.stringify(command), snapshot);
});
