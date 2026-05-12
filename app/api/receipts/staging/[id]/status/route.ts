import { NextResponse } from "next/server";
import { getReceiptStagingOcrStatus } from "@/lib/receipt-staging-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const status = await getReceiptStagingOcrStatus(id);
    if (!status) {
      return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
    }
    return NextResponse.json(status);
  } catch (err) {
    console.error("[GET /api/receipts/staging/[id]/status]", err);
    return NextResponse.json({ error: "โหลดสถานะไม่สำเร็จ" }, { status: 500 });
  }
}
