/**
 * @ember/render2d/camera2d — world/screen mapping and camera control.
 */

import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { type Camera2DState, Parent, Scene, rect, vec2 } from "@ember/core";
import {
  Camera2DController,
  clampCameraToBounds,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAtScreenPoint,
} from "@ember/render2d";

const viewport = { width: 800, height: 600 };

function camera(overrides: Partial<Camera2DState> = {}): Camera2DState {
  return {
    position: vec2(400, 300),
    zoom: 1,
    smoothing: 0,
    bounds: null,
    follow: null,
    ...overrides,
  };
}

Deno.test("worldToScreen: the camera centre maps to the viewport centre", () => {
  const point = worldToScreen(camera(), viewport, vec2(400, 300));
  assertEquals(point, vec2(400, 300));
});

Deno.test("worldToScreen: zoom scales offsets from the camera", () => {
  const point = worldToScreen(camera({ zoom: 2 }), viewport, vec2(450, 300));
  assertEquals(point, vec2(500, 300));
});

Deno.test("worldToScreen: moving the camera shifts the world the other way", () => {
  const point = worldToScreen(camera({ position: vec2(500, 300) }), viewport, vec2(400, 300));
  assertEquals(point, vec2(300, 300));
});

Deno.test("screenToWorld inverts worldToScreen", () => {
  for (const zoom of [0.5, 1, 2.5]) {
    for (const position of [vec2(0, 0), vec2(400, 300), vec2(-250, 640)]) {
      const cam = camera({ position, zoom });
      const world = vec2(123, -45);
      const roundTrip = screenToWorld(cam, viewport, worldToScreen(cam, viewport, world));
      assertAlmostEquals(roundTrip.x, world.x, 1e-9);
      assertAlmostEquals(roundTrip.y, world.y, 1e-9);
    }
  }
});

Deno.test("visibleWorldRect at zoom 1 equals the viewport size", () => {
  const visible = visibleWorldRect(camera(), viewport);
  assertEquals(visible, rect(0, 0, 800, 600));
});

Deno.test("visibleWorldRect shrinks as the camera zooms in", () => {
  const visible = visibleWorldRect(camera({ zoom: 2 }), viewport);
  assertEquals(visible, rect(200, 150, 400, 300));
});

Deno.test("visibleWorldRect grows as the camera zooms out", () => {
  const visible = visibleWorldRect(camera({ zoom: 0.5 }), viewport);
  assertEquals(visible, rect(-400, -300, 1600, 1200));
});

Deno.test("clampCameraToBounds keeps the view inside the bounds", () => {
  const bounds = rect(0, 0, 2000, 1000);
  assertEquals(clampCameraToBounds(vec2(-500, -500), bounds, viewport, 1), vec2(400, 300));
  assertEquals(clampCameraToBounds(vec2(5000, 5000), bounds, viewport, 1), vec2(1600, 700));
});

Deno.test("clampCameraToBounds passes through positions already inside", () => {
  const bounds = rect(0, 0, 2000, 1000);
  assertEquals(clampCameraToBounds(vec2(800, 500), bounds, viewport, 1), vec2(800, 500));
});

Deno.test("clampCameraToBounds centres the bounds when the view is larger", () => {
  const bounds = rect(100, 100, 200, 200);
  assertEquals(clampCameraToBounds(vec2(0, 0), bounds, viewport, 1), vec2(200, 200));
});

Deno.test("clampCameraToBounds accounts for zoom", () => {
  const bounds = rect(0, 0, 1000, 1000);
  assertEquals(clampCameraToBounds(vec2(0, 0), bounds, viewport, 2), vec2(200, 150));
});

Deno.test("zoomAtScreenPoint keeps the world point under the cursor fixed", () => {
  const anchor = vec2(200, 100);
  const before = screenToWorld(camera(), viewport, anchor);
  const zoomed = zoomAtScreenPoint(camera(), viewport, anchor, 2);
  const after = screenToWorld(zoomed, viewport, anchor);
  assertAlmostEquals(after.x, before.x, 1e-9);
  assertAlmostEquals(after.y, before.y, 1e-9);
  assertEquals(zoomed.zoom, 2);
});

Deno.test("zoomAtScreenPoint respects the zoom limits", () => {
  const zoomed = zoomAtScreenPoint(camera(), viewport, vec2(0, 0), 100, { min: 0.5, max: 3 });
  assertEquals(zoomed.zoom, 3);
  const shrunk = zoomAtScreenPoint(camera(), viewport, vec2(0, 0), 0.0001, { min: 0.5, max: 3 });
  assertEquals(shrunk.zoom, 0.5);
});

Deno.test("zoomAtScreenPoint leaves other camera fields untouched", () => {
  const source = camera({ bounds: rect(0, 0, 100, 100), follow: 7, smoothing: 0.5 });
  const zoomed = zoomAtScreenPoint(source, viewport, vec2(10, 10), 1.5);
  assertEquals(zoomed.bounds, source.bounds);
  assertEquals(zoomed.follow, 7);
  assertEquals(zoomed.smoothing, 0.5);
});

Deno.test("controller exposes the same mapping as the free functions", () => {
  const controller = new Camera2DController(camera(), viewport);
  assertEquals(controller.worldToScreen(vec2(400, 300)), vec2(400, 300));
  assertEquals(controller.screenToWorld(vec2(400, 300)), vec2(400, 300));
  assertEquals(controller.visibleRect(), rect(0, 0, 800, 600));
});

Deno.test("controller.setViewport copies the size", () => {
  const controller = new Camera2DController(camera(), viewport);
  const size = { width: 100, height: 50 };
  controller.setViewport(size);
  size.width = 999;
  assertEquals(controller.viewport.width, 100);
});

Deno.test("controller.visibleRectPadded grows the rect on all sides", () => {
  const controller = new Camera2DController(camera(), viewport);
  assertEquals(controller.visibleRectPadded(10), rect(-10, -10, 820, 620));
});

Deno.test("controller.snapTo moves instantly and applies bounds", () => {
  const controller = new Camera2DController(camera({ bounds: rect(0, 0, 1000, 1000) }), viewport);
  controller.snapTo(vec2(-100, -100));
  assertEquals(controller.state.position, vec2(400, 300));
});

Deno.test("controller.snapTo can skip the bounds clamp", () => {
  const controller = new Camera2DController(camera({ bounds: rect(0, 0, 1000, 1000) }), viewport);
  controller.snapTo(vec2(-100, -100), false);
  assertEquals(controller.state.position, vec2(-100, -100));
});

Deno.test("controller.zoomBy zooms around the viewport centre by default", () => {
  const controller = new Camera2DController(camera(), viewport);
  controller.zoomBy(2);
  assertEquals(controller.state.zoom, 2);
  assertEquals(controller.state.position, vec2(400, 300));
});

Deno.test("controller.zoomBy accepts an anchor", () => {
  const controller = new Camera2DController(camera(), viewport);
  const before = controller.screenToWorld(vec2(100, 100));
  controller.zoomBy(2, vec2(100, 100));
  const after = controller.screenToWorld(vec2(100, 100));
  assertAlmostEquals(after.x, before.x, 1e-9);
});

Deno.test("controller follows a target instantly when smoothing is zero", () => {
  const scene = new Scene({ viewport });
  const target = scene.createEntity({ position: vec2(1500, 900) });
  scene.resources.camera.smoothing = 0;
  scene.resources.camera.follow = target;
  const controller = new Camera2DController(scene.resources.camera, viewport);
  controller.update(scene, 1 / 60);
  assertEquals(controller.state.position, vec2(1500, 900));
});

Deno.test("controller follows with smoothing and converges over time", () => {
  const scene = new Scene({ viewport });
  const target = scene.createEntity({ position: vec2(1000, 300) });
  scene.resources.camera.follow = target;
  scene.resources.camera.smoothing = 0.2;
  const controller = new Camera2DController(scene.resources.camera, viewport);
  controller.update(scene, 1 / 60);
  const firstStep = controller.state.position.x;
  assert(firstStep > 400 && firstStep < 1000, `smoothed step should be partial, got ${firstStep}`);
  for (let i = 0; i < 300; i++) controller.update(scene, 1 / 60);
  assertAlmostEquals(controller.state.position.x, 1000, 1);
});

Deno.test("controller follows a parented entity through the hierarchy", () => {
  const scene = new Scene({ viewport });
  const parent = scene.createEntity({ position: vec2(500, 400) });
  const child = scene.createEntity({ position: vec2(50, -50) });
  scene.world.add(child, Parent, { entity: parent });
  scene.resources.camera.follow = child;
  const controller = new Camera2DController(scene.resources.camera, viewport);
  const target = controller.followTarget(scene)!;
  assertEquals(target, vec2(550, 350));
});

Deno.test("controller.followTarget is undefined without a follow entity", () => {
  const scene = new Scene({ viewport });
  const controller = new Camera2DController(scene.resources.camera, viewport);
  assertEquals(controller.followTarget(scene), undefined);
});

Deno.test("controller.followTarget is undefined for a despawned entity", () => {
  const scene = new Scene({ viewport });
  const target = scene.createEntity();
  scene.resources.camera.follow = target;
  scene.world.despawn(target);
  const controller = new Camera2DController(scene.resources.camera, viewport);
  assertEquals(controller.followTarget(scene), undefined);
});

Deno.test("controller clamps to scene bounds after following", () => {
  const scene = new Scene({ viewport });
  scene.resources.camera.bounds = rect(0, 0, 1200, 600);
  const target = scene.createEntity({ position: vec2(5000, 5000) });
  scene.resources.camera.follow = target;
  const controller = new Camera2DController(scene.resources.camera, viewport);
  controller.update(scene, 1 / 60);
  assertEquals(controller.state.position, vec2(800, 300));
});

Deno.test("controller.update can skip bounds clamping", () => {
  const scene = new Scene({ viewport });
  scene.resources.camera.bounds = rect(0, 0, 1200, 600);
  scene.resources.camera.smoothing = 0;
  const target = scene.createEntity({ position: vec2(5000, 5000) });
  scene.resources.camera.follow = target;
  const controller = new Camera2DController(scene.resources.camera, viewport);
  controller.update(scene, 1 / 60, { clampToBounds: false });
  assertEquals(controller.state.position, vec2(5000, 5000));
});

Deno.test("controller without a follow target only applies bounds", () => {
  const scene = new Scene({ viewport });
  scene.resources.camera.bounds = rect(0, 0, 1000, 1000);
  scene.resources.camera.position = vec2(-100, -100);
  const controller = new Camera2DController(scene.resources.camera, viewport);
  controller.update(scene, 1 / 60);
  assertEquals(controller.state.position, vec2(400, 300));
});
