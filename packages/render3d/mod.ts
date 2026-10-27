/**
 * @ember/render3d — public surface of the 3D renderer.
 *
 * Pipeline: `Scene` + `Camera3DState` -> `build3DCommands` -> triangle commands.
 * `buildFrame` merges the 2D and 3D pipelines into one ordered draw list, so a scene can
 * contain sprites, meshes, or both. Nothing here touches a window: every stage is pure
 * and unit-testable, and the same `canvas2d` backend rasterises the result.
 */

export * from "./mesh.ts";
export * from "./camera3d.ts";
export * from "./build3d.ts";
export * from "./compose.ts";
