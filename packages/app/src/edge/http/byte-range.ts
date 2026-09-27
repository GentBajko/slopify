import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { Context } from "hono";

// One `bytes=` range, as browsers ask for media; anything else is answered with the whole file.
export function byteRange(
  header: string | undefined,
  size: number,
): { readonly start: number; readonly end: number } | "unsatisfiable" | undefined {
  const matched = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (matched === null) return undefined;
  const [, from = "", to = ""] = matched;
  if (from === "" && to === "") return undefined;
  if (from === "") {
    const suffix = Number(to);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}

// A file on disk as a response that honours one byte range, so an audio or video element
// can seek: it asks for the bytes at the new time and gets 206 with just that slice. Built
// with `c.body` so the app's own headers (the version, among others) are still added.
export function fileResponse(
  c: Context,
  path: string,
  size: number,
  headers: Readonly<Record<string, string>>,
): Response {
  const base = { ...headers, "accept-ranges": "bytes" };
  const range = byteRange(c.req.header("range"), size);
  if (range === "unsatisfiable")
    return c.body(null, 416, { ...base, "content-range": `bytes */${String(size)}` });
  if (size === 0) return c.body(null, 200, { ...base, "content-length": "0" });
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
  return c.body(body, range === undefined ? 200 : 206, {
    ...base,
    "content-length": String(end - start + 1),
    ...(range === undefined
      ? {}
      : { "content-range": `bytes ${String(start)}-${String(end)}/${String(size)}` }),
  });
}
