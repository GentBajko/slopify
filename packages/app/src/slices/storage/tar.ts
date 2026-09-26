// The container a full backup travels in. A POSIX tar rather than the ZIP the settings-only
// backup used: a project can hold a two-hour video, and a tar is written and read front to
// back with nothing at the end to seek to, so the export streams from the files and the
// import streams to disk without either side holding an archive in memory. ZIP would need
// ZIP64 past 4 GB, which the ZIP reader here deliberately refuses. Only what a backup needs
// is spoken: regular files, with a PAX record for a long name or a size past the 8 GiB a
// ustar header can hold.

const block = 512;
const ustarNameMax = 100;
const ustarSizeMax = 0o77777777777;
const paxMax = 64 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export const tarEnd: Uint8Array = new Uint8Array(block * 2);

export interface TarEntry {
  readonly name: string;
  readonly size: number;
}

// The header block(s) for one regular file: a PAX record first when the name or size does
// not fit the ustar fields.
export function tarHeader(entry: TarEntry): Uint8Array {
  const name = encoder.encode(entry.name);
  const long = name.byteLength > ustarNameMax;
  const huge = entry.size > ustarSizeMax;
  if (!long && !huge) return ustarHeader(name, entry.size, "0");
  const records = [
    ...(long ? [paxRecord("path", entry.name)] : []),
    ...(huge ? [paxRecord("size", String(entry.size))] : []),
  ].join("");
  const pax = encoder.encode(records);
  const placeholder = encoder.encode(`longname-${entry.name.length}`);
  return concat([
    ustarHeader(encoder.encode("PaxHeader"), pax.byteLength, "x"),
    pax,
    new Uint8Array(tarPadding(pax.byteLength)),
    ustarHeader(long ? placeholder : name, huge ? 0 : entry.size, "0"),
  ]);
}

export function tarPadding(size: number): number {
  return (block - (size % block)) % block;
}

// Every byte one member adds to the archive, so an export can announce its length up front.
export function tarMemberBytes(entry: TarEntry): number {
  return tarHeader(entry).byteLength + entry.size + tarPadding(entry.size);
}

function paxRecord(key: string, value: string): string {
  // The length prefix counts itself, so it is found by fixed point.
  const body = ` ${key}=${value}\n`;
  const bytes = encoder.encode(body).byteLength;
  const digits = String(bytes).length;
  const length = String(bytes + digits).length > digits ? bytes + digits + 1 : bytes + digits;
  return `${length}${body}`;
}

function ustarHeader(name: Uint8Array, size: number, type: "0" | "x"): Uint8Array {
  const header = new Uint8Array(block);
  header.set(name.subarray(0, ustarNameMax), 0);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = type.charCodeAt(0);
  header.set(encoder.encode("ustar\u000000"), 257);
  let sum = 0;
  for (const byte of header) sum += byte;
  writeOctal(header, 148, 7, sum);
  header[155] = 0x20;
  return header;
}

function writeOctal(header: Uint8Array, offset: number, length: number, value: number): void {
  const text = value.toString(8).padStart(length - 1, "0");
  header.set(encoder.encode(text), offset);
  header[offset + length - 1] = 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

// What an entry handler is given for the member's content. It must be read to the end or
// skipped exactly once; the reader refuses to move on otherwise.
export interface TarBody {
  readonly chunks: () => AsyncGenerator<Uint8Array>;
  readonly skip: () => Promise<void>;
}

export class TarFormatError extends Error {}

// Reads a tar from a byte stream, handing each regular file to `onEntry` in archive order.
export async function readTar(
  source: AsyncIterable<Uint8Array>,
  onEntry: (entry: TarEntry, body: TarBody) => Promise<void>,
): Promise<void> {
  const reader = new ByteReader(source[Symbol.asyncIterator]());
  let pax: { path?: string; size?: number } = {};
  while (true) {
    const header = await reader.exact(block);
    if (header === undefined) throw new TarFormatError("The archive ends before its last file.");
    if (header.every((byte) => byte === 0)) {
      // The end marker is two zero blocks; anything after them is ignored like tar does.
      await reader.drain();
      return;
    }
    checkSum(header);
    const type = String.fromCharCode(header[156] ?? 0);
    const size = readOctal(header, 124, 12);
    if (type === "x" || type === "g") {
      if (size > paxMax) throw new TarFormatError("The archive has an oversized PAX header.");
      const data = await reader.exact(size + tarPadding(size));
      if (data === undefined) throw new TarFormatError("The archive ends inside a PAX header.");
      if (type === "x") pax = parsePax(data.subarray(0, size));
      continue;
    }
    if (type !== "0" && type !== "\u0000")
      throw new TarFormatError("The archive holds something other than plain files.");
    const name = pax.path ?? ustarName(header);
    const entrySize = pax.size ?? size;
    pax = {};
    // An object, so the state the handler's calls change is read back after them.
    const status = { state: "unread" as "unread" | "reading" | "done" };
    const body: TarBody = {
      chunks: async function* () {
        if (status.state !== "unread") throw new TarFormatError("A file was read twice.");
        status.state = "reading";
        let left = entrySize;
        while (left > 0) {
          const chunk = await reader.upTo(left);
          if (chunk === undefined) throw new TarFormatError("The archive ends inside a file.");
          left -= chunk.byteLength;
          yield chunk;
        }
        status.state = "done";
      },
      skip: async () => {
        for await (const _ of body.chunks()) {
          // Discarded: the importer does not keep this file.
        }
      },
    };
    await onEntry({ name, size: entrySize }, body);
    if (status.state !== "done") throw new TarFormatError("A file was not read to its end.");
    const padding = tarPadding(entrySize);
    if (padding > 0 && (await reader.exact(padding)) === undefined)
      throw new TarFormatError("The archive ends inside a file.");
  }
}

function checkSum(header: Uint8Array): void {
  const stored = readOctal(header, 148, 8);
  let sum = 0;
  for (let index = 0; index < block; index += 1)
    sum += index >= 148 && index < 156 ? 0x20 : (header[index] ?? 0);
  if (sum !== stored) throw new TarFormatError("The archive has a damaged file header.");
}

function readOctal(header: Uint8Array, offset: number, length: number): number {
  const text = String.fromCharCode(...header.subarray(offset, offset + length))
    .replace(/\0.*$/s, "")
    .trim();
  if (!/^[0-7]*$/.test(text)) throw new TarFormatError("The archive has a damaged file header.");
  return text === "" ? 0 : Number.parseInt(text, 8);
}

function ustarName(header: Uint8Array): string {
  const field = (offset: number, length: number): string => {
    const raw = header.subarray(offset, offset + length);
    const end = raw.indexOf(0);
    return decode(end === -1 ? raw : raw.subarray(0, end));
  };
  const name = field(0, 100);
  const prefix = field(345, 155);
  return prefix === "" ? name : `${prefix}/${name}`;
}

function parsePax(data: Uint8Array): { path?: string; size?: number } {
  const out: { path?: string; size?: number } = {};
  let offset = 0;
  while (offset < data.byteLength) {
    // "<length> <key>=<value>\n", the length in bytes and counting the whole record.
    const space = data.indexOf(0x20, offset);
    const length = Number(String.fromCharCode(...data.subarray(offset, Math.max(offset, space))));
    if (
      space === -1 ||
      !Number.isSafeInteger(length) ||
      length <= space - offset + 1 ||
      offset + length > data.byteLength ||
      data[offset + length - 1] !== 0x0a
    )
      throw new TarFormatError("The archive has a damaged PAX header.");
    const body = decode(data.subarray(space + 1, offset + length - 1));
    const equals = body.indexOf("=");
    const key = body.slice(0, equals);
    const value = body.slice(equals + 1);
    if (key === "path") out.path = value;
    if (key === "size") {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new TarFormatError("The archive has a damaged PAX header.");
      out.size = Number(value);
    }
    offset += length;
  }
  return out;
}

function decode(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new TarFormatError("The archive has a file name that is not valid text.");
  }
}

class ByteReader {
  private pending: Uint8Array = new Uint8Array(0);
  private ended = false;

  constructor(private readonly source: AsyncIterator<Uint8Array>) {}

  private async fill(): Promise<boolean> {
    while (this.pending.byteLength === 0) {
      if (this.ended) return false;
      const next = await this.source.next();
      if (next.done === true) {
        this.ended = true;
        return false;
      }
      this.pending = next.value;
    }
    return true;
  }

  // Up to `limit` bytes, whatever arrived: file content streams in the sizes the socket sends.
  async upTo(limit: number): Promise<Uint8Array | undefined> {
    if (!(await this.fill())) return undefined;
    const chunk = this.pending.subarray(0, limit);
    this.pending = this.pending.subarray(chunk.byteLength);
    return chunk;
  }

  async exact(length: number): Promise<Uint8Array | undefined> {
    const out = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      const chunk = await this.upTo(length - offset);
      if (chunk === undefined) return undefined;
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }

  async drain(): Promise<void> {
    this.pending = new Uint8Array(0);
    while (!this.ended) {
      const next = await this.source.next();
      if (next.done === true) this.ended = true;
    }
  }
}
