import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import {
  type Camera3DState,
  Colors,
  luminance,
  MeshRenderer,
  Parent,
  Scene,
  Transform3D,
  vec3,
  Visibility,
} from "@ember/core";
import { build3DCommands, DEFAULT_LIGHT_DIRECTION, shadeColor } from "@ember/render3d";

const VIEWPORT = { width: 800, height: 600 };

function cameraAt(z: number, overrides: Partial<Camera3DState> = {}): Camera3DState {
  return {
    position: vec3(0, 0, z),
    target: vec3(0, 0, 0),
    up: vec3(0, 1, 0),
    fov: Math.PI / 3,
    near: 0.1,
    far: 100,
    ...overrides,
  };
}

function meshScene(mesh = "cube", layer = 0): { scene: Scene; entity: number } {
  const scene = new Scene({ viewport: VIEWPORT });
  const entity = scene.world.spawn();
  scene.world.add(entity, Transform3D);
  scene.world.add(entity, MeshRenderer, { mesh, layer });
  return { scene, entity };
}

Deno.test("a cube facing the camera keeps only its front face", () => {
  const { scene } = meshScene();
  const frame = build3DCommands(scene, { camera: cameraAt(10) });
  assertEquals(frame.commands.length, 2);
  assertEquals(frame.stats.considered, 1);
  assertEquals(frame.stats.drawn, 2);
  assertEquals(frame.stats.culled, 10);
  assertEquals(frame.stats.clipped, 0);
});

Deno.test("doubleSided renders all twelve cube triangles", () => {
  const { scene, entity } = meshScene();
  scene.world.set(entity, MeshRenderer, { doubleSided: true });
  const frame = build3DCommands(scene, { camera: cameraAt(10) });
  assertEquals(frame.commands.length, 12);
  assertEquals(frame.stats.culled, 0);
});

Deno.test("cullBackfaces false renders backfaces for every mesh", () => {
  const { scene } = meshScene();
  const frame = build3DCommands(scene, { camera: cameraAt(10), cullBackfaces: false });
  assertEquals(frame.commands.length, 12);
  assertEquals(frame.stats.culled, 0);
});

Deno.test("build3DCommands defaults to the scene's camera3d resource", () => {
  const { scene } = meshScene();
  scene.resources.camera3d = cameraAt(10);
  const frame = build3DCommands(scene);
  assertEquals(frame.commands.length, 2);
});

Deno.test("triangles are sorted farthest first", () => {
  const scene = new Scene({ viewport: VIEWPORT });
  for (const z of [0, -5, 3]) {
    const entity = scene.world.spawn();
    scene.world.add(entity, Transform3D, { position: vec3(0, 0, z) });
    scene.world.add(entity, MeshRenderer, { mesh: "quad", doubleSided: true });
  }
  const frame = build3DCommands(scene, {
    camera: cameraAt(10, { position: vec3(0, 10, 10), target: vec3(0, 0, 0) }),
  });
  for (let i = 1; i < frame.commands.length; i++) {
    assert(
      frame.commands[i - 1].depth >= frame.commands[i].depth,
      `depth went up at command ${i}`,
    );
  }
});

Deno.test("commands carry the source entity, layer and world position", () => {
  const { scene, entity } = meshScene("cube", 7);
  const frame = build3DCommands(scene, { camera: cameraAt(10) });
  assert(frame.commands.length > 0);
  for (const command of frame.commands) {
    assertEquals(command.entity, entity);
    assertEquals(command.layer, 7);
    assertEquals(command.filled, true);
    assertEquals(command.alpha, 1);
  }
  // The front face sits at z = +0.5, i.e. 9.5 units from an eye at z = 10.
  for (const command of frame.commands) assertAlmostEquals(command.depth, 9.5, 1e-9);
});

Deno.test("flat shading darkens the base colour without changing alpha", () => {
  const { scene, entity } = meshScene();
  scene.world.set(entity, MeshRenderer, { color: Colors.white });
  const frame = build3DCommands(scene, { camera: cameraAt(10) });
  assert(frame.commands.length > 0);
  const shaded = frame.commands[0].color;
  assert(luminance(shaded) < luminance(Colors.white));
  assert(luminance(shaded) > 0);
  // Every front-face triangle has the same normal, so the same shade.
  assertEquals(frame.commands[1].color, shaded);
  assertEquals(frame.commands[0].alpha, 1);
});

Deno.test("shadeColor hits black and white at the ends and is monotonic", () => {
  assertEquals(shadeColor("#ffffff", 0), "rgba(0, 0, 0, 1)");
  assertEquals(shadeColor("#ffffff", 1), "rgba(255, 255, 255, 1)");
  const dark = luminance(shadeColor("#808080", 0.25));
  const mid = luminance(shadeColor("#808080", 0.5));
  const bright = luminance(shadeColor("#808080", 1));
  assert(dark < mid && mid < bright);
});

Deno.test("the default light points up and towards the viewer", () => {
  assert(DEFAULT_LIGHT_DIRECTION.y > 0);
  assert(DEFAULT_LIGHT_DIRECTION.z > 0);
  assertAlmostEquals(
    Math.hypot(DEFAULT_LIGHT_DIRECTION.x, DEFAULT_LIGHT_DIRECTION.y, DEFAULT_LIGHT_DIRECTION.z),
    1,
    1e-9,
  );
});

Deno.test("wireframe can be forced by the option or set per renderer", () => {
  const { scene, entity } = meshScene();
  const forced = build3DCommands(scene, { camera: cameraAt(10), wireframe: true });
  assertEquals(forced.commands.every((command) => !command.filled), true);

  scene.world.set(entity, MeshRenderer, { wireframe: true });
  const perRenderer = build3DCommands(scene, { camera: cameraAt(10) });
  assertEquals(perRenderer.commands.every((command) => !command.filled), true);
});

Deno.test("triangles crossing the near plane are dropped and counted", () => {
  const { scene } = meshScene("triangle");
  const frame = build3DCommands(scene, {
    camera: cameraAt(0.4, { near: 0.5, target: vec3(0, 0, -1) }),
  });
  assertEquals(frame.commands.length, 0);
  assertEquals(frame.stats.clipped, 1);
});

Deno.test("an unregistered mesh is skipped and reported", () => {
  const { scene } = meshScene("not-a-mesh");
  const frame = build3DCommands(scene, { camera: cameraAt(10) });
  assertEquals(frame.commands.length, 0);
  assertEquals(frame.stats.missingMeshes, 1);
  assertEquals(frame.stats.drawn, 0);
});

Deno.test("hidden and fully transparent meshes emit nothing", () => {
  const hidden = meshScene();
  hidden.scene.world.add(hidden.entity, Visibility, { visible: false });
  const hiddenFrame = build3DCommands(hidden.scene, { camera: cameraAt(10) });
  assertEquals(hiddenFrame.commands.length, 0);
  assertEquals(hiddenFrame.stats.considered, 1);

  const transparent = meshScene();
  transparent.scene.world.set(transparent.entity, MeshRenderer, { alpha: 0 });
  assertEquals(
    build3DCommands(transparent.scene, { camera: cameraAt(10) }).commands.length,
    0,
  );
});

Deno.test("rotating a cube exposes more faces", () => {
  const { scene, entity } = meshScene();
  scene.world.set(entity, Transform3D, { rotation: vec3(0, Math.PI / 4, 0) });
  const frame = build3DCommands(scene, { camera: cameraAt(10) });
  assertEquals(frame.commands.length, 4);
});

Deno.test("a parent Transform3D offsets its child", () => {
  const scene = new Scene({ viewport: VIEWPORT });
  const parent = scene.world.spawn();
  scene.world.add(parent, Transform3D, { position: vec3(0, 0, -20) });
  const child = scene.world.spawn();
  scene.world.add(child, Transform3D);
  scene.world.add(child, Parent, { entity: parent });
  scene.world.add(child, MeshRenderer, { mesh: "cube" });

  const frame = build3DCommands(scene, { camera: cameraAt(10) });
  assertEquals(frame.commands.length, 2);
  for (const command of frame.commands) assertAlmostEquals(command.depth, 29.5, 1e-9);
});

Deno.test("an entity without Transform3D is not drawn by the 3D pipeline", () => {
  const scene = new Scene({ viewport: VIEWPORT });
  const entity = scene.createEntity({ name: "flat" });
  scene.world.add(entity, MeshRenderer, { mesh: "cube" });
  const frame = build3DCommands(scene, { camera: cameraAt(10) });
  assertEquals(frame.commands.length, 0);
  assertEquals(frame.stats.considered, 0);
});

Deno.test("build3DCommands is deterministic for the same scene", () => {
  const { scene } = meshScene();
  scene.world.set(1, Transform3D, { rotation: vec3(0.3, 0.4, 0.5) });
  const first = build3DCommands(scene, { camera: cameraAt(10) });
  const second = build3DCommands(scene, { camera: cameraAt(10) });
  assertEquals(first.commands, second.commands);
});
