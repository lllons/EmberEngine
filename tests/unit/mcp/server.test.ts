/**
 * @ember/mcp — the MCP wire protocol and tool dispatch, without spawning a process.
 */

import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  LineTransport,
  McpServer,
  parseRequest,
  RpcProtocolError,
} from "@ember/mcp";

function memoryTransport(lines: readonly string[]): {
  transport: LineTransport;
  sent: () => Array<Record<string, unknown>>;
} {
  const chunks: Array<Record<string, unknown>> = [];
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
      controller.close();
    },
  });
  const output = new WritableStream<Uint8Array>({
    write(chunk) {
      for (const line of decoder.decode(chunk).split("\n")) {
        if (line.trim()) chunks.push(JSON.parse(line));
      }
    },
  });
  return { transport: new LineTransport(input, output), sent: () => chunks };
}

async function run(lines: readonly string[]): Promise<Array<Record<string, unknown>>> {
  const { transport, sent } = memoryTransport(lines);
  await new McpServer({ log: () => {} }).serve(transport);
  return sent();
}

Deno.test("mcp parses a request and rejects malformed input", () => {
  const request = parseRequest('{"jsonrpc":"2.0","id":7,"method":"ping"}');
  assertEquals(request.method, "ping");
  assertEquals(request.id, 7);

  try {
    parseRequest("{not json");
    assert(false, "malformed JSON should throw");
  } catch (error) {
    assertEquals((error as RpcProtocolError).code, -32700);
  }
});

Deno.test("mcp handshake advertises the protocol and its tools", async () => {
  const responses = await run([
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}',
    '{"jsonrpc":"2.0","method":"notifications/initialized"}',
    '{"jsonrpc":"2.0","id":2,"method":"tools/list"}',
  ]);
  assertEquals(responses.length, 2, "notifications never get a reply");
  const init = responses[0].result as Record<string, unknown>;
  assertEquals(init.protocolVersion, "2024-11-05");
  assertEquals((init.serverInfo as Record<string, unknown>).name, "emberengine");

  const tools = (responses[1].result as { tools: Array<{ name: string }> }).tools;
  const names = tools.map((tool) => tool.name);
  for (const expected of ["engine_info", "scene_list", "scene_read", "simulate", "export_game"]) {
    assert(names.includes(expected), `tool ${expected} is listed`);
  }
});

Deno.test("mcp reports unknown methods and unknown tools as errors", async () => {
  const responses = await run([
    '{"jsonrpc":"2.0","id":1,"method":"nope"}',
    '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"nope","arguments":{}}}',
  ]);
  assertEquals((responses[0].error as Record<string, unknown>).code, -32601);
  assertEquals((responses[1].error as Record<string, unknown>).code, -32602);
});

Deno.test("mcp tool failures are readable results, not protocol errors", async () => {
  const responses = await run([
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"scene_read","arguments":{"scene":"does-not-exist"}}}',
  ]);
  assertFalse("error" in responses[0], "a tool failure is not a protocol error");
  const result = responses[0].result as Record<string, unknown>;
  assertEquals(result.isError, true);
  const text = (result.content as Array<{ text: string }>)[0].text;
  assert(text.includes("no scene"), `error text names the problem: ${text}`);
});

Deno.test("mcp script_check accepts a hook object and reports syntax errors", async () => {
  const responses = await run([
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"script_check","arguments":{"source":"({ update(ctx) { return ctx.dt; } })"}}}',
    '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"script_check","arguments":{"source":"({ update( })"}}}',
  ]);
  const ok = JSON.parse((responses[0].result as { content: Array<{ text: string }> }).content[0].text);
  assertEquals(ok.ok, true);
  assert(ok.hooks.includes("update"));

  const bad = responses[1].result as { isError?: boolean };
  assertEquals(bad.isError, true);
});
