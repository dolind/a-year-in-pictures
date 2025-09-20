import test from "node:test";
import assert from "node:assert/strict";

import { normalizeEdges, diither } from "../src/version2/core.js";
import { ensureBuffers } from "../src/version2/core.js";

test("normalizeEdges scales values correctly on 3x3", () => {
  const W = 3, H = 3, N = W * H;

  // input: range 10..90
  const src = new Float32Array([
    10, 20, 30,
    40, 50, 60,
    70, 80, 90
  ]);
  const dst = new Float32Array(N);

  normalizeEdges(src, dst, N);

  // min=10, max=90 → scale=255/80
  const scale = 255 / 80;
  const expected = src.map(v => (v - 10) * scale);

  assert.deepStrictEqual(Array.from(dst), Array.from(expected));
});

test("normalizeEdges fills with zeros when min==max", () => {
  const W = 3, H = 3, N = W * H;
  const src = new Float32Array(Array(N).fill(50));
  const dst = new Float32Array(N);

  normalizeEdges(src, dst, N);

  assert.deepStrictEqual(Array.from(dst), Array(N).fill(0));
});

test("diither produces deterministic 3x3 mask", () => {
  const W = 3, H = 3, N = W * H;

  // Simple gradient input
  const src = new Float32Array([
    10, 20, 30,
    40, 50, 60,
    70, 80, 90
  ]);

  ensureBuffers(W, H);
  const dst = new Uint8ClampedArray(N);

  diither(src, W, H, dst, false);

  // Check output is only 0 or 255
  for (let i = 0; i < N; i++) {
    assert.ok(dst[i] === 0 || dst[i] === 255, `dst[${i}] = ${dst[i]} not binary`);
  }

  // Check dimensions
  assert.equal(dst.length, N);

  // Check at least one 0 and one 255 exist (so dithering actually happened)
  assert.ok(dst.includes(0), "no black pixels");
  assert.ok(dst.includes(255), "no white pixels");
});
