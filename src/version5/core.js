export function floydSteinbergLUT(p5img, {gamma = 1.3, brighten = 1.3} = {}) {
    p5img.loadPixels();
    const w = p5img.width;
    const h = p5img.height;
    let arr = new Float32Array(w * h);

    // Build LUT
    let lut = new Float32Array(256);
    let gammaLut = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
        gammaLut[i] = Math.pow(i / 255, gamma) * 255;
    }
    let interp = [0, 64, 128, 192, 255];
    let mapped = [0, 50, 120, 190, 235];

    function lutInterp(val) {
        for (let i = 0; i < interp.length - 1; i++) {
            if (val <= interp[i + 1]) {
                let t = (val - interp[i]) / (interp[i + 1] - interp[i]);
                return mapped[i] + t * (mapped[i + 1] - mapped[i]);
            }
        }
        return mapped[mapped.length - 1];
    }

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let idx = 4 * (y * w + x);
            let g = p5img.pixels[idx]; // grayscale image expected
            let val = gammaLut[g] * brighten;
            val = Math.min(255, Math.max(0, val));
            arr[y * w + x] = lutInterp(val);
        }
    }

    let out = new Uint8Array(w * h);
    const step = 255 / 7;

    // Floyd–Steinberg
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let i = y * w + x;
            let oldVal = arr[i];
            let newVal = Math.round(oldVal / step);
            out[i] = newVal;
            let error = oldVal - newVal * step;

            if (x + 1 < w) arr[i + 1] += error * 7 / 16;
            if (y + 1 < h) {
                if (x > 0) arr[i + w - 1] += error * 3 / 16;
                arr[i + w] += error * 5 / 16;
                if (x + 1 < w) arr[i + w + 1] += error * 1 / 16;
            }
        }
    }

    // Write back
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let idx = 4 * (y * w + x);
            let val = out[y * w + x] * 255 / 7;
            p5img.pixels[idx] = val;
            p5img.pixels[idx + 1] = val;
            p5img.pixels[idx + 2] = val;
            p5img.pixels[idx + 3] = 255;
        }
    }
    p5img.updatePixels();
}
