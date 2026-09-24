import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { type IncomingMessage, request } from "node:http";
import { join } from "node:path";
import { bridgeLimits } from "../../kernel/ports/host-cli.js";
import { type ProviderError, providerError } from "../../kernel/ports/model.js";

export function hostUnavailable(submitted = false): ProviderError {
  return providerError({
    kind: "unavailable",
    message: submitted
      ? "The host CLI connection ended without a reliable result; the result may be uncertain. Review the affected rebuild before retrying."
      : "Host helper unavailable. Run npx @gentbajko/slopify@latest --docker on the host to set it up or check its service.",
  });
}
export interface HostRequestOptions {
  readonly directory: string;
  readonly path: string;
  readonly method: "GET" | "POST";
  readonly kind: "metadata" | "llm" | "image";
  readonly body?: Uint8Array;
  readonly signal: AbortSignal;
}
async function tokenAt(directory: string): Promise<string> {
  const file = await open(join(directory, "token"), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size !== 64 || (stat.mode & 0o022) !== 0) throw hostUnavailable();
    const bytes = Buffer.alloc(65);
    const { bytesRead } = await file.read(bytes, 0, 65, 0);
    const value = bytes.subarray(0, bytesRead).toString("utf8");
    if (!/^[a-f0-9]{64}$/.test(value)) throw hostUnavailable();
    return value;
  } finally {
    await file.close();
  }
}
export async function hostRequest(options: HostRequestOptions): Promise<IncomingMessage> {
  if (options.body && options.body.byteLength > bridgeLimits.request)
    throw providerError({
      kind: "unsupported",
      message: "The host provider request exceeds 16 MiB.",
    });
  let token: string;
  try {
    options.signal.throwIfAborted();
    token = await tokenAt(options.directory);
  } catch {
    throw hostUnavailable();
  }
  return new Promise((resolve, reject) => {
    let response: IncomingMessage | undefined;
    let submitted = false;
    const req = request(
      {
        socketPath: join(options.directory, "cli.sock"),
        path: options.path,
        method: options.method,
        agent: false,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          ...(options.body ? { "content-length": options.body.byteLength } : {}),
        },
      },
      (incoming) => {
        response = incoming;
        const maximum =
          options.kind === "image"
            ? bridgeLimits.image
            : options.kind === "llm"
              ? bridgeLimits.stream
              : options.path.includes("/models/")
                ? bridgeLimits.models
                : bridgeLimits.status;
        const advertised = Number(incoming.headers["content-length"] ?? 0);
        if (!Number.isFinite(advertised) || advertised > maximum) {
          fail();
          return;
        }
        incoming.once("error", () => {});
        incoming.once("close", cleanup);
        resolve(incoming);
      },
    );
    const fail = () => {
      const error = hostUnavailable(submitted);
      response?.destroy(error);
      req.destroy(error);
      reject(error);
    };
    const connectTimer = setTimeout(fail, 5000);
    const deadline = setTimeout(
      fail,
      options.kind === "image" ? 300_000 : options.kind === "metadata" ? 35_000 : 120_000,
    );
    const cleanup = () => {
      clearTimeout(connectTimer);
      clearTimeout(deadline);
      options.signal.removeEventListener("abort", fail);
    };
    req.once("socket", (socket) => {
      socket.once("connect", () => {
        clearTimeout(connectTimer);
        submitted = options.method === "POST";
      });
    });
    req.on("error", () => {
      cleanup();
      const error = hostUnavailable(submitted);
      response?.destroy(error);
      reject(error);
    });
    if (options.kind === "llm") {
      req.on("response", () => clearTimeout(deadline));
      req.setTimeout(120_000, fail);
    }
    options.signal.addEventListener("abort", fail, { once: true });
    if (options.signal.aborted) fail();
    else req.end(options.body);
  });
}
export async function readHostBytes(response: IncomingMessage, maximum: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const value of response) {
      if (!Buffer.isBuffer(value)) throw hostUnavailable();
      length += value.byteLength;
      if (length > maximum)
        throw providerError({
          kind: "unavailable",
          message: "Host response exceeded its size limit.",
        });
      chunks.push(value);
    }
    if (!response.complete) throw hostUnavailable();
    return Buffer.concat(chunks, length);
  } finally {
    response.destroy();
  }
}
