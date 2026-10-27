/**
 * @ember/player/host — the loopback window host.
 *
 * Owner: this file owns "how a game reaches a window on the player's machine". It serves
 * one page plus the bundled player over `127.0.0.1`, opens the default browser at that
 * URL, and records the frame reports the page posts back so the CLI and the tests can
 * prove a frame was actually painted.
 *
 * Deliberately free of engine imports: the exported `.exe` compiles this file with
 * `deno compile`, so it must stay small and dependency-free.
 */

export interface PlayerHostOptions {
  title: string;
  /** Bundled player JavaScript (ES module, self-contained). */
  js: string;
  width: number;
  height: number;
  /** Fixed port; 0 asks the OS for a free one. */
  port?: number;
  /** Open the default browser at the served URL. */
  open?: boolean;
}

export interface FrameReportLike {
  frames?: number;
  draws?: number;
  entities?: number;
  time?: number;
  paintedPixels?: number;
  samples?: string[];
}

export interface PlayerStatus {
  game: string;
  width: number;
  height: number;
  url: string;
  startedAt: string;
  bundleBytes: number;
  /** Frame reports received from the page. */
  reports: number;
  /** Set once a frame report has arrived. */
  frame: FrameReportLike | null;
}

export interface PlayerHost {
  url: string;
  port: number;
  status(): PlayerStatus;
  /** Resolves once the server has stopped listening. */
  stop(): Promise<void>;
}

export function playerHtml(title: string, width: number, height: number): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0b0d12; color: #c9d1e3;
    font: 13px/1.4 "Segoe UI", system-ui, sans-serif; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
  header { display: flex; gap: 10px; align-items: baseline; opacity: .85; }
  header b { color: #ff7a2f; letter-spacing: .04em; }
  canvas { width: min(96vw, ${width}px); height: auto; aspect-ratio: ${width} / ${height};
    background: #10131a; border-radius: 6px; box-shadow: 0 12px 40px rgba(0,0,0,.55);
    outline: 1px solid #232a3a; }
  footer { opacity: .55; font-size: 12px; }
  #error { display: none; max-width: min(92vw, ${width}px); padding: 10px 12px; border-radius: 6px;
    background: #35121a; border: 1px solid #7a2436; color: #ffb3c0; white-space: pre-wrap;
    font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
  #error.on { display: block; }
</style>
</head>
<body>
<header><b>EMBER</b><span>${
    escapeHtml(title)
  }</span><span style="opacity:.5">${width}×${height}</span></header>
<canvas id="ember-canvas" width="${width}" height="${height}"></canvas>
<div id="error"></div>
<footer>Arrow keys / A D to move · Space to jump</footer>
<script>
  addEventListener("error", (event) => {
    const box = document.getElementById("error");
    box.textContent = "Player error: " + (event.error?.stack || event.message);
    box.classList.add("on");
  });
  addEventListener("unhandledrejection", (event) => {
    const box = document.getElementById("error");
    box.textContent = "Player error: " + (event.reason?.stack || event.reason);
    box.classList.add("on");
  });
</script>
<script type="module" src="/player.js"></script>
</body>
</html>`;
}

/** Starts the loopback host. `port: 0` (default) lets the OS choose. */
export function servePlayer(options: PlayerHostOptions): PlayerHost {
  const startedAt = new Date().toISOString();
  const html = playerHtml(options.title, options.width, options.height);
  const bytes = new TextEncoder().encode(options.js);
  let reports = 0;
  let frame: FrameReportLike | null = null;
  let url = "";

  const server = Deno.serve(
    {
      hostname: "127.0.0.1",
      port: options.port ?? 0,
      // The page polls nothing; these headers are for the CLI/self-check probes.
      onListen: (addr) => {
        const host = addr.hostname === "0.0.0.0" || addr.hostname === "::"
          ? "127.0.0.1"
          : addr.hostname;
        url = `http://${host}:${addr.port}/`;
      },
    },
    async (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/") {
        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
      if (path === "/player.js") {
        return new Response(bytes, {
          headers: {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      if (path === "/api/status") {
        return json({ ...status(), frame });
      }
      if (path === "/api/frame" && request.method === "POST") {
        try {
          frame = (await request.json()) as FrameReportLike;
          reports += 1;
        } catch {
          return json({ ok: false, error: "frame report must be JSON" }, 400);
        }
        return json({ ok: true, reports });
      }
      if (path === "/favicon.ico") return new Response(null, { status: 204 });
      return new Response("not found", { status: 404 });
    },
  );

  function status(): PlayerStatus {
    return {
      game: options.title,
      width: options.width,
      height: options.height,
      url,
      startedAt,
      bundleBytes: bytes.byteLength,
      reports,
      frame: null,
    };
  }

  const host: PlayerHost = {
    get url() {
      return url;
    },
    get port() {
      return server.addr.port;
    },
    status: () => ({ ...status(), frame }),
    stop: () => server.shutdown(),
  };

  if (options.open ?? true) openBrowser(url);
  return host;
}

/** Opens the default browser. Failure is not fatal: the URL is always printed. */
export function openBrowser(url: string): boolean {
  const commands: Array<[string, string[]]> = Deno.build.os === "windows"
    ? [["cmd", ["/c", "start", "", url]]]
    : Deno.build.os === "darwin"
    ? [["open", [url]]]
    : [["xdg-open", [url]]];
  for (const [program, args] of commands) {
    try {
      const child = new Deno.Command(program, {
        args,
        stdin: "null",
        stdout: "null",
        stderr: "null",
      }).spawn();
      child.unref();
      return true;
    } catch {
      // Try the next opener; a headless run keeps serving regardless.
    }
  }
  return false;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (
      character,
    ) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ??
      character),
  );
}
