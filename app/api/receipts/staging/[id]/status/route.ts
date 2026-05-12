import { NextResponse } from "next/server";
import {
  getReceiptStagingOcrStatus,
  runOcrAndPatchStaging,
} from "@/lib/receipt-staging-service";

export const runtime = "nodejs";
/** OCR may run inside this route when staging is still pending. */
export const maxDuration = 300;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    let status = await getReceiptStagingOcrStatus(id);
    if (!status) {
      return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
    }
    if (status.ocrPending) {
      await runOcrAndPatchStaging({ stagingId: id });
      status = await getReceiptStagingOcrStatus(id);
    }
    if (!status) {
      return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
    }
    return NextResponse.json(status);
  } catch (err) {
    console.error("[GET /api/receipts/staging/[id]/status]", err);
    return NextResponse.json({ error: "โหลดสถานะไม่สำเร็จ" }, { status: 500 });
  }
}
