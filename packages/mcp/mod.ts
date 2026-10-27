/**
 * @ember/mcp — the EmberEngine Model Context Protocol server.
 *
 * Layer: hosts only. It depends on `@ember/core`, `@ember/gameloader`,
 * `@ember/runtime` and `@ember/packager`; nothing depends on it.
 *
 * - `protocol.ts`  JSON-RPC 2.0 over newline-delimited stdio
 * - `tools.ts`     the engine actions an agent can call (scenes, entities, simulate, export)
 * - `server.ts`    handshake and `tools/list` / `tools/call` dispatch
 */

export * from "./protocol.ts";
export * from "./tools.ts";
export * from "./server.ts";
