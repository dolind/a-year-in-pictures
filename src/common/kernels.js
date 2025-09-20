// Export reusable kernels/constants here
export const LoGKernel = [
    // Example Laplacian of Gaussian kernel
    [0, 1, 1, 2, 2, 2, 1, 1, 0],
    [1, 2, 4, 5, 5, 5, 4, 2, 1],
    [1, 4, 5, 3, 0, 3, 5, 4, 1],
    [2, 5, 3, -12, -24, -12, 3, 5, 2],
    [2, 5, 0, -24, -10, -24, 0, 5, 2],
    [2, 5, 3, -12, -24, -12, 3, 5, 2],
    [1, 4, 5, 3, 0, 3, 5, 4, 1],
    [1, 2, 4, 5, 5, 5, 4, 2, 1],
    [0, 1, 1, 2, 2, 2, 1, 1, 0],
];

export     const diid8x8 = [
        [1, 13, 7, 16, 3, 13, 7, 18],
        [10, 8, 11, 9, 10, 8, 11, 9],
        [6, 14, 5, 12, 6, 14, 5, 12],
        [11, 9, 10, 8, 11, 9, 10, 8],
        [4, 13, 7, 17, 2, 13, 7, 15],
        [10, 8, 11, 9, 10, 8, 11, 9],
        [6, 14, 5, 12, 6, 14, 5, 12],
        [11, 9, 10, 8, 11, 9, 10, 8],
    ];

export function stats(arr) {
  let min = Infinity, max = -Infinity, sum = 0;
  for (let v of arr) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return {min, max, mean: sum / arr.length};
}