import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";


import { ditherIt as dith1 } from "../src/version1/core.js";
import { ditherIt as dith2, ensureBuffers } from "../src/version2/core.js";
import {arrayToVec} from "./helpers.js";

// A tiny fake p5-style image
function makeFakeImg(W, H, pixels) {
  return {
    width: W,
    height: H,
    pixels: new Uint8ClampedArray(pixels),
    loadPixels() {},   // no-op
    updatePixels() {}, // no-op
    filter() {},       // skip BLUR
    get() { return this; }
  };
}
global.BLUR = 1;
test("ditherIt produces identical output on tiny image", () => {
  const W = 2, H = 2;
  // RGBA pixels: two rows, two cols
  const pixels = [
    10,20,30,255,   40,50,60,255,
    70,80,90,255,   100,110,120,255
  ];
  const img1 = makeFakeImg(W, H, pixels);
  const img2 = makeFakeImg(W, H, pixels);


  dith1(img1, { exp: 1, color: 1, gray: false });

  const v1Out = Array.from(img1.pixels);

  // --- version 2 ---
 ensureBuffers(W, H);
  dith2(img2, { exp: 1, color: 1, gray: false });

  const v2Out = Array.from(img2.pixels);

  // === Compare ===
  assert.equal(v2Out.length, v1Out.length);
  for (let i = 0; i < v1Out.length; i++) {
    assert.equal(v2Out[i], v1Out[i], `Pixel mismatch at ${i}`);
  }
});



test("ditherIt produces consistent output on generated 3x3 image", () => {
  const W = 3, H = 3;
  const pixels = new Uint8ClampedArray(W * H * 4);

  // Fill with a synthetic gradient pattern
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      pixels[i + 0] = (x * 5) % 256;          // R gradient
      pixels[i + 1] = (y * 5) % 256;          // G gradient
      pixels[i + 2] = ((x + y) * 3) % 256;    // B gradient
      pixels[i + 3] = 255;                    // alpha
    }
  }
  const img1 = makeFakeImg(W, H, pixels);
  const img2 = makeFakeImg(W, H, pixels);


  dith1(img1, { exp: 1, color: 1, gray: false });

const v1Out = Array.from(img1.pixels)
  // --- version 2 ---
 ensureBuffers(W, H);
  dith2(img2, { exp: 1, color: 1, gray: false });

  const v2Out = Array.from(img2.pixels);


  // === Compare ===
  assert.equal(v2Out.length, v1Out.length);
  for (let i = 0; i < v1Out.length; i++) {
    assert.equal(v2Out[i], v1Out[i], `Pixel mismatch at ${i}`);
  }
});


test("ditherIt produces consistent output on generated 15x15 image for multi color", () => {
  const W = 66, H = 66;
  const pixels = new Uint8ClampedArray(W * H * 4);

  // Fill with a synthetic gradient pattern
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const i = (row * W + col) * 4;
      pixels[i + 0] = (row * 5) % 256;          // R gradient
      pixels[i + 1] = (col * 5) % 256;          // G gradient
      pixels[i + 2] = ((row +col) * 3) % 256;    // B gradient
      pixels[i + 3] = 255;                    // alpha
    }
  }
  const img1 = makeFakeImg(W, H, pixels);
  const img2 = makeFakeImg(W, H, pixels);


  dith1(img1, { exp: 2, color:3, gray: true });

const v1Out = Array.from(img1.pixels)


 ensureBuffers(W, H);
  dith2(img2, { exp:2, color: 3, gray: true });

  const v2Out = Array.from(img2.pixels);


  // === Compare ===
  assert.equal(v2Out.length, v1Out.length);
  for (let i = 0; i < v1Out.length; i++) {
    assert.deepEqual(v2Out[i], v1Out[i], `Pixel mismatch at ${i}`);
  }
});

test("ditherIt produces consistent output from real PNG file", async () => {
  // Load PNG file
  const fs = await import("node:fs");
  const buffer = fs.readFileSync("tests/test.png");
  const png = PNG.sync.read(buffer);

  const W = png.width;
  const H = png.height;
  const pixels = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);

  const img1 = makeFakeImg(W, H, pixels.slice()); // copy for version1
  const img2 = makeFakeImg(W, H, pixels.slice()); // copy for version2


  dith1(img1, { exp: 1, color: 1, gray: false });
  const v1Out = Array.from(img1.pixels);

  // --- version2 ---
  ensureBuffers(W, H);
  dith2(img2, { exp: 1, color: 1, gray: false });
  const v2Out = Array.from(img2.pixels);

  // Compare results
  assert.equal(v2Out.length, v1Out.length);
  let diffCount = 0;
  let maxDiff = 0;
  for (let i = 0; i < v1Out.length; i++) {
    const d = Math.abs(v1Out[i] - v2Out[i]);
    if (d > 0) {
      diffCount++;
      if (d > maxDiff) maxDiff = d;
    }
  }

  console.log(`PNG test: pixels different=${diffCount}, max difference=${maxDiff}`);
  // Allow small tolerance for rounding differences
  assert.ok(maxDiff <= 1, "Outputs differ more than tolerance");
});
