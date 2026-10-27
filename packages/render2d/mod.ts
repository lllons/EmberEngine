/**
 * @ember/render2d — public surface of the 2D renderer.
 *
 * Pipeline: `Scene` + `Camera2DState` -> `buildDrawList` -> `DrawCommand[]` -> backend.
 * The command vocabulary and backends are shared with `@ember/render3d`, so a mixed
 * frame is still one draw list and one renderer. Nothing here touches a window, so every
 * stage is unit-testable.
 */

export * from "./commands.ts";
export * from "./build.ts";
export * from "./camera2d.ts";
export * from "./backends/canvas2d.ts";
