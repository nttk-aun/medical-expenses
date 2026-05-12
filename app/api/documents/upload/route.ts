import { mkdir, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import { after } from "next/server";
import { NextResponse } from "next/server";
import {
  createReceiptStagingPlaceholder,
  createReceiptStagingWithOcr,
  runOcrAndPatchStaging,
} from "@/lib/receipt-staging-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES_LOCAL = 15 * 1024 * 1024;
/** Server → Blob `put()` limit (Vercel); local disk path can use larger files. */
const MAX_BYTES_BLOB_SERVER = Math.floor(4.5 * 1024 * 1024);
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function uploadErrorMessageForClient(err: unknown): string {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    if (/P1001|Can't reach database server/i.test(msg)) {
      return "เชื่อมต่อฐานข้อมูลไม่ได้ — ตรวจสอบ DATABASE_URL บน Vercel (Neon: ใช้ connection string แบบ pooled / `-pooler` ตามที่ผู้ให้บริการแนะนำ)";
    }
    if (/P1000|Authentication failed|password authentication failed/i.test(msg)) {
      return "ฐานข้อมูลปฏิเสธการเข้าสู่ระบบ — ตรวจสอบรหัสผ่านและผู้ใช้ใน DATABASE_URL";
    }
    if (/ENOENT|EPERM|EACCES|EROFS|read-only file system/i.test(msg)) {
      return "บันทึกไฟล์ไม่สำเร็จ — บน Vercel ต้องตั้งค่า BLOB_READ_WRITE_TOKEN (พื้นที่เขียนดิสก์ของฟังก์ชันแทบใช้ไม่ได้)";
    }
    if (/BLOB_READ_WRITE_TOKEN|@vercel\/blob|Vercel Blob/i.test(msg)) {
      return "ที่เก็บไฟล์ (Blob) ไม่สำเร็จ — ตรวจสอบ BLOB_READ_WRITE_TOKEN และสิทธิ์ของ Blob store";
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
  let tempOcrPath: string | null = null;
  let blobRollbackUrl: string | null = null;
  let deferTempCleanup = false;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const useAsyncOcr = Boolean(process.env.VERCEL && blobToken);

  try {
    if (process.env.VERCEL && !blobToken) {
      return NextResponse.json(
        {
          error:
            "บน Vercel ต้องตั้งค่า BLOB_READ_WRITE_TOKEN ใน Environment Variables — เซิร์ฟเวอร์เขียนโฟลเดอร์ uploads ถาวรไม่ได้",
        },
        { status: 503 },
      );
    }

    if (!process.env.DATABASE_URL?.trim()) {
      return NextResponse.json(
        { error: "ไม่พบ DATABASE_URL ใน Environment Variables ของ Vercel" },
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
    const maxBytes = blobToken ? MAX_BYTES_BLOB_SERVER : MAX_BYTES_LOCAL;
    if (buf.byteLength > maxBytes) {
      return NextResponse.json(
        {
          error: blobToken
            ? "ไฟล์ใหญ่เกินขีดจำกัดการอัปโหลดผ่านเซิร์ฟเวอร์ไป Vercel Blob (ประมาณ 4.5MB) — ลดขนาดรูปหรือบีบอัดก่อนอัปโหลด"
            : "ไฟล์ใหญ่เกิน 15MB",
        },
        { status: 400 },
      );
    }

    const originalFilename =
      typeof (file as File).name === "string" && (file as File).name.length > 0
        ? (file as File).name
        : `upload${extensionForMime(mimeType)}`;

    const id = randomUUID();
    const ext = extensionForMime(mimeType);

    let storedPath: string;
    let absoluteFilePath: string;

    if (blobToken) {
      const { put } = await import("@vercel/blob");
      const key = `medical-expenses/${id}${ext}`;
      const blob = await put(key, buf, { access: "public", token: blobToken });
      storedPath = blob.url;
      blobRollbackUrl = blob.url;
      tempOcrPath = path.join(tmpdir(), `${id}${ext}`);
      absoluteFilePath = tempOcrPath;
      await writeFile(tempOcrPath, buf);
    } else {
      const relativePath = path.join("uploads", `${id}${ext}`);
      const absolutePath = path.join(process.cwd(), relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, buf);
      storedPath = relativePath.split(path.sep).join("/");
      absoluteFilePath = absolutePath;
    }

    if (useAsyncOcr) {
      await createReceiptStagingPlaceholder({
        stagingId: id,
        originalFilename,
        storedPath,
        mimeType,
        fileSizeBytes: buf.byteLength,
      });
      blobRollbackUrl = null;
      deferTempCleanup = true;
      const ocrPath = tempOcrPath;
      after(async () => {
        try {
          if (ocrPath) {
            await runOcrAndPatchStaging({
              stagingId: id,
              absoluteFilePath: ocrPath,
            });
          }
        } catch (afterErr) {
          console.error("[POST /api/documents/upload] after() OCR", afterErr);
        } finally {
          if (ocrPath) {
            try {
              await unlink(ocrPath);
            } catch (unlinkErr) {
              console.error("[POST /api/documents/upload] after() tmp cleanup", unlinkErr);
            }
          }
        }
      });

      return NextResponse.json(
        {
          stagingId: id,
          originalFilename,
          ocrSucceeded: false,
          ocrError: null,
          suggestedServiceDate: null,
          suggestedAmountThb: null,
          ocrPending: true,
        },
        { status: 201 },
      );
    }

    const result = await createReceiptStagingWithOcr({
      stagingId: id,
      originalFilename,
      absoluteFilePath,
      storedPath,
      mimeType,
      fileSizeBytes: buf.byteLength,
    });

    blobRollbackUrl = null;

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (blobRollbackUrl && blobToken) {
      try {
        const { del } = await import("@vercel/blob");
        await del(blobRollbackUrl, { token: blobToken });
      } catch (rollbackErr) {
        console.error("[POST /api/documents/upload] blob rollback", rollbackErr);
      }
    }
    console.error("[POST /api/documents/upload]", err);
    return NextResponse.json(
      { error: uploadErrorMessageForClient(err) },
      { status: 500 },
    );
  } finally {
    if (tempOcrPath && !deferTempCleanup) {
      try {
        await unlink(tempOcrPath);
      } catch (cleanupErr) {
        console.error("[POST /api/documents/upload] tmp cleanup", cleanupErr);
      }
    }
  }
}
