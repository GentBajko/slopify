import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, it } from "vitest";
import { limitRequestTimes } from "./timeouts.js";

// Real sockets against a real Node server, with the limits shrunk to fractions of a second.
const limits = { requestMs: 300, uploadIdleMs: 300 };
let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

async function listening(): Promise<number> {
  server = createServer((request, response) => {
    let bytes = 0;
    request.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
    });
    request.on("end", () => response.end(`got ${String(bytes)}`));
  });
  limitRequestTimes(server, limits);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No port");
  return address.port;
}

// Sends the headers, then each chunk after its delay; resolves with the status line, or
// "closed" when the server hung up without answering.
async function send(
  port: number,
  path: string,
  chunks: readonly (readonly [number, string])[],
): Promise<string> {
  const length = chunks.reduce((sum, [, text]) => sum + text.length, 0);
  const socket = connect(port, "127.0.0.1");
  const answer = new Promise<string>((resolve) => {
    let text = "";
    socket.on("data", (data) => {
      text += String(data);
    });
    socket.on("error", () => undefined);
    socket.on("close", () => resolve(text === "" ? "closed" : (text.split("\r\n")[0] ?? "")));
  });
  await new Promise((resolve) => socket.once("connect", resolve));
  socket.write(
    `PUT ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\nContent-Length: ${String(length)}\r\n\r\n`,
  );
  for (const [wait, text] of chunks) {
    await delay(wait);
    if (socket.destroyed) break;
    socket.write(text);
  }
  return answer;
}

// A body still trickling in after the limit: 100 ms apart, 600 ms in all.
const trickle = Array.from({ length: 6 }, () => [100, "x"] as const);

it("switches off Node's server-wide request limit", async () => {
  await listening();
  expect(server?.requestTimeout).toBe(0);
});

it("still answers 408 to any other request that takes longer than the limit to arrive", async () => {
  const port = await listening();
  expect(await send(port, "/api/projects", trickle)).toBe("HTTP/1.1 408 Request Timeout");
});

it("lets a backup import keep uploading past the limit while bytes keep coming", async () => {
  const port = await listening();
  expect(await send(port, "/api/storage/import", trickle)).toBe("HTTP/1.1 200 OK");
});

it("gives up on a backup import that sends nothing for the idle limit", async () => {
  const port = await listening();
  expect(
    await send(port, "/api/storage/import?x=1", [
      [50, "x"],
      [700, "y"],
    ]),
  ).toBe("closed");
});

it("leaves a request that arrives in time alone", async () => {
  const port = await listening();
  expect(await send(port, "/api/projects", [[10, "x"]])).toBe("HTTP/1.1 200 OK");
});
