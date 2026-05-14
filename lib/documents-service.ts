import { getPrisma } from "@/lib/prisma";
import { parseAmountInput, parseDateInputYmd } from "@/lib/receipt-input";
import { deleteStoredObject } from "@/lib/stored-object";

export type DocumentListItem = {
  id: string;
  originalFilename: string;
  status: string;
  createdAt: string;
  serviceDate: string | null;
  amountThb: string | null;
  currency: string;
  ocrError: string | null;
  /** false เมื่อไม่เก็บไฟล์รูป (เช่น flow ใหม่) — ซ่อนภาพตัวอย่างและลิงก์ดูรูป */
  imageAvailable: boolean;
};

export type DocumentEditPayload = {
  id: string;
  originalFilename: string;
  serviceDateIso: string | null;
  amountThb: string | null;
  notes: string | null;
};

export async function listDocumentsWithExtractions(): Promise<DocumentListItem[]> {
  try {
    const prisma = getPrisma();
    const rows = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        extractions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return rows.map((d: (typeof rows)[number]) => {
      const ex = d.extractions[0];
      return {
        id: d.id,
        originalFilename: d.originalFilename,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
        serviceDate: ex?.serviceDate ? ex.serviceDate.toISOString().slice(0, 10) : null,
        amountThb: ex?.amountThb != null ? ex.amountThb.toString() : null,
        currency: ex?.currency ?? "THB",
        ocrError: d.ocrError ?? null,
        imageAvailable: !!(d.storedPath && d.storedPath.trim()),
      };
    });
  } catch (err) {
    console.error("[listDocumentsWithExtractions]", err);
    throw err;
  }
}

export async function getDocumentStoredPath(id: string): Promise<{
  storedPath: string | null;
  mimeType: string;
  originalFilename: string;
} | null> {
  try {
    const prisma = getPrisma();
    const doc = await prisma.document.findUnique({
      where: { id },
      select: { storedPath: true, mimeType: true, originalFilename: true },
    });
    return doc;
  } catch (err) {
    console.error("[getDocumentStoredPath]", err);
    throw err;
  }
}

export async function getDocumentWithLatestExtractionForEdit(
  id: string,
): Promise<DocumentEditPayload | null> {
  try {
    const prisma = getPrisma();
    const row = await prisma.document.findUnique({
      where: { id },
      include: { extractions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!row) {
      return null;
    }
    const ex = row.extractions[0];
    return {
      id: row.id,
      originalFilename: row.originalFilename,
      serviceDateIso: ex?.serviceDate ? ex.serviceDate.toISOString().slice(0, 10) : null,
      amountThb: ex?.amountThb != null ? ex.amountThb.toString() : null,
      notes: ex?.notes ?? null,
    };
  } catch (err) {
    console.error("[getDocumentWithLatestExtractionForEdit]", err);
    throw err;
  }
}

export async function updateDocumentLatestExtraction(args: {
  documentId: string;
  serviceDate: string;
  amountThb: string;
  notes?: string | null;
}): Promise<void> {
  try {
    const prisma = getPrisma();
    const serviceDate = parseDateInputYmd(args.serviceDate);
    const amount = parseAmountInput(args.amountThb);
    if (!serviceDate) {
      throw new Error("INVALID_DATE");
    }
    if (!amount) {
      throw new Error("INVALID_AMOUNT");
    }
    const latest = await prisma.expenseExtraction.findFirst({
      where: { documentId: args.documentId },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) {
      throw new Error("EXTRACTION_NOT_FOUND");
    }
    await prisma.expenseExtraction.update({
      where: { id: latest.id },
      data: {
        serviceDate,
        amountThb: amount,
        notes: args.notes?.trim() ? args.notes.trim() : null,
        dateSource: "user_edit",
        amountSource: "user_edit",
        userVerified: true,
      },
    });
  } catch (err) {
    console.error("[updateDocumentLatestExtraction]", err);
    throw err;
  }
}

export async function deleteDocumentAndFile(id: string): Promise<void> {
  try {
    const prisma = getPrisma();
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) {
      throw new Error("NOT_FOUND");
    }
    await deleteStoredObject(doc.storedPath);
    await prisma.document.delete({ where: { id } });
  } catch (err) {
    console.error("[deleteDocumentAndFile]", err);
    throw err;
  }
}
