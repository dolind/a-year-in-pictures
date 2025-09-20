import {diid8x8, LoGKernel} from "../common/kernels.js";

let buffers = null;


export function ensureBuffers(W, H) {
    if (buffers && buffers.W === W && buffers.H === H) return;
    buffers = {
        W, H,
        gray: new Float32Array(W * H),
        tmp1: new Float32Array(W * H),
        tmp2: new Float32Array(W * H),
        score: new Float32Array(W * H),
        mask: new Float32Array(W * H),
        accumA: new Float32Array(W * H),
        accumB: new Float32Array(W * H)
    };
}

export function scorePixels(src, W, H, dst) {
    // Laplacian must also be col-major
    const lp = new Float32Array(W * H);
    laplacian(src, W, H, lp);

    const sddev = 0.2;
    const med = 128;

    for (let col = 0; col < W; col++) {
        for (let row = 0; row < H; row++) {
            const idx = col * H + row; // col-major index

            const laplacianImpliedContrast = Math.abs(lp[idx]);
            const val = src[idx];

            const wellExposedness = Math.exp(
                -Math.pow((val - med) / 256, 2) / (2 * Math.pow(sddev, 2))
            );

            dst[idx] = laplacianImpliedContrast * wellExposedness;
        }
    }

    return dst;
}


// we flatten all function to 1d with width * height for indexing
export function laplacian(src, W, H, dst) {
    const lOffset = Math.ceil(LoGKernel.length / 2);

    for (let row = 0; row < H; row++) {
        for (let col = 0; col < W; col++) {
            let acc = 0;

            for (let kernel_row = 0; kernel_row < LoGKernel.length; kernel_row++) {
                const yy = row + kernel_row - lOffset;
                if (yy < 0 || yy >= H) continue;

                for (let kernel_col = 0; kernel_col < LoGKernel[0].length; kernel_col++) {
                    const xx = col + kernel_col - lOffset;
                    if (xx < 0 || xx >= W) continue;

                    // column-major lookup
                    acc += LoGKernel[kernel_row][kernel_col] * src[xx * H + yy];
                }
            }

            dst[col * H + row] = acc;
        }
    }

    return dst;
}

export function getGrayPixels(pix, W, H, exposure = 0, dst) {
    const f = 1 + exposure;

    for (let row = 0; row < H; row++) {
        for (let col = 0; col < W; col++) {
            // ImageData is always row-major (row * W + col)
            const rgbaIndex = (row * W + col) * 4;
            let base = pix[rgbaIndex + 2];
            let px = base + base * exposure;
            if (px < 0) px = 0;
            else if (px > 255) px = 255;

            // Store in column-major layout
            const idx = col * H + row;
            dst[idx] = px;
        }
    }

    return dst;
}


export function getChannelPixels(pix, W, H, c, diff, exposure = 0, dst) {
    const mainDiff = 1 - 2 * diff;

    // weights (same as original)


    for (let row = 0; row < H; row++) {
        for (let col = 0; col < W; col++) {
            // ImageData is row-major
            const rgbaIndex = (row * W + col) * 4;

            let px = 0;
            for (let j = 0; j < 3; j++) {
                if (j === c) px += mainDiff * pix[rgbaIndex + j];
                else px += diff * pix[rgbaIndex + j];
            }
            px += px * exposure;
            if (px < 0) px = 0;
            else if (px > 255) px = 255;

            // column-major storage
            const idx = col * H + row;
            dst[idx] = px;
        }
    }

    return dst;
}


export function normalizeGrays(src, W, H, count, doEq, dst) {
    const N = W * H;

    if (!doEq) {
        for (let i = 0; i < N; i++) {
            dst[i] = (src[i] * count) / 256;
        }
        return dst;
    }

    // 1. Copy into plain array
    const sorted = new Array(N);
    for (let i = 0; i < N; i++) {
        sorted[i] = src[i];
    }

    // 2. Sort
    sorted.sort((a, b) => a - b);

    // 3. Compute cutoffs
    const splits = N / count;
    const cutoffs = [];
    for (let i = 1; i < count; i++) {
        cutoffs.push(sorted[Math.floor(splits * i)]);
    }
    cutoffs.push(256);
    // 4. Assign bins (always assign something!)
    for (let i = 0; i < N; i++) {
        let v = src[i];
        if (v < 0) v = 0;
        else if (v > 255) v = 255;

        let bin = count - 1; // fallback last bin
        for (let k = 0; k < count; k++) {
            if (v < cutoffs[k]) {
                bin = k;
                break;
            }
        }
        dst[i] = bin;
    }

    return dst;
}


export function diither(src, W, H, dst, doEq) {

    normalizeEdges(src, buffers.tmp1, W * H);

    normalizeGrays(buffers.tmp1, W, H, 18, doEq, buffers.mask);

    const col_num = diid8x8[0].length; // width of matrix
    const row_num = diid8x8.length;    // height of matrix
    const adjustment = 1;

    // Step 3: apply Bayer-like threshold matrix
    for (let row = 0; row < H; row++) {
        for (let col = 0; col < W; col++) {
            const idx = col * H + row;
            const threshold = diid8x8[col % col_num][row % row_num];
            dst[idx] = (buffers.mask[idx] + adjustment > threshold) ? 255 : 0;
        }
    }

    return dst;
}


export function diidify(mask, pix, W, H, bw = false, inverted = false) {

    let r = 126;
    let g = 143;
    let b = 250;
    let gr = 47;

    if (bw) {
        const r = 255;
        const g = 255;
        const b = 255;
        const gr = 255;
    }

    for (let col = 0; col < W; col++) {
        for (let row = 0; row < H; row++) {
            const idx = col * H + row;        // column-major index into mask
            const rgbaIndex = (row * W + col) * 4; // ImageData is row-major

            let white = mask[idx] > 125;
            if (inverted) {
                white = !white;
            }
            if (white) {
                pix[rgbaIndex] = r;
                pix[rgbaIndex + 1] = g;
                pix[rgbaIndex + 2] = b;
                pix[rgbaIndex + 3] = 255;
            } else {
                pix[rgbaIndex] = gr;
                pix[rgbaIndex + 1] = gr;
                pix[rgbaIndex + 2] = gr;
                pix[rgbaIndex + 3] = 255;
            }
        }
    }
}

export function fuse(options, W, H, out, scoreBuf, tmpScore) {
    const N = W * H;

    // seed
    scoreBuf.fill(0);

    for (let opt of options) {

        scorePixels(opt, W, H, tmpScore);

        for (let x = 0; x < W; x++) {
            for (let y = 0; y < H; y++) {
                const idx = x * H + y;
                const val = tmpScore[idx];
                if (val >= scoreBuf[idx]) {
                    scoreBuf[idx] = val;

                    out[idx] = opt[idx];
                }
            }
        }
    }

    return out;
}


export function normalizeEdges(src, dst, N) {
    let min = src[0], max = src[0];
    for (let i = 1; i < N; i++) {
        const v = src[i];
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (max === min) {
        dst.fill(0);
        return dst;
    }
    const scale = 255 / (max - min);
    for (let i = 0; i < N; i++) {
        dst[i] = (src[i] - min) * scale;
    }
    return dst;
}

export function ditherIt(img, {exp, color, gray}, saveImage = false) {
    const W = img.width, H = img.height;
    ensureBuffers(W, H);
    img.loadPixels();
    img.filter(BLUR, 1.1);
    const imgPixels = img.pixels;
    const exposures = [
        0, 0.1, -0.1, -0.05, 0.05, 0.15, -0.15, 0.03, -0.03,
    ].slice(0, (exp - 1) * 2 + 1);

    const diffs = [0.1, 0.3, 0.2, 0.05]
        .slice(0, color - 1);

    let goldDither;

    // === show total work ===
    const totalSteps = exposures.length * (1 + diffs.length * 3);
    let step = 0;

    function updateStatus() {
        if (typeof statusDiv !== "undefined" && statusDiv) {
            statusDiv.html(`Processing… ${step}/${totalSteps}`);
        }
    }

    // clear accumulators
    buffers.accumA.fill(0);
    buffers.accumB.fill(0);
    buffers.score.fill(0);

    let acc = buffers.accumA;
    let tmp = buffers.accumB;
    let seeded = false;


    for (let exposure of exposures) {
        // === DITHER GRAYSCALE BEFORE FUSING ===
        getGrayPixels(imgPixels, W, H, exposure, buffers.gray);

        diither(buffers.gray, W, H, buffers.tmp1, gray);

        if (!seeded) {
            acc.set(buffers.tmp1);
            seeded = true;
        } else {
            fuse([acc, buffers.tmp1], W, H, tmp, buffers.score, buffers.tmp2);
            [acc, tmp] = [tmp, acc];
        }

        for (let diff of diffs) {
            for (let c = 0; c < 3; c++) {
                getChannelPixels(imgPixels, W, H, c, diff, 0, buffers.gray);
                diither(buffers.gray, W, H, buffers.tmp1, gray);
                fuse([acc, buffers.tmp1], W, H, tmp, buffers.score, buffers.tmp2);
                [acc, tmp] = [tmp, acc];
            }
        }

    }

    diidify(acc, imgPixels, W, H, saveImage, saveImage);

    img.updatePixels();
    if (typeof statusDiv !== "undefined" && statusDiv) {
        statusDiv.html("✅ Processing complete");
    }

}
