/**
 * Base URL ของ deployment ปัจจุบันบน Vercel — ใช้เรียก route ภายใน (เช่น OCR job) จาก server
 * @see https://vercel.com/docs/projects/environment-variables/system-environment-variables
 */
export function resolveVercelDeploymentOrigin(): string | null {
  try {
    const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (prod) {
      if (prod.startsWith("https://")) {
        return prod;
      }
      if (prod.startsWith("http://")) {
        return `https://${prod.slice("http://".length)}`;
      }
      return `https://${prod.replace(/^\/+/, "")}`;
    }
    const vu = process.env.VERCEL_URL?.trim();
    if (!vu) {
      return null;
    }
    const host = vu.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  } catch (err) {
    console.error("[resolveVercelDeploymentOrigin]", err);
    return null;
  }
}
