import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getDocumentStoredPath } from "@/lib/documents-service";
import {
  isHttpRedirectableStoredPath,
  isLocalUploadsPath,
} from "@/lib/stored-object";
import { resolveSafeUploadAbsolutePath } from "@/lib/upload-path";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const doc = await getDocumentStoredPath(id);
    if (!doc) {
      return new NextResponse("Not found", { status: 404 });
    }

    if (isHttpRedirectableStoredPath(doc.storedPath)) {
      return NextResponse.redirect(doc.storedPath.trim(), 302);
    }

    if (!isLocalUploadsPath(doc.storedPath)) {
      console.error(
        "[GET /api/documents/[id]/image] invalid storedPath",
        JSON.stringify(doc.storedPath),
      );
      return new NextResponse("Not found", { status: 404 });
    }

    const abs = resolveSafeUploadAbsolutePath(doc.storedPath);
    const body = await readFile(abs);
    return new NextResponse(body, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.originalFilename)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[GET /api/documents/[id]/image]", err);
    return new NextResponse("Error", { status: 500 });
  }
}
