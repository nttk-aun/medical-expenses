import { readFile } from "fs/promises";

const MIN_READ_SIDE = 1600;

/** เตรียมภาพจาก buffer ก่อน OCR (ไม่ต้องมีไฟล์บนดิสก์) */
export async function preprocessImageBufferFromBytes(
  input: Buffer,
): Promise<Buffer | null> {
  try {
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default;
    const meta = await sharp(input).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const shortSide = w > 0 && h > 0 ? Math.min(w, h) : Math.max(w, h) || 800;

    let img = sharp(input).rotate().greyscale().normalize();

    if (shortSide < MIN_READ_SIDE && w > 0 && h > 0) {
      if (w >= h) {
        img = img.resize({
          width: MIN_READ_SIDE,
          fit: "inside",
          withoutEnlargement: false,
        });
      } else {
        img = img.resize({
          height: MIN_READ_SIDE,
          fit: "inside",
          withoutEnlargement: false,
        });
      }
    }

    return await img
      .sharpen({ sigma: 0.55, m1: 0.75, m2: 2 })
      .png()
      .toBuffer();
  } catch (err) {
    console.error("[preprocessImageBufferFromBytes]", err);
    return null;
  }
}

/** เตรียมภาพก่อน OCR: หมุนตาม EXIF, โทนเทา, ขยายให้ด้านสั้น ≥ ~1600px, คมเล็กน้อย */
export async function preprocessImageBufferForOcr(
  imagePath: string,
): Promise<Buffer | null> {
  try {
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default;
    const input = await readFile(imagePath);
    const meta = await sharp(input).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const shortSide = w > 0 && h > 0 ? Math.min(w, h) : Math.max(w, h) || 800;

    let img = sharp(input).rotate().greyscale().normalize();

    if (shortSide < MIN_READ_SIDE && w > 0 && h > 0) {
      if (w >= h) {
        img = img.resize({
          width: MIN_READ_SIDE,
          fit: "inside",
          withoutEnlargement: false,
        });
      } else {
        img = img.resize({
          height: MIN_READ_SIDE,
          fit: "inside",
          withoutEnlargement: false,
        });
      }
    }

    return await img
      .sharpen({ sigma: 0.55, m1: 0.75, m2: 2 })
      .png()
      .toBuffer();
  } catch (err) {
    console.error("[preprocessImageBufferForOcr]", err);
    return null;
  }
}
