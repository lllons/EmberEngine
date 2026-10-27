/**
 * @ember/player — the exported game runtime.
 *
 * Pieces:
 * - `bundle.ts`  the payload embedded in an exported `.exe`
 * - `server.ts`  the loopback server that serves the game page
 * - `main.ts`    the CLI compiled into the executable (`--headless`, `--port`, …)
 * - `app/*`      the browser side: canvas factory, host (input + loop) and bootstrap
 *
 * The browser files are only imported by bundled entries; importing them in Deno is fine
 * (they compile against the DOM types Deno ships) but they must not run outside a browser.
 */

export * from "./bundle.ts";
export * from "./server.ts";
export * from "./main.ts";
