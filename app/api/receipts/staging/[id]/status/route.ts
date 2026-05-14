import { NextResponse } from "next/server";
import {
  getReceiptStagingOcrStatus,
  runOcrAndPatchStaging,
} from "@/lib/receipt-staging-service";

export const runtime = "nodejs";
/** Background OCR via `waitUntil` may run after the JSON response is sent. */
export const maxDuration = 300;

const inflightOcrByStagingId = new Map<string, Promise<void>>();

async function scheduleOcrWithWaitUntil(stagingId: string): Promise<void> {
  try {
    const { waitUntil } = await import("@vercel/functions");
    let p = inflightOcrByStagingId.get(stagingId);
    if (!p) {
      p = runOcrAndPatchStaging({ stagingId })
        .catch((ocrErr) => {
          console.error(
            "[GET /api/receipts/staging/[id]/status] background OCR",
            ocrErr,
          );
        })
        .finally(() => {
          try {
            inflightOcrByStagingId.delete(stagingId);
          } catch (inner) {
            console.error("[scheduleOcrWithWaitUntil] finally", inner);
          }
        });
      inflightOcrByStagingId.set(stagingId, p);
    }
    waitUntil(
      p.catch((chainErr) => {
        console.error("[scheduleOcrWithWaitUntil] waitUntil chain", chainErr);
      }),
    );
  } catch (err) {
    console.error("[scheduleOcrWithWaitUntil]", err);
  }
}

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
      if (process.env.VERCEL) {
        await scheduleOcrWithWaitUntil(id);
      } else {
        await runOcrAndPatchStaging({ stagingId: id });
        const refreshed = await getReceiptStagingOcrStatus(id);
        if (refreshed) {
          status = refreshed;
        }
      }
    }

    return NextResponse.json(status);
  } catch (err) {
    console.error("[GET /api/receipts/staging/[id]/status]", err);
    return NextResponse.json({ error: "โหลดสถานะไม่สำเร็จ" }, { status: 500 });
  }
}
