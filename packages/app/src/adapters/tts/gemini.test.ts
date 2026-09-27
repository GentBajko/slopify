import { describe, expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import type { GeminiTtsDeps } from "./gemini.js";
import { geminiSpeechBody, geminiTts, geminiTtsBase } from "./gemini.js";
import { pcmToMp3Args } from "./pcm-mp3.js";

// Constructed from Google's documented generateContent shape for speech
// (https://ai.google.dev/api/generate-content, SpeechConfig); nothing here ran against the API.

const key = "AIzaSyTESTTESTTESTTESTTESTTESTTESTTEST";

interface Seen {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

const pcm = Uint8Array.from([1, 0, 2, 0, 3, 0]);
const mp3 = Uint8Array.from([0xff, 0xfb, 0x90, 0x64]);

function audioAnswer(mimeType = "audio/L16;codec=pcm;rate=24000"): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType, data: Buffer.from(pcm).toString("base64") } }],
          },
          finishReason: "STOP",
        },
      ],
    }),
    { status: 200 },
  );
}

function replaying(response: Response, seen: Seen[] = []): GeminiTtsDeps["fetch"] {
  return (input, init) => {
    seen.push({ url: String(input), init });
    return Promise.resolve(response);
  };
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: number[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done || value === undefined) break;
    chunks.push(...value);
  }
  return Uint8Array.from(chunks);
}

function port(fetcher: GeminiTtsDeps["fetch"], encoded: { rate?: number; pcm?: Uint8Array } = {}) {
  return geminiTts({
    fetch: fetcher,
    key: () => key,
    toMp3: (input, rate) => {
      encoded.rate = rate;
      encoded.pcm = input;
      return Promise.resolve(mp3);
    },
  });
}

const signal = new AbortController().signal;

describe("geminiTts.synthesize", () => {
  it("asks generateContent for audio in one prebuilt voice and hands back the MP3 of its PCM", async () => {
    const seen: Seen[] = [];
    const encoded: { rate?: number; pcm?: Uint8Array } = {};
    const audio = await port(replaying(audioAnswer(), seen), encoded).synthesize({
      model: "gemini-2.5-pro-preview-tts",
      voiceId: "Kore",
      text: "Hello there.",
      signal,
    });
    expect(seen[0]?.url).toBe(`${geminiTtsBase}/models/gemini-2.5-pro-preview-tts:generateContent`);
    const headers = (seen[0]?.init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe(key);
    expect(seen[0]?.url).not.toContain(key);
    expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({
      contents: [{ parts: [{ text: "Hello there." }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
      },
    });
    expect(encoded).toEqual({ rate: 24000, pcm });
    expect(audio.container).toBe("mp3");
    expect(await drain(audio.audio)).toEqual(mp3);
  });

  it("speaks two voices in one multi-speaker request, each voice named as its speaker", async () => {
    const seen: Seen[] = [];
    await port(replaying(audioAnswer(), seen)).synthesize({
      voiceId: "Kore",
      text: "Hi.\nHello.\nBye.",
      dialogue: [
        { voiceId: "Kore", text: "Hi." },
        { voiceId: "Puck", text: "Hello,\nfriend." },
        { voiceId: "Kore", text: "Bye." },
      ],
      signal,
    });
    expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({
      contents: [
        {
          parts: [
            {
              text: "TTS the following conversation between Kore and Puck:\nKore: Hi.\nPuck: Hello, friend.\nKore: Bye.",
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: "Kore", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
              { speaker: "Puck", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
            ],
          },
        },
      },
    });
  });

  it("reads a dialogue in one voice as that voice alone, and refuses a third voice", () => {
    expect(
      geminiSpeechBody({
        voiceId: "Kore",
        text: "a\nb",
        dialogue: [
          { voiceId: "Kore", text: "a" },
          { voiceId: "Kore", text: "b" },
        ],
      }),
    ).toMatchObject({
      contents: [{ parts: [{ text: "a\nb" }] }],
      generationConfig: {
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
      },
    });
    expect(() =>
      geminiSpeechBody({
        voiceId: "Kore",
        text: "",
        dialogue: ["Kore", "Puck", "Leda"].map((voiceId) => ({ voiceId, text: "x" })),
      }),
    ).toThrow(/at most two/);
  });

  it("takes the sample rate Google names", async () => {
    const encoded: { rate?: number } = {};
    await port(replaying(audioAnswer("audio/L16;codec=pcm;rate=16000")), encoded).synthesize({
      voiceId: "Kore",
      text: "x",
      signal,
    });
    expect(encoded.rate).toBe(16000);
  });

  it("fails plainly without a key, on an unknown key, on a block and without audio", async () => {
    const noKey = geminiTts({
      fetch: replaying(audioAnswer()),
      key: () => undefined,
      toMp3: () => Promise.resolve(mp3),
    });
    await expect(noKey.synthesize({ voiceId: "Kore", text: "x", signal })).rejects.toThrow(
      "No Google API key is saved. Add one in Settings → Providers",
    );

    const badKey = await port(
      replaying(
        new Response(
          JSON.stringify({
            error: {
              message: "API key not valid. Please pass a valid API key.",
              status: "INVALID_ARGUMENT",
              details: [{ reason: "API_KEY_INVALID" }],
            },
          }),
          { status: 400 },
        ),
      ),
    )
      .synthesize({ voiceId: "Kore", text: "x", signal })
      .catch((error: unknown) => error);
    expect(isProviderError(badKey) && badKey.fault.kind).toBe("auth");
    expect(String(badKey)).toContain("Google did not accept the API key");

    const blocked = await port(
      replaying(new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }))),
    )
      .synthesize({ voiceId: "Kore", text: "x", signal })
      .catch((error: unknown) => error);
    expect(isProviderError(blocked) && blocked.fault.kind).toBe("refusal");

    const silent = await port(replaying(new Response(JSON.stringify({ candidates: [] }))))
      .synthesize({ voiceId: "Kore", text: "x", signal })
      .catch((error: unknown) => error);
    expect(String(silent)).toContain("Google finished without sending any audio");
  });
});

describe("geminiTts.models", () => {
  it("lists only the speech models", async () => {
    const models = await port(
      replaying(
        new Response(
          JSON.stringify({
            models: [
              {
                name: "models/gemini-2.5-flash-preview-tts",
                displayName: "Gemini 2.5 Flash Preview TTS",
                supportedGenerationMethods: ["generateContent", "countTokens"],
              },
              { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
            ],
          }),
        ),
      ),
    ).models();
    expect(models).toEqual([
      { id: "gemini-2.5-flash-preview-tts", name: "Gemini 2.5 Flash Preview TTS" },
    ]);
  });
});

describe("pcmToMp3Args", () => {
  it("reads mono 16-bit PCM at the given rate from stdin and writes MP3 to stdout", () => {
    const args = pcmToMp3Args(24000);
    expect(args.join(" ")).toContain("-f s16le -ar 24000 -ac 1 -i pipe:0");
    expect(args.slice(-3)).toEqual(["-f", "mp3", "pipe:1"]);
  });
});
