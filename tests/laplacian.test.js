import test from "node:test";

import {laplacian as lap1} from "../src/version1/core.js";
import {laplacian as lap2} from "../src/version2/core.js";
import {arrayToVec} from "./helpers.js";
import assert from "node:assert/strict";

test("laplacian matches between versions", () => {
    const W = 3, H = 3;
    const img = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
    ];
    const v1 = lap1(img);

    const src = new Float32Array([
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
    ]);
    const dst = new Float32Array(9);
    lap2(src, 3, 3, dst);

    assert.deepStrictEqual(Array.from(dst), arrayToVec(v1,3,3));
});
