/**
 * @ember/studio/app/api — the editor's client for the studio server.
 *
 * Owner: this file owns the browser/server contract. Panels never call `fetch` directly, so
 * the API surface is one readable list and the panels stay UI-only.
 */

import type { SerializedScene } from "@ember/core";

export interface GameInfo {
  descriptor: {
    id: string;
    title: string;
    version: string;
    directory: string;
    scenesDirectory: string;
    start: string;
  };
  described: {
    id: string;
    title: string;
    version: string;
    start: string | null;
    scenes: string[];
    systems: string[];
    scripts: string[];
  };
  sceneSource: "files" | "code";
  scenes: Array<{ name: string; entities: number; width: number; height: number }>;
  assets: Array<{ id: string; path: string; kind: string; bytes?: number }>;
  warnings: string[];
}

export interface SimulateResult {
  scene: string;
  seconds: number;
  frames: number;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface ExportSummary {
  exePath: string | null;
  exeBytes: number;
  bundlePath: string;
  bundleBytes: number;
  scenes: string[];
  startScene: string;
  assetCount: number;
  steps: Array<{ name: string; detail: string; ms: number }>;
  warnings: string[];
}

export interface ExportResponse {
  export: ExportSummary;
  verification: { ok: boolean; checks: Array<{ name: string; ok: boolean; detail: string }> } | null;
}

export interface ScenePayload {
  name: string;
  scene: SerializedScene;
}

export class StudioApi {
  constructor(private base = "") {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data = text.length > 0 ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = (data as { error?: string }).error ?? `HTTP ${response.status}`;
      const problems = (data as { problems?: string[] }).problems;
      throw new Error(problems && problems.length > 0 ? `${message}: ${problems.join(", ")}` : message);
    }
    return data as T;
  }

  game(): Promise<GameInfo> {
    return this.request<GameInfo>("GET", "/api/game");
  }

  scene(name: string): Promise<ScenePayload> {
    return this.request<ScenePayload>("GET", `/api/scenes/${encodeURIComponent(name)}`);
  }

  saveScene(name: string, scene: SerializedScene): Promise<{ ok: boolean; path: string; entities: number }> {
    return this.request("PUT", `/api/scenes/${encodeURIComponent(name)}`, { scene });
  }

  createScene(name: string, template: string): Promise<{ ok: boolean; name: string; scene: SerializedScene }> {
    return this.request("POST", "/api/scenes", { name, template });
  }

  deleteScene(name: string): Promise<{ ok: boolean }> {
    return this.request("DELETE", `/api/scenes/${encodeURIComponent(name)}`);
  }

  reload(): Promise<{ ok: boolean; scenes: string[]; sceneSource: string }> {
    return this.request("POST", "/api/reload");
  }

  simulate(scene: string, seconds: number, keys: string[] = []): Promise<SimulateResult> {
    return this.request<SimulateResult>("POST", "/api/simulate", { scene, seconds, keys });
  }

  exportGame(verify = true): Promise<ExportResponse> {
    return this.request<ExportResponse>("POST", "/api/export", { verify });
  }

  logs(): Promise<{ logs: string[] }> {
    return this.request<{ logs: string[] }>("GET", "/api/logs");
  }
}
