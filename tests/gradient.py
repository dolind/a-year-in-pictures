from PIL import Image
import numpy as np

def gradient_test(width=1200, height=825, filename="gradient_test"):
    """
    Create a left-to-right gradient using all 8 Inkplate grayscale levels.
    Saves as PNG and BMP (8-bit grayscale).
    """
    arr = np.zeros((height, width), dtype=np.uint8)
    for x in range(width):
        level = int(round((x / (width - 1)) * 7))  # 0..7
        arr[:, x] = level

    # Scale to 0..255 with exact mapping
    arr8 = (arr.astype(np.uint16) * 255 // 7).astype(np.uint8)

    img = Image.fromarray(arr8, mode="L")
    img.save(filename + ".png", format="PNG")
    print(f"Saved {filename}.png  ({width}x{height})")

# Example: generate Inkplate gradient
gradient_test()
