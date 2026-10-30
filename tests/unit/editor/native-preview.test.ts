/**
 * Native preview · procedural textures.
 *
 * The editor's viewport used to draw every sprite as a tinted box because GDI has no image
 * decoding. These cases cover the replacement end to end at the level a headless test can:
 * the software texture factory produces the shipped games' real artwork, and the GDI command
 * renderer blits the sampled sprite where the viewport mapping says it goes.
 */

import { assert, assertEquals } from "@std/assert";
import { buildTextures, createSoftwareCanvasFactory } from "@ember/assets";
import { Colors, parseColor, Scene, Sprite, Transform, vec2 } from "@ember/core";
import { findExample } from "@ember/editor";
import {
  buildDrawList,
  FULL_UV,
  type RgbaImage,
  readPixel,
  type SpriteCommand,
} from "@ember/render2d";
import { renderCommandsGdi } from "../../../packages/editor/native/gdi-backend.ts";

interface Blit {
  image: RgbaImage;
  x: number;
  y: number;
}

interface RecordingCanvas {
  fills: Array<{ x: number; y: number; w: number; h: number; color: string }>;
  blits: Blit[];
}

/** The GdiCanvas surface `renderCommandsGdi` talks to, recording instead of drawing. */
function recordingCanvas(): RecordingCanvas & Record<string, unknown> {
  const canvas = {
    fills: [] as RecordingCanvas["fills"],
    blits: [] as Blit[],
    fillRect(x: number, y: number, w: number, h: number, color: string) {
      canvas.fills.push({ x, y, w, h, color });
    },
    strokeRect() {},
    polygon() {},
    ellipse() {},
    text() {},
    clip() {},
    restore() {},
    alphaBlit(image: RgbaImage, x: number, y: number) {
      canvas.blits.push({ image, x, y });
    },
  };
  return canvas as unknown as RecordingCanvas & Record<string, unknown>;
}

function textureResolver(exampleId: string): (key: string) => RgbaImage | undefined {
  const example = findExample(exampleId);
  assert(example?.textures, `${exampleId} must ship textures`);
  const registry = buildTextures(example.textures, createSoftwareCanvasFactory());
  return (key) => registry.image(key)?.image as RgbaImage | undefined;
}

function spriteCommand(overrides: Partial<SpriteCommand> = {}): SpriteCommand {
  return {
    kind: "sprite",
    x: 50,
    y: 25,
    width: 10,
    height: 10,
    texture: "bird",
    uv: FULL_UV,
    tint: Colors.white,
    alpha: 1,
    rotation: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    flipX: false,
    entity: 1,
    layer: 0,
    ...overrides,
  };
}

/** Preview rect that maps the whole scene at 2x, so offsets are easy to reason about. */
const PREVIEW = { x: 0, y: 0, w: 200, h: 100, sceneWidth: 100, sceneHeight: 50 };

Deno.test("native preview · a sprite blits its texture where the mapping puts it", () => {
  const canvas = recordingCanvas();
  const mapping = renderCommandsGdi(
    canvas as never,
    [spriteCommand()],
    PREVIEW,
    { textures: textureResolver("flappy-ember") },
  );
  assertEquals(mapping.scale, 2, "preview scale");
  assertEquals(canvas.blits.length, 1, "one blit");
  const blit = canvas.blits[0];
  assertEquals([blit.x, blit.y], [90, 40], "centred at the sprite position");
  assertEquals([blit.image.width, blit.image.height], [20, 20], "scaled sprite size");
  let painted = 0;
  for (let index = 3; index < blit.image.pixels.length; index += 4) {
    if (blit.image.pixels[index] > 0) painted++;
  }
  assert(painted > 0, "the blit carries the bird's pixels");
  assertEquals(canvas.fills.length, 1, "only the preview background was filled");
});

Deno.test("native preview · a sprite with no texture keeps the tinted box", () => {
  const canvas = recordingCanvas();
  renderCommandsGdi(canvas as never, [spriteCommand()], PREVIEW, { textures: () => undefined });
  assertEquals(canvas.blits.length, 0, "nothing to blit");
  assertEquals(canvas.fills.length, 2, "background plus the placeholder box");
  assertEquals([canvas.fills[1].w, canvas.fills[1].h], [20, 20], "placeholder size");
});

Deno.test("native preview · a frame strip draws the frame the command asked for", () => {
  const strip = createSoftwareCanvasFactory();
  const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
  const registry = buildTextures(
    {
      strip: {
        width: 4,
        height: 1,
        draw(ctx) {
          for (const [index, color] of colors.entries()) {
            ctx.fillStyle = color;
            ctx.fillRect(index, 0, 1, 1);
          }
        },
      },
    },
    strip,
  );
  const scene = new Scene({
    name: "strip",
    viewport: { width: 100, height: 50 },
    camera: { position: vec2(50, 25), zoom: 1, smoothing: 0, bounds: null },
  });
  const entity = scene.world.spawn();
  scene.world.add(entity, Transform, { position: vec2(50, 25) });
  scene.world.add(entity, Sprite, {
    texture: "strip",
    width: 4,
    height: 1,
    frameCount: 4,
    frame: 2,
  });
  const frame = buildDrawList(scene, { cull: false });
  const canvas = recordingCanvas();
  renderCommandsGdi(canvas as never, frame.commands, {
    x: 0,
    y: 0,
    w: 100,
    h: 50,
    sceneWidth: 100,
    sceneHeight: 50,
  }, { textures: (key) => registry.image(key)?.image as RgbaImage | undefined });

  assertEquals(canvas.blits.length, 1, "one blit");
  const blit = canvas.blits[0];
  // Frame 2 of 4 is the third column; the sprite is 4 px wide, so its first pixel is it.
  assertEquals([blit.x, blit.y], [48, 24], "left edge of a 1:1 sprite at 50,25");
  const [r, g, b, a] = readPixel(blit.image, 0, 0);
  assert(a > 0, "the first pixel is covered");
  assert(r < 60 && g < 60 && b > 200, `expected the blue frame, got ${r},${g},${b}`);
});

Deno.test("native preview · the shipped games' textures rasterise into real artwork", () => {
  const ember = parseColor(Colors.ember);
  assert(ember, "the theme's ember colour parses");
  const flappy = textureResolver("flappy-ember");
  const bird = flappy("bird");
  assert(bird, "the bird texture exists");
  // The wing covers the middle, so sample the body beside it, not the centre.
  const [br, bg, bb, ba] = readPixel(bird, bird.width - 6, Math.floor(bird.height / 2));
  assertEquals([br, bg, bb, ba], [ember.r, ember.g, ember.b, 255], "the bird's body is ember");
  assertEquals(readPixel(bird, 0, 0), [0, 0, 0, 0], "its corner is transparent");

  const runner = textureResolver("ember-runner");
  const player = runner("player");
  assert(player, "the player texture exists");
  assertEquals(readPixel(player, 0, 0)[3], 255, "the runner's body covers its first pixel");
  assert(runner("coin"), "the coin strip exists");
  assert(runner("missing-key") === undefined, "unknown keys resolve to nothing");
});

Deno.test("native preview · examples without artwork opt out of textures", () => {
  assertEquals(findExample("scripting-playground")?.textures, undefined, "no textures");
  assertEquals(findExample("3d-showcase")?.textures, undefined, "no textures");
  const runner = findExample("ember-runner")?.textures;
  assert(runner, "the runner ships textures");
  assertEquals(Object.keys(runner).sort(), ["coin", "goal", "ground", "hazard", "player"]);
});
