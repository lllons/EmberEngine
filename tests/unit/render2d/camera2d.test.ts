/** Camera2D: world/screen mapping, framing clamps, zoom anchoring and follow. */

import { type Camera2DState, Scene, Transform, vec2 } from "@ember/core";
import {
  Camera2DController,
  clampCameraToBounds,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAtScreenPoint,
} from "@ember/render2d";
import { assert, assertEqual, near, table, vecNear } from "../../harness.ts";

function camera(overrides: Partial<Camera2DState> = {}): Camera2DState {
  return {
    position: vec2(100, 50),
    zoom: 1,
    smoothing: 0,
    bounds: null,
    follow: null,
    ...overrides,
  };
}

const VIEWPORT = { width: 800, height: 600 };

table("render2d/camera worldToScreen", [
  { label: "camera centre", world: vec2(100, 50), expected: vec2(400, 300) },
  { label: "to the right", world: vec2(110, 50), expected: vec2(410, 300) },
  { label: "below", world: vec2(100, 60), expected: vec2(400, 310) },
  { label: "up and left", world: vec2(90, 40), expected: vec2(390, 290) },
] as const, (row) => {
  vecNear(worldToScreen(camera(), VIEWPORT, row.world), row.expected, 1e-12, row.label);
});

table("render2d/camera worldToScreen zoom", [
  { label: "zoom 2 doubles the offset", zoom: 2, world: vec2(110, 50), expected: vec2(420, 300) },
  { label: "zoom 0.5 halves it", zoom: 0.5, world: vec2(120, 50), expected: vec2(410, 300) },
  { label: "zoom applies to y too", zoom: 3, world: vec2(100, 60), expected: vec2(400, 330) },
] as const, (row) => {
  vecNear(
    worldToScreen(camera({ zoom: row.zoom }), VIEWPORT, row.world),
    row.expected,
    1e-12,
    row.label,
  );
});

Deno.test("render2d/camera screenToWorld inverts worldToScreen", () => {
  for (const zoom of [0.5, 1, 2.5]) {
    const state = camera({ zoom, position: vec2(-30, 12) });
    for (const worldPoint of [vec2(0, 0), vec2(100, -40), vec2(-250, 300)]) {
      const screen = worldToScreen(state, VIEWPORT, worldPoint);
      vecNear(screenToWorld(state, VIEWPORT, screen), worldPoint, 1e-9, `zoom ${zoom}`);
    }
  }
});

table("render2d/camera visibleWorldRect", [
  {
    label: "zoom 1",
    zoom: 1,
    expected: { x: -300, y: -250, w: 800, h: 600 },
  },
  {
    label: "zoom 2",
    zoom: 2,
    expected: { x: -100, y: -100, w: 400, h: 300 },
  },
  {
    label: "zoom 0.5",
    zoom: 0.5,
    expected: { x: -700, y: -550, w: 1600, h: 1200 },
  },
] as const, (row) => {
  assertEqual(visibleWorldRect(camera({ zoom: row.zoom }), VIEWPORT), row.expected, row.label);
});

table("render2d/camera clampCameraToBounds", [
  {
    label: "inside the bounds",
    position: vec2(500, 300),
    bounds: { x: 0, y: 0, w: 1000, h: 600 },
    zoom: 1,
    expected: vec2(500, 300),
  },
  {
    label: "clamps left edge",
    position: vec2(0, 300),
    bounds: { x: 0, y: 0, w: 1000, h: 600 },
    zoom: 1,
    expected: vec2(400, 300),
  },
  {
    label: "clamps right edge",
    position: vec2(1000, 300),
    bounds: { x: 0, y: 0, w: 1000, h: 600 },
    zoom: 1,
    expected: vec2(600, 300),
  },
  {
    label: "clamps beyond the right edge",
    position: vec2(5000, 300),
    bounds: { x: 0, y: 0, w: 1000, h: 600 },
    zoom: 1,
    expected: vec2(600, 300),
  },
  {
    label: "zoom 2 narrows the allowed range",
    position: vec2(0, 300),
    bounds: { x: 0, y: 0, w: 1000, h: 600 },
    zoom: 2,
    expected: vec2(200, 300),
  },
  {
    label: "view wider than the bounds centres",
    position: vec2(0, 0),
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    zoom: 1,
    expected: vec2(50, 50),
  },
] as const, (row) => {
  vecNear(
    clampCameraToBounds(row.position, row.bounds, VIEWPORT, row.zoom),
    row.expected,
    1e-9,
    row.label,
  );
});

Deno.test("render2d/camera zoomAtScreenPoint keeps the anchored world point still", () => {
  const state = camera({ zoom: 1, position: vec2(50, 40) });
  const anchor = vec2(700, 120);
  const before = screenToWorld(state, VIEWPORT, anchor);
  for (const factor of [2, 0.5, 1.5]) {
    const zoomed = zoomAtScreenPoint(state, VIEWPORT, anchor, factor);
    vecNear(screenToWorld(zoomed, VIEWPORT, anchor), before, 1e-9, `factor ${factor}`);
  }
});

Deno.test("render2d/camera zoomAtScreenPoint clamps to the default limits", () => {
  const state = camera();
  const zoomedIn = zoomAtScreenPoint(state, VIEWPORT, vec2(400, 300), 100);
  near(zoomedIn.zoom, 4, 0, "max zoom");
  const zoomedOut = zoomAtScreenPoint(state, VIEWPORT, vec2(400, 300), 0.0001);
  near(zoomedOut.zoom, 0.25, 0, "min zoom");
});

Deno.test("render2d/camera zoomAtScreenPoint honours custom limits and never mutates", () => {
  const state = camera({ zoom: 1 });
  const zoomed = zoomAtScreenPoint(state, VIEWPORT, vec2(0, 0), 2, { min: 1.5, max: 2 });
  near(zoomed.zoom, 2, 0, "zoom");
  near(state.zoom, 1, 0, "input camera must not change");
  assert(zoomed !== state, "zoom must return a new state object");
});

Deno.test("render2d/camera controller maps points through its viewport", () => {
  const controller = new Camera2DController(camera(), VIEWPORT);
  vecNear(controller.worldToScreen(vec2(100, 50)), vec2(400, 300), 1e-12, "to screen");
  vecNear(controller.screenToWorld(vec2(400, 300)), vec2(100, 50), 1e-12, "to world");
});

Deno.test("render2d/camera controller copies the viewport on setViewport", () => {
  const controller = new Camera2DController(camera(), VIEWPORT);
  const viewport = { width: 320, height: 240 };
  controller.setViewport(viewport);
  viewport.width = 999;
  near(controller.viewport.width, 320, 0, "viewport must be copied");
  assertEqual(controller.visibleRect(), { x: -60, y: -70, w: 320, h: 240 });
});

table("render2d/camera controller padding", [
  { label: "zero padding", padding: 0, expected: { x: -300, y: -250, w: 800, h: 600 } },
  { label: "positive padding", padding: 10, expected: { x: -310, y: -260, w: 820, h: 620 } },
  { label: "negative padding", padding: -100, expected: { x: -200, y: -150, w: 600, h: 400 } },
] as const, (row) => {
  const controller = new Camera2DController(camera(), VIEWPORT);
  assertEqual(controller.visibleRectPadded(row.padding), row.expected, row.label);
});

Deno.test("render2d/camera controller snapTo clamps to bounds by default", () => {
  const controller = new Camera2DController(
    camera({ bounds: { x: 0, y: 0, w: 1000, h: 600 } }),
    VIEWPORT,
  );
  controller.snapTo(vec2(-100, 50));
  vecNear(controller.state.position, vec2(400, 300), 1e-9, "clamped");
  controller.snapTo(vec2(-100, 50), false);
  vecNear(controller.state.position, vec2(-100, 50), 1e-9, "unclamped");
});

Deno.test("render2d/camera controller zoomBy anchors at the centre by default", () => {
  const controller = new Camera2DController(camera(), VIEWPORT);
  controller.zoomBy(2);
  near(controller.state.zoom, 2, 1e-12, "zoom");
  vecNear(controller.state.position, vec2(100, 50), 1e-9, "centre anchor keeps position");
});

Deno.test("render2d/camera controller follows an entity and snaps at smoothing 0", () => {
  const scene = new Scene();
  const hero = scene.createEntity({ position: vec2(500, 400) });
  const state = camera({ smoothing: 0, follow: hero });
  const controller = new Camera2DController(state, VIEWPORT);
  controller.update(scene, 1 / 60);
  vecNear(state.position, vec2(500, 400), 1e-9, "position");
});

Deno.test("render2d/camera controller smooths toward the follow target", () => {
  const scene = new Scene();
  const hero = scene.createEntity({ position: vec2(200, 100) });
  const state = camera({ smoothing: 0.5, follow: hero, position: vec2(0, 0) });
  const controller = new Camera2DController(state, VIEWPORT);
  controller.update(scene, 0.1);
  const expected = 0 + (200 - 0) * (1 - Math.exp(-0.1 / 0.5));
  near(state.position.x, expected, 1e-9, "smoothed x");
  near(state.position.y, (0 + (100 - 0) * (1 - Math.exp(-0.1 / 0.5))), 1e-9, "smoothed y");
});

Deno.test("render2d/camera controller clamps after following", () => {
  const scene = new Scene();
  const hero = scene.createEntity({ position: vec2(-500, 400) });
  const state = camera({
    smoothing: 0,
    follow: hero,
    bounds: { x: 0, y: 0, w: 1000, h: 600 },
  });
  const controller = new Camera2DController(state, VIEWPORT);
  controller.update(scene, 1 / 60);
  // Viewport is 800x600 over a 1000x600 world: x may range [400, 600] while the
  // view is exactly as tall as the stage, so y is pinned to the bounds centre (300).
  vecNear(state.position, vec2(400, 300), 1e-9, "clamped follow");
  const transform = scene.world.get(hero, Transform);
  if (!transform) throw new Error("expected the hero to keep its transform");
  transform.position = vec2(5000, -5000);
  controller.update(scene, 1 / 60);
  vecNear(state.position, vec2(600, 300), 1e-9, "clamped follow past the far edge");
});

Deno.test("render2d/camera controller ignores bounds when asked", () => {
  const scene = new Scene();
  const hero = scene.createEntity({ position: vec2(-500, 400) });
  const state = camera({
    smoothing: 0,
    follow: hero,
    bounds: { x: 0, y: 0, w: 1000, h: 600 },
  });
  const controller = new Camera2DController(state, VIEWPORT);
  controller.update(scene, 1 / 60, { clampToBounds: false });
  vecNear(state.position, vec2(-500, 400), 1e-9, "unclamped follow");
});

Deno.test("render2d/camera controller followTarget is undefined for dead entities", () => {
  const scene = new Scene();
  const hero = scene.createEntity({ position: vec2(0, 0) });
  const controller = new Camera2DController(camera({ follow: hero }), VIEWPORT);
  assert(controller.followTarget(scene) !== undefined, "live entity");
  scene.world.despawn(hero);
  assertEqual(controller.followTarget(scene), undefined, "dead entity");
  assertEqual(new Camera2DController(camera({ follow: null }), VIEWPORT).followTarget(scene), undefined, "free camera");
});
