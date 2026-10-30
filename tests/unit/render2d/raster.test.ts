/**
 * @ember/render2d/raster — software rasterisation and sprite sampling.
 *
 * Assertions are on real pixels: the rasteriser is the thing that decides what a procedural
 * texture looks like without a browser, so "the centre of a filled circle is opaque and the
 * corner is transparent" is the contract worth checking, not the calls it makes.
 */

import { assert, assertEquals } from "@std/assert";
import { near } from "../../harness.ts";
import {
  createRasterSurface,
  createRgbaImage,
  FULL_UV,
  type RgbaImage,
  readPixel,
  sampleSprite,
} from "@ember/render2d";

function paint(image: RgbaImage, x: number, y: number, color: [number, number, number, number]) {
  const index = (y * image.width + x) * 4;
  image.pixels[index] = color[0];
  image.pixels[index + 1] = color[1];
  image.pixels[index + 2] = color[2];
  image.pixels[index + 3] = color[3];
}

const RED: [number, number, number, number] = [255, 0, 0, 255];
const GREEN: [number, number, number, number] = [0, 255, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];

Deno.test("raster · a filled rect paints every pixel in the colour", () => {
  const surface = createRasterSurface(4, 3);
  surface.ctx.fillStyle = "#ff0000";
  surface.ctx.fillRect(0, 0, 4, 3);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 4; x++) {
      assertEquals(readPixel(surface.image, x, y), RED, `pixel ${x},${y}`);
    }
  }
});

Deno.test("raster · an untranslated fillRect leaves the rest of the surface transparent", () => {
  const surface = createRasterSurface(4, 4);
  surface.ctx.fillStyle = "#ff0000";
  surface.ctx.fillRect(1, 1, 2, 2);
  assertEquals(readPixel(surface.image, 1, 1), RED, "inside the rect");
  assertEquals(readPixel(surface.image, 0, 0), [0, 0, 0, 0], "outside the rect");
});

Deno.test("raster · translate moves later drawing", () => {
  const surface = createRasterSurface(6, 6);
  surface.ctx.translate(3, 2);
  surface.ctx.fillStyle = "#ff0000";
  surface.ctx.fillRect(0, 0, 2, 2);
  assertEquals(readPixel(surface.image, 3, 2), RED, "translated pixel");
  assertEquals(readPixel(surface.image, 0, 0), [0, 0, 0, 0], "origin stays empty");
});

Deno.test("raster · globalAlpha blends with what is already there", () => {
  const surface = createRasterSurface(2, 2);
  surface.ctx.fillStyle = "#ffffff";
  surface.ctx.fillRect(0, 0, 2, 2);
  surface.ctx.globalAlpha = 0.5;
  surface.ctx.fillStyle = "#ff0000";
  surface.ctx.fillRect(0, 0, 2, 2);
  const [r, g, b, a] = readPixel(surface.image, 0, 0);
  assert(r === 255 && g === 128 && b === 128, `expected half-red over white, got ${r},${g},${b}`);
  assertEquals(a, 255, "alpha stays opaque over an opaque surface");
});

Deno.test("raster · a filled circle is opaque in the middle and empty at the corner", () => {
  const surface = createRasterSurface(33, 33);
  surface.ctx.fillStyle = "#00ff00";
  surface.ctx.beginPath();
  surface.ctx.arc(16.5, 16.5, 15, 0, Math.PI * 2);
  surface.ctx.closePath();
  surface.ctx.fill();
  assertEquals(readPixel(surface.image, 16, 16), GREEN, "centre");
  assertEquals(readPixel(surface.image, 0, 0), [0, 0, 0, 0], "corner outside the circle");
});

Deno.test("raster · an ellipse edge is anti-aliased rather than hard", () => {
  const surface = createRasterSurface(32, 32);
  surface.ctx.fillStyle = "#000000";
  surface.ctx.beginPath();
  surface.ctx.ellipse(16, 16, 12, 6, 0, 0, Math.PI * 2);
  surface.ctx.closePath();
  surface.ctx.fill();
  assertEquals(readPixel(surface.image, 16, 16)[3], 255, "centre is opaque");
  // A hard edge would only ever produce 0 or 255; anti-aliasing leaves partial pixels.
  let partial = 0;
  for (let py = 0; py < 32; py++) {
    for (let px = 0; px < 32; px++) {
      const alpha = readPixel(surface.image, px, py)[3];
      if (alpha > 0 && alpha < 255) partial++;
    }
  }
  assert(partial > 0, "expected partial-alpha pixels along the ellipse edge");
  assertEquals(readPixel(surface.image, 0, 0)[3], 0, "corner stays empty");
});

Deno.test("raster · strokeRect outlines without filling the middle", () => {
  const surface = createRasterSurface(8, 8);
  surface.ctx.strokeStyle = "#0000ff";
  surface.ctx.lineWidth = 2;
  surface.ctx.strokeRect(0, 0, 8, 8);
  assertEquals(readPixel(surface.image, 0, 0), BLUE, "border pixel");
  assertEquals(readPixel(surface.image, 4, 4), [0, 0, 0, 0], "interior stays empty");
});

Deno.test("raster · a stroked path follows moveTo/lineTo", () => {
  const surface = createRasterSurface(8, 8);
  surface.ctx.strokeStyle = "#0000ff";
  surface.ctx.lineWidth = 2;
  surface.ctx.beginPath();
  surface.ctx.moveTo(1, 4);
  surface.ctx.lineTo(7, 4);
  surface.ctx.stroke();
  assertEquals(readPixel(surface.image, 4, 4), BLUE, "on the line");
  assertEquals(readPixel(surface.image, 4, 7), [0, 0, 0, 0], "off the line");
});

Deno.test("raster · clearRect erases what was drawn", () => {
  const surface = createRasterSurface(4, 4);
  surface.ctx.fillStyle = "#ff0000";
  surface.ctx.fillRect(0, 0, 4, 4);
  surface.ctx.clearRect(1, 1, 2, 2);
  assertEquals(readPixel(surface.image, 0, 0), RED, "kept");
  assertEquals(readPixel(surface.image, 1, 1), [0, 0, 0, 0], "erased");
});

Deno.test("raster · save/restore reverts styles", () => {
  const surface = createRasterSurface(4, 4);
  surface.ctx.fillStyle = "#ff0000";
  surface.ctx.save();
  surface.ctx.fillStyle = "#0000ff";
  surface.ctx.restore();
  surface.ctx.fillRect(0, 0, 2, 2);
  assertEquals(readPixel(surface.image, 0, 0), RED, "restored fillStyle");
});

Deno.test("raster · text and images are reported instead of silently mis-drawn", () => {
  const surface = createRasterSurface(8, 8);
  surface.ctx.fillText("score", 0, 4);
  surface.ctx.drawImage({}, 0, 0, 2, 2);
  assertEquals(surface.unsupported, ["fillText", "drawImage"], "unsupported calls");
});

Deno.test("sampleSprite · a full-uv sample copies the source when sizes match", () => {
  const source = createRgbaImage(2, 2);
  paint(source, 0, 0, RED);
  paint(source, 1, 0, GREEN);
  paint(source, 0, 1, BLUE);
  paint(source, 1, 1, [10, 20, 30, 255]);
  const sampled = sampleSprite(source, { uv: FULL_UV, width: 2, height: 2 });
  assertEquals([sampled.image.width, sampled.image.height], [2, 2], "size");
  assertEquals([sampled.offsetX, sampled.offsetY], [-1, -1], "centred offset");
  assertEquals(readPixel(sampled.image, 0, 0), RED, "top-left");
  assertEquals(readPixel(sampled.image, 1, 0), GREEN, "top-right");
  assertEquals(readPixel(sampled.image, 0, 1), BLUE, "bottom-left");
  assertEquals(readPixel(sampled.image, 1, 1), [10, 20, 30, 255], "bottom-right");
});

Deno.test("sampleSprite · uv selects one frame of a strip", () => {
  const source = createRgbaImage(4, 1);
  paint(source, 0, 0, RED);
  paint(source, 1, 0, GREEN);
  paint(source, 2, 0, BLUE);
  paint(source, 3, 0, [10, 20, 30, 255]);
  const sampled = sampleSprite(source, {
    uv: { u0: 0.5, v0: 0, u1: 0.75, v1: 1 },
    width: 2,
    height: 1,
  });
  assertEquals(readPixel(sampled.image, 0, 0), BLUE, "frame 3 starts here");
  assertEquals(readPixel(sampled.image, 1, 0), BLUE, "and covers the sample");
});

Deno.test("sampleSprite · flipX mirrors horizontally", () => {
  const source = createRgbaImage(2, 1);
  paint(source, 0, 0, RED);
  paint(source, 1, 0, GREEN);
  const sampled = sampleSprite(source, { uv: FULL_UV, width: 2, height: 1, flipX: true });
  assertEquals(readPixel(sampled.image, 0, 0), GREEN, "left pixel comes from the right");
  assertEquals(readPixel(sampled.image, 1, 0), RED, "right pixel comes from the left");
});

Deno.test("sampleSprite · tint multiplies channels and alpha multiplies coverage", () => {
  const source = createRgbaImage(1, 1);
  paint(source, 0, 0, [255, 255, 255, 255]);
  const sampled = sampleSprite(source, {
    uv: FULL_UV,
    width: 1,
    height: 1,
    tint: "#808080",
    alpha: 0.5,
  });
  const [r, g, b, a] = readPixel(sampled.image, 0, 0);
  assert(r === 128 && g === 128 && b === 128, `expected half-grey, got ${r},${g},${b}`);
  assertEquals(a, 128, "half alpha");
});

Deno.test("sampleSprite · a quarter turn swaps the sprite's axes", () => {
  const source = createRgbaImage(2, 2);
  paint(source, 0, 0, RED);
  paint(source, 1, 0, GREEN);
  paint(source, 0, 1, BLUE);
  paint(source, 1, 1, [10, 20, 30, 255]);
  const sampled = sampleSprite(source, {
    uv: FULL_UV,
    width: 4,
    height: 2,
    rotation: Math.PI / 2,
  });
  assertEquals([sampled.image.width, sampled.image.height], [2, 4], "bounding box");
  assertEquals([sampled.offsetX, sampled.offsetY], [-1, -2], "offset of the rotated box");
  assertEquals(readPixel(sampled.image, 0, 0), BLUE, "rotated top-left");
  // Turning right moves the source's right column to the bottom row.
  assertEquals(readPixel(sampled.image, 1, 3), GREEN, "rotated bottom-right");
});

Deno.test("sampleSprite · pixels outside the rotated box stay transparent", () => {
  const source = createRgbaImage(2, 2);
  paint(source, 0, 0, RED);
  paint(source, 1, 0, RED);
  paint(source, 0, 1, RED);
  paint(source, 1, 1, RED);
  const sampled = sampleSprite(source, {
    uv: FULL_UV,
    width: 8,
    height: 2,
    rotation: Math.PI / 4,
  });
  const corners = [
    readPixel(sampled.image, 0, 0),
    readPixel(sampled.image, sampled.image.width - 1, 0),
    readPixel(sampled.image, 0, sampled.image.height - 1),
    readPixel(sampled.image, sampled.image.width - 1, sampled.image.height - 1),
  ];
  for (const [index, pixel] of corners.entries()) {
    assertEquals(pixel[3], 0, `corner ${index} alpha`);
  }
  const middle = readPixel(
    sampled.image,
    Math.floor(sampled.image.width / 2),
    Math.floor(sampled.image.height / 2),
  );
  near(middle[3], 255, 1, "the sprite covers the middle");
});
