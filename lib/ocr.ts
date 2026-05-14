import { createWorker, type Worker } from "tesseract.js";
import { preprocessImageBufferForOcr } from "@/lib/ocr-prep";

export type OcrBbox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

/** บรรทัดจาก Tesseract พร้อมตำแหน่ง — ใช้หามุมล่างขวาของใบเสร็จ */
export type OcrLineBox = {
  text: string;
  bbox: OcrBbox;
};

export type OcrResult = {
  text: string;
  lines: OcrLineBox[];
};

type RawBlock = {
  paragraphs?: RawParagraph[];
};

type RawParagraph = {
  lines?: RawLine[];
};

type RawLine = {
  text?: string;
  bbox?: OcrBbox;
};

function flattenOcrLinesFromData(data: unknown): OcrLineBox[] {
  const out: OcrLineBox[] = [];
  try {
    const d = data as { blocks?: RawBlock[] | null };
    const blocks = d?.blocks;
    if (!Array.isArray(blocks)) {
      return out;
    }
    for (const block of blocks) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          const t = (line.text ?? "").trim();
          const b = line.bbox;
          if (t && b && [b.x0, b.y0, b.x1, b.y1].every((n) => Number.isFinite(n))) {
            out.push({ text: t, bbox: b });
          }
        }
      }
    }
    return out;
  } catch (err) {
    console.error("[flattenOcrLinesFromData]", err);
    return out;
  }
}

export async function runOcrOnImagePath(imagePath: string): Promise<OcrResult> {
  let worker: Worker | undefined;
  try {
    worker = await createWorker("tha+eng");
    const prepared = await preprocessImageBufferForOcr(imagePath);
    const input: string | Buffer = prepared ?? imagePath;
    const { data } = await worker.recognize(input);
    const text = data?.text ?? "";
    const lines = flattenOcrLinesFromData(data);
    return { text, lines };
  } catch (err) {
    console.error("[runOcrOnImagePath]", err);
    throw err;
  } finally {
    try {
      if (worker) {
        await worker.terminate();
      }
    } catch (err) {
      console.error("[runOcrOnImagePath] terminate", err);
    }
  }
}
