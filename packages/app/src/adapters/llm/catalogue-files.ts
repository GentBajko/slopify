import { open } from "node:fs/promises";

// Bound both the initial read and a file that grows between stat and read. Model
// metadata is data only: none of the installed CLI's modules are evaluated.
export async function readCatalogueFile(path: string, maxBytes: number): Promise<string> {
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error("Invalid model metadata file");
    const bytes = Buffer.alloc(maxBytes + 1);
    let size = 0;
    while (size <= maxBytes) {
      const chunk = await file.read(bytes, size, bytes.length - size, null);
      if (chunk.bytesRead === 0) return bytes.toString("utf8", 0, size);
      size += chunk.bytesRead;
    }
    throw new Error("Model metadata file is too large");
  } finally {
    await file.close();
  }
}
