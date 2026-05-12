import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createReceiptStagingWithOcr } from "@/lib/receipt-staging-service";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

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
    const ext = extensionForMime(mimeType);
    const relativePath = path.join("uploads", `${id}${ext}`);
    const absolutePath = path.join(process.cwd(), relativePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buf);

    const result = await createReceiptStagingWithOcr({
      stagingId: id,
      originalFilename,
      absoluteFilePath: absolutePath,
      storedPath: relativePath.split(path.sep).join("/"),
      mimeType,
      fileSizeBytes: buf.byteLength,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[POST /api/documents/upload]", err);
    return NextResponse.json(
      { error: "อัปโหลดหรือประมวลผลไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
