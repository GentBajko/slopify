import { Readable } from "node:stream";
import { Busboy } from "@fastify/busboy";
import { HTTPException } from "hono/http-exception";

// The consumer cannot commit an upload until the entire multipart envelope is valid.
export async function readMultipart<T>(
  request: Request,
  consume: (content: AsyncIterable<Uint8Array>, filename: string) => Promise<T>,
): Promise<T | undefined> {
  const contentType = request.headers.get("content-type");
  if (contentType === null || !contentType.startsWith("multipart/form-data"))
    throw new HTTPException(415, {
      message: "The upload was not sent as a file. Reload the page and choose the file again.",
    });
  if (request.body === null)
    throw new HTTPException(400, {
      message: "The upload arrived empty. Choose the file again and retry.",
    });
  let parser: InstanceType<typeof Busboy>;
  try {
    parser = new Busboy({
      headers: { "content-type": contentType },
      limits: { files: 1, fields: 8 },
      preservePath: true,
    });
  } catch (error) {
    throw new HTTPException(400, {
      message: "The upload did not arrive complete. Choose the file again and retry.",
      cause: error,
    });
  }
  const source = Readable.fromWeb(request.body);
  let file: Readable | undefined;
  let operation: Promise<T> | undefined;
  let complete: () => void = () => undefined;
  let rejectEnvelope: (error: Error) => void = () => undefined;
  const completed = new Promise<void>((resolve, reject) => {
    complete = resolve;
    rejectEnvelope = reject;
  });
  // Observe immediately: the consumer may reject before it reaches the envelope check.
  const envelope = completed.then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const fail = (error: Error): void => {
    rejectEnvelope(error);
    file?.destroy(error);
    source.destroy();
    parser.destroy();
  };
  source.on("error", fail);
  parser.on("error", (error: Error) =>
    fail(
      new HTTPException(400, {
        message: "The upload did not arrive complete. Choose the file again and retry.",
        cause: error,
      }),
    ),
  );
  parser.on("finish", () => complete());
  parser.on("file", (_field, stream, filename) => {
    file = stream;
    stream.on("error", fail);
    async function* content(): AsyncGenerator<Uint8Array> {
      for await (const chunk of stream) yield chunk;
      const result = await envelope;
      if (!result.ok) throw result.error;
    }
    operation = Promise.resolve().then(() =>
      consume(content(), typeof filename === "string" ? filename : ""),
    );
    void operation.then(
      () => stream.resume(),
      (error: unknown) => {
        fail(error instanceof Error ? error : new Error("Upload failed", { cause: error }));
      },
    );
  });
  const abort = (): void =>
    fail(
      new Error("The upload was interrupted before it finished. Choose the file again and retry."),
    );
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  else source.pipe(parser);
  try {
    const parsed = await envelope;
    if (operation !== undefined) {
      const result = await operation;
      if (!parsed.ok) throw parsed.error;
      return result;
    }
    if (!parsed.ok) throw parsed.error;
    return undefined;
  } finally {
    request.signal.removeEventListener("abort", abort);
  }
}
