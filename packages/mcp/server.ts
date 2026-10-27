/**
 * @ember/mcp/server — the Model Context Protocol server for EmberEngine.
 *
 * Owner: this file owns the MCP surface: handshake, capability advertisement and
 * `tools/list` / `tools/call` dispatch. Tools live in `tools.ts`; the wire format lives in
 * `protocol.ts`, so adding a tool never touches transport code.
 *
 * Any MCP client can launch it:
 *   { "command": "deno", "args": ["run", "-A", "--unstable-ffi", "packages/mcp/main.ts"] }
 * or point at a compiled `EmberMCP.exe`.
 *
 * Protocol version 2024-11-05 is the widely supported baseline; newer clients negotiate
 * down to it, so the server works with Claude Code, Cursor, Zed and the MCP Inspector.
 */

import {
  failure,
  type JsonRpcId,
  type JsonRpcRequest,
  LineTransport,
  parseRequest,
  RpcError,
  RpcProtocolError,
} from "./protocol.ts";
import { createEngineTools, type Tool } from "./tools.ts";

export const SERVER_NAME = "emberengine";
export const SERVER_VERSION = "0.1.0";
export const PROTOCOL_VERSION = "2024-11-05";

export const INSTRUCTIONS = [
  "EmberEngine is a 2D/3D TypeScript game engine whose projects are folders containing",
  "game.json, scenes/*.emberscene and src/*.ts.",
  "",
  "Start with engine_info, then scene_list and scene_read to see the current state.",
  "Scenes are JSON: entities have a Transform plus components such as RectShape,",
  "CircleShape, TextLabel, Sprite, MeshRenderer, Transform3D, BoxCollider, RigidBody,",
  "Velocity, Script and Tag. Use component_catalog for exact names and defaults.",
  "",
  "Edit with scene_create, entity_add, entity_update and entity_delete — they write the",
  ".emberscene files the editor and exported games use. Verify gameplay changes with",
  "simulate (it runs the real systems and scripts headlessly) and check inline JavaScript",
  "with script_check before saving it into a Script component.",
  "",
  "export_game builds a standalone .exe with the real export pipeline.",
].join("\n");

export interface McpServerOptions {
  tools?: readonly Tool[];
  /** Progress/log lines; must never be written to stdout or the protocol breaks. */
  log?: (line: string) => void;
}

export class McpServer {
  readonly tools: readonly Tool[];
  private readonly byName: Map<string, Tool>;
  private readonly log: (line: string) => void;

  constructor(options: McpServerOptions = {}) {
    this.tools = options.tools ?? createEngineTools();
    this.byName = new Map(this.tools.map((tool) => [tool.definition.name, tool]));
    this.log = options.log ?? ((line) => console.error(`[ember-mcp] ${line}`));
  }

  /** Handles one parsed request; notifications return null (no response). */
  async handle(request: JsonRpcRequest): Promise<object | null> {
    const isNotification = request.id === undefined;
    try {
      const result = await this.dispatch(request);
      // Notifications (no id) never get a reply, even on success.
      if (isNotification) return null;
      return { jsonrpc: "2.0", id: request.id ?? null, result };
    } catch (error) {
      const id = (request.id ?? null) as JsonRpcId;
      if (error instanceof RpcProtocolError) {
        if (isNotification) return null;
        return { jsonrpc: "2.0", id, error: { code: error.code, message: error.message } };
      }
      if (isNotification) return null;
      return failure(id, error);
    }
  }

  private async dispatch(request: JsonRpcRequest): Promise<unknown> {
    switch (request.method) {
      case "initialize":
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions: INSTRUCTIONS,
        };
      case "notifications/initialized":
        return null;
      case "ping":
        return {};
      case "tools/list":
        return {
          tools: this.tools.map((tool) => ({
            name: tool.definition.name,
            title: tool.definition.title,
            description: tool.definition.description,
            inputSchema: tool.definition.inputSchema,
          })),
        };
      case "tools/call":
        return await this.callTool(request.params);
      default:
        throw new RpcProtocolError(RpcError.methodNotFound, `unknown method "${request.method}"`);
    }
  }

  private async callTool(params: unknown): Promise<unknown> {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw new RpcProtocolError(RpcError.invalidParams, "tools/call needs an object with `name`");
    }
    const raw = params as Record<string, unknown>;
    const name = raw.name;
    if (typeof name !== "string" || !name) {
      throw new RpcProtocolError(RpcError.invalidParams, "tools/call needs a tool `name`");
    }
    const tool = this.byName.get(name);
    if (!tool) {
      throw new RpcProtocolError(RpcError.invalidParams, `unknown tool "${name}"`);
    }
    const args = raw.arguments === undefined ? {} : raw.arguments;
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      throw new RpcProtocolError(RpcError.invalidParams, "`arguments` must be an object");
    }
    try {
      const result = await tool.handler(args as Record<string, unknown>);
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        isError: result.isError === true,
      };
    } catch (error) {
      // Tool failures are results (not protocol errors) so the model can read and fix them.
      return {
        content: [{ type: "text", text: `error: ${(error as Error)?.message ?? String(error)}` }],
        isError: true,
      };
    }
  }

  /** Reads stdin until EOF, replying on stdout. Never throws for protocol mistakes. */
  async serve(transport: LineTransport = new LineTransport()): Promise<void> {
    for await (const line of transport.lines()) {
      if (line.trim().length === 0) continue;
      let request: JsonRpcRequest;
      try {
        request = parseRequest(line);
      } catch (error) {
        await transport.send(
          failure(null, error),
        );
        continue;
      }
      const response = await this.handle(request);
      if (response) await transport.send(response as Parameters<LineTransport["send"]>[0]);
    }
    await transport.close();
  }
}

/** Convenience entry used by `packages/mcp/main.ts` and the tests. */
export function startMcpServer(options: McpServerOptions = {}): Promise<void> {
  return new McpServer(options).serve();
}
