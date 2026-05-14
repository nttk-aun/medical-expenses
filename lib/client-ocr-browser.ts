import type { OcrBbox, OcrLineBox, OcrResult } from "@/lib/ocr";

type RawLine = {
  text?: string;
  bbox?: OcrBbox;
};

type RawParagraph = {
  lines?: RawLine[];
};

type RawBlock = {
  paragraphs?: RawParagraph[];
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
    console.error("[flattenOcrLinesFromData client]", err);
    return out;
  }
}

/** OCR ในเบราว์เซอร์ (ไม่ผ่านเซิร์ฟเวอร์) — ใช้บน Vercel กันหมดเวลา serverless */
export async function runClientOcrOnFile(file: File): Promise<OcrResult> {
  let worker: import("tesseract.js").Worker | undefined;
  try {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("tha+eng");
    const { data } = await worker.recognize(file);
    const text = data?.text ?? "";
    const lines = flattenOcrLinesFromData(data);
    return { text, lines };
  } catch (err) {
    console.error("[runClientOcrOnFile]", err);
    throw err;
  } finally {
    try {
      if (worker) {
        await worker.terminate();
      }
    } catch (err) {
      console.error("[runClientOcrOnFile] terminate", err);
    }
  }
}
