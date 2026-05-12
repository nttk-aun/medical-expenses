import { NextResponse } from "next/server";
import {
  deleteDocumentAndFile,
  getDocumentWithLatestExtractionForEdit,
  updateDocumentLatestExtraction,
} from "@/lib/documents-service";

export const runtime = "nodejs";

function isUuid(s: string): boolean {
  try {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  } catch (err) {
    console.error("[isUuid]", err);
    return false;
  }
}

function mapErr(err: unknown): { status: number; message: string } {
  try {
    if (err instanceof Error) {
      if (err.message === "NOT_FOUND") {
        return { status: 404, message: "ไม่พบเอกสาร" };
      }
      if (err.message === "INVALID_DATE") {
        return { status: 400, message: "วันที่ไม่ถูกต้อง" };
      }
      if (err.message === "INVALID_AMOUNT") {
        return { status: 400, message: "จำนวนเงินไม่ถูกต้อง" };
      }
      if (err.message === "EXTRACTION_NOT_FOUND") {
        return { status: 400, message: "ไม่พบข้อมูลยอดในประวัติ" };
      }
    }
    return { status: 500, message: "เกิดข้อผิดพลาด" };
  } catch (inner) {
    console.error("[mapErr]", inner);
    return { status: 500, message: "เกิดข้อผิดพลาด" };
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const document = await getDocumentWithLatestExtractionForEdit(id);
    if (!document) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ document });
  } catch (err) {
    console.error("[GET /api/documents/[id]]", err);
    return NextResponse.json({ error: "ไม่สามารถโหลดได้" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      serviceDate?: string;
      amountThb?: string;
      notes?: string | null;
    };
    const serviceDate = body.serviceDate?.trim() ?? "";
    const amountThb = String(body.amountThb ?? "").trim();
    const notes = body.notes ?? null;
    await updateDocumentLatestExtraction({
      documentId: id,
      serviceDate,
      amountThb,
      notes,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/documents/[id]]", err);
    const m = mapErr(err);
    return NextResponse.json({ error: m.message }, { status: m.status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await deleteDocumentAndFile(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/documents/[id]]", err);
    const m = mapErr(err);
    return NextResponse.json({ error: m.message }, { status: m.status });
  }
}
