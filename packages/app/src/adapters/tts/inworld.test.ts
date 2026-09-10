import { describe, expect, it, vi } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import type { TtsRequest } from "../../kernel/ports/tts.js";
import { inworldTts } from "./inworld.js";

// Constructed fixtures from Inworld's stream/async API references; no paid API calls.
const key = "fixture-base64-credential";
const name = "workspaces/demo/ttsAsyncJobs/job-1/operations/op-1";
const request: TtsRequest = {
  voiceId: "Dennis",
  text: "Hello",
  signal: new AbortController().signal,
};
const mp3 = Uint8Array.from([255, 251, 144, 100, 1, 2, 3]);
const streamed = (): Response =>
  new Response(
    `${JSON.stringify({ result: { audioContent: Buffer.from(mp3).toString("base64") } })}\n`,
  );
function setup(responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  });
  const clock = fixedClock("2026-09-10T00:00:00Z");
  const speaker = inworldTts({ fetch, key: () => key, clock });
  const speak = async (overrides: Partial<TtsRequest> = {}): Promise<Uint8Array> => {
    const result = await speaker.synthesize({ ...request, ...overrides });
    return new Uint8Array(await new Response(result.audio).arrayBuffer());
  };
  return { fetch, speaker, speak };
}

describe("Inworld narration", () => {
  it("decodes NDJSON incrementally, including split and unterminated lines", async () => {
    const line = JSON.stringify({ result: { audioContent: Buffer.from(mp3).toString("base64") } });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of ['{"result":{}}\n', line.slice(0, 12), line.slice(12)])
          controller.enqueue(new TextEncoder().encode(part));
        controller.close();
      },
    });
    const h = setup([new Response(body)]);
    expect(await h.speak({ model: "inworld-tts-2-flash" })).toEqual(mp3);
    expect(h.fetch.mock.calls[0]?.[0]).toBe("https://api.inworld.ai/tts/v1/voice:stream");
    const init = h.fetch.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Basic ${key}`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      text: "Hello",
      voiceId: "Dennis",
      modelId: "inworld-tts-2-flash",
      audioConfig: { audioEncoding: "MP3" },
    });
  });

  it("submits 100,000 characters unchanged as one async job, polls, then downloads without credentials", async () => {
    const h = setup([
      Response.json({ name, done: false }),
      Response.json({ name, done: false }),
      Response.json({
        name,
        done: true,
        response: {
          audioUri: "https://storage.googleapis.com/fixture/audio.mp3?signature=example",
        },
      }),
      new Response(mp3),
    ]);
    const onActivity = vi.fn();
    const text = "a".repeat(100_000);
    expect(await h.speak({ text, onActivity })).toEqual(mp3);
    expect(h.fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.inworld.ai/tts/v1/voice:synthesizeAsync",
      `https://api.inworld.ai/lro/v1alpha/${name}`,
      `https://api.inworld.ai/lro/v1alpha/${name}`,
      "https://storage.googleapis.com/fixture/audio.mp3?signature=example",
    ]);
    expect(JSON.parse(String(h.fetch.mock.calls[0]?.[1]?.body)).text).toBe(text);
    expect(new Headers(h.fetch.mock.calls[3]?.[1]?.headers).get("Authorization")).toBeNull();
    expect(onActivity).toHaveBeenCalledTimes(3);
  });

  it("reuses an accepted job after a polling failure instead of submitting twice", async () => {
    const h = setup([
      Response.json({ name, done: false }),
      new Response("unavailable", { status: 503 }),
      Response.json({
        name,
        done: true,
        response: { audioUri: "https://storage.googleapis.com/audio.mp3" },
      }),
      new Response(mp3),
    ]);
    let token: string | undefined;
    const continuation = {
      read: () => token,
      write: (value: string) => {
        token = value;
      },
    };
    const long = { text: "a".repeat(4001), continuation };
    await expect(h.speak(long)).rejects.toThrow("503");
    expect(await h.speak(long)).toEqual(mp3);
    expect(h.fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("keeps Flash on the streaming endpoint and preserves long text", async () => {
    const h = setup([streamed(), streamed(), streamed()]);
    const text = "A whole sentence. ".repeat(500).trim();
    await h.speak({ text, model: "inworld-tts-2-flash" });
    const parts = h.fetch.mock.calls.map(
      ([, init]) => JSON.parse(String(init?.body)).text as string,
    );
    expect(parts.every((part) => part.length <= 4000)).toBe(true);
    expect(parts.join(" ")).toBe(text);
    expect(h.fetch.mock.calls.every(([url]) => String(url).endsWith(":stream"))).toBe(true);
  });

  it("rejects over-limit async input before submitting", async () => {
    const h = setup([]);
    await expect(h.speak({ text: "a".repeat(100_001) })).rejects.toThrow("100,000");
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("preserves account-specific rejection details and redacts credentials", async () => {
    const h = setup([new Response(`On-Demand limit is 10000 characters. ${key}`, { status: 400 })]);
    await expect(h.speak({ text: "a".repeat(10_001) })).rejects.toMatchObject({
      fault: { kind: "unsupported" },
      message: expect.stringContaining("10000"),
    });
    const second = setup([new Response(key, { status: 401 })]);
    await expect(second.speak()).rejects.toThrow("[redacted]");
  });

  it("rejects malformed operations without following their path", async () => {
    const h = setup([Response.json({ name: "https://evil.invalid/steal", done: false })]);
    await expect(h.speak({ text: "a".repeat(4001) })).rejects.toThrow("operation");
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("stops polling when canceled", async () => {
    const controller = new AbortController();
    const h = setup([Response.json({ name, done: false })]);
    await expect(
      h.speak({
        text: "a".repeat(4001),
        signal: controller.signal,
        onActivity: () => controller.abort(new Error("Paused")),
      }),
    ).rejects.toThrow("Paused");
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["not json", '{"result":{"audioContent":"!invalid!"}}', '{"result":{}}'])(
    "rejects unusable stream %s",
    async (body) => {
      await expect(setup([new Response(body)]).speak()).rejects.toThrow("Inworld");
    },
  );

  it("surfaces failed async jobs without downloading", async () => {
    const h = setup([
      Response.json({ name, done: true, error: { code: 9, message: "Voice is unavailable" } }),
    ]);
    await expect(h.speak({ text: "a".repeat(4001) })).rejects.toThrow("Voice is unavailable");
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
});
