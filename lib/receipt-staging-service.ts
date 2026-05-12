import { unlink } from "fs/promises";
import { Prisma } from "@prisma/client";
import type { ParsedExpense } from "@/lib/parse-expense";
import { getPrisma } from "@/lib/prisma";
import { resolveSafeUploadAbsolutePath } from "@/lib/upload-path";

export type StagingUploadResult = {
  stagingId: string;
  originalFilename: string;
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

function parseAmountInput(raw: string): Prisma.Decimal | null {
  try {
    const cleaned = raw.trim().replace(/,/g, "");
    if (!cleaned) {
      return null;
    }
    const n = Number.parseFloat(cleaned);
    if (!Number.isFinite(n) || n < 0) {
      return null;
    }
    return new Prisma.Decimal(n.toFixed(2));
  } catch (err) {
    console.error("[parseAmountInput]", err);
    return null;
  }
}

function parseDateInputYmd(raw: string): Date | null {
  try {
    const s = raw.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return null;
    }
    const d = new Date(`${s}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    return d;
  } catch (err) {
    console.error("[parseDateInputYmd]", err);
    return null;
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

    try {
      const abs = resolveSafeUploadAbsolutePath(staging.storedPath);
      await unlink(abs);
    } catch (unlinkErr) {
      console.error("[discardReceiptStaging] unlink", unlinkErr);
    }

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
