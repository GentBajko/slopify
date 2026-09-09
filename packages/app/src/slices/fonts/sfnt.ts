import { fontMaxBytes } from "./model.js";

export interface FontFaceMetadata {
  readonly family: string;
  readonly name: string;
  readonly assName: string;
  readonly index: number;
  readonly extension: ".ttf" | ".otf" | ".ttc";
}
interface Table {
  readonly offset: number;
  readonly length: number;
}
interface Face {
  readonly offset: number;
  readonly tables: ReadonlyMap<string, Table>;
}
const trueType = 0x00010000;
const openType = 0x4f54544f;
const collection = 0x74746366;

// Metadata only: outlines remain FreeType's responsibility. Every read and allocation
// is bounded before using file-controlled offsets, lengths or counts.
export function readFontMetadata(content: Uint8Array): readonly FontFaceMetadata[] | undefined {
  const bytes = Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  const faces = directories(bytes);
  if (faces === undefined) return undefined;
  const result: FontFaceMetadata[] = [];
  for (const [index, face] of faces.entries()) {
    const names = fontNames(bytes, face.tables.get("name"));
    if (names === undefined) return undefined;
    const family = names.get(1) ?? names.get(16);
    const name = names.get(4) ?? family;
    const cff = face.tables.has("CFF ") || face.tables.has("CFF2");
    const assName = cff ? (names.get(6) ?? family) : (names.get(4) ?? names.get(1));
    if (!usable(family) || !usable(name) || !usable(assName)) return undefined;
    result.push({
      family,
      name,
      assName,
      index,
      extension: bytes.readUInt32BE(0) === collection ? ".ttc" : cff ? ".otf" : ".ttf",
    });
  }
  return result;
}

// Browsers do not consistently address individual TTC faces. Repackage just the
// selected face, retaining its original tables and names, with fresh SFNT checksums.
export function standaloneFont(content: Uint8Array, index: number): Uint8Array | undefined {
  const bytes = Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  const face = directories(bytes)?.[index];
  if (face === undefined || readFontMetadata(content) === undefined) return undefined;
  if (bytes.readUInt32BE(0) !== collection) return Buffer.from(bytes);
  const tables = [...face.tables.entries()].filter(([tag]) => tag !== "DSIG");
  const header = 12 + tables.length * 16;
  const size = tables.reduce((sum, [, table]) => sum + padded(table.length), header);
  if (size > fontMaxBytes) return undefined;
  const result = Buffer.alloc(size);
  result.writeUInt32BE(bytes.readUInt32BE(face.offset), 0);
  result.writeUInt16BE(tables.length, 4);
  const power = Math.floor(Math.log2(tables.length));
  result.writeUInt16BE(2 ** power * 16, 6);
  result.writeUInt16BE(power, 8);
  result.writeUInt16BE(tables.length * 16 - 2 ** power * 16, 10);
  let offset = header;
  let head = 0;
  for (const [index, [tag, table]] of tables.entries()) {
    const record = 12 + index * 16;
    result.write(tag, record, 4, "ascii");
    bytes.copy(result, offset, table.offset, table.offset + table.length);
    if (tag === "head") {
      head = offset;
      result.writeUInt32BE(0, head + 8);
    }
    result.writeUInt32BE(
      checksum(result.subarray(offset, offset + padded(table.length))),
      record + 4,
    );
    result.writeUInt32BE(offset, record + 8);
    result.writeUInt32BE(table.length, record + 12);
    offset += padded(table.length);
  }
  result.writeUInt32BE((0xb1b0afba - checksum(result)) >>> 0, head + 8);
  return result;
}

function directories(bytes: Buffer): readonly Face[] | undefined {
  if (bytes.length < 12 || bytes.length > fontMaxBytes) return undefined;
  const offsets = [0];
  if (bytes.readUInt32BE(0) === collection) {
    const version = bytes.readUInt32BE(4);
    const count = bytes.readUInt32BE(8);
    if (
      ![0x00010000, 0x00020000].includes(version) ||
      count < 1 ||
      count > 256 ||
      12 + count * 4 > bytes.length
    )
      return undefined;
    offsets.splice(0);
    for (let at = 0; at < count; at += 1) offsets.push(bytes.readUInt32BE(12 + at * 4));
    if (new Set(offsets).size !== offsets.length) return undefined;
  }
  const faces: Face[] = [];
  for (const offset of offsets) {
    if (!within(bytes, offset, 12) || ![trueType, openType].includes(bytes.readUInt32BE(offset)))
      return undefined;
    const count = bytes.readUInt16BE(offset + 4);
    if (count < 1 || count > 256 || !within(bytes, offset + 12, count * 16)) return undefined;
    const tables = new Map<string, Table>();
    for (let at = 0; at < count; at += 1) {
      const record = offset + 12 + at * 16;
      const tag = bytes.toString("ascii", record, record + 4);
      const table = {
        offset: bytes.readUInt32BE(record + 8),
        length: bytes.readUInt32BE(record + 12),
      };
      if (tables.has(tag) || table.offset % 4 !== 0 || !within(bytes, table.offset, table.length))
        return undefined;
      tables.set(tag, table);
    }
    const spans = [...tables.values()]
      .filter((table) => table.length > 0)
      .toSorted((a, b) => a.offset - b.offset);
    if (
      spans.some(
        (table, at) =>
          at > 0 && (spans[at - 1]?.offset ?? 0) + (spans[at - 1]?.length ?? 0) > table.offset,
      )
    )
      return undefined;
    const cff = tables.has("CFF ") || tables.has("CFF2");
    if ((bytes.readUInt32BE(offset) === openType) !== cff || !validTables(bytes, tables))
      return undefined;
    faces.push({ offset, tables });
  }
  return faces;
}

function validTables(bytes: Buffer, tables: ReadonlyMap<string, Table>): boolean {
  const minimum: Readonly<Record<string, number>> = {
    head: 54,
    maxp: 6,
    cmap: 4,
    hhea: 36,
    hmtx: 4,
    name: 6,
  };
  for (const [tag, size] of Object.entries(minimum))
    if ((tables.get(tag)?.length ?? 0) < size) return false;
  const head = tables.get("head");
  const maxp = tables.get("maxp");
  const hhea = tables.get("hhea");
  const hmtx = tables.get("hmtx");
  if (!head || !maxp || !hhea || !hmtx) return false;
  const glyphs = bytes.readUInt16BE(maxp.offset + 4);
  const metrics = bytes.readUInt16BE(hhea.offset + 34);
  const units = bytes.readUInt16BE(head.offset + 18);
  if (
    bytes.readUInt32BE(head.offset + 12) !== 0x5f0f3cf5 ||
    units < 16 ||
    units > 16384 ||
    glyphs === 0 ||
    metrics === 0 ||
    metrics > glyphs ||
    hmtx.length < metrics * 4 + (glyphs - metrics) * 2
  )
    return false;
  const cff = tables.get("CFF ") ?? tables.get("CFF2");
  if (!validCmap(bytes, tables.get("cmap"))) return false;
  if (cff) return cff.length >= 4 && [1, 2].includes(bytes[cff.offset] ?? 0);
  const glyf = tables.get("glyf");
  const loca = tables.get("loca");
  const format = bytes.readInt16BE(head.offset + 50);
  if (
    !glyf ||
    !loca ||
    (format !== 0 && format !== 1) ||
    loca.length < (glyphs + 1) * (format === 0 ? 2 : 4)
  )
    return false;
  let previous = 0;
  for (let at = 0; at <= glyphs; at += 1) {
    const next =
      format === 0
        ? bytes.readUInt16BE(loca.offset + at * 2) * 2
        : bytes.readUInt32BE(loca.offset + at * 4);
    if (next < previous || next > glyf.length) return false;
    previous = next;
  }
  return true;
}

function validCmap(bytes: Buffer, table: Table | undefined): boolean {
  if (!table || table.length < 4 || bytes.readUInt16BE(table.offset) !== 0) return false;
  const count = bytes.readUInt16BE(table.offset + 2);
  if (count < 1 || count > 512 || table.length < 4 + count * 8) return false;
  let supported = false;
  for (let at = 0; at < count; at += 1) {
    const offset = bytes.readUInt32BE(table.offset + 4 + at * 8 + 4);
    if (offset < 4 + count * 8 || offset + 4 > table.length) return false;
    const format = bytes.readUInt16BE(table.offset + offset);
    const long = [8, 10, 12, 13].includes(format);
    if (long && offset + 8 > table.length) return false;
    const length =
      format === 14
        ? offset + 6 <= table.length
          ? bytes.readUInt32BE(table.offset + offset + 2)
          : 0
        : long
          ? bytes.readUInt32BE(table.offset + offset + 4)
          : bytes.readUInt16BE(table.offset + offset + 2);
    if (length < 4 || offset + length > table.length) return false;
    if ([0, 4, 6, 10, 12, 13].includes(format)) supported = true;
  }
  return supported;
}

function fontNames(
  bytes: Buffer,
  table: Table | undefined,
): ReadonlyMap<number, string> | undefined {
  if (!table || table.length < 6) return undefined;
  const format = bytes.readUInt16BE(table.offset);
  const count = bytes.readUInt16BE(table.offset + 2);
  const storage = bytes.readUInt16BE(table.offset + 4);
  if (format > 1 || count > 4096 || storage < 6 + count * 12 || storage > table.length)
    return undefined;
  const names = new Map<number, { value: string; score: number }>();
  for (let at = 0; at < count; at += 1) {
    const record = table.offset + 6 + at * 12;
    const platform = bytes.readUInt16BE(record);
    const encoding = bytes.readUInt16BE(record + 2);
    const language = bytes.readUInt16BE(record + 4);
    const id = bytes.readUInt16BE(record + 6);
    const length = bytes.readUInt16BE(record + 8);
    const offset = bytes.readUInt16BE(record + 10);
    if (storage + offset + length > table.length) return undefined;
    if (
      ![1, 4, 6, 16].includes(id) ||
      (platform !== 0 && !(platform === 3 && [0, 1, 10].includes(encoding)))
    )
      continue;
    if (length === 0 || length > 1024 || length % 2 !== 0) return undefined;
    const score = (platform === 3 ? 2 : 0) + (language === 0x409 ? 1 : 0);
    if ((names.get(id)?.score ?? -1) > score) continue;
    let value: string;
    try {
      value = new TextDecoder("utf-16be", { fatal: true }).decode(
        bytes.subarray(table.offset + storage + offset, table.offset + storage + offset + length),
      );
    } catch {
      return undefined;
    }
    names.set(id, { value, score });
  }
  return new Map([...names].map(([id, entry]) => [id, entry.value]));
}

function usable(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.length > 0 &&
    value.length <= 256 &&
    !value.includes(",") &&
    ![...value].some((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point < 0x20 || (point >= 0x7f && point <= 0x9f);
    })
  );
}
function within(bytes: Buffer, offset: number, length: number): boolean {
  return offset >= 0 && length >= 0 && offset <= bytes.length && length <= bytes.length - offset;
}
function padded(value: number): number {
  return Math.ceil(value / 4) * 4;
}
function checksum(bytes: Buffer): number {
  let sum = 0;
  for (let at = 0; at < bytes.length; at += 4) sum = (sum + bytes.readUInt32BE(at)) >>> 0;
  return sum;
}
