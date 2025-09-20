export function floydSteinbergBW(p5img, {gamma = 1.3, brighten = 1.3} = {}) {
    p5img.loadPixels();
    const w = p5img.width;
    const h = p5img.height;
    let arr = new Float32Array(w * h);

    // Build gamma LUT
    let gammaLut = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
        gammaLut[i] = Math.pow(i / 255, gamma) * 255;
    }

    // Preprocess input pixels
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let idx = 4 * (y * w + x);
            let g = p5img.pixels[idx]; // grayscale expected
            let val = gammaLut[g] * brighten;
            val = Math.min(255, Math.max(0, val));
            arr[y * w + x] = val;
        }
    }

    // Output (binary values 0 or 1)
    let out = new Uint8Array(w * h);

    // Floyd–Steinberg error diffusion (BW)
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let i = y * w + x;
            let oldVal = arr[i];
            let newVal = oldVal < 128 ? 0 : 255; // only black or white
            out[i] = newVal;
            let error = oldVal - newVal;

            if (x + 1 < w) arr[i + 1] += error * 7 / 16;
            if (y + 1 < h) {
                if (x > 0) arr[i + w - 1] += error * 3 / 16;
                arr[i + w] += error * 5 / 16;
                if (x + 1 < w) arr[i + w + 1] += error * 1 / 16;
            }
        }
    }

    // Write back to image
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let idx = 4 * (y * w + x);
            let val = out[y * w + x];
            p5img.pixels[idx] = val;
            p5img.pixels[idx + 1] = val;
            p5img.pixels[idx + 2] = val;
            p5img.pixels[idx + 3] = 255;
        }
    }
    p5img.updatePixels();
}
