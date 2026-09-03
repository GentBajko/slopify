// Bytes off a socket or off a child's stdout, turned into the units above them. One file
// for both because OpenRouter's SSE and the two CLIs' JSONL differ only in what a line
// means, and 05-dependencies records the decision: global `fetch` at rung 3, this reader
// at rung 6, no SDK for any of the three providers.

// A chunk boundary lands wherever the network or the pipe put it: between two lines, in
// the middle of one, or inside a multi-byte character. TextDecoder's streaming mode holds
// back the tail of a split UTF-8 sequence instead of emitting a replacement character,
// and the leftover buffer holds back a split line.
export async function* lines(
  chunks: AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  for await (const chunk of chunks) {
    signal?.throwIfAborted();
    buffer += decoder.decode(chunk, { stream: true });
    for (let at = buffer.indexOf("\n"); at !== -1; at = buffer.indexOf("\n")) {
      yield withoutCr(buffer.slice(0, at));
      buffer = buffer.slice(at + 1);
    }
  }
  buffer += decoder.decode();
  // A producer that ends without a trailing newline still wrote a whole line, and one cut
  // off mid-line wrote a broken one. Both are handed on: the caller's parse is what tells
  // a complete last line from a truncated stream, and it must not be robbed of the
  // evidence by a reader that quietly drops the remainder.
  if (buffer !== "") {
    yield withoutCr(buffer);
  }
}

// The `data:` payloads of an SSE stream, in order. Comment lines - which is what
// OpenRouter's ": OPENROUTER PROCESSING" keep-alive is - and the blank lines between
// events carry nothing, and neither do the `id:`, `event:` and `retry:` fields.
// ceiling: one `data:` line is one payload. The spec folds consecutive `data:` lines of
// an event into one value joined by newlines; no provider here sends them, and buffering
// until the blank line is the upgrade when one does.
export async function* sseData(
  chunks: AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  for await (const line of lines(chunks, signal)) {
    if (!line.startsWith("data:")) {
      continue;
    }
    // The spec strips one leading space after the colon and nothing else.
    yield line.slice(5).replace(/^ /, "");
  }
}

function withoutCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
