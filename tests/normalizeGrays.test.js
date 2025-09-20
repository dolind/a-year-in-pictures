import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGrays as norm1 } from "../src/version1/core.js";
import { normalizeGrays as norm2 } from "../src/version2/core.js";

test("normalizeGrays matches between versions (3x3 case)", () => {
  const W = 3, H = 3, count = 4;


  const p = [
  [ 0, 63.75, 127.5 ],
  [ 63.75, 127.5, 191.25 ],
  [ 127.5, 191.25, 255 ]
  ];
  global.grayBox = false

  // --- v1 ---
  const out1 = norm1(JSON.parse(JSON.stringify(p)), count);
  const out1Int = out1.map(col => col.map(v => Math.floor(v)));

  // --- v2 ---
  const src = new Float32Array([
  0, 63.75, 127.5 ,
  63.75, 127.5, 191.25 ,
   127.5, 191.25, 255
  ]);
  const dst = new Float32Array(W * H);
  norm2(src, W, H, count, false, dst);

  // Build expected in row-major from v1's column-major
  const expected = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      expected.push(out1[x][y]);
    }
  }

  assert.deepStrictEqual(Array.from(dst), expected);
});
