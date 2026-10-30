import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

function inRoundRect(x, y, left, top, right, bottom, radius) {
  if (x < left || y < top || x >= right || y >= bottom) return false;
  const centers = [
    [left + radius, top + radius],
    [right - radius - 1, top + radius],
    [left + radius, bottom - radius - 1],
    [right - radius - 1, bottom - radius - 1],
  ];
  const inCorner =
    (x < left + radius && y < top + radius) ||
    (x >= right - radius && y < top + radius) ||
    (x < left + radius && y >= bottom - radius) ||
    (x >= right - radius && y >= bottom - radius);
  if (!inCorner) return true;
  return centers.some(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2);
}

function paint(size, maskable) {
  const png = new PNG({ width: size, height: size });
  const inset = Math.round(size * (maskable ? 0.2 : 0.1));
  const radius = Math.round(size * 0.16);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (size * y + x) << 2;
      let r = 0x9a;
      let g = 0x34;
      let b = 0x12;
      const card = inRoundRect(x, y, inset, inset, size - inset, size - inset, radius);
      if (card) {
        r = 0xf6;
        g = 0xf1;
        b = 0xe8;
      }
      const sunX = size * 0.36;
      const sunY = size * 0.38;
      const sunR = size * 0.07;
      if (card && (x - sunX) ** 2 + (y - sunY) ** 2 <= sunR ** 2) {
        r = 0xc2;
        g = 0x41;
        b = 0x0c;
      }
      const hill = size * 0.64;
      const floor = size - inset - size * 0.06;
      if (card && y >= hill && y <= floor) {
        const rise = (y - hill) / Math.max(1, floor - hill);
        const half = size * (0.06 + rise * 0.34);
        if (Math.abs(x - size * 0.52) <= half) {
          r = 0x9a;
          g = 0x34;
          b = 0x12;
        }
      }
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", paint(192, false));
writeFileSync("public/icons/icon-512.png", paint(512, false));
writeFileSync("public/icons/icon-maskable-512.png", paint(512, true));
writeFileSync("public/icons/apple-touch-icon.png", paint(180, false));
