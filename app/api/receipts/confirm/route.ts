import { NextResponse } from "next/server";
import { confirmReceiptStaging } from "@/lib/receipt-staging-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      stagingId?: string;
      serviceDate?: string;
      amountThb?: string;
      notes?: string | null;
    } | null;

    const stagingId = body?.stagingId?.trim();
    const serviceDate = body?.serviceDate?.trim() ?? "";
    const amountThb = body?.amountThb?.trim() ?? "";
    if (!stagingId) {
      return NextResponse.json({ error: "ไม่พบ stagingId" }, { status: 400 });
    }

    const { documentId } = await confirmReceiptStaging({
      stagingId,
      serviceDate,
      amountThb,
      notes: body?.notes ?? null,
    });

    return NextResponse.json({ documentId }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/receipts/confirm]", err);
    const code = err instanceof Error ? err.message : "UNKNOWN";
    const map: Record<string, string> = {
      INVALID_DATE: "วันที่ไม่ถูกต้อง (ใช้รูปแบบ YYYY-MM-DD)",
      INVALID_AMOUNT: "จำนวนเงินไม่ถูกต้อง",
      STAGING_NOT_FOUND: "ไม่พบรายการชั่วคราว",
      STAGING_NOT_PENDING: "รายการนี้ยืนยันหรือยกเลิกแล้ว",
      STAGING_EXPIRED: "รายการหมดอายุ กรุณาอัปโหลดใหม่",
    };
    const msg = map[code] ?? "ยืนยันไม่สำเร็จ";
    const status =
      code === "STAGING_NOT_FOUND"
        ? 404
        : code === "STAGING_NOT_PENDING" || code === "STAGING_EXPIRED"
          ? 409
          : code === "INVALID_DATE" || code === "INVALID_AMOUNT"
            ? 400
            : 500;
    return NextResponse.json({ error: msg, code }, { status });
  }
}
