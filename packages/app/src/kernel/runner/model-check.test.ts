import { describe, expect, it } from "vitest";
import { manualClock } from "../clock.fake.js";
import type { ImagePort } from "../ports/image.js";
import type { LlmCompletion, LlmPort } from "../ports/llm.js";
import { type ProviderErrorInit, providerError } from "../ports/model.js";
import type { Registry } from "../ports/registry.js";
import type { TtsPort, TtsRequest } from "../ports/tts.js";
import { checkModel } from "./model-check.js";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function registry(outcome: "ok" | ProviderErrorInit | Error, seen: unknown[] = []): Registry {
  const fail = () => {
    if (outcome === "ok") return;
    throw outcome instanceof Error ? outcome : providerError(outcome);
  };
  const llm: LlmPort = {
    id: "openrouter",
    capabilities: { streams: true, reportsUsage: true, webSearch: false },
    models: async () => [],
    complete: async function* (request: LlmCompletion) {
      seen.push(request);
      fail();
      yield { type: "delta", text: "OK" };
      yield { type: "done", usage: { inputTokens: 9, outputTokens: 2 }, finishReason: "stop" };
    },
  };
  const tts: TtsPort = {
    id: "openai-tts",
    capabilities: { streams: false },
    models: async () => [],
    synthesize: async (request: TtsRequest) => {
      seen.push(request);
      fail();
      return { audio: new Response(png).body as ReadableStream<Uint8Array>, container: "mp3" };
    },
  };
  const image: ImagePort = {
    id: "fal",
    models: async () => [],
    generate: async (request) => {
      seen.push(request);
      fail();
      return { bytes: png, mime: "image/png" };
    },
  };
  return { llm: () => llm, tts: () => tts, image: () => image, list: async () => [] };
}

const deps = (outcome: Parameters<typeof registry>[0], seen?: unknown[]) => ({
  registry: registry(outcome, seen),
  clock: manualClock(),
  log: { write: () => {} },
});
const llm = { kind: "llm", provider: "openrouter", model: "m", prompt: "Reply with OK." } as const;
const signal = new AbortController().signal;

describe("checkModel", () => {
  it("asks the smallest question and reports what it used", async () => {
    const seen: unknown[] = [];
    const answer = await checkModel(deps("ok", seen), { ...llm, thinking: "off" }, signal);
    expect(answer).toEqual({
      verdict: "works",
      sentence: null,
      stopProvider: false,
      mayHaveBilled: false,
      use: {
        kind: "llm",
        provider: "openrouter",
        model: "m",
        tokensIn: 9,
        tokensOut: 2,
        wallMs: 0,
      },
    });
    expect(seen).toMatchObject([
      { model: "m", thinking: "off", messages: [{ role: "user", content: "Reply with OK." }] },
    ]);
  });

  it("speaks a word and draws a small picture", async () => {
    const seen: unknown[] = [];
    const tts = {
      kind: "tts",
      provider: "openai-tts",
      model: "t",
      voiceId: "alloy",
      text: "Hi",
    } as const;
    expect((await checkModel(deps("ok", seen), tts, signal)).use).toMatchObject({ characters: 2 });
    const image = {
      kind: "image",
      provider: "fal",
      model: "i",
      prompt: "a small grey dot",
      aspect: "1:1",
    } as const;
    expect((await checkModel(deps("ok", seen), image, signal)).use).toMatchObject({ images: 1 });
    expect(seen).toMatchObject([{ voiceId: "alloy", text: "Hi" }, { aspect: "1:1" }]);
  });

  it("calls a model the provider refused as not on the plan no-access, with its words", async () => {
    const answer = await checkModel(
      deps({ kind: "unsupported", message: "Not on your plan.", access: "no-access" }),
      llm,
      signal,
    );
    expect(answer).toMatchObject({
      verdict: "no-access",
      sentence: "Not on your plan.",
      stopProvider: false,
    });
  });

  it("stops the provider's batch on a rejected key or a used-up limit, and says it failed", async () => {
    for (const fault of [
      { kind: "auth", message: "Bad key." },
      { kind: "rate_limit", message: "Slow down." },
      {
        kind: "rate_limit",
        message: "Plan used up.",
        planLimit: { account: "codex", resetsAt: null },
      },
    ] as const) {
      const answer = await checkModel(deps(fault), llm, signal);
      expect(answer).toMatchObject({
        verdict: "failed",
        stopProvider: true,
        sentence: fault.message,
      });
    }
  });

  it("makes one call only: a failure is never retried", async () => {
    const seen: unknown[] = [];
    const answer = await checkModel(deps({ kind: "dropped", message: "Gone." }, seen), llm, signal);
    expect(answer).toMatchObject({ verdict: "failed", stopProvider: false, sentence: "Gone." });
    expect(seen).toHaveLength(1);
  });

  it("keeps a key the provider quoted back out of the sentence", async () => {
    const answer = await checkModel(
      deps({ kind: "other", message: "Key sk-or-v1-0123456789abcdef0123456789abcdef is wrong" }),
      llm,
      signal,
    );
    expect(answer.sentence).not.toContain("0123456789abcdef");
  });

  it("says whether a failed check may have been billed: only once the provider took the request", async () => {
    const billed = async (outcome: ProviderErrorInit | Error) =>
      (await checkModel(deps(outcome), llm, signal)).mayHaveBilled;
    for (const kind of ["timeout", "dropped", "refusal", "other"] as const)
      expect(await billed({ kind, message: "x" }), kind).toBe(true);
    expect(await billed(new Error("The model answered with no text."))).toBe(true);
    for (const kind of ["auth", "missing_key", "rate_limit", "unavailable", "unsupported"] as const)
      expect(await billed({ kind, message: "x" }), kind).toBe(false);
    expect(await billed({ kind: "other", message: "x", access: "not-found" })).toBe(false);
    expect((await checkModel(deps("ok"), llm, signal)).mayHaveBilled).toBe(false);
  });

  it("names an error that is not the provider's as failed", async () => {
    const answer = await checkModel(deps(new Error("boom")), llm, signal);
    expect(answer).toMatchObject({ verdict: "failed", sentence: "boom" });
  });

  it("fails an empty answer", async () => {
    const empty: Registry = {
      ...registry("ok"),
      llm: () => ({
        id: "openrouter",
        capabilities: { streams: true, reportsUsage: true, webSearch: false },
        models: async () => [],
        complete: async function* () {
          yield { type: "done", usage: null, finishReason: "stop" };
        },
      }),
    };
    const answer = await checkModel({ ...deps("ok"), registry: empty }, llm, signal);
    expect(answer.verdict).toBe("failed");
  });
});
