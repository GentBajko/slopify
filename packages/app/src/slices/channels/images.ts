import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { insertImageBlob } from "./repo.js";

// What a picture sent as a reference may weigh: the host helper's bridge carries at most this
// much per reference image (`bridgeLimits.reference`).
export const castImageMaxBytes = 10 * 1024 * 1024;
// Per cast member. Every one is sent with each image that mentions the member.
export const castImagesPerMember = 4;

export function sniffImage(bytes: Uint8Array): "image/png" | "image/jpeg" | undefined {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((value, index) => bytes[index] === value))
    return "image/png";
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" : undefined;
}

// Stores the bytes under their SHA-256 and returns it; the same picture twice is one row.
export function storeImageBlob(
  db: DatabaseSync,
  bytes: Uint8Array,
  mime: "image/png" | "image/jpeg",
  at: string,
): string {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  insertImageBlob(db, { sha256, mime, bytes }, at);
  return sha256;
}
