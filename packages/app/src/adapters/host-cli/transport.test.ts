import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type RequestListener, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { hostRequest, readHostBytes } from "./transport.js";

const cleanups: (() => Promise<void>)[] = [];
it.skipIf(process.platform === "win32")(
  "does not impose the metadata deadline on delayed image headers",
  async () => {
    let begin = () => {};
    const started = new Promise<void>((resolve) => {
      begin = resolve;
    });
    const directory = await fixture((_req, res) => {
      begin();
      setTimeout(() => res.end("image"), 36_000);
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const response = hostRequest({
        directory,
        path: "/v1/image",
        method: "POST",
        kind: "image",
        body: Buffer.from("{}"),
        signal: new AbortController().signal,
      });
      await started;
      await vi.advanceTimersByTimeAsync(36_001);
      expect((await readHostBytes(await response, 100)).toString()).toBe("image");
    } finally {
      vi.useRealTimers();
    }
  },
);
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
async function fixture(listener: RequestListener) {
  const directory = await mkdtemp(join(tmpdir(), "sb-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "token"), "a".repeat(64), { mode: 0o644 });
  const server: Server = createServer(listener);
  await new Promise<void>((resolve) => server.listen(join(directory, "cli.sock"), resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  return directory;
}
it.skipIf(process.platform === "win32")(
  "sends one authenticated request and never replays a lost response",
  async () => {
    let count = 0;
    const directory = await fixture((req) => {
      count++;
      expect(req.headers.authorization).toBe(`Bearer ${"a".repeat(64)}`);
      req.socket.destroy();
    });
    await expect(
      hostRequest({
        directory,
        path: "/v1/image",
        method: "POST",
        kind: "image",
        body: Buffer.from("{}"),
        signal: AbortSignal.timeout(2000),
      }),
    ).rejects.toMatchObject({
      fault: { kind: "unavailable" },
      message: expect.stringContaining("cannot tell whether it finished"),
    });
    expect(count).toBe(1);
  },
);
it.skipIf(process.platform === "win32")(
  "rejects oversized advertised or actual responses",
  async () => {
    const directory = await fixture((_req, res) => {
      res.writeHead(200, { "content-length": "100000" });
      res.end("x");
    });
    await expect(
      hostRequest({
        directory,
        path: "/v1/status/codex",
        method: "GET",
        kind: "metadata",
        signal: AbortSignal.timeout(2000),
      }),
    ).rejects.toMatchObject({ fault: { kind: "unavailable" } });
    const chunked = await fixture((_req, res) => {
      res.write("abc");
      res.end("def");
    });
    const response = await hostRequest({
      directory: chunked,
      path: "/v1/status/codex",
      method: "GET",
      kind: "metadata",
      signal: AbortSignal.timeout(2000),
    });
    await expect(readHostBytes(response, 5)).rejects.toThrow("more data than Slopify accepts");
  },
);
