import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { createHostCliClient } from "../adapters/host-cli/index.js";
import { hostCliRoutes, hostGate } from "../edge/http/host-cli.js";
import {
  decodeHostImageReport,
  encodeHostImageReport,
  type HostCliPorts,
  hostDoneFrame,
  hostFrameSchema,
  hostFramesHeader,
  hostImageReportHeader,
} from "../kernel/ports/host-cli.js";
import type { LlmDone, LlmEvent } from "../kernel/ports/llm.js";
import { prepareHostPaths } from "./paths.js";
import { startHostServer } from "./server.js";

// The frame rules of an app from before frame version 2, copied as they were: every object
// strict, so any field it does not know fails the whole answer.
const oldFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string() }).strict(),
  z.object({ type: z.literal("activity") }).strict(),
  z
    .object({
      type: z.literal("done"),
      usage: z
        .object({ inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative() })
        .strict()
        .nullable(),
      finishReason: z.string().max(256).nullable(),
    })
    .strict(),
  z.object({ type: z.literal("error"), kind: z.string(), message: z.string() }).strict(),
]);

const done: LlmDone = {
  type: "done",
  usage: { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1000, model: "claude-opus-5" },
  finishReason: "end_turn",
  limits: {
    after: [
      { kind: "five_hour", usedPercent: 42, resetsAt: "2026-09-27T15:00:00.000Z" },
      { kind: "weekly", usedPercent: 7, resetsAt: null },
    ],
  },
};
const image = {
  bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  mime: "image/jpeg" as const,
  usage: { inputTokens: 900, outputTokens: 40, cachedInputTokens: 300 },
  limits: { before: [{ kind: "five_hour" as const, usedPercent: 10, resetsAt: null }] },
};
const ports: HostCliPorts = {
  status: async (id) => ({ id, command: "/host/cli", installed: true, login: "signed-in" }),
  llm: (id) => ({
    id,
    capabilities: { streams: true, reportsUsage: true, webSearch: true },
    models: async () => [],
    complete: async function* () {
      yield { type: "delta", text: "hello" };
      yield done;
    },
  }),
  image: { id: "codex-image", models: async () => [], generate: async () => image },
};
const token = "a".repeat(64);
const llmBody = JSON.stringify({ model: "sonnet", messages: [{ role: "user", content: "hi" }] });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

it.skipIf(process.platform === "win32")(
  "carries cached tokens, the answering model and plan windows across the bridge",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "sb-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const paths = await prepareHostPaths(root);
    const server = await startHostServer({
      directory: paths.share,
      token,
      version: "1.4.0",
      ports,
    });
    cleanups.push(server.stop);
    await writeFile(paths.tokenFile, token, { mode: 0o644 });
    const client = createHostCliClient({ directory: paths.share });
    const events: LlmEvent[] = [];
    for await (const event of client.llm("claude-code").complete({
      model: "sonnet",
      messages: [{ role: "user", content: "hi" }],
      signal: AbortSignal.timeout(2000),
    }))
      events.push(event);
    expect(events).toEqual([{ type: "delta", text: "hello" }, done]);
    expect(
      await client.image.generate({
        model: "codex-imagegen",
        prompt: "test",
        aspect: "16:9",
        signal: AbortSignal.timeout(2000),
      }),
    ).toEqual(image);
  },
);

it("keeps the original frames for an app that does not ask for version 2", async () => {
  const app = hostCliRoutes({ token, version: "1.4.0", ports, gate: hostGate() });
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const old = await app.request("/v1/llm/claude-code", { method: "POST", headers, body: llmBody });
  const lines = (await old.text()).trim().split("\n");
  // Every frame passes the old app's strict rules, and the done frame is the original one.
  for (const line of lines) expect(oldFrameSchema.safeParse(JSON.parse(line)).success).toBe(true);
  expect(JSON.parse(lines.at(-1) ?? "")).toEqual({
    type: "done",
    usage: { inputTokens: 1200, outputTokens: 80 },
    finishReason: "end_turn",
  });
  const rich = await app.request("/v1/llm/claude-code", {
    method: "POST",
    headers: { ...headers, [hostFramesHeader]: "2" },
    body: llmBody,
  });
  const richDone = JSON.parse((await rich.text()).trim().split("\n").at(-1) ?? "");
  // Which is why the helper waits to be asked: the old rules refuse the richer frame.
  expect(oldFrameSchema.safeParse(richDone).success).toBe(false);
  expect(hostFrameSchema.parse(richDone)).toEqual(done);
});

it("sends the image report as a header an older app ignores", async () => {
  const app = hostCliRoutes({ token, version: "1.4.0", ports, gate: hostGate() });
  const response = await app.request("/v1/image", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "codex-imagegen", prompt: "test", aspect: "16:9" }),
  });
  // The body and content type an older app checks are unchanged.
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(image.bytes));
  expect(decodeHostImageReport(response.headers.get(hostImageReportHeader) ?? undefined)).toEqual({
    usage: image.usage,
    limits: image.limits,
  });
});

it("reads an older helper's frames and tolerates fields it does not know", () => {
  expect(
    hostFrameSchema.parse({
      type: "done",
      usage: { inputTokens: 1, outputTokens: 2 },
      finishReason: null,
    }),
  ).toEqual({ type: "done", usage: { inputTokens: 1, outputTokens: 2 }, finishReason: null });
  expect(
    hostFrameSchema.parse({
      type: "done",
      usage: { inputTokens: 1, outputTokens: 2, reasoningTokens: 5 },
      finishReason: null,
      costUsd: 0.01,
    }),
  ).toEqual({ type: "done", usage: { inputTokens: 1, outputTokens: 2 }, finishReason: null });
  expect(hostFrameSchema.parse({ type: "delta", text: "x", index: 3 })).toEqual({
    type: "delta",
    text: "x",
  });
  // An older helper sends no image report; a garbled one only costs the report.
  expect(decodeHostImageReport(undefined)).toEqual({});
  expect(decodeHostImageReport("not base64 json")).toEqual({});
});

it("drops a malformed part of the report rather than the answer", () => {
  expect(
    hostDoneFrame(
      {
        type: "done",
        usage: { inputTokens: 1, outputTokens: 2, cachedInputTokens: -1, model: "bad\nname" },
        finishReason: null,
        limits: { after: [{ kind: "weekly", usedPercent: Number.NaN, resetsAt: null }] },
      },
      2,
    ),
  ).toEqual({ type: "done", usage: { inputTokens: 1, outputTokens: 2 }, finishReason: null });
  expect(hostDoneFrame({ type: "done", usage: null, finishReason: null }, 2)).toEqual({
    type: "done",
    usage: null,
    finishReason: null,
  });
  expect(encodeHostImageReport({ bytes: new Uint8Array(), mime: "image/png" })).toBeUndefined();
});
