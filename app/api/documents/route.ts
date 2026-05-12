import { NextResponse } from "next/server";
import { listDocumentsWithExtractions } from "@/lib/documents-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await listDocumentsWithExtractions();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[GET /api/documents]", err);
    return NextResponse.json(
      { error: "ไม่สามารถโหลดรายการได้" },
      { status: 500 },
    );
  }
}
