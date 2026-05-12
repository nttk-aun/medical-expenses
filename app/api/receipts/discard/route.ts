import { NextResponse } from "next/server";
import { discardReceiptStaging } from "@/lib/receipt-staging-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      stagingId?: string;
    } | null;
    const stagingId = body?.stagingId?.trim();
    if (!stagingId) {
      return NextResponse.json({ error: "ไม่พบ stagingId" }, { status: 400 });
    }

    await discardReceiptStaging(stagingId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/receipts/discard]", err);
    const code = err instanceof Error ? err.message : "UNKNOWN";
    const map: Record<string, string> = {
      STAGING_NOT_FOUND: "ไม่พบรายการชั่วคราว",
      STAGING_NOT_PENDING: "รายการนี้ยืนยันหรือยกเลิกแล้ว",
    };
    const msg = map[code] ?? "ยกเลิกไม่สำเร็จ";
    const status = code === "STAGING_NOT_FOUND" ? 404 : code === "STAGING_NOT_PENDING" ? 409 : 500;
    return NextResponse.json({ error: msg, code }, { status });
  }
}
