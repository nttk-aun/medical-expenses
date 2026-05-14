import { unlink, writeFile } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { Prisma } from "@prisma/client";
import type { ParsedExpense } from "@/lib/parse-expense";
import { parseAmountInput, parseDateInputYmd } from "@/lib/receipt-input";
import { getPrisma } from "@/lib/prisma";
import { deleteStoredObject, isLocalUploadsPath } from "@/lib/stored-object";
import { resolveSafeUploadAbsolutePath } from "@/lib/upload-path";

export type StagingUploadResult = {
  stagingId: string;
  originalFilename: string;
  ocrSucceeded: boolean;
  ocrError: string | null;
  suggestedServiceDate: string | null;
  suggestedAmountThb: string | null;
  /** True when OCR runs in the background (Vercel); client should poll `/api/receipts/staging/[id]/status`. */
  ocrPending?: boolean;
};

export type StagingOcrStatusPayload = {
  ocrPending: boolean;
  ocrSucceeded: boolean;
  ocrError: string | null;
  suggestedServiceDate: string | null;
  suggestedAmountThb: string | null;
};

export async function createReceiptStagingWithOcr(args: {
  stagingId: string;
  originalFilename: string;
  absoluteFilePath: string;
  storedPath: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<StagingUploadResult> {
  try {
    const prisma = getPrisma();
    const stagingId = args.stagingId;
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    let ocrText: string | null = null;
    let ocrError: string | null = null;
    let parsed: ParsedExpense | null = null;

    try {
      const { runOcrOnImagePath } = await import("@/lib/ocr");
      const { parseExpenseFromOcrText } = await import("@/lib/parse-expense");
      const { text, lines } = await runOcrOnImagePath(args.absoluteFilePath);
      ocrText = text;
      parsed = parseExpenseFromOcrText(text, lines);
    } catch (inner) {
      console.error("[createReceiptStagingWithOcr] ocr", inner);
      ocrError =
        inner instanceof Error ? inner.message.slice(0, 4000) : String(inner).slice(0, 4000);
    }

    const parseSnapshot: Prisma.InputJsonValue = {
      suggestedServiceDate: parsed?.serviceDate?.toISOString().slice(0, 10) ?? null,
      suggestedAmountThb: parsed?.amountThb ?? null,
      dateSource: parsed?.dateSource ?? null,
      amountSource: parsed?.amountSource ?? null,
      ocrPreview: ocrText ? ocrText.slice(0, 800) : null,
    };

    await prisma.receiptStaging.create({
      data: {
        id: stagingId,
        originalFilename: args.originalFilename,
        storedPath: args.storedPath,
        mimeType: args.mimeType,
        fileSizeBytes: args.fileSizeBytes,
        status: "PENDING",
        ocrText,
        ocrError,
        suggestedServiceDate: parsed?.serviceDate ?? undefined,
        suggestedAmountThb:
          parsed?.amountThb != null
            ? new Prisma.Decimal(parsed.amountThb.toFixed(2))
            : undefined,
        suggestedDateSource: parsed?.dateSource ?? undefined,
        suggestedAmountSource: parsed?.amountSource ?? undefined,
        parseSnapshot,
        expiresAt,
      },
    });

    return {
      stagingId,
      originalFilename: args.originalFilename,
      ocrSucceeded: ocrError == null,
      ocrError,
      suggestedServiceDate: parsed?.serviceDate
        ? parsed.serviceDate.toISOString().slice(0, 10)
        : null,
      suggestedAmountThb:
        parsed?.amountThb != null ? parsed.amountThb.toFixed(2) : null,
    };
  } catch (err) {
    console.error("[createReceiptStagingWithOcr]", err);
    throw err;
  }
}

/** Fast insert before OCR — used on Vercel with `after()` so the HTTP response can finish quickly. */
export async function createReceiptStagingPlaceholder(args: {
  stagingId: string;
  originalFilename: string;
  storedPath: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<void> {
  try {
    const prisma = getPrisma();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await prisma.receiptStaging.create({
      data: {
        id: args.stagingId,
        originalFilename: args.originalFilename,
        storedPath: args.storedPath,
        mimeType: args.mimeType,
        fileSizeBytes: args.fileSizeBytes,
        status: "PENDING",
        ocrText: null,
        ocrError: null,
        parseSnapshot: { ocrPending: true },
        expiresAt,
      },
    });
  } catch (err) {
    console.error("[createReceiptStagingPlaceholder]", err);
    throw err;
  }
}

/** Run OCR and merge into an existing placeholder row (must still be PENDING with `ocrPending` in snapshot). */
export async function runOcrAndPatchStaging(args: { stagingId: string }): Promise<void> {
  let downloadedTmp: string | null = null;
  try {
    const prisma = getPrisma();
    const row = await prisma.receiptStaging.findUnique({
      where: { id: args.stagingId },
    });
    if (!row || row.status !== "PENDING") {
      return;
    }
    const snap = row.parseSnapshot as { ocrPending?: boolean } | null;
    if (snap?.ocrPending !== true) {
      return;
    }

    let absoluteFilePath: string;
    try {
      if (isLocalUploadsPath(row.storedPath)) {
        absoluteFilePath = resolveSafeUploadAbsolutePath(row.storedPath);
      } else {
        const url = row.storedPath.trim();
        if (!url.startsWith("https://")) {
          await prisma.receiptStaging.update({
            where: { id: args.stagingId },
            data: {
              ocrError: "stored_path ไม่ใช่ URL ที่อ่านรูปได้",
              parseSnapshot: {
                ocrPending: false,
                suggestedServiceDate: null,
                suggestedAmountThb: null,
                dateSource: null,
                amountSource: null,
                ocrPreview: null,
              },
            },
          });
          return;
        }
        const res = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) {
          await prisma.receiptStaging.update({
            where: { id: args.stagingId },
            data: {
              ocrError: `โหลดรูปจาก Blob ไม่สำเร็จ (HTTP ${res.status})`,
              parseSnapshot: {
                ocrPending: false,
                suggestedServiceDate: null,
                suggestedAmountThb: null,
                dateSource: null,
                amountSource: null,
                ocrPreview: null,
              },
            },
          });
          return;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const pathname = new URL(url).pathname;
        const extFromUrl = path.extname(pathname) || ".jpg";
        downloadedTmp = path.join(tmpdir(), `ocr-${args.stagingId}${extFromUrl}`);
        await writeFile(downloadedTmp, buf);
        absoluteFilePath = downloadedTmp;
      }
    } catch (prepErr) {
      console.error("[runOcrAndPatchStaging] prepare image", prepErr);
      const msg =
        prepErr instanceof Error
          ? prepErr.message.slice(0, 4000)
          : String(prepErr).slice(0, 4000);
      await prisma.receiptStaging.update({
        where: { id: args.stagingId },
        data: {
          ocrError: msg,
          parseSnapshot: {
            ocrPending: false,
            suggestedServiceDate: null,
            suggestedAmountThb: null,
            dateSource: null,
            amountSource: null,
            ocrPreview: null,
          },
        },
      });
      return;
    }

    let ocrText: string | null = null;
    let ocrError: string | null = null;
    let parsed: ParsedExpense | null = null;

    try {
      const { runOcrOnImagePath } = await import("@/lib/ocr");
      const { parseExpenseFromOcrText } = await import("@/lib/parse-expense");
      const { text, lines } = await runOcrOnImagePath(absoluteFilePath);
      ocrText = text;
      parsed = parseExpenseFromOcrText(text, lines);
    } catch (inner) {
      console.error("[runOcrAndPatchStaging] ocr", inner);
      ocrError =
        inner instanceof Error ? inner.message.slice(0, 4000) : String(inner).slice(0, 4000);
    }

    const parseSnapshot: Prisma.InputJsonValue = {
      ocrPending: false,
      suggestedServiceDate: parsed?.serviceDate?.toISOString().slice(0, 10) ?? null,
      suggestedAmountThb: parsed?.amountThb ?? null,
      dateSource: parsed?.dateSource ?? null,
      amountSource: parsed?.amountSource ?? null,
      ocrPreview: ocrText ? ocrText.slice(0, 800) : null,
    };

    await prisma.receiptStaging.update({
      where: { id: args.stagingId },
      data: {
        ocrText,
        ocrError,
        suggestedServiceDate: parsed?.serviceDate ?? undefined,
        suggestedAmountThb:
          parsed?.amountThb != null
            ? new Prisma.Decimal(parsed.amountThb.toFixed(2))
            : undefined,
        suggestedDateSource: parsed?.dateSource ?? undefined,
        suggestedAmountSource: parsed?.amountSource ?? undefined,
        parseSnapshot,
      },
    });
  } catch (err) {
    console.error("[runOcrAndPatchStaging]", err);
    try {
      const prisma = getPrisma();
      const msg =
        err instanceof Error ? err.message.slice(0, 4000) : String(err).slice(0, 4000);
      await prisma.receiptStaging.update({
        where: { id: args.stagingId },
        data: {
          ocrError: `ประมวลผลไม่สมบูรณ์: ${msg}`,
          parseSnapshot: {
            ocrPending: false,
            suggestedServiceDate: null,
            suggestedAmountThb: null,
            dateSource: null,
            amountSource: null,
            ocrPreview: null,
          },
        },
      });
    } catch (markErr) {
      console.error("[runOcrAndPatchStaging] mark ocr failed", markErr);
    }
  } finally {
    if (downloadedTmp) {
      try {
        await unlink(downloadedTmp);
      } catch (unlinkErr) {
        console.error("[runOcrAndPatchStaging] tmp cleanup", unlinkErr);
      }
    }
  }
}

export async function getReceiptStagingOcrStatus(
  stagingId: string,
): Promise<StagingOcrStatusPayload | null> {
  try {
    const prisma = getPrisma();
    const row = await prisma.receiptStaging.findFirst({
      where: { id: stagingId, status: "PENDING" },
      select: {
        parseSnapshot: true,
        ocrText: true,
        ocrError: true,
        suggestedServiceDate: true,
        suggestedAmountThb: true,
      },
    });
    if (!row) {
      return null;
    }

    const snap = row.parseSnapshot as { ocrPending?: boolean } | null;
    const ocrPending = snap?.ocrPending === true;

    return {
      ocrPending,
      ocrSucceeded: !ocrPending && row.ocrError == null,
      ocrError: row.ocrError,
      suggestedServiceDate: row.suggestedServiceDate
        ? row.suggestedServiceDate.toISOString().slice(0, 10)
        : null,
      suggestedAmountThb:
        row.suggestedAmountThb != null ? row.suggestedAmountThb.toString() : null,
    };
  } catch (err) {
    console.error("[getReceiptStagingOcrStatus]", err);
    throw err;
  }
}

export async function confirmReceiptStaging(input: {
  stagingId: string;
  serviceDate: string;
  amountThb: string;
  notes?: string | null;
}): Promise<{ documentId: string }> {
  try {
    const prisma = getPrisma();
    const serviceDate = parseDateInputYmd(input.serviceDate);
    const amount = parseAmountInput(input.amountThb);
    if (!serviceDate) {
      throw new Error("INVALID_DATE");
    }
    if (!amount) {
      throw new Error("INVALID_AMOUNT");
    }

    const result = await prisma.$transaction(async (tx) => {
      const staging = await tx.receiptStaging.findUnique({
        where: { id: input.stagingId },
      });
      if (!staging) {
        throw new Error("STAGING_NOT_FOUND");
      }
      if (staging.status !== "PENDING") {
        throw new Error("STAGING_NOT_PENDING");
      }
      if (staging.expiresAt && staging.expiresAt.getTime() < Date.now()) {
        throw new Error("STAGING_EXPIRED");
      }

      const doc = await tx.document.create({
        data: {
          originalFilename: staging.originalFilename,
          storedPath: staging.storedPath,
          mimeType: staging.mimeType,
          fileSizeBytes: staging.fileSizeBytes,
          status: "PROCESSED",
          ocrText: staging.ocrText,
          ocrError: null,
        },
      });

      await tx.expenseExtraction.create({
        data: {
          documentId: doc.id,
          serviceDate,
          amountThb: amount,
          currency: "THB",
          dateSource: "user_confirm",
          amountSource: "user_confirm",
          userVerified: true,
          notes: input.notes?.trim() || null,
          extraJson: staging.parseSnapshot ?? undefined,
        },
      });

      await tx.receiptStaging.update({
        where: { id: staging.id },
        data: {
          status: "CONFIRMED",
          confirmedDocumentId: doc.id,
        },
      });

      return { documentId: doc.id };
    });

    return result;
  } catch (err) {
    console.error("[confirmReceiptStaging]", err);
    throw err;
  }
}

export async function discardReceiptStaging(stagingId: string): Promise<void> {
  try {
    const prisma = getPrisma();
    const staging = await prisma.receiptStaging.findUnique({
      where: { id: stagingId },
    });
    if (!staging) {
      throw new Error("STAGING_NOT_FOUND");
    }
    if (staging.status !== "PENDING") {
      throw new Error("STAGING_NOT_PENDING");
    }

    await deleteStoredObject(staging.storedPath);

    await prisma.receiptStaging.update({
      where: { id: stagingId },
      data: { status: "DISCARDED" },
    });
  } catch (err) {
    console.error("[discardReceiptStaging]", err);
    throw err;
  }
}

export async function getStagingForImage(stagingId: string): Promise<{
  storedPath: string;
  mimeType: string;
  originalFilename: string;
} | null> {
  try {
    const prisma = getPrisma();
    const row = await prisma.receiptStaging.findFirst({
      where: {
        id: stagingId,
        status: "PENDING",
      },
      select: {
        storedPath: true,
        mimeType: true,
        originalFilename: true,
      },
    });
    return row;
  } catch (err) {
    console.error("[getStagingForImage]", err);
    throw err;
  }
}
