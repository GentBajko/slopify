import { describe, expect, it } from "vitest";
import { lines, sseData } from "./sse-lines.js";

// The stream chopped at every offset from 1 to its length: whichever byte the network
// split on, the reader has to put the same lines back together.
function chopped(text: string, size: number): AsyncIterable<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      for (let at = 0; at < bytes.length; at += size) {
        yield bytes.slice(at, at + size);
      }
    },
  };
}

async function collect(source: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const item of source) {
    out.push(item);
  }
  return out;
}

describe("lines", () => {
  it("splits on newlines and drops the carriage return of CRLF framing", async () => {
    expect(await collect(lines(chopped("a\r\nb\nc\n", 64)))).toEqual(["a", "b", "c"]);
  });

  it("yields a blank line for a blank line, which is how SSE separates events", async () => {
    expect(await collect(lines(chopped("a\n\nb\n", 64)))).toEqual(["a", "", "b"]);
  });

  it("hands on a final line the producer did not terminate", async () => {
    expect(await collect(lines(chopped("a\nb", 64)))).toEqual(["a", "b"]);
  });

  it("yields nothing for an empty stream", async () => {
    expect(await collect(lines(chopped("", 64)))).toEqual([]);
  });

  it("puts a line back together whatever offset the chunk boundary fell on", async () => {
    const text = 'data: {"a":1}\n: OPENROUTER PROCESSING\ndata: [DONE]\n\n';
    const whole = ['data: {"a":1}', ": OPENROUTER PROCESSING", "data: [DONE]", ""];
    for (let size = 1; size <= text.length; size += 1) {
      expect(await collect(lines(chopped(text, size)))).toEqual(whole);
    }
  });

  it("keeps a multi-byte character split across a chunk boundary whole", async () => {
    // "é" is two bytes, "€" three, "𝄞" four (a surrogate pair in JS), and the crossed
    // pennant is an emoji sequence: every UTF-8 width, cut at every offset.
    const text = "héllo € 𝄞 🏳️‍🌈 ok\nsecond é line\n";
    for (let size = 1; size <= text.length; size += 1) {
      expect(await collect(lines(chopped(text, size)))).toEqual([
        "héllo € 𝄞 🏳️‍🌈 ok",
        "second é line",
      ]);
    }
  });

  it("stops on an aborted signal rather than reading the rest", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);
    await expect(collect(lines(chopped("a\nb\n", 1), controller.signal))).rejects.toBe(reason);
  });
});

describe("sseData", () => {
  it("yields payloads and skips comments, blank lines and other fields", async () => {
    const stream = [
      ": OPENROUTER PROCESSING",
      "",
      "event: message",
      'data: {"one":1}',
      "",
      ": OPENROUTER PROCESSING",
      "id: 7",
      "data: [DONE]",
      "",
      "",
    ].join("\n");
    expect(await collect(sseData(chopped(stream, 7)))).toEqual(['{"one":1}', "[DONE]"]);
  });

  it("strips exactly one space after the colon", async () => {
    expect(await collect(sseData(chopped("data:  two spaces\ndata:none\n", 3)))).toEqual([
      " two spaces",
      "none",
    ]);
  });
});
