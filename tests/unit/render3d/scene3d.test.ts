import { assertEquals } from "@std/assert";
import {
  MeshRenderer,
  roundTrips,
  Scene,
  sceneFromFileObject,
  sceneFromJson,
  sceneToJson,
  Transform3D,
  vec3,
} from "@ember/core";

Deno.test("camera3d and 3D components survive a scene round-trip", () => {
  const scene = new Scene({ name: "level-3d", camera3d: { position: vec3(1, 2, 3) } });
  const entity = scene.world.spawn();
  scene.world.add(entity, Transform3D, {
    position: vec3(4, 5, 6),
    rotation: vec3(0.1, 0.2, 0.3),
    scale: vec3(7, 8, 9),
  });
  scene.world.add(entity, MeshRenderer, { mesh: "pyramid", color: "#ff7a2f" });

  const restored = sceneFromJson(sceneToJson(scene));
  assertEquals(restored.resources.camera3d.position, vec3(1, 2, 3));
  assertEquals(restored.world.require(entity, Transform3D).position, vec3(4, 5, 6));
  assertEquals(restored.world.require(entity, MeshRenderer).mesh, "pyramid");
  assertEquals(restored.world.require(entity, MeshRenderer).color, "#ff7a2f");
  assertEquals(roundTrips(scene), true);
});

Deno.test("a scene file without camera3d loads the default 3D camera", () => {
  const scene = sceneFromFileObject({ name: "legacy", entities: [] });
  assertEquals(scene.resources.camera3d.target, vec3(0, 0, 0));
  assertEquals(scene.resources.camera3d.up, vec3(0, 1, 0));
  assertEquals(scene.resources.camera3d.near > 0, true);
  assertEquals(scene.resources.camera3d.far > scene.resources.camera3d.near, true);
});
