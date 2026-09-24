import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { LlmEvent } from "../../kernel/ports/llm.js";
import { createHostCliClient } from "./index.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
async function endpoint(body: string | Buffer, type = "application/x-ndjson", protocol = 1) {
  const directory = await mkdtemp(join(tmpdir(), "sb-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "token"), "a".repeat(64), { mode: 0o644 });
  let posts = 0;
  const server = createServer((req, res) => {
    if (req.url === "/v1/health") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ protocol, version: "1.4.0", active: 0, accepting: true }));
      return;
    }
    if (req.method === "POST") posts++;
    res.setHeader("content-type", type);
    const bytes = Buffer.from(body);
    for (let i = 0; i < bytes.length; i += 3) res.write(bytes.subarray(i, i + 3));
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(join(directory, "cli.sock"), resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  return { client: createHostCliClient({ directory }), posts: () => posts };
}
const req = () => ({
  model: "test",
  messages: [{ role: "user" as const, content: "hello" }],
  signal: AbortSignal.timeout(2000),
});
async function drain(client: ReturnType<typeof createHostCliClient>) {
  const events: LlmEvent[] = [];
  for await (const event of client.llm("codex").complete(req())) events.push(event);
  return events;
}
it("gives setup guidance without local fallback when no helper is configured", async () => {
  const client = createHostCliClient({ directory: undefined });
  expect(await client.status("codex")).toMatchObject({ installed: false, issueKind: "bridge" });
  await expect(drain(client)).rejects.toMatchObject({ fault: { kind: "unavailable" } });
});
it.skipIf(process.platform === "win32")(
  "parses fragmented UTF-8 events and exact image bytes",
  async () => {
    const events = [
      { type: "activity" },
      { type: "delta", text: "héllo 🌕" },
      { type: "done", usage: { inputTokens: 1, outputTokens: 2 }, finishReason: null },
    ];
    const { client } = await endpoint(`${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
    expect(await drain(client)).toEqual(events);
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const picture = await endpoint(image, "image/jpeg");
    expect(
      await picture.client.image.generate({
        model: "codex-imagegen",
        prompt: "test",
        aspect: "16:9",
        signal: AbortSignal.timeout(2000),
      }),
    ).toEqual({ bytes: image, mime: "image/jpeg" });
  },
);
it
  .skipIf(process.platform === "win32")
  .each([
    "<html>bad</html>",
    '{"type":"delta","text":"partial"}\n',
    '{"type":"done","usage":null,"finishReason":null}\n{"type":"delta","text":"late"}\n',
  ])("rejects malformed or incomplete output without replay: %s", async (body) => {
  const h = await endpoint(body);
  await expect(drain(h.client)).rejects.toMatchObject({ fault: { kind: "unavailable" } });
  expect(h.posts()).toBe(1);
});
it.skipIf(process.platform === "win32")(
  "validates the protocol before submitting generation",
  async () => {
    const h = await endpoint("", "application/x-ndjson", 2);
    await expect(drain(h.client)).rejects.toMatchObject({ fault: { kind: "unavailable" } });
    expect(h.posts()).toBe(0);
  },
);
it.skipIf(process.platform === "win32")(
  "preserves host model groups and reasoning options",
  async () => {
    const models = [
      { id: "test", name: "Test", group: "Installed", thinkingModes: ["low", "high"] },
    ];
    const h = await endpoint(JSON.stringify({ models }), "application/json");
    expect(await h.client.llm("codex").models()).toEqual(models);
    expect(h.posts()).toBe(0);
  },
);
it.skipIf(process.platform === "win32")(
  "preserves terminal provider failures and rejects bad image bytes",
  async () => {
    const h = await endpoint(
      '{"type":"error","kind":"missing_key","message":"Sign in on the host."}\n',
    );
    await expect(drain(h.client)).rejects.toMatchObject({ fault: { kind: "missing_key" } });
    const image = await endpoint("bad", "image/png");
    await expect(
      image.client.image.generate({
        model: "codex-imagegen",
        prompt: "test",
        aspect: "16:9",
        signal: AbortSignal.timeout(2000),
      }),
    ).rejects.toMatchObject({ fault: { kind: "unavailable" } });
  },
);
