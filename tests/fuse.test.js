import test from "node:test";
import assert from "node:assert/strict";

import { fuse as fuse1 } from "../src/version1/core.js";
import { fuse as fuse2, ensureBuffers } from "../src/version2/core.js";
import { arrayToVec } from "./helpers.js";

test("fuse matches between versions on simple inputs", () => {
  const W = 3, H = 3;

  // --- version 1 ---
  const opt1 = [[1, 2, 3], [4, 5, 7], [8, 9, 10]];
  const opt2 = [[9, 8, 7], [6, 5, 4], [3, 2, 1]];
  const out1 = fuse1([opt1, opt2]);

  // --- version 2 ---
  ensureBuffers(W, H);  // ✅ init scratch buffers

  const src1 = arrayToVec(opt1,W,H) // row-major
  const src2 = arrayToVec(opt2,W, H)
  const out2 = new Float32Array(W * H);
  const score = new Float32Array(W * H);
  const tmp = new Float32Array(W * H);

  fuse2([src1, src2], W, H, out2, score, tmp);


  // compare (row-major vs col-major)
  const expected = Array.from(arrayToVec(out1, W, H));
  assert.deepStrictEqual(Array.from(out2), expected);
});



test("fuse resolves ties consistently between versions", () => {
  const W = 3, H = 3;

  // Two identical options (same scores everywhere)
  const opt1 = [
    [0,   0, 255],
    [0, 255, 255],
    [255,255,255]
  ];
  const opt2 = [
    [0,   0, 255],
    [0, 255, 255],
    [0,0,255]
  ];

  // --- version 1 ---
  const out1 = fuse1([opt1, opt2]);

  // --- version 2 ---
  ensureBuffers(W, H);

  const src1 = arrayToVec(opt1, W, H);
  const src2 = arrayToVec(opt2, W, H);
  const out2 = new Float32Array(W * H);
  const score = new Float32Array(W * H);
  const tmp = new Float32Array(W * H);

  fuse2([src1, src2], W, H, out2, score, tmp);

  // Compare outputs (convert v1 col-major → row-major)
  const expected = Array.from(arrayToVec(out1, W, H));
  assert.deepStrictEqual(Array.from(out2), expected);
});
