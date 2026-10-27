#!/usr/bin/env -S deno run -A --unstable-ffi
/**
 * `EmberMCP` — the EmberEngine MCP server, launched by a coding agent over stdio.
 *
 * Usage (usually written into the agent's MCP config, not typed by hand):
 *   deno run -A --unstable-ffi packages/mcp/main.ts [--game <dir>]
 *
 * `--game` sets the default game folder; without it, EMBER_GAME or `games/ember-runner`
 * is used relative to the process working directory.
 *
 * stdout is the protocol channel, so every diagnostic goes to stderr.
 */

import { startMcpServer } from "./server.ts";

function argument(name: string): string | undefined {
  const index = Deno.args.indexOf(name);
  if (index >= 0) return Deno.args[index + 1];
  const inline = Deno.args.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : undefined;
}

const game = argument("--game");
if (game) Deno.env.set("EMBER_GAME", game);

if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
  console.error(
    [
      "EmberMCP — Model Context Protocol server for EmberEngine",
      "",
      "usage: deno run -A --unstable-ffi packages/mcp/main.ts [--game <dir>]",
      "",
      "Speaks JSON-RPC over stdio. Configure it in your agent, for example:",
      '  { "mcpServers": { "emberengine": {',
      '      "command": "deno",',
      '      "args": ["run", "-A", "--unstable-ffi", "packages/mcp/main.ts"] } } }',
    ].join("\n"),
  );
  Deno.exit(0);
}

console.error("[ember-mcp] ready on stdio");
await startMcpServer({ log: (line) => console.error(`[ember-mcp] ${line}`) });
