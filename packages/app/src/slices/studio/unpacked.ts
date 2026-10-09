import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import { strFromU8, unzipSync } from "fflate";

// The Chrome extension, unpacked in a folder Slopify owns and keeps current. Loaded once in
// chrome://extensions with Load unpacked, it updates with Slopify: each start puts the bundled
// build there when its version differs, and the extension, seeing a newer manifest on disk than
// the one it runs, reloads itself (`packages/extension/src/self-update.ts`). No store review, no
// download to unzip by hand, and nothing a Downloads cleanup can take away.

export interface UnpackedExtension {
  readonly path: string;
  readonly version: string;
}

export function unpackedExtensionDir(dataDir: string): string {
  return join(dataDir, "extension", "chrome");
}

// Puts the zip's build in `target` when the version there differs. The new build is written
// beside it and swapped in whole, so Chrome never reads half of one and half of another.
export function installUnpackedExtension(zipPath: string, target: string): UnpackedExtension {
  const files = unzipSync(readFileSync(zipPath));
  const manifest = files["manifest.json"];
  if (manifest === undefined)
    throw new Error(
      `The Slopify Studio extension bundled with Slopify has no manifest.json (${zipPath}). Update or reinstall Slopify.`,
    );
  const version = String((JSON.parse(strFromU8(manifest)) as { version?: unknown }).version);
  if (installedVersion(target) === version) return { path: target, version };
  const next = `${target}.next`;
  const old = `${target}.old`;
  rmSync(next, { recursive: true, force: true });
  rmSync(old, { recursive: true, force: true });
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    const path = normalize(name);
    if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`))
      throw new Error(
        `The Slopify Studio extension bundled with Slopify has a file outside its folder (${name}). Update or reinstall Slopify.`,
      );
    mkdirSync(dirname(join(next, path)), { recursive: true });
    writeFileSync(join(next, path), bytes, { mode: 0o644 });
  }
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) renameSync(target, old);
  renameSync(next, target);
  rmSync(old, { recursive: true, force: true });
  return { path: target, version };
}

export function installedVersion(target: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(target, "manifest.json"), "utf8")) as {
      version?: unknown;
    };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}
