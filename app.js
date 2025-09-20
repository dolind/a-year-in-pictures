import {ditherIt as ditherV1} from "src/version1/core.js";
import {ditherIt as ditherV2} from "src/version2/core.js";
import {ditherIt as ditherGPU} from "src/version3/core.js";
import {ditherIt as ditherV4} from "src/version4/core.js";
import {floydSteinbergLUT} from "src/version5/core.js";
import {floydSteinbergBW} from "src/version6/core.js";

let img;
let originalImg
let expSlider, colorSlider, grayBox, saveBox, versionRadio;
let computing = false;
let lastSettings = {};
let statusDiv;
window.preload = function preload() {
    // Load a test image – replace with your own path
    originalImg = loadImage("test.png");
}

window.setup = function setup() {
    pixelDensity(1);
    createCanvas(1200, 825).parent(document.body);

    // Controls
    const controls = createDiv().id("controls");

    let label = createDiv("Exposures: ");
    expSlider = createSlider(1, 5, 1);
    expSlider.parent(label);
    expSlider.changed(triggerRecompute);
    label.parent(controls);

    label = createDiv("Color Depth: ");
    colorSlider = createSlider(1, 5, 1);
    colorSlider.parent(label);
    colorSlider.changed(triggerRecompute);
    label.parent(controls);

    label = createDiv("Normalization: ");
    grayBox = createCheckbox();
    grayBox.parent(label);
    label.parent(controls);


    label = createDiv("Save image: ");
    saveBox = createCheckbox();
    saveBox.parent(label);
    label.parent(controls);
    saveBox.changed(triggerRecompute);
    statusDiv = createDiv("").parent(controls);


    label = createDiv("Version: ");
    versionRadio = createRadio();
    versionRadio.option("v1", "v1: Original 2D Arrays");
    versionRadio.option("v2", "v2: 1D Preallocated Typed Arrays");
    versionRadio.option("v3", "v3: WebGPU");
    versionRadio.option("v4", "v4: same as v2 with 3bit dithering ");
    versionRadio.option("fs-lut", "Floyd–Steinberg LUT 3bit");
    versionRadio.option("fs", "Floyd–Steinberg LUT 1bit");
    versionRadio.selected("v2"); // default
    versionRadio.parent(label);
    versionRadio.changed(triggerRecompute);
    label.parent(controls);
    // First run
    img = originalImg.get();
    triggerRecompute();
}

window.draw = function draw() {
    background("#2f2f2f");
    if (img) {
        image(img, 0, 0);
    }
}

function triggerRecompute() {
    if (computing) return;
    computing = true;

    const settings = {
        exp: expSlider.value(),
        color: colorSlider.value(),
        gray: grayBox.checked(),
        save: saveBox.checked(),
        version: versionRadio.value()
    };

    if (JSON.stringify(settings) === JSON.stringify(lastSettings)) {
        computing = false;
        return;
    }

    lastSettings = settings;

    const startTime = performance.now();

    setTimeout(async () => {
        let workingImg = originalImg.get();
        workingImg.loadPixels(); // ensure .pixels is valid

        switch (settings.version) {
            case "v1":
                ditherV1(workingImg, {exp: settings.exp, color: settings.color, gray: settings.gray});
                break;
            case "v2":
                ditherV2(workingImg, {exp: settings.exp, color: settings.color, gray: settings.gray});
                break;
            case "v3": {
                // GPU path must await
                const outPixels = await ditherGPU(
                    workingImg.pixels,
                    workingImg.width,
                    workingImg.height,
                    {exp: settings.exp, color: settings.color, gray: settings.gray}
                );
                workingImg.pixels.set(outPixels);
                workingImg.updatePixels();
                break;
            }
            case "v4":
                ditherV4(workingImg, {exp: settings.exp, color: settings.color, gray: settings.gray});
                break;
            case "fs-lut":
                floydSteinbergLUT(workingImg, {gamma: 1.3, brighten: 1.3});
                break;
            case "fs":
                floydSteinbergBW(workingImg, {gamma: 1.3, brighten: 1.3});
                break;
        }

        img = workingImg;
        const endTime = performance.now();
        const elapsed = (endTime - startTime).toFixed(2);
        statusDiv.html(`${settings.version} computed in ${elapsed} ms`);
        computing = false;
        loop();

        if (saveBox.checked()) {
            img.save("dithered.png");
        }
    }, 10);


    if (saveBox.checked()) {
        img.save("dithered.png");
    }
}
