import type { IncomingMessage, Server } from "node:http";
import type { Http2SecureServer, Http2Server } from "node:http2";

export interface RequestLimits {
  // How long a request may take to arrive in full, headers and body: Node's own default.
  readonly requestMs: number;
  // How long a backup upload may send nothing before it is given up on.
  readonly uploadIdleMs: number;
}

export const requestLimits: RequestLimits = { requestMs: 300_000, uploadIdleMs: 300_000 };

// Node's `requestTimeout` (5 minutes) is one limit for the whole server: every
// `connectionsCheckingInterval` it answers 408 and closes any connection whose current request
// started longer ago than that and has not fully arrived, however steadily its body is still
// coming in. A multi-GB backup over a slow link needs longer, so the server's limit is switched
// off and the same limit is kept here per request, with one exception: Import everything
// (PUT /api/storage/import) may take as long as it needs, and is only cut off when it sends
// nothing at all for `uploadIdleMs`. `headersTimeout` (1 minute) is Node's and still applies to
// every request.
export function limitRequestTimes(
  server: Server | Http2Server | Http2SecureServer,
  limits: RequestLimits = requestLimits,
): void {
  if (!("requestTimeout" in server)) return;
  server.requestTimeout = 0;
  server.on("request", (request: IncomingMessage) => {
    if (isBackupUpload(request)) {
      // Idle only while the file is arriving; once it is in, the import may take its time.
      request.setTimeout(limits.uploadIdleMs);
      request.once("end", () => request.setTimeout(0));
      return;
    }
    const timer = setTimeout(() => {
      if (request.complete) return;
      // What Node itself does: a 408 if nothing has been answered on this connection yet.
      const socket = request.socket;
      if (socket.writable && socket.bytesWritten === 0)
        socket.write("HTTP/1.1 408 Request Timeout\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }, limits.requestMs);
    timer.unref();
    const clear = () => clearTimeout(timer);
    request.once("end", clear);
    request.once("close", clear);
  });
}

function isBackupUpload(request: IncomingMessage): boolean {
  return request.method === "PUT" && (request.url ?? "").split("?")[0] === "/api/storage/import";
}
