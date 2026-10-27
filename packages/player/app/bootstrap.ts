/**
 * @ember/player/app/bootstrap — the browser entry used by exported games.
 *
 * The packager generates a tiny entry that imports this file plus the game module, so the
 * exported page only needs to fetch its bundle and start: no build step in the browser.
 */

import { type TextureSources, buildTextures } from "@ember/assets";
import type { Scene } from "@ember/core";
import { type Game } from "@ember/runtime";
import type { PlayerBundle } from "../bundle.ts";
import { scenesFromBundle } from "../bundle.ts";
import { createDomCanvasFactory } from "./canvas-factory.ts";
import { type MountedGame, mountGame } from "./host.ts";

export interface BootstrapOptions {
  /** Builds the game, given the scenes that came out of the bundle. */
  createGame: (options: { scenes: Map<string, Scene> }) => Game;
  /** Procedural textures the game wants available as sprites. */
  textureSources?: TextureSources;
  /** URL the bundle is fetched from (default `/game.json`). */
  bundleUrl?: string;
  /** Element to mount into; defaults to a full-screen container created on `document.body`. */
  mount?: HTMLElement;
  /** Draw a title bar with the game name and FPS counter (default true). */
  chrome?: boolean;
  /** Called after each host frame. */
  onStats?: (text: string) => void;
}

export interface BootstrappedPlayer {
  game: Game;
  bundle: PlayerBundle;
  mounted: MountedGame;
  destroy(): void;
}

/** Fetches the bundle, builds the game and mounts it. Returns the running player. */
export async function startBrowserGame(options: BootstrapOptions): Promise<BootstrappedPlayer> {
  const bundle: PlayerBundle = await fetch(options.bundleUrl ?? "/game.json").then((response) => {
    if (!response.ok) throw new Error(`could not load the game bundle (HTTP ${response.status})`);
    return response.json();
  });

  const scenes = scenesFromBundle(bundle);
  const game = options.createGame({ scenes });

  const registries = options.textureSources
    ? buildTextures(options.textureSources, createDomCanvasFactory())
    : null;

  const shell = buildShell(bundle, options);
  const mounted = mountGame({
    mount: shell.stage,
    game,
    resolveTexture: registries ? registries.resolver() : undefined,
    onStats: (stats) => {
      shell.status.textContent = `fps ${stats.fps.toFixed(0)} · ${stats.entityCount} entities · ` +
        `${stats.drawCommands} draws · t ${stats.time.toFixed(1)}s`;
      options.onStats?.(shell.status.textContent);
    },
    onScene: (name) => {
      shell.title.textContent = `${bundle.game.title} — ${name}`;
    },
  });

  // The exported page ships a "loading…" placeholder; the shell now covers it, so drop it.
  (globalThis as unknown as { document?: Document }).document?.getElementById("boot")?.remove();

  window.addEventListener("resize", () => mounted.resize());
  (window as unknown as { emberPlayer?: unknown }).emberPlayer = {
    mounted,
    session: mounted.session,
    stop: () => mounted.stop(),
  };

  return {
    game,
    bundle,
    mounted,
    destroy() {
      mounted.stop();
    },
  };
}

interface Shell {
  /** The caller may supply any element to mount into, so this is not a `HTMLDivElement`. */
  root: HTMLElement;
  stage: HTMLDivElement;
  title: HTMLSpanElement;
  status: HTMLSpanElement;
}

/** Minimal chrome: title, hint line and a stats readout, all styled inline (no CSS file). */
function buildShell(bundle: PlayerBundle, options: BootstrapOptions): Shell {
  const root = options.mount ?? document.createElement("div");
  root.id = "ember-player";
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    display: "flex",
    flexDirection: "column",
    background: "#05070c",
    color: "#e7ecf6",
    font: "13px/1.4 'Segoe UI', system-ui, sans-serif",
    overflow: "hidden",
  } satisfies Partial<CSSStyleDeclaration>);

  const bar = document.createElement("div");
  Object.assign(bar.style, {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    padding: "6px 12px",
    background: "#0d1220",
    borderBottom: "1px solid #1e2740",
  } satisfies Partial<CSSStyleDeclaration>);

  const title = document.createElement("span");
  title.textContent = `${bundle.game.title}`;
  title.style.fontWeight = "600";

  const hint = document.createElement("span");
  hint.textContent = "arrows / WASD · space · click";
  hint.style.color = "#8b93a7";

  const status = document.createElement("span");
  status.style.marginLeft = "auto";
  status.style.color = "#8b93a7";

  bar.append(title, hint, status);
  const stage = document.createElement("div");
  Object.assign(stage.style, {
    flex: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  } satisfies Partial<CSSStyleDeclaration>);
  root.append(bar, stage);
  if (!options.mount) document.body.append(root);
  return { root, stage, title, status };
}
