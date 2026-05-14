import { del } from "@vercel/blob";
import { unlink } from "fs/promises";
import { resolveSafeUploadAbsolutePath } from "@/lib/upload-path";

/** True when `storedPath` is a relative path under `uploads/` (local disk). */
export function isLocalUploadsPath(storedPath: string | null | undefined): boolean {
  try {
    if (!storedPath?.trim()) {
      return false;
    }
    const n = storedPath.trim().replace(/\\/g, "/");
    return n.startsWith("uploads/");
  } catch (err) {
    console.error("[isLocalUploadsPath]", err);
    return false;
  }
}

/** Remove file from disk or object from Vercel Blob; logs and does not throw on I/O failure. */
export async function deleteStoredObject(
  storedPath: string | null | undefined,
): Promise<void> {
  try {
    if (!storedPath?.trim()) {
      return;
    }
    if (isLocalUploadsPath(storedPath)) {
      try {
        const abs = resolveSafeUploadAbsolutePath(storedPath);
        await unlink(abs);
      } catch (unlinkErr) {
        console.error("[deleteStoredObject] unlink", unlinkErr);
      }
      return;
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
      console.error(
        "[deleteStoredObject] remote storedPath but BLOB_READ_WRITE_TOKEN is not set",
      );
      return;
    }
    try {
      await del(storedPath, { token });
    } catch (delErr) {
      console.error("[deleteStoredObject] del", delErr);
    }
  } catch (err) {
    console.error("[deleteStoredObject]", err);
  }
}
