import { createHash } from "node:crypto";
import { opendir } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, posix, win32 } from "node:path";
import { readFontFile, unavailable } from "./files.js";
import type { ResolvedFont } from "./model.js";
import { readFontMetadata } from "./sfnt.js";

export function systemFontDirectories(
  platform: string,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): readonly string[] {
  if (platform === "win32")
    return [
      win32.join(env.WINDIR ?? "C:\\Windows", "Fonts"),
      ...(env.LOCALAPPDATA ? [win32.join(env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts")] : []),
    ];
  if (platform === "darwin")
    return ["/System/Library/Fonts", "/Library/Fonts", posix.join(home, "Library/Fonts")];
  return [
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    posix.join(env.XDG_DATA_HOME ?? posix.join(home, ".local/share"), "fonts"),
    posix.join(home, ".fonts"),
  ];
}

export async function discoverSystemFonts(): Promise<readonly ResolvedFont[]> {
  return scanFontDirectories(systemFontDirectories(process.platform, process.env, homedir()));
}

// Fixed roots only, no symlink traversal. Bounds also cover nested font-manager
// folders and damaged font files, without making the Settings request unbounded.
export async function scanFontDirectories(
  roots: readonly string[],
): Promise<readonly ResolvedFont[]> {
  const pending = [...new Set(roots)].map((path) => ({ path, depth: 0 }));
  const files = new Set<string>();
  let entries = 0;
  for (let at = 0; at < pending.length && entries < 10000 && files.size < 2048; at += 1) {
    const dir = pending[at];
    if (dir === undefined) continue;
    try {
      for await (const entry of await opendir(dir.path)) {
        entries += 1;
        const path = join(dir.path, entry.name);
        if (entry.isDirectory() && dir.depth < 8) pending.push({ path, depth: dir.depth + 1 });
        else if (
          entry.isFile() &&
          [".ttf", ".otf", ".ttc"].includes(extname(entry.name).toLowerCase())
        )
          files.add(path);
        if (entries >= 10000 || files.size >= 2048) break;
      }
    } catch (error) {
      if (!unavailable(error)) throw error;
    }
  }
  const fonts: ResolvedFont[] = [];
  let bytesRead = 0;
  for (const path of [...files].sort()) {
    if (bytesRead >= 256 * 1024 * 1024) break;
    const bytes = await readFontFile(path);
    if (bytes === undefined) continue;
    bytesRead += bytes.length;
    for (const face of readFontMetadata(bytes) ?? []) {
      const id = createHash("sha256")
        .update(path)
        .update("\0")
        .update(String(face.index))
        .digest("hex");
      fonts.push({
        id: `system-${id}`,
        name: face.name,
        family: face.family,
        source: "system",
        path,
        extension: face.extension,
        assName: face.assName,
        faceIndex: face.index,
      });
    }
  }
  return fonts;
}
