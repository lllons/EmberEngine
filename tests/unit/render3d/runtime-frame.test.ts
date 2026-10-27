import { assertEquals } from "@std/assert";
import { MeshRenderer, RectShape, Scene, Transform3D, vec3 } from "@ember/core";
import { RuntimeSession } from "@ember/runtime";

function mixedSession(): RuntimeSession {
  const scene = new Scene({
    viewport: { width: 400, height: 300 },
    camera3d: { position: vec3(0, 0, 10), near: 0.1, far: 100 },
  });
  const cube = scene.world.spawn();
  scene.world.add(cube, Transform3D);
  scene.world.add(cube, MeshRenderer, { mesh: "cube" });
  const panel = scene.createEntity({ position: { x: 50, y: 50 } });
  scene.world.add(panel, RectShape, { width: 10, height: 10 });
  return new RuntimeSession({ scene });
}

Deno.test("play mode draw lists contain both sprites and meshes", () => {
  const frame = mixedSession().drawList();
  assertEquals(frame.commands[0].kind, "clear");
  assertEquals(frame.commands.filter((command) => command.kind === "triangle").length, 2);
  assertEquals(frame.commands.filter((command) => command.kind === "rect").length, 1);
});

Deno.test("play mode draw stats count both pipelines", () => {
  const frame = mixedSession().drawList();
  // One 2D rect plus the cube's two front-face triangles.
  assertEquals(frame.stats.drawn, 3);
});

Deno.test("play mode forwards the background option to the frame builder", () => {
  const frame = mixedSession().drawList({ background: false });
  assertEquals(frame.commands.some((command) => command.kind === "clear"), false);
  assertEquals(frame.stats.drawn, 3);
});
