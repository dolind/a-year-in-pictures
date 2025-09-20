import {diid8x8, LoGKernel} from "../common/kernels.js";

globalThis.img = null;
globalThis.imgPixels = null;
globalThis.grayBox = null;

export function laplacian(p) {
    const out = [];

    const lOffset = Math.ceil(LoGKernel.length / 2);

    for (let x = 0; x < p.length; x++) {
        out.push([]);
        for (let y = 0; y < p[x].length; y++) {
            let pixel = 0;
            for (let i = 0; i < LoGKernel.length; i++) {
                const x1 = x + i - lOffset;
                if (x1 < 0 || x1 >= p.length) continue;

                for (let j = 0; j < LoGKernel[i].length; j++) {
                    const y1 = y + j - lOffset;
                    if (y1 < 0 || y1 >= p[x].length) continue;
                    pixel += LoGKernel[i][j] * p[x1][y1];
                }
            }

            out[x].push(pixel);
        }
    }

    return out;
}

export function getGrayPixels(exposure = 0) {


    const output = [];

    for (let x = 0; x < img.width; x++) {
        output.push([]);
        for (let y = 0; y < img.height; y++) {
            const i = y * img.width * 4 + x * 4 + 2;
            let px = imgPixels[i] + imgPixels[i] * exposure;
            if (px < 0) px = 0;
            if (px > 255) px = 255;
            output[x].push(px);
        }
    }

    return output;
}

export function getChannelPixels(c, diff, exposure = 0) {
    const mainDiff = 1 - 2 * diff;
    // 0.299*R + 0.587*G + 0.114*B
    const diffs = [0.299, 0.587, 0.114];
    for (let di = 0; di < 3; di++) {
        if (di === c) diffs[di] *= mainDiff;
        else diffs[di] *= diff;
    }


    const output = [];

    for (let x = 0; x < img.width; x++) {
        output.push([]);
        for (let y = 0; y < img.height; y++) {
            const i = y * img.width * 4 + x * 4;
            let px = 0;

            for (let j = 0; j < 3; j++) {
                if (j === c) px += mainDiff * imgPixels[i + j];
                else px += diff * imgPixels[i + j];
            }

            px += px * exposure;
            if (px < 0) px = 0;
            if (px > 255) px = 255;

            output[x].push(px);
        }
    }

    return output;
}

export function normalizeGrays(p, count) {
    if (!grayBox) {
        for (let x = 0; x < p.length; x++) {
            for (let y = 0; y < p[x].length; y++) {
                p[x][y] = (p[x][y] * count) / 256;
            }
        }

        return p;
    }

    let longPixels = [];

    for (let x = 0; x < p.length; x++) {
        for (let y = 0; y < p[x].length; y++) {
            longPixels.push(p[x][y]);
        }
    }

    longPixels = longPixels.sort((a, b) => a - b);
    const totalPixels = longPixels.length;
    const splits = totalPixels / count;

    const cutoffs = [];

    for (let i = 1; i < count; i++) {
        cutoffs.push(longPixels[Math.floor(splits * i)]);
    }

    cutoffs.push(256);

    for (let x = 0; x < p.length; x++) {
        for (let y = 0; y < p[x].length; y++) {
            for (let i = 0; i < cutoffs.length; i++) {
                if (p[x][y] < cutoffs[i]) {
                    p[x][y] = i;
                    break;
                }
            }
        }
    }

    return p;
}

export function diither(p) {

    const matrix = diid8x8;
    p = normalizeEdges(p);

    const xl = matrix[0].length;
    const yl = matrix.length;
    const adjustment = 1;

    p = normalizeGrays(p, 18);

    const out = [];

    for (let x = 0; x < p.length; x++) {
        out.push([]);
        for (let y = 0; y < p[x].length; y++) {
            out[x].push(p[x][y] + adjustment > matrix[x % xl][y % yl] ? 255 : 0);
        }
    }

    return out;
}

export function diidify(p) {
    const r = 126;
    const g = 143;
    const b = 250;

    const gr = 47;

    for (let x = 0; x < p.length; x++) {
        for (let y = 0; y < p[x].length; y++) {
            const i = y * p.length * 4 + x * 4;
            if (p[x][y] > 125) {
                imgPixels[i] = r;
                imgPixels[i + 1] = g;
                imgPixels[i + 2] = b;
                imgPixels[i + 3] = 255;
            } else {
                imgPixels[i] = gr;
                imgPixels[i + 1] = gr;
                imgPixels[i + 2] = gr;
                imgPixels[i + 3] = 255;
            }
        }
    }

    img.updatePixels();
}

function scorePixels(p) {
    const lp = laplacian(p);

    const sddev = 0.2;
    const med = 128;

    return p.map((xVal, x) =>
        xVal.map((val, y) => {
            const laplacianImpliedContrast = Math.abs(lp[x][y]);

            const wellExposedness = Math.exp(
                -Math.pow((val - med) / 256, 2) / (2 * Math.pow(sddev, 2))
            );

            return laplacianImpliedContrast * wellExposedness;
        })
    );
}

export function fuse(options) {
    const out = [];
    const maxScore = [];


    for (let option of options) {
        const score = scorePixels(option);

        for (let x = 0; x < option.length; x++) {
            if (!maxScore[x]) maxScore.push([]);
            if (!out[x]) out.push([]);
            for (let y = 0; y < option[x].length; y++) {
                if (!maxScore[x][y]) maxScore[x].push(0);
                if (!out[x][y]) out[x].push(0);

                if (maxScore[x][y] <= score[x][y]) {
                    maxScore[x][y] = score[x][y];
                    out[x][y] = option[x][y];
                }
            }
        }
    }

    return out;
}

export function normalizeEdges(p) {
    let max = 0;
    let min = -1;

    const out = [];

    for (let x = 0; x < p.length; x++) {
        for (let y = 0; y < p[x].length; y++) {
            if (p[x][y] > max) max = p[x][y];
            if (p[x][y] < min || min === -1) min = p[x][y];
        }
    }

    if (max === min) {
        return p.map(row => row.map(() => 0));
    }

    for (let x = 0; x < p.length; x++) {
        out.push([]);
        for (let y = 0; y < p[x].length; y++) {
            out[x].push((255 * (p[x][y] - min)) / (max - min));
        }
    }

    return out;
}

export function ditherIt(img_in, {exp, color, gray}) {
    img = img_in;
    img.loadPixels();
    imgPixels = img.pixels;
    img.filter(BLUR, 1.1);
    grayBox = gray;

    const exposures = [
        0, 0.1, -0.1, -0.05, 0.05, 0.15, -0.15, 0.03, -0.03,
    ].slice(0, (exp - 1) * 2 + 1);

    const diffs = [0.1, 0.3, 0.2, 0.05].slice(0, color - 1);

    let goldDither;

    for (let exposure of exposures) {
        let graypx = getGrayPixels(exposure);

        let out1 = diither(graypx);
        // console.log("dither_11", stats(arrayToVec(out1,13,13)));
        if (!goldDither) goldDither = out1;
        else goldDither = fuse([goldDither, out1]);

        for (let diff of diffs) {
            for (let i = 0; i < 3; i++) {
                goldDither = fuse([goldDither, diither(getChannelPixels(i, diff))]);
            }
        }

    }

    diidify(goldDither);

}
