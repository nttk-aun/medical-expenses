import { NextResponse } from "next/server";
import { runOcrAndPatchStaging } from "@/lib/receipt-staging-service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Internal job: full OCR budget in its own invocation (triggered from upload via `waitUntil(fetch)`).
 * Set `INTERNAL_OCR_SECRET` on Vercel and send the same value in header `x-internal-ocr-secret`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const secret = process.env.INTERNAL_OCR_SECRET?.trim();
    const hdr = request.headers.get("x-internal-ocr-secret");
    if (!secret || hdr !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    await runOcrAndPatchStaging({ stagingId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/receipts/staging/[id]/process-ocr]", err);
    return NextResponse.json({ error: "OCR job failed" }, { status: 500 });
  }
}
