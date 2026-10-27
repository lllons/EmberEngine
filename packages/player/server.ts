/**
 * @ember/player/server — the local server an exported game serves itself from.
 *
 * Owner: this file owns the player's HTTP surface. The compiled `.exe` has no windowing
 * toolkit, so it serves its own self-contained page on loopback and opens the default
 * browser — the approach web exports take when they must ship as a single binary.
 * Everything the page needs (bundle JSON plus the bundled app module) is embedded in the
 * executable, so an export runs with no files beside it.
 */

import type { PlayerBundle } from "./bundle.ts";
import { bundleSceneNames, describeBundle } from "./bundle.ts";

export interface PlayerServerOptions {
  bundle: PlayerBundle;
  /** Bundled browser module (engine + game) served at `/app.js`. */
  appSource: string;
  /** 0 or omitted lets the OS choose a free port. */
  port?: number;
  hostname?: string;
}

export interface PlayerServer {
  url: string;
  port: number;
  hostname: string;
  /** Number of requests served; tests use this to prove the page was fetched. */
  readonly requests: number;
  /** Serves a request; exposed so tests can call it without a socket. */
  handle(request: Request): Promise<Response>;
  stop(): Promise<void>;
}

const CONTENT_TYPES = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  text: "text/plain; charset=utf-8",
} as const;

/** Starts the player server and resolves once it is actually listening. */
export async function startPlayerServer(options: PlayerServerOptions): Promise<PlayerServer> {
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;
  let requests = 0;

  const serve = (request: Request): Promise<Response> => {
    requests++;
    return handleRequest(request, options);
  };

  // `onListen` fires while `Deno.serve` is still running, so it may only hand back the
  // address; the server object is captured afterwards. Touching `httpServer` from inside
  // the callback would read it before its initializer completes (a TDZ crash in the exe).
  let httpServer: Deno.HttpServer | undefined;
  const address = await new Promise<Deno.NetAddr>((resolve) => {
    httpServer = Deno.serve(
      {
        hostname,
        port,
        onListen: (addr) => resolve(addr as Deno.NetAddr),
      },
      serve,
    );
  });
  const server = httpServer;
  if (!server) throw new Error("player server failed to start");

  return {
    url: `http://${hostname}:${address.port}`,
    port: address.port,
    hostname,
    get requests() {
      return requests;
    },
    handle: serve,
    stop: async () => {
      await server.shutdown();
    },
  };
}

/** Routes: the page, the app module, the bundle, a health probe and a text summary. */
export async function handleRequest(
  request: Request,
  options: Pick<PlayerServerOptions, "bundle" | "appSource">,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  switch (path) {
    case "/":
    case "/index.html":
      return respond(playerPageHtml(options.bundle), CONTENT_TYPES.html);
    case "/app.js":
      return respond(options.appSource, CONTENT_TYPES.js);
    case "/game.json":
      return respond(JSON.stringify(options.bundle), CONTENT_TYPES.json);
    case "/health":
      return respond(
        JSON.stringify({
          ok: true,
          game: options.bundle.game,
          scenes: bundleSceneNames(options.bundle),
        }),
        CONTENT_TYPES.json,
      );
    case "/bundle.txt":
      return respond(describeBundle(options.bundle), CONTENT_TYPES.text);
    default:
      return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  }
}

function respond(body: string, contentType: string): Response {
  return new Response(body, {
    headers: { "content-type": contentType, "cache-control": "no-store" },
  });
}

/** The exported game's page. Styling is inline so an export ships no extra files. */
export function playerPageHtml(bundle: PlayerBundle): string {
  const title = escapeHtml(bundle.game.title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  html, body { margin: 0; height: 100%; background: #05070c; color: #e7ecf6; }
  #boot { position: fixed; inset: 0; display: grid; place-items: center; font: 14px 'Segoe UI', system-ui, sans-serif; }
  #boot p { color: #8b93a7; }
</style>
</head>
<body>
<div id="boot"><p>loading ${title}…</p></div>
<script type="module" src="/app.js"></script>
</body>
</html>
`;
}

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
        character,
  );
}
