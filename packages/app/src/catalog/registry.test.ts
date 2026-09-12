import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inworldTts } from "../adapters/tts/inworld.js";
import { fixedClock } from "../kernel/clock.fake.js";
import type { LlmCompletion, LlmPort } from "../kernel/ports/llm.js";
import type { Registry } from "../kernel/ports/registry.js";
import type { TtsPort, TtsRequest } from "../kernel/ports/tts.js";
import { curateRegistry } from "./registry.js";
import { createCatalogueStore } from "./store.js";

const catalogue = createCatalogueStore({
  dataDir: mkdtempSync(join(tmpdir(), "slopify-registry-")),
  fetch: globalThis.fetch,
});
function registry(llm?: LlmPort, tts?: TtsPort): Registry {
  return {
    list: async () => [],
    llm: () => {
      if (!llm) throw Error("No LLM");
      return llm;
    },
    tts: () => {
      if (!tts) throw Error("No TTS");
      return tts;
    },
    image: () => {
      throw Error("No image");
    },
  };
}
describe("curated provider requests", () => {
  it("forwards supported thinking and rejects unsupported settings before a provider call", async () => {
    const requests: LlmCompletion[] = [];
    const port: LlmPort = {
      id: "gemini",
      capabilities: { streams: true, webSearch: true, reportsUsage: false },
      models: async () => [],
      complete: async function* (r) {
        requests.push(r);
        yield { type: "done", usage: null, finishReason: null };
      },
    };
    const curated = curateRegistry(registry(port), catalogue).llm("gemini");
    const consume = async (thinking: "low" | "off"): Promise<void> => {
      for await (const _event of curated.complete({
        model: "gemini-3.8-flash",
        thinking,
        messages: [],
        signal: new AbortController().signal,
      })) {
      }
    };
    await consume("low");
    expect(requests[0]?.thinkingConfig).toEqual({ level: "low" });
    await expect(consume("off")).rejects.toThrow(/thinking/);
    expect(requests).toHaveLength(1);
  });
  it("rejects oversized physical requests without submitting hidden split jobs", async () => {
    const texts: string[] = [];
    const port = ttsRecorder(texts);
    const curated = curateRegistry(registry(undefined, port), catalogue).tts("inworld");
    await expect(curated.synthesize(ttsRequest("a".repeat(10001)))).rejects.toMatchObject({
      fault: { kind: "unsupported" },
    });
    expect(texts).toEqual([]);
    const text = "  Exact\r\nrequest.  ";
    await curated.synthesize(ttsRequest(text));
    expect(texts).toEqual([text]);
  });

  it("still enforces Inworld's streaming ceiling when YAML raises the Flash limit", async () => {
    let calls = 0;
    const port = inworldTts({
      clock: fixedClock("2026-09-12T00:00:00Z"),
      key: () => "fixture-credential",
      fetch: async () => {
        calls++;
        throw new Error("Unexpected provider request");
      },
    });
    const live = {
      ...catalogue,
      models: (provider: string, family: Parameters<typeof catalogue.models>[1]) =>
        catalogue
          .models(provider, family)
          .map((model) =>
            "tts" in model ? { ...model, tts: { ...model.tts, maxCharacters: 100000 } } : model,
          ),
    };
    const response = await curateRegistry(registry(undefined, port), live)
      .tts("inworld")
      .synthesize({ ...ttsRequest("a".repeat(4001)), model: "inworld-tts-2-flash" });
    await expect(new Response(response.audio).arrayBuffer()).rejects.toMatchObject({
      fault: { kind: "unsupported" },
    });
    expect(calls).toBe(0);
  });

  it.each(["disabled", "lower-limit"])(
    "retrieves an accepted job after a %s catalogue change without resubmitting",
    async (change) => {
      let changed = false;
      let token: string | undefined;
      let submissions = 0;
      let fail = true;
      const texts: string[] = [];
      const port: TtsPort = {
        ...ttsRecorder(texts),
        synthesize: async (request) => {
          texts.push(request.text);
          if (request.continuation?.read() === undefined) {
            submissions++;
            request.continuation?.write("operation-1");
          }
          if (fail) {
            fail = false;
            throw new Error("download interrupted");
          }
          return { container: "mp3", audio: new ReadableStream({ start: (c) => c.close() }) };
        },
      };
      const live = {
        ...catalogue,
        models: (provider: string, family: Parameters<typeof catalogue.models>[1]) => {
          const models = catalogue.models(provider, family);
          if (!changed) return models;
          if (change === "disabled") return [];
          return models.map((model) =>
            "tts" in model ? { ...model, tts: { ...model.tts, maxCharacters: 1 } } : model,
          );
        },
      };
      const request: TtsRequest = {
        ...ttsRequest("original physical request"),
        continuation: {
          read: () => token,
          write: (value) => {
            token = value;
          },
        },
      };
      await expect(
        curateRegistry(registry(undefined, port), live).tts("inworld").synthesize(request),
      ).rejects.toThrow("download interrupted");
      changed = true;
      await curateRegistry(registry(undefined, port), live).tts("inworld").synthesize(request);
      expect(submissions).toBe(1);
      expect(texts).toEqual([request.text, request.text]);
      await expect(
        curateRegistry(registry(undefined, port), live)
          .tts("inworld")
          .synthesize(ttsRequest(request.text)),
      ).rejects.toMatchObject({ fault: { kind: "unsupported" } });
      expect(submissions).toBe(1);
    },
  );

  it("keeps frozen thinking configuration while the catalogue mapping changes", async () => {
    const requests: LlmCompletion[] = [];
    const port: LlmPort = {
      id: "gemini",
      capabilities: { streams: true, webSearch: true, reportsUsage: false },
      models: async () => [],
      complete: async function* (request) {
        requests.push(request);
        yield { type: "done", usage: null, finishReason: null };
      },
    };
    const live = {
      ...catalogue,
      models: (provider: string, family: Parameters<typeof catalogue.models>[1]) =>
        catalogue
          .models(provider, family)
          .map((model) =>
            "llm" in model
              ? { ...model, llm: { ...model.llm, thinking: { low: { budget: 2048 } } } }
              : model,
          ),
    };
    const curated = curateRegistry(registry(port), live).llm("gemini");
    for (const thinkingConfig of [{ level: "low" } as const, null]) {
      for await (const _event of curated.complete({
        model: "gemini-3.8-flash",
        thinking: "low",
        thinkingConfig,
        messages: [],
        signal: new AbortController().signal,
      })) {
      }
    }
    expect(requests.map((request) => request.thinkingConfig)).toEqual([{ level: "low" }, null]);
  });
});

function ttsRequest(text: string): TtsRequest {
  return { model: "inworld-tts-2", voiceId: "voice", text, signal: new AbortController().signal };
}
function ttsRecorder(texts: string[]): TtsPort {
  return {
    id: "inworld",
    capabilities: { streams: true },
    models: async () => [],
    synthesize: async (request) => {
      texts.push(request.text);
      return { container: "mp3", audio: new ReadableStream({ start: (c) => c.close() }) };
    },
  };
}
