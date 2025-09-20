import fs from "fs";
import path from "path";
import {Jimp} from "jimp";
import inquirer from "inquirer";
import {writeFile} from "fs/promises";

import {ditherIt as ditherV2} from "./core.js";

const targetWidth = 1200;
const targetHeight = 825;

async function resizeAndCrop(img, targetWidth, targetHeight) {
    const targetRatio = targetWidth / targetHeight;
    const srcRatio = img.bitmap.width / img.bitmap.height;

    let drawW, drawH;

    if (srcRatio > targetRatio) {

        drawH = targetHeight;
        drawW = img.bitmap.width * (targetHeight / img.bitmap.height);
    } else {

        drawW = targetWidth;
        drawH = img.bitmap.height * (targetWidth / img.bitmap.width);
    }

    img.resize({w: Math.round(drawW), h: Math.round(drawH)});


    const x = Math.max(0, Math.round((img.bitmap.width - targetWidth) / 2));
    const y = Math.max(0, Math.round((img.bitmap.height - targetHeight) / 2));


    img.crop({x, y, w: targetWidth, h: targetHeight});

    return img;
}

async function main() {

    const {inputDir} = await inquirer.prompt([
        {
            type: "input",
            name: "inputDir",
            message: "Enter the path to your image directory:",
            default: "./test"
        }
    ]);

    if (!fs.existsSync(inputDir)) {
        console.error(`❌ Directory not found: ${inputDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(inputDir).filter(f => /\.(png|jpe?g)$/i.test(f));
    if (files.length === 0) {
        console.log("No images found in folder.");
        return;
    }

    const outputDir = "./output";
    fs.mkdirSync(outputDir, {recursive: true});


    let index = 0;

    for (const file of files) {
        console.log(`Processing ${file}...`);
        const filePath = path.join(inputDir, file);
        const img = await Jimp.read(filePath);


        await resizeAndCrop(img, targetWidth, targetHeight);

        ditherV2(img, {exp: 3, color: 2, gray: true}, true);


        // Save to disk
        const outName = `a-year-in-pictures-${index}.png`;
        const outPath = path.join(outputDir, outName);
        const buf = await img.getBuffer("image/png");
        await writeFile(outPath, buf);


        console.log(`✅ Processed ${file} -> ${outName}`);
        index++;
    }

}

main().catch(console.error);
