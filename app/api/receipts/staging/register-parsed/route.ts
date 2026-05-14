import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { OcrLineBox } from "@/lib/ocr";
import { createReceiptStagingFromClientPayload } from "@/lib/receipt-staging-service";

export const runtime = "nodejs";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_OCR_TEXT = 500_000;

function coerceLines(raw: unknown): OcrLineBox[] {
  const out: OcrLineBox[] = [];
  try {
    if (!Array.isArray(raw)) {
      return out;
    }
    for (const item of raw) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const o = item as { text?: unknown; bbox?: unknown };
      const text = typeof o.text === "string" ? o.text.trim() : "";
      const b = o.bbox as Record<string, unknown> | undefined;
      if (!text || !b) {
        continue;
      }
      const x0 = Number(b.x0);
      const y0 = Number(b.y0);
      const x1 = Number(b.x1);
      const y1 = Number(b.y1);
      if (![x0, y0, x1, y1].every((n) => Number.isFinite(n))) {
        continue;
      }
      out.push({ text, bbox: { x0, y0, x1, y1 } });
    }
    return out;
  } catch (err) {
    console.error("[coerceLines]", err);
    return out;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      stagingId?: string;
      originalFilename?: string;
      storedPath?: string;
      mimeType?: string;
      fileSizeBytes?: number;
      ocrText?: string;
      lines?: unknown[];
    } | null;

    const stagingId = body?.stagingId?.trim();
    const originalFilename = body?.originalFilename?.trim() ?? "";
    const storedPath = body?.storedPath?.trim() ?? "";
    const mimeType = body?.mimeType?.trim() || "application/octet-stream";
    const fileSizeBytes =
      typeof body?.fileSizeBytes === "number" && Number.isFinite(body.fileSizeBytes)
        ? Math.floor(body.fileSizeBytes)
        : 0;
    const ocrText =
      typeof body?.ocrText === "string" ? body.ocrText.slice(0, MAX_OCR_TEXT) : "";
    const lines = coerceLines(body?.lines);

    if (!stagingId) {
      return NextResponse.json({ error: "ไม่พบ stagingId" }, { status: 400 });
    }
    if (!originalFilename) {
      return NextResponse.json({ error: "ไม่พบชื่อไฟล์" }, { status: 400 });
    }
    if (!storedPath.startsWith("https://")) {
      return NextResponse.json({ error: "storedPath ไม่ถูกต้อง" }, { status: 400 });
    }
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json(
        { error: "รองรับเฉพาะ JPG, PNG, WebP" },
        { status: 400 },
      );
    }
    if (fileSizeBytes <= 0 || fileSizeBytes > Math.floor(4.5 * 1024 * 1024)) {
      return NextResponse.json({ error: "ขนาดไฟล์ไม่ถูกต้อง" }, { status: 400 });
    }

    const result = await createReceiptStagingFromClientPayload({
      stagingId,
      originalFilename,
      storedPath,
      mimeType,
      fileSizeBytes,
      ocrText,
      lines,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[POST /api/receipts/staging/register-parsed]", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "รายการนี้มีแล้ว — ลองอัปโหลดใหม่" },
        { status: 409 },
      );
    }
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "INVALID_STAGING_ID") {
      return NextResponse.json({ error: "stagingId ไม่ถูกต้อง" }, { status: 400 });
    }
    if (code === "INVALID_STORED_PATH") {
      return NextResponse.json({ error: "storedPath ไม่ถูกต้อง" }, { status: 400 });
    }
    return NextResponse.json({ error: "บันทึกรายการชั่วคราวไม่สำเร็จ" }, { status: 500 });
  }
}
