import { getPrisma } from "@/lib/prisma";

export type DocumentListItem = {
  id: string;
  originalFilename: string;
  status: string;
  createdAt: string;
  serviceDate: string | null;
  amountThb: string | null;
  currency: string;
  ocrError: string | null;
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
      };
    });
  } catch (err) {
    console.error("[listDocumentsWithExtractions]", err);
    throw err;
  }
}

export async function getDocumentStoredPath(id: string): Promise<{
  storedPath: string;
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
