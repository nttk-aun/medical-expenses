import { Prisma } from "@prisma/client";
import type { ParsedExpense } from "@/lib/parse-expense";
import { parseAmountInput, parseDateInputYmd } from "@/lib/receipt-input";
import { getPrisma } from "@/lib/prisma";
import { deleteStoredObject } from "@/lib/stored-object";

export type StagingUploadResult = {
  stagingId: string;
  originalFilename: string;
  ocrSucceeded: boolean;
  ocrError: string | null;
  suggestedServiceDate: string | null;
  suggestedAmountThb: string | null;
};

/** บันทึก staging + OCR จาก buffer เท่านั้น — ไม่เก็บไฟล์รูปถาวร */
export async function createReceiptStagingWithOcrFromBuffer(args: {
  stagingId: string;
  originalFilename: string;
  buffer: Buffer;
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
      const { runOcrOnImageBuffer } = await import("@/lib/ocr");
      const { parseExpenseFromOcrText } = await import("@/lib/parse-expense");
      const { text, lines } = await runOcrOnImageBuffer(args.buffer);
      ocrText = text;
      parsed = parseExpenseFromOcrText(text, lines);
    } catch (inner) {
      console.error("[createReceiptStagingWithOcrFromBuffer] ocr", inner);
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
        /** ว่าง = ไม่เก็บไฟล์รูป (OCR จาก buffer เท่านั้น) */
        storedPath: "",
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
    console.error("[createReceiptStagingWithOcrFromBuffer]", err);
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

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

    if (staging.storedPath?.trim()) {
      await deleteStoredObject(staging.storedPath);
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
  storedPath: string | null;
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
