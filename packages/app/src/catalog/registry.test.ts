import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
  it("bounds long segments and retains each accepted async job across a failed download retry", async () => {
    let submissions = 0;
    let fail = true;
    let continuation: string | undefined;
    const texts: string[] = [];
    const port: TtsPort = {
      id: "inworld",
      capabilities: { streams: true },
      models: async () => [],
      synthesize: async (request) => {
        texts.push(request.text);
        if (!request.continuation?.read()) {
          submissions++;
          request.continuation?.write(`operation-${submissions}`);
        }
        return {
          container: "mp3",
          audio: new ReadableStream({
            start(c) {
              if (fail && request.text.startsWith("b")) {
                fail = false;
                c.error(new Error("download interrupted"));
              } else {
                c.enqueue(new Uint8Array([1]));
                c.close();
              }
            },
          }),
        };
      },
    };
    const curated = curateRegistry(registry(undefined, port), catalogue).tts("inworld");
    const request: TtsRequest = {
      model: "inworld-tts-2",
      voiceId: "voice",
      text: "a".repeat(10000) + "b".repeat(10000),
      signal: new AbortController().signal,
      continuation: {
        read: () => continuation,
        write: (value) => {
          continuation = value;
        },
      },
    };
    const consume = async (): Promise<void> => {
      await new Response((await curated.synthesize(request)).audio).arrayBuffer();
    };
    await expect(consume()).rejects.toThrow("download interrupted");
    await consume();
    expect(submissions).toBe(2);
    expect(texts.every((text) => text.length <= 10000)).toBe(true);
  });
});
