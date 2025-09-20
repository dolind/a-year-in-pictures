import test from "node:test";
import assert from "node:assert/strict";

import { diidify as diidify1 } from "../src/version1/core.js";
import { diidify as diidify2 } from "../src/version2/core.js";

test("diidify outputs match between v1 (2D mask) and v2 (flat mask)", () => {
const W = 3, H = 3;

  // Same mask values
  const mask2D = [
    [0,   200, 50],   // row y=0
    [126, 80,  255],  // row y=1
    [30,  180, 100],  // row y=2
  ];

  // Flattened row-major order: (x=0,y=0), (x=1,y=0), (x=2,y=0), (x=0,y=1)...
  const maskFlat = new Uint8ClampedArray([
    0, 200, 50,
    126, 80, 255,
    30, 180, 100
  ]);


  // --- version 1 (needs global imgPixels + fake img) ---
  global.imgPixels = new Uint8ClampedArray(W * H * 4).fill(99);
  global.img = { updatePixels() {} }; // no-op
  diidify1(mask2D);
  const v1Out = Array.from(global.imgPixels);

  // --- version 2 ---
  const pix2 = new Uint8ClampedArray(W * H * 4).fill(123);
  diidify2(maskFlat, pix2, W, H);
  const v2Out = Array.from(pix2);

  // === Compare ===
  assert.deepEqual(v2Out, v1Out);
});
