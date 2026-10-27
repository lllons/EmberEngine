/**
 * @ember/mcp/protocol — JSON-RPC 2.0 over newline-delimited stdio.
 *
 * Owner: this file owns the wire format of the MCP server. It is deliberately dependency
 * free: Model Context Protocol clients (Claude Code, Cursor, Zed, …) speak JSON-RPC and
 * expect one JSON object per line on stdin/stdout.
 *
 * Nothing here writes to stdout except `LineTransport.send`, so a game module that logs
 * during import cannot corrupt the protocol.
 */

export type JsonRpcId = number | string | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: JsonRpcError;
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

/** JSON-RPC error codes plus the MCP-specific ones. */
export const RpcError = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

export function parseRequest(line: string): JsonRpcRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new RpcProtocolError(RpcError.parse, `invalid JSON: ${(error as Error).message}`);
  }
  return validateRequest(parsed);
}

/** Structural check for a JSON-RPC request; batches are not part of MCP. */
export function validateRequest(value: unknown): JsonRpcRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RpcProtocolError(RpcError.invalidRequest, "request must be a JSON object");
  }
  const raw = value as Record<string, unknown>;
  if (raw.jsonrpc !== "2.0") {
    throw new RpcProtocolError(RpcError.invalidRequest, 'jsonrpc must be "2.0"');
  }
  if (typeof raw.method !== "string" || raw.method.length === 0) {
    throw new RpcProtocolError(RpcError.invalidRequest, "method must be a non-empty string");
  }
  if (raw.id !== undefined && raw.id !== null && typeof raw.id !== "string" && typeof raw.id !== "number") {
    throw new RpcProtocolError(RpcError.invalidRequest, "id must be a string, number or null");
  }
  return {
    jsonrpc: "2.0",
    id: raw.id as JsonRpcId | undefined,
    method: raw.method,
    params: raw.params,
  };
}

export class RpcProtocolError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcProtocolError";
    this.code = code;
    this.data = data;
  }
}

export class LineTransport {
  readonly input: ReadableStream<Uint8Array>;
  readonly output: WritableStream<Uint8Array>;
  readonly encoder = new TextEncoder();
  readonly decoder = new TextDecoder();
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  constructor(
    input: ReadableStream<Uint8Array> = Deno.stdin.readable,
    output: WritableStream<Uint8Array> = Deno.stdout.writable,
  ) {
    this.input = input;
    this.output = output;
  }

  /** Yields every complete line, skipping blank ones. */
  async *lines(): AsyncGenerator<string> {
    const reader = this.input.getReader();
    let buffered = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += this.decoder.decode(value, { stream: true });
        let newline = buffered.indexOf("\n");
        while (newline >= 0) {
          yield buffered.slice(0, newline).replace(/\r$/, "");
          buffered = buffered.slice(newline + 1);
          newline = buffered.indexOf("\n");
        }
      }
      buffered += this.decoder.decode();
      if (buffered.trim().length > 0) yield buffered.replace(/\r$/, "");
    } finally {
      reader.releaseLock();
    }
  }

  async send(message: JsonRpcResponse): Promise<void> {
    this.writer ??= this.output.getWriter();
    await this.writer.write(this.encoder.encode(`${JSON.stringify(message)}\n`));
  }

  async close(): Promise<void> {
    await this.writer?.close();
    this.writer = null;
  }
}

/** Wraps a handler error as a JSON-RPC failure, keeping the original message. */
export function failure(id: JsonRpcId, error: unknown): JsonRpcFailure {
  if (error instanceof RpcProtocolError) {
    return { jsonrpc: "2.0", id, error: { code: error.code, message: error.message, data: error.data } };
  }
  return {
    jsonrpc: "2.0",
    id,
    error: { code: RpcError.internal, message: (error as Error)?.message ?? String(error) },
  };
}
