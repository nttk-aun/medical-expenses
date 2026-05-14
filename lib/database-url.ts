/**
 * Neon / Vercel: `channel_binding=require` มักทำให้การเชื่อมจาก Node (Prisma) ไป pooler ไม่เสถียร
 * — แนะนำให้ใช้ `sslmode=require` อย่างเดียวบน serverless
 * @see https://neon.tech/docs/connect/connection-errors
 */
export function normalizePostgresUrlForServerless(raw: string): string {
  try {
    const trimmed = raw.trim();
    if (!trimmed) {
      return trimmed;
    }
    const u = new URL(trimmed);
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch (err) {
    console.error("[normalizePostgresUrlForServerless]", err);
    return raw
      .replace(/[&?]channel_binding=[^&]*/gi, "")
      .replace(/\?&/, "?")
      .replace(/&&/g, "&")
      .replace(/\?$/, "");
  }
}
