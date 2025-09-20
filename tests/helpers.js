
/**
 * Convert a Version 1 style 2D array (column-major: p[x][y])
 * into a row-major flat array for comparison with Version 2.
 */
export function arrayToVec(arr2d, W, H) {
  const out = [];
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      out.push(arr2d[row][col]);
    }
  }
  return out;
}

export function RowMajorToColMajor(flat, W, H) {
  const out = Array.from({ length: W }, () => new Array(H));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      out[x][y] = flat[y * W + x];
    }
  }
  return out;
}

