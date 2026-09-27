import { describe, expect, it } from "vitest";
import { manualClock } from "../clock.fake.js";
import type { Log } from "../log.js";
import type { ImagePort } from "../ports/image.js";
import type { LlmEvent, LlmPort } from "../ports/llm.js";
import { providerError } from "../ports/model.js";
import type { Registry } from "../ports/registry.js";
import { backoffMs } from "./attempt.js";
import type { StandaloneMeteredCall } from "./meter.js";
import { standaloneImage, standaloneLlm } from "./standalone.js";

const log: Log = { write: () => {} };

function registry(ports: { readonly llm?: LlmPort; readonly image?: ImagePort }): Registry {
  return {
    llm: () => {
      if (ports.llm === undefined) throw new Error("no llm");
      return ports.llm;
    },
    tts: () => {
      throw new Error("no tts");
    },
    image: () => {
      if (ports.image === undefined) throw new Error("no image");
      return ports.image;
    },
    list: () => Promise.resolve([]),
  };
}

function llm(events: (n: number, signal: AbortSignal) => AsyncGenerator<LlmEvent>): LlmPort & {
  readonly asked: () => number;
} {
  let n = 0;
  return {
    id: "claude-code",
    capabilities: { streams: true, reportsUsage: true, webSearch: false },
    models: () => Promise.resolve([]),
    complete: (request) => {
      n += 1;
      return events(n, request.signal);
    },
    asked: () => n,
  };
}

const owner = { kind: "schedule", id: "sch1" } as const;

describe("a provider call outside any project", () => {
  it("retries a transient failure with the stage calls' backoff and meters the answer", async () => {
    const clock = manualClock();
    const metered: StandaloneMeteredCall[] = [];
    const port = llm(async function* (n) {
      if (n === 1) throw providerError({ kind: "rate_limit", message: "Busy." });
      yield { type: "delta", text: "Owl" };
      yield { type: "delta", text: "bears" };
      yield {
        type: "done",
        usage: { inputTokens: 120, outputTokens: 8, cachedInputTokens: 100, model: "opus-x" },
        finishReason: "end_turn",
        limits: { after: [{ kind: "weekly", usedPercent: 40, resetsAt: null }] },
      };
    });
    const answer = await clock.settle(
      standaloneLlm(
        {
          registry: registry({ llm: port }),
          clock,
          log,
          meter: { record: (c) => metered.push(c) },
        },
        {
          owner,
          purpose: "topics",
          provider: "claude-code",
          model: "opus",
          messages: [{ role: "user", content: "Topics?" }],
        },
      ),
    );
    expect(answer).toEqual({
      text: "Owlbears",
      usage: { inputTokens: 120, outputTokens: 8, cachedInputTokens: 100, model: "opus-x" },
      limits: { after: [{ kind: "weekly", usedPercent: 40, resetsAt: null }] },
    });
    expect(port.asked()).toBe(2);
    expect(clock.waits).toContain(backoffMs[0]);
    expect(metered).toEqual([
      expect.objectContaining({
        owner,
        purpose: "topics",
        kind: "llm",
        provider: "claude-code",
        model: "opus-x",
        tokensIn: 120,
        tokensOut: 8,
        cachedTokens: 100,
        limits: { after: [{ kind: "weekly", usedPercent: 40, resetsAt: null }] },
      }),
    ]);
  });

  it("gives up after the last retry, meters nothing, and drops the stage-only advice", async () => {
    const clock = manualClock();
    const metered: StandaloneMeteredCall[] = [];
    const port = llm(async function* () {
      yield* [];
      throw new TypeError("fetch failed");
    });
    const call = standaloneLlm(
      { registry: registry({ llm: port }), clock, log, meter: { record: (c) => metered.push(c) } },
      {
        owner,
        purpose: "topics",
        provider: "claude-code",
        model: "opus",
        messages: [{ role: "user", content: "Topics?" }],
      },
    );
    const failure = clock.settle(call).catch((error: unknown) => error);
    const error = await failure;
    expect(port.asked()).toBe(4);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Slopify could not reach the AI model over the internet. Check your internet connection, firewall or VPN.",
    );
    expect(metered).toEqual([]);
  });

  it("stops when the caller's signal aborts", async () => {
    const clock = manualClock();
    const stop = new AbortController();
    const port = llm(async function* (_n, signal) {
      yield { type: "delta", text: "Half" };
      await new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    const call = standaloneLlm(
      { registry: registry({ llm: port }), clock, log },
      {
        owner,
        purpose: "topics",
        provider: "claude-code",
        model: "opus",
        messages: [{ role: "user", content: "Topics?" }],
        signal: stop.signal,
      },
    );
    const settled = call.then(
      () => "answered",
      () => "stopped",
    );
    await Promise.resolve();
    stop.abort(new Error("closing"));
    expect(await settled).toBe("stopped");
    expect(port.asked()).toBe(1);
  });

  it("meters a cast picture on its channel", async () => {
    const clock = manualClock();
    const metered: StandaloneMeteredCall[] = [];
    const image: ImagePort = {
      id: "fal",
      models: () => Promise.resolve([]),
      generate: async () => ({ bytes: new Uint8Array([1]), mime: "image/png" }),
    } as unknown as ImagePort;
    await clock.settle(
      standaloneImage(
        { registry: registry({ image }), clock, log, meter: { record: (c) => metered.push(c) } },
        {
          owner: { kind: "channel", id: "c1" },
          purpose: "cast-image",
          provider: "fal",
          model: "flux",
          prompt: "A dragon",
          aspect: "9:16",
        },
      ),
    );
    expect(metered).toEqual([
      expect.objectContaining({
        owner: { kind: "channel", id: "c1" },
        purpose: "cast-image",
        kind: "image",
        provider: "fal",
        model: "flux",
        images: 1,
        size: "9:16",
      }),
    ]);
  });
});
