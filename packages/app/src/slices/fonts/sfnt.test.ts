import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readFontMetadata, standaloneFont } from "./sfnt.js";

const regular = readFileSync(new URL("../../assets/fonts/Barlow-Regular.ttf", import.meta.url));

function renamed(): Buffer {
  const bytes = Buffer.from(regular);
  const before = Buffer.from("Barlow", "utf16le").swap16();
  const after = Buffer.from("Custom", "utf16le").swap16();
  let at = bytes.indexOf(before);
  while (at >= 0) {
    after.copy(bytes, at);
    at = bytes.indexOf(before, at + before.length);
  }
  return bytes;
}

function collection(): Buffer {
  const faces = [regular, renamed()];
  const headerSize = 12 + faces.length * 4;
  const result = Buffer.alloc(headerSize + faces.reduce((sum, face) => sum + face.length, 0));
  result.write("ttcf");
  result.writeUInt32BE(0x00010000, 4);
  result.writeUInt32BE(faces.length, 8);
  let offset = headerSize;
  faces.forEach((face, index) => {
    result.writeUInt32BE(offset, 12 + index * 4);
    face.copy(result, offset);
    for (let table = 0; table < face.readUInt16BE(4); table += 1) {
      const at = offset + 12 + table * 16 + 8;
      result.writeUInt32BE(result.readUInt32BE(at) + offset, at);
    }
    offset += face.length;
  });
  return result;
}

describe("SFNT metadata", () => {
  it("uses the internal TrueType full name, not its PostScript name", () => {
    expect(readFontMetadata(regular)).toEqual([
      {
        family: "Barlow",
        name: "Barlow Regular",
        assName: "Barlow Regular",
        index: 0,
        extension: ".ttf",
      },
    ]);
  });

  it("uses the PostScript name for a CFF outline face", () => {
    const bytes = Buffer.from(regular);
    bytes.write("OTTO", 0);
    for (let at = 0; at < bytes.readUInt16BE(4); at += 1) {
      const record = 12 + at * 16;
      if (bytes.toString("ascii", record, record + 4) === "glyf") {
        bytes.write("CFF ", record);
        const offset = bytes.readUInt32BE(record + 8);
        bytes.set([1, 0, 4, 4], offset);
      }
    }
    expect(readFontMetadata(bytes)?.[0]).toMatchObject({
      assName: "Barlow-Regular",
      extension: ".otf",
    });
  });

  it("refuses corrupted glyph metrics and character-map offsets", () => {
    for (const tag of ["hhea", "cmap"]) {
      const bytes = Buffer.from(regular);
      for (let at = 0; at < bytes.readUInt16BE(4); at += 1) {
        const record = 12 + at * 16;
        if (bytes.toString("ascii", record, record + 4) === tag) {
          const offset = bytes.readUInt32BE(record + 8);
          if (tag === "hhea") bytes.writeUInt16BE(0, offset + 34);
          else bytes.writeUInt32BE(0xffffffff, offset + 8);
        }
      }
      expect(readFontMetadata(bytes)).toBeUndefined();
    }
  });

  it("refuses truncated or out-of-bounds table directories", () => {
    expect(readFontMetadata(regular.subarray(0, 100))).toBeUndefined();
    const bad = Buffer.from(regular);
    bad.writeUInt32BE(0xffffffff, 20);
    expect(readFontMetadata(bad)).toBeUndefined();
    expect(readFontMetadata(Buffer.alloc(20))).toBeUndefined();
  });

  it("refuses names that could introduce ASS style fields", () => {
    const bad = Buffer.from(regular);
    const before = Buffer.from("Barlow", "utf16le").swap16();
    const after = Buffer.from("Bad,xx", "utf16le").swap16();
    let at = bad.indexOf(before);
    while (at >= 0) {
      after.copy(bad, at);
      at = bad.indexOf(before, at + before.length);
    }
    expect(readFontMetadata(bad)).toBeUndefined();
  });

  it("lists collection faces and extracts the selected face for browser preview", () => {
    const bytes = collection();
    expect(readFontMetadata(bytes)?.map((face) => [face.name, face.index, face.extension])).toEqual(
      [
        ["Barlow Regular", 0, ".ttc"],
        ["Custom Regular", 1, ".ttc"],
      ],
    );
    const preview = standaloneFont(bytes, 1);
    expect(preview).toBeDefined();
    expect(readFontMetadata(preview ?? new Uint8Array())?.[0]?.name).toBe("Custom Regular");
    expect(standaloneFont(bytes, 2)).toBeUndefined();
  });
});
