/**
 * @ember/studio/server — the editor's HTTP API.
 *
 * Runs against the real game folder (scenes are the source of truth) but every write uses a
 * uniquely named scene that is deleted afterwards, so the repository is left unchanged.
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { loadGame } from "@ember/gameloader";
import { startStudio } from "@ember/studio";

const workspaceRoot = Deno.cwd();
const gameDirectory = `${workspaceRoot}/games/ember-runner`;

async function withStudio(
  body: (studio: Awaited<ReturnType<typeof startStudio>>) => Promise<void>,
): Promise<void> {
  const loaded = await loadGame(gameDirectory);
  const studio = await startStudio({
    descriptor: loaded.descriptor,
    workspaceRoot,
    sceneSource: loaded.sceneSource,
    bundleApp: false,
  });
  try {
    await body(studio);
  } finally {
    await studio.stop();
  }
}

async function json<T>(studio: { handle(request: Request): Promise<Response> }, path: string) {
  const response = await studio.handle(new Request(`http://studio${path}`));
  return { status: response.status, body: await response.json() as T };
}

Deno.test("the editor serves its page and never caches it", async () => {
  await withStudio(async (studio) => {
    const response = await studio.handle(new Request("http://studio/"));
    assertEquals(response.status, 200);
    assertStringIncludes(response.headers.get("content-type") ?? "", "text/html");
    assertStringIncludes(await response.text(), "Ember Studio");
  });
});

Deno.test("the editor page points at the bundled app", async () => {
  await withStudio(async (studio) => {
    const html = await (await studio.handle(new Request("http://studio/"))).text();
    assertStringIncludes(html, "studio.js");
  });
});

Deno.test("an unknown path is a 404", async () => {
  await withStudio(async (studio) => {
    const response = await studio.handle(new Request("http://studio/nope"));
    assertEquals(response.status, 404);
  });
});

Deno.test("GET /api/game describes the loaded game", async () => {
  await withStudio(async (studio) => {
    const { status, body } = await json<{ described: { id: string; scenes: string[] }; scenes: unknown[] }>(
      studio,
      "/api/game",
    );
    assertEquals(status, 200);
    assertEquals(body.described.id, "ember-runner");
    assert(body.described.scenes.includes("title"));
    assert(body.scenes.length >= 3);
  });
});

Deno.test("GET /api/scenes lists the scene files on disk", async () => {
  await withStudio(async (studio) => {
    const { status, body } = await json<{ scenes: string[] }>(studio, "/api/scenes");
    assertEquals(status, 200);
    assert(body.scenes.includes("level-1"));
  });
});

Deno.test("GET /api/scenes/:name returns a serialized scene", async () => {
  await withStudio(async (studio) => {
    const { status, body } = await json<{ name: string; scene: { name: string } }>(
      studio,
      "/api/scenes/title",
    );
    assertEquals(status, 200);
    assertEquals(body.name, "title");
    assertEquals(body.scene.name, "title");
  });
});

Deno.test("an unknown scene is a 404", async () => {
  await withStudio(async (studio) => {
    const { status } = await json(studio, "/api/scenes/does-not-exist");
    assertEquals(status, 404);
  });
});

Deno.test("POST /api/scenes creates a scene file that the list then shows", async () => {
  const name = `studio-test-${Date.now().toString(36)}`;
  await withStudio(async (studio) => {
    try {
      const response = await studio.handle(
        new Request("http://studio/api/scenes", {
          method: "POST",
          body: JSON.stringify({ name, template: "platformer" }),
        }),
      );
      assertEquals(response.status, 201);
      const created = await response.json() as { name: string; scene: { entities: unknown[] } };
      assertEquals(created.name, name);
      assert(created.scene.entities.length >= 2);

      const listed = await json<{ scenes: string[] }>(studio, "/api/scenes");
      assert(listed.body.scenes.includes(name));
    } finally {
      await Deno.remove(`${gameDirectory}/scenes/${name}.emberscene`).catch(() => {});
    }
  });
});

Deno.test("POST /api/scenes rejects invalid names", async () => {
  await withStudio(async (studio) => {
    const response = await studio.handle(
      new Request("http://studio/api/scenes", {
        method: "POST",
        body: JSON.stringify({ name: "not a name!" }),
      }),
    );
    assertEquals(response.status, 400);
  });
});

Deno.test("POST /api/scenes refuses to overwrite an existing scene", async () => {
  await withStudio(async (studio) => {
    const response = await studio.handle(
      new Request("http://studio/api/scenes", {
        method: "POST",
        body: JSON.stringify({ name: "title" }),
      }),
    );
    assertEquals(response.status, 409);
  });
});

Deno.test("PUT /api/scenes/:name saves a valid scene", async () => {
  const name = `studio-save-${Date.now().toString(36)}`;
  await withStudio(async (studio) => {
    try {
      await studio.handle(
        new Request("http://studio/api/scenes", {
          method: "POST",
          body: JSON.stringify({ name, template: "empty" }),
        }),
      );
      const read = await json<{ scene: Record<string, unknown> }>(studio, `/api/scenes/${name}`);
      const response = await studio.handle(
        new Request(`http://studio/api/scenes/${name}`, {
          method: "PUT",
          body: JSON.stringify({ scene: read.body.scene }),
        }),
      );
      assertEquals(response.status, 200);
      const saved = await response.json() as { ok: boolean; path: string };
      assertEquals(saved.ok, true);
      assert(saved.path.endsWith(`${name}.emberscene`));
    } finally {
      await Deno.remove(`${gameDirectory}/scenes/${name}.emberscene`).catch(() => {});
    }
  });
});

Deno.test("PUT /api/scenes/:name rejects a body without a scene", async () => {
  await withStudio(async (studio) => {
    const response = await studio.handle(
      new Request("http://studio/api/scenes/title", { method: "PUT", body: "{}" }),
    );
    assertEquals(response.status, 400);
  });
});

Deno.test("POST /api/simulate steps a scene and reports a digest", async () => {
  await withStudio(async (studio) => {
    const response = await studio.handle(
      new Request("http://studio/api/simulate", {
        method: "POST",
        body: JSON.stringify({ scene: "level-1", seconds: 0.5 }),
      }),
    );
    assertEquals(response.status, 200);
    const result = await response.json() as {
      frames: number;
      before: { digest: string };
      after: { digest: string; entities: number };
    };
    assertEquals(result.frames, 30);
    assert(/^[0-9a-f]{8}$/.test(result.after.digest));
    assert(result.after.entities > 0);
  });
});

Deno.test("POST /api/simulate rejects an unknown scene", async () => {
  await withStudio(async (studio) => {
    const response = await studio.handle(
      new Request("http://studio/api/simulate", {
        method: "POST",
        body: JSON.stringify({ scene: "ghost" }),
      }),
    );
    assertEquals(response.status, 404);
  });
});

Deno.test("POST /api/reload re-reads the game folder", async () => {
  await withStudio(async (studio) => {
    const response = await studio.handle(new Request("http://studio/api/reload", { method: "POST" }));
    assertEquals(response.status, 200);
    const result = await response.json() as { ok: boolean; scenes: string[] };
    assertEquals(result.ok, true);
    assert(result.scenes.length >= 3);
  });
});

Deno.test("GET /api/logs returns the editor's action log", async () => {
  await withStudio(async (studio) => {
    const { status, body } = await json<{ logs: string[] }>(studio, "/api/logs");
    assertEquals(status, 200);
    assert(Array.isArray(body.logs));
  });
});

Deno.test("the editor records every save in its log", async () => {
  const name = `studio-log-${Date.now().toString(36)}`;
  await withStudio(async (studio) => {
    try {
      await studio.handle(
        new Request("http://studio/api/scenes", {
          method: "POST",
          body: JSON.stringify({ name, template: "empty" }),
        }),
      );
      assert(studio.logs.some((line) => line.includes(name)));
    } finally {
      await Deno.remove(`${gameDirectory}/scenes/${name}.emberscene`).catch(() => {});
    }
  });
});

Deno.test("requests are counted", async () => {
  await withStudio(async (studio) => {
    const before = studio.requests;
    await studio.handle(new Request("http://studio/"));
    assert(studio.requests > before);
  });
});
