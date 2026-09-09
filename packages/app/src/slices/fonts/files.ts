import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { fontMaxBytes } from "./model.js";

export function unavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ["ENOENT", "ENOTDIR", "EACCES", "EPERM", "ELOOP"].includes(String(error.code))
  );
}

export async function readFontFile(path: string): Promise<Buffer | undefined> {
  try {
    if (!(await lstat(path)).isFile()) return undefined;
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size < 12 || stat.size > fontMaxBytes) return undefined;
      const bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const result = await file.read(bytes, offset, bytes.length - offset, offset);
        if (result.bytesRead === 0) return undefined;
        offset += result.bytesRead;
      }
      return bytes;
    } finally {
      await file.close();
    }
  } catch (error) {
    if (unavailable(error)) return undefined;
    throw error;
  }
}
