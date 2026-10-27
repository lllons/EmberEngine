import { assertEquals } from "@std/assert";
import {
  commandBounds,
  commandHistogram,
  type Context2D,
  createCanvas2DRenderer,
  renderCommands,
  type TriangleCommand,
} from "@ember/render2d";

type Call = { name: string; args: unknown[] };

function fakeContext(): { ctx: Context2D; calls: Call[] } {
  const calls: Call[] = [];
  const stack: number[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args });
  };
  const ctx: Context2D = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    save: () => {
      stack.push(ctx.globalAlpha);
      calls.push({ name: "save", args: [] });
    },
    restore: () => {
      const alpha = stack.pop();
      if (alpha !== undefined) ctx.globalAlpha = alpha;
      calls.push({ name: "restore", args: [] });
    },
    translate: record("translate"),
    rotate: record("rotate"),
    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    strokeRect: record("strokeRect"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    rect: record("rect"),
    arc: record("arc"),
    ellipse: record("ellipse"),
    fill: record("fill"),
    stroke: record("stroke"),
    fillText: record("fillText"),
    drawImage: record("drawImage"),
  };
  return { ctx, calls };
}

function triangle(overrides: Partial<TriangleCommand> = {}): TriangleCommand {
  return {
    kind: "triangle",
    ax: 10,
    ay: 20,
    bx: 40,
    by: 20,
    cx: 25,
    cy: 50,
    color: "#ff0000",
    alpha: 1,
    filled: true,
    strokeWidth: 1,
    depth: 5,
    entity: 1,
    layer: 0,
    ...overrides,
  };
}

Deno.test("a filled triangle becomes a closed path that is filled", () => {
  const { ctx, calls } = fakeContext();
  renderCommands(ctx, [triangle()], { width: 800, height: 600 });
  assertEquals(
    calls.map((call) => call.name),
    ["beginPath", "moveTo", "lineTo", "lineTo", "closePath", "fill"],
  );
  assertEquals(calls[1].args, [10, 20]);
  assertEquals(calls[2].args, [40, 20]);
  assertEquals(calls[3].args, [25, 50]);
  assertEquals(ctx.fillStyle, "#ff0000");
});

Deno.test("an unfilled triangle is stroked with its width", () => {
  const { ctx, calls } = fakeContext();
  renderCommands(ctx, [triangle({ filled: false, strokeWidth: 3 })]);
  assertEquals(calls.at(-1)?.name, "stroke");
  assertEquals(ctx.strokeStyle, "#ff0000");
  assertEquals(ctx.lineWidth, 3);
});

Deno.test("translucent triangles save, set alpha and restore", () => {
  const { ctx, calls } = fakeContext();
  renderCommands(ctx, [triangle({ alpha: 0.25 })]);
  assertEquals(calls[0].name, "save");
  assertEquals(calls.at(-1)?.name, "restore");
  assertEquals(ctx.globalAlpha, 1);
});

Deno.test("the clear command fills the configured surface", () => {
  const { ctx, calls } = fakeContext();
  const renderer = createCanvas2DRenderer(ctx, { width: 320, height: 240 });
  renderer.render([{ kind: "clear", color: "#10131a" }]);
  assertEquals(calls, [{ name: "fillRect", args: [0, 0, 320, 240] }]);
  assertEquals(ctx.fillStyle, "#10131a");
});

Deno.test("triangle bounds are the min/max of its vertices", () => {
  assertEquals(commandBounds(triangle()), { x: 10, y: 20, w: 30, h: 30 });
});

Deno.test("triangle commands are counted in the histogram and render stats", () => {
  const commands = [triangle(), triangle({ depth: 9 }), {
    kind: "clear" as const,
    color: "#000000",
  }];
  assertEquals(commandHistogram(commands), { triangle: 2, clear: 1 });
  const { ctx } = fakeContext();
  const stats = renderCommands(ctx, commands);
  assertEquals(stats.commands, 3);
  assertEquals(stats.byKind.triangle, 2);
  assertEquals(stats.byKind.clear, 1);
});
