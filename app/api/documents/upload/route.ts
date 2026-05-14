import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createReceiptStagingWithOcrFromBuffer } from "@/lib/receipt-staging-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function uploadErrorMessageForClient(err: unknown): string {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    if (/P1001|Can't reach database server/i.test(msg)) {
      return "เชื่อมต่อฐานข้อมูลไม่ได้ — ตรวจสอบ DATABASE_URL บน Vercel";
    }
    if (/P1000|Authentication failed|password authentication failed/i.test(msg)) {
      return "ฐานข้อมูลปฏิเสธการเข้าสู่ระบบ — ตรวจสอบ DATABASE_URL";
    }
  } catch (inner) {
    console.error("[uploadErrorMessageForClient]", inner);
  }
  return "อัปโหลดหรือประมวลผลไม่สำเร็จ";
}

function extensionForMime(mime: string): string {
  try {
    if (mime === "image/jpeg") {
      return ".jpg";
    }
    if (mime === "image/png") {
      return ".png";
    }
    if (mime === "image/webp") {
      return ".webp";
    }
    return ".bin";
  } catch (err) {
    console.error("[extensionForMime]", err);
    return ".bin";
  }
}

export async function POST(request: Request) {
  try {
    if (!process.env.DATABASE_URL?.trim()) {
      return NextResponse.json(
        { error: "ไม่พบ DATABASE_URL ใน Environment Variables" },
        { status: 500 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    }

    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json(
        { error: "รองรับเฉพาะ JPG, PNG, WebP" },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 15MB" }, { status: 400 });
    }

    const originalFilename =
      typeof (file as File).name === "string" && (file as File).name.length > 0
        ? (file as File).name
        : `upload${extensionForMime(mimeType)}`;

    const id = randomUUID();

    const result = await createReceiptStagingWithOcrFromBuffer({
      stagingId: id,
      originalFilename,
      buffer: buf,
      mimeType,
      fileSizeBytes: buf.byteLength,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[POST /api/documents/upload]", err);
    return NextResponse.json(
      { error: uploadErrorMessageForClient(err) },
      { status: 500 },
    );
  }
}
