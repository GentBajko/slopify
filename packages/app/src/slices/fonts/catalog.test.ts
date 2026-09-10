import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { layout } from "../../kernel/paths.js";
import { listFonts, resolveFont } from "./catalog.js";
import { scanFontDirectories, systemFontDirectories } from "./discovery.js";
import { uploadFont } from "./upload.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fresh() {
  const dir = await mkdtemp(join(tmpdir(), "slopify-fonts-"));
  temporary.push(dir);
  return layout(dir);
}
async function regular(): Promise<Uint8Array> {
  return readFile(new URL("../../assets/fonts/Barlow-Regular.ttf", import.meta.url));
}

describe("font catalog", () => {
  // Listing includes the runner’s installed fonts, whose first scan can exceed five seconds.
  it("always resolves the bundled default with matching renderer metadata", {
    timeout: 30_000,
  }, async () => {
    const paths = await fresh();
    expect(await resolveFont(paths, "default")).toMatchObject({
      id: "default",
      source: "bundled",
      family: "Barlow",
      assName: "Barlow Regular",
      extension: ".ttf",
    });
    expect(await listFonts(paths)).toContainEqual({
      id: "default",
      name: "Barlow Regular",
      family: "Barlow",
      source: "bundled",
    });
  });

  it("stores validated uploads under a content hash and resolves the same bytes", async () => {
    const paths = await fresh();
    const content = await regular();
    const result = await uploadFont(paths, { filename: "My font.ttf", content });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.font.id).toMatch(/^uploaded-[a-f0-9]{64}$/);
    expect(result.font.name).toBe("Barlow Regular");
    const resolved = await resolveFont(paths, result.font.id);
    expect(await readFile(resolved.path)).toEqual(Buffer.from(content));
    expect(await uploadFont(paths, { filename: "renamed.ttf", content })).toEqual(result);
    expect(await readdir(join(paths.dataDir, "fonts"))).toHaveLength(1);
  });

  it("refuses unsafe names, unsupported containers and corrupt files without writing", async () => {
    const paths = await fresh();
    for (const filename of ["../font.ttf", "C:\\font.ttf", "bad/Font.ttf"]) {
      expect(await uploadFont(paths, { filename, content: await regular() })).toMatchObject({
        ok: false,
        reason: "unsafe-filename",
      });
    }
    expect(
      await uploadFont(paths, { filename: "font.woff2", content: await regular() }),
    ).toMatchObject({ ok: false, reason: "unsupported-format" });
    expect(
      await uploadFont(paths, { filename: "font.ttf", content: new Uint8Array([1, 2, 3]) }),
    ).toMatchObject({ ok: false, reason: "invalid-font" });
    await expect(resolveFont(paths, "../slopify.db")).rejects.toMatchObject({
      cause: "font-not-found",
    });
  });

  it("does not follow uploaded font symlinks", async () => {
    const paths = await fresh();
    await mkdir(join(paths.dataDir, "fonts"));
    const id = `uploaded-${"a".repeat(64)}`;
    await symlink(
      new URL("../../assets/fonts/Barlow-Regular.ttf", import.meta.url),
      join(paths.dataDir, "fonts", `${id}.ttf`),
    );
    await expect(resolveFont(paths, id)).rejects.toMatchObject({ cause: "font-not-found" });
  });
});

describe("system font discovery", () => {
  it("recurses only inside supplied roots and tolerates missing roots and malformed fonts", async () => {
    const paths = await fresh();
    await mkdir(join(paths.dataDir, "nested"));
    await writeFile(join(paths.dataDir, "nested", "regular.ttf"), await regular());
    await writeFile(join(paths.dataDir, "bad.ttf"), "not a font");
    await symlink(paths.dataDir, join(paths.dataDir, "nested", "loop"));
    const files = await scanFontDirectories([paths.dataDir, join(paths.dataDir, "absent")]);
    expect(files.map((file) => file.name)).toEqual(["Barlow Regular"]);
    expect(files[0]?.id).toMatch(/^system-[a-f0-9]{64}$/);
  });

  it("uses platform and user font roots without interpolating a shell command", () => {
    expect(
      systemFontDirectories(
        "win32",
        { WINDIR: "C:\\Windows", LOCALAPPDATA: "C:\\Users\\A\\AppData\\Local" },
        "/home/a",
      ),
    ).toContain("C:\\Windows\\Fonts");
    expect(systemFontDirectories("darwin", {}, "/Users/a")).toContain("/Users/a/Library/Fonts");
    expect(systemFontDirectories("linux", { XDG_DATA_HOME: "/data/a" }, "/home/a")).toContain(
      "/data/a/fonts",
    );
  });
});
