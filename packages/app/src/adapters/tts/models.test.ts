import { describe, expect, it } from "vitest";
import { cartesiaTts } from "./cartesia.js";
import { elevenLabsTts } from "./elevenlabs.js";
import { openAiTts } from "./openai.js";

const key = "test-catalogue-key";

const catalogues = [
  {
    name: "ElevenLabs",
    create: elevenLabsTts,
    url: "https://api.elevenlabs.io/v1/models",
    header: "xi-api-key",
    prefix: "",
    payload: [
      { model_id: "eleven_v3", name: "Eleven v3", can_do_text_to_speech: true },
      { model_id: "eleven_future", can_do_text_to_speech: true },
      { model_id: "voice-conversion", can_do_text_to_speech: false },
      { model_id: "unknown-capabilities" },
    ],
    expected: [
      { id: "eleven_v3", name: "Eleven v3" },
      { id: "eleven_future", name: "eleven_future" },
    ],
  },
  {
    name: "OpenAI",
    create: openAiTts,
    url: "https://api.openai.com/v1/models",
    header: "Authorization",
    prefix: "Bearer ",
    payload: {
      data: [
        { id: "gpt-4o-mini-tts" },
        { id: "gpt-4o-mini-tts-2026-08-27" },
        { id: "tts-1" },
        { id: "tts-1-hd" },
        { id: "tts-1-hd-1106" },
        { id: "gpt-4o" },
        { id: "gpt-4o-transcribe" },
        { id: "gpt-4o-mini-tts-realtime" },
      ],
    },
    expected: [
      { id: "gpt-4o-mini-tts", name: "gpt-4o-mini-tts" },
      { id: "gpt-4o-mini-tts-2026-08-27", name: "gpt-4o-mini-tts-2026-08-27" },
      { id: "tts-1", name: "tts-1" },
      { id: "tts-1-hd", name: "tts-1-hd" },
      { id: "tts-1-hd-1106", name: "tts-1-hd-1106" },
    ],
  },
] as const;

for (const catalogue of catalogues) {
  describe(`${catalogue.name} TTS models`, () => {
    it("loads current speech-capable models with fresh credentials and a bounded request", async () => {
      const calls: { url: string; init: RequestInit | undefined }[] = [];
      let stored = key;
      const port = catalogue.create({
        key: () => stored,
        fetch: async (url, init) => {
          calls.push({ url: String(url), init });
          return Response.json(catalogue.payload);
        },
      });

      expect(await port.models()).toEqual(catalogue.expected);
      stored = "replacement-catalogue-key";
      expect(await port.models()).toEqual(catalogue.expected);
      expect(calls.map((call) => call.url)).toEqual([catalogue.url, catalogue.url]);
      expect(calls.map((call) => new Headers(call.init?.headers).get(catalogue.header))).toEqual([
        `${catalogue.prefix}${key}`,
        `${catalogue.prefix}${stored}`,
      ]);
      expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    });

    it.each([{}, { data: "bad" }, "not-json"])(
      "rejects malformed catalogues rather than inventing models: %j",
      async (payload) => {
        const port = catalogue.create({
          key: () => key,
          fetch: async () => Response.json(payload),
        });
        await expect(port.models()).rejects.toThrow("model list");
      },
    );

    it("does not call the catalogue without a saved key", async () => {
      let calls = 0;
      const port = catalogue.create({
        key: () => undefined,
        fetch: async () => {
          calls += 1;
          return Response.json(catalogue.payload);
        },
      });
      await expect(port.models()).rejects.toThrow("key is stored");
      expect(calls).toBe(0);
    });

    it("reports catalogue HTTP failures without pretending to return a current list", async () => {
      const port = catalogue.create({
        key: () => key,
        fetch: async () => new Response("unavailable", { status: 503 }),
      });
      await expect(port.models()).rejects.toThrow("503");
    });
  });
}

it("offers documented Cartesia models without requesting an undocumented discovery endpoint", async () => {
  const port = cartesiaTts({
    key: () => key,
    fetch: async () => {
      throw new Error("Cartesia does not publish a model-list API");
    },
  });
  expect(await port.models()).toEqual([
    { id: "sonic-3.6", name: "Sonic 3.6" },
    { id: "sonic-3.5", name: "Sonic 3.5" },
    { id: "sonic-3", name: "Sonic 3" },
  ]);
});
