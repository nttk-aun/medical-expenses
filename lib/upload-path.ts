import path from "path";

/** Resolve a DB `stored_path` under `./uploads` and block path traversal. */
export function resolveSafeUploadAbsolutePath(storedPath: string): string {
  try {
    const root = path.resolve(process.cwd(), "uploads");
    const abs = path.resolve(process.cwd(), storedPath);
    const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
    if (!abs.startsWith(normalizedRoot) && abs !== root) {
      throw new Error("Invalid stored path");
    }
    return abs;
  } catch (err) {
    console.error("[resolveSafeUploadAbsolutePath]", err);
    throw err;
  }
}
