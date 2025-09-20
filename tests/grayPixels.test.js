import test from "node:test";
import assert from "node:assert/strict";

import { getGrayPixels as gray1 } from "../src/version1/core.js";
import { getGrayPixels as gray2 } from "../src/version2/core.js";
import {arrayToVec} from "./helpers.js";

test("getGrayPixels matches between versions on 3x3 image", () => {
  const W = 3, H = 3;
  const img = { width: W, height: H };
  global.img = img;

  // 9 pixels * 4 channels = 36 values
  global.imgPixels = new Uint8ClampedArray([
    // row 0
    10,20,30,255,   40,50,60,255,   70,80,90,255,
    // row 1
    15,25,35,255,   45,55,65,255,   75,85,95,255,
    // row 2
    20,30,40,255,   50,60,70,255,   80,90,100,255
  ]);

  // --- version 1 (column-major 2D array) ---
  const v1 = gray1(0);

  // --- version 2 (row-major flat array) ---
  const out2 = new Float32Array(W * H);
  gray2(global.imgPixels, W, H, 0, out2);

  // Convert v1’s column-major into row-major for comparison
  const expected = arrayToVec(v1,3,3);

  assert.deepStrictEqual(Array.from(out2), expected);
});
