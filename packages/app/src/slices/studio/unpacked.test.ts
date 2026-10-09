import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";
import { installedVersion, installUnpackedExtension } from "./unpacked.js";

function build(dir: string, version: string, extra: Record<string, string> = {}): string {
  const path = join(dir, `ext-${version}.zip`);
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify({ name: "Slopify Studio", version })),
    "background.js": strToU8(`// ${version}`),
  };
  for (const [name, text] of Object.entries(extra)) files[name] = strToU8(text);
  writeFileSync(path, zipSync(files));
  return path;
}

it("unpacks the build into its folder, replaces it on a new version and leaves it otherwise", () => {
  const dir = mkdtempSync(join(tmpdir(), "slopify-unpacked-"));
  const target = join(dir, "extension", "chrome");
  expect(installUnpackedExtension(build(dir, "1.0.0", { "icons/a.png": "png" }), target)).toEqual({
    path: target,
    version: "1.0.0",
  });
  expect(installedVersion(target)).toBe("1.0.0");
  expect(readFileSync(join(target, "icons", "a.png"), "utf8")).toBe("png");
  // Same version: nothing is written.
  writeFileSync(join(target, "background.js"), "kept");
  installUnpackedExtension(build(dir, "1.0.0"), target);
  expect(readFileSync(join(target, "background.js"), "utf8")).toBe("kept");
  // A new version replaces the folder whole, leaving nothing of the old one.
  installUnpackedExtension(build(dir, "1.1.0"), target);
  expect(installedVersion(target)).toBe("1.1.0");
  expect(readFileSync(join(target, "background.js"), "utf8")).toBe("// 1.1.0");
  expect(existsSync(join(target, "icons"))).toBe(false);
  expect(existsSync(`${target}.next`) || existsSync(`${target}.old`)).toBe(false);
});

it("refuses a build with a file outside its folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "slopify-unpacked-"));
  const target = join(dir, "extension", "chrome");
  expect(() =>
    installUnpackedExtension(build(dir, "1.0.0", { "../evil.js": "x" }), target),
  ).toThrow(/outside its folder/u);
  expect(existsSync(join(dir, "extension", "evil.js"))).toBe(false);
});
