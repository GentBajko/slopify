import { describe, expect, it } from "vitest";
import { builtInTheme } from "../document/theme.js";
import {
  copyName,
  importedName,
  libraryFile,
  libraryFileFormat,
  readLibraryFile,
} from "./transfer.js";

const now = new Date("2026-10-04T10:00:00.000Z");

describe("the library file", () => {
  it("carries only what the editor saves, and reads back the same items", () => {
    const file = libraryFile(
      {
        prompts: [
          {
            id: "p1",
            kind: "article",
            name: "Dossier",
            body: "On {{topic}}.",
            slots: ["topic"],
            updatedAt: "x",
          } as never,
        ],
      },
      now,
    );
    expect(file).toEqual({
      format: libraryFileFormat,
      version: 1,
      exportedAt: now.toISOString(),
      prompts: [{ kind: "article", name: "Dossier", body: "On {{topic}}." }],
    });
    const read = readLibraryFile(JSON.stringify(file), "prompts");
    expect(read).toEqual({
      ok: true,
      items: [{ kind: "article", name: "Dossier", body: "On {{topic}}." }],
      skipped: [],
    });
  });

  it("round-trips a PDF theme's values and aliases", () => {
    const values = builtInTheme("plain");
    const themes = readLibraryFile(
      JSON.stringify(libraryFile({ documentThemes: [{ name: "Mine", values }] }, now)),
      "documentThemes",
    );
    expect(themes.ok && themes.items[0]?.values).toEqual(values);
    const alias = { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false };
    const aliases = readLibraryFile(
      JSON.stringify(libraryFile({ aliases: [{ ...alias, key: 3 } as never] }, now)),
      "aliases",
    );
    expect(aliases).toEqual({ ok: true, items: [alias], skipped: [] });
  });

  it("skips an item that doesn't fit, with its name and the reason, and keeps the rest", () => {
    const text = JSON.stringify({
      format: libraryFileFormat,
      version: 1,
      entries: [
        { category: "intro", mode: "text", name: "Hello", body: "Hi." },
        { category: "middle", mode: "text", name: "Odd", body: "x" },
        { category: "outro", mode: "text", name: "", body: "x" },
      ],
    });
    const read = readLibraryFile(text, "entries");
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.items.map((item) => item.name)).toEqual(["Hello"]);
    expect(read.skipped).toEqual([
      { item: "Odd", reason: "it is neither an intro nor an outro." },
      { item: "Item 3", reason: "it has no name." },
    ]);
  });

  it("refuses a file that isn't one, is newer, or has nothing for this tab", () => {
    expect(readLibraryFile("not json", "prompts")).toMatchObject({ ok: false });
    expect(readLibraryFile('{"hello":1}', "prompts")).toMatchObject({
      ok: false,
      message: expect.stringContaining("isn't a Slopify library file"),
    });
    expect(
      readLibraryFile(JSON.stringify({ format: libraryFileFormat, version: 9 }), "prompts"),
    ).toMatchObject({ ok: false, message: expect.stringContaining("newer Slopify") });
    expect(
      readLibraryFile(JSON.stringify(libraryFile({ aliases: [] }, now)), "documentThemes"),
    ).toMatchObject({ ok: false, message: expect.stringContaining("holds no PDF themes") });
  });
});

describe("names", () => {
  it("keeps a free name and marks a taken one as imported, counting up", () => {
    expect(importedName("Dossier", new Set(), 200)).toBe("Dossier");
    expect(importedName("Dossier", new Set(["dossier"]), 200)).toBe("Dossier (imported)");
    expect(importedName("Dossier", new Set(["dossier", "dossier (imported)"]), 200)).toBe(
      "Dossier (imported 2)",
    );
  });

  it("cuts a long name so the suffix still fits", () => {
    const long = "x".repeat(80);
    const named = importedName(long, new Set([long]), 80);
    expect(named).toHaveLength(80);
    expect(named.endsWith(" (imported)")).toBe(true);
  });

  it("names a copy '<name> copy', then 'copy 2'", () => {
    expect(copyName("Dossier", new Set(["dossier"]), 200)).toBe("Dossier copy");
    expect(copyName("Dossier", new Set(["dossier", "dossier copy"]), 200)).toBe("Dossier copy 2");
  });
});
