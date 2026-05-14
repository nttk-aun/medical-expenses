import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getStagingForImage } from "@/lib/receipt-staging-service";
import { isLocalUploadsPath } from "@/lib/stored-object";
import { resolveSafeUploadAbsolutePath } from "@/lib/upload-path";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const row = await getStagingForImage(id);
    if (!row) {
      return new NextResponse("Not found", { status: 404 });
    }

    if (!row.storedPath?.trim()) {
      return new NextResponse("No image stored", { status: 404 });
    }

    if (!isLocalUploadsPath(row.storedPath)) {
      return NextResponse.redirect(row.storedPath, 302);
    }

    const abs = resolveSafeUploadAbsolutePath(row.storedPath);
    const body = await readFile(abs);
    return new NextResponse(body, {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(row.originalFilename)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("[GET /api/receipts/staging/[id]/image]", err);
    return new NextResponse("Error", { status: 500 });
  }
}
