/**
 * @ember/studio — the Ember editor ("Ember Studio").
 *
 * Layer: hosts only. The editor depends on `@ember/core`, `@ember/render2d`,
 * `@ember/runtime`, `@ember/assets` and `@ember/packager`; nothing depends on the editor.
 *
 * - `server.ts`  the local HTTP server and JSON API (scene I/O, simulate, export)
 * - `app/*`      the browser UI (panels, viewport, inspector) bundled on demand
 */

export * from "./server.ts";
