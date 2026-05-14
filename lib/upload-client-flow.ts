/** บน Vercel: อัปโหลด Blob อย่างเดียวที่เซิร์ฟเวอร์ แล้ว OCR + parse ในเบราว์เซอร์ — กันหมดเวลา serverless */
export function shouldUploadBlobThenClientOcr(): boolean {
  try {
    if (process.env.NEXT_PUBLIC_USE_CLIENT_OCR === "1") {
      return true;
    }
    if (typeof window === "undefined") {
      return false;
    }
    const h = window.location.hostname;
    return h.endsWith(".vercel.app");
  } catch (err) {
    console.error("[shouldUploadBlobThenClientOcr]", err);
    return false;
  }
}
