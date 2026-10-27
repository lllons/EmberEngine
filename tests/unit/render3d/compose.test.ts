import { assert, assertEquals } from "@std/assert";
import type { DrawCommand, RectCommand, TriangleCommand } from "@ember/render2d";
import { buildFrame, compareMixedCommands } from "@ember/render3d";
import { Colors, MeshRenderer, RectShape, Scene, Transform3D, vec3 } from "@ember/core";

const VIEWPORT = { width: 800, height: 600 };

function mixedScene(): { scene: Scene; rect: number; cube: number } {
  const scene = new Scene({
    viewport: VIEWPORT,
    background: Colors.ink,
    camera3d: { position: vec3(0, 0, 10), near: 0.1, far: 100 },
  });
  const rect = scene.createEntity({ name: "panel", position: { x: 100, y: 100 } });
  scene.world.add(rect, RectShape, { width: 40, height: 20, layer: 0 });
  const cube = scene.world.spawn();
  scene.world.add(cube, Transform3D);
  scene.world.add(cube, MeshRenderer, { mesh: "cube", layer: 0 });
  return { scene, rect, cube };
}

function triangleCommand(depth: number, layer = 0, entity = 1): TriangleCommand {
  return {
    kind: "triangle",
    ax: 0,
    ay: 0,
    bx: 10,
    by: 0,
    cx: 0,
    cy: 10,
    color: Colors.white,
    alpha: 1,
    filled: true,
    strokeWidth: 1,
    depth,
    entity,
    layer,
  };
}

function rectCommand(layer = 0, entity = 1): RectCommand {
  return {
    kind: "rect",
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    color: Colors.ember,
    alpha: 1,
    rotation: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    filled: true,
    strokeWidth: 1,
    entity,
    layer,
  };
}

Deno.test("a mixed frame starts with one clear in the scene background colour", () => {
  const { scene } = mixedScene();
  const frame = buildFrame(scene);
  assertEquals(frame.commands[0], { kind: "clear", color: Colors.ink });
  assertEquals(
    frame.commands.filter((command) => command.kind === "clear").length,
    1,
  );
});

Deno.test("2D and 3D both render into the same frame", () => {
  const { scene } = mixedScene();
  const frame = buildFrame(scene);
  assertEquals(frame.stats.twoD.drawn, 1);
  assertEquals(frame.stats.threeD.drawn, 2);
  assertEquals(frame.commands.filter((command) => command.kind === "triangle").length, 2);
  assertEquals(frame.commands.filter((command) => command.kind === "rect").length, 1);
});

Deno.test("at the same layer the 2D command draws before the triangles", () => {
  const { scene, rect } = mixedScene();
  const frame = buildFrame(scene);
  const rectIndex = frame.commands.findIndex(
    (command) => command.kind === "rect" && command.entity === rect,
  );
  const firstTriangle = frame.commands.findIndex((command) => command.kind === "triangle");
  assert(rectIndex >= 0 && firstTriangle >= 0);
  assert(rectIndex < firstTriangle, "2D must come first at an equal layer");
});

Deno.test("a higher layer draws after the meshes, regardless of pipeline", () => {
  const { scene, rect } = mixedScene();
  scene.world.set(rect, RectShape, { layer: 10 });
  const frame = buildFrame(scene);
  const last = frame.commands.at(-1);
  assert(last !== undefined && last.kind === "rect", "last command must be the rect");
  assertEquals(last.entity, rect);
});

Deno.test("background: false omits the clear command", () => {
  const { scene } = mixedScene();
  const frame = buildFrame(scene, { background: false });
  assertEquals(frame.commands.some((command) => command.kind === "clear"), false);
});

Deno.test("buildFrame honours a viewport and camera override", () => {
  const { scene } = mixedScene();
  const frame = buildFrame(scene, {
    viewport: { width: 400, height: 300 },
    camera3d: {
      position: vec3(0, 0, 5),
      target: vec3(0, 0, 0),
      up: vec3(0, 1, 0),
      fov: Math.PI / 3,
      near: 0.1,
      far: 50,
    },
  });
  assertEquals(frame.viewport, { width: 400, height: 300 });
  assertEquals(frame.camera3d.position, vec3(0, 0, 5));
  // Closer camera: the front face is still the only visible one.
  assertEquals(frame.stats.threeD.drawn, 2);
});

Deno.test("compareMixedCommands orders clear, layer, pipeline, depth, entity", () => {
  const clear: DrawCommand = { kind: "clear", color: Colors.black };
  const near = triangleCommand(1, 0, 4);
  const far = triangleCommand(9, 0, 3);
  const panel = rectCommand(0, 2);

  assertEquals(compareMixedCommands(clear, panel) < 0, true);
  assertEquals(compareMixedCommands(panel, near) < 0, true);
  assertEquals(compareMixedCommands(far, near) < 0, true);
  assertEquals(compareMixedCommands(near, far) > 0, true);

  const highLayer = rectCommand(5);
  assertEquals(compareMixedCommands(near, highLayer) < 0, true);

  const sameDepthA = triangleCommand(3, 0, 1);
  const sameDepthB = triangleCommand(3, 0, 2);
  assertEquals(compareMixedCommands(sameDepthA, sameDepthB) < 0, true);
});

Deno.test("buildFrame is deterministic", () => {
  const { scene } = mixedScene();
  assertEquals(buildFrame(scene).commands, buildFrame(scene).commands);
});
