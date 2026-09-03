import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import type { OpenAiTtsDeps } from "./openai.js";
import { openAiAudioBase, openAiTts, openAiTtsModel } from "./openai.js";

// Fixture provenance: `fixtures/openai-*.json` are constructed, not captured. No OpenAI
// key exists on this machine or in `~/.slopify/slopify.db`, so nothing here ran against
// the live API. The envelope is OpenAI's documented `{ error: { message, type, param,
// code } }`; the 400 is the shape its schema produces for `input` past the documented
// `maxLength: 4096`, and the organisation id and counts are invented.

const key = "sk-proj-0123456789abcdef0123456789abcdef0123456789abcdef";
const voiceId = "nova";

interface Seen {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function audioBytes(): Uint8Array {
  return Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 0x04, 0x05, 0x06]);
}

function replaying(response: Response, seen: Seen[] = []): OpenAiTtsDeps["fetch"] {
  return (input, init) => {
    seen.push({ url: String(input), init });
    return Promise.resolve(response);
  };
}

function headersOf(call: Seen | undefined): Record<string, string> {
  return (call?.init?.headers ?? {}) as Record<string, string>;
}

function bodyOf(call: Seen | undefined): unknown {
  return JSON.parse(String(call?.init?.body));
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done || value === undefined) {
      break;
    }
    chunks.push(value);
  }
  return Uint8Array.from(chunks.flatMap((chunk) => [...chunk]));
}

function port(fetcher: OpenAiTtsDeps["fetch"]) {
  return openAiTts({ fetch: fetcher, key: () => key });
}

function speak(fetcher: OpenAiTtsDeps["fetch"], voice = voiceId) {
  return port(fetcher).synthesize({
    voiceId: voice,
    text: "The first move is what sets everything in motion.",
    signal: new AbortController().signal,
  });
}

function failed(response: Response): Promise<unknown> {
  return speak(replaying(response)).then(
    () => new Error("the call should have failed"),
    (thrown: unknown) => thrown,
  );
}

describe("openAiTts.synthesize", () => {
  it("hands back the response body as the audio stream", async () => {
    const bytes = audioBytes();
    const spoken = await speak(replaying(new Response(bytes, { status: 200 })));

    expect(spoken.container).toBe("mp3");
    expect(await drain(spoken.audio)).toEqual(bytes);
  });

  it("posts the model, the text, the voice and the mp3 format with the key", async () => {
    const seen: Seen[] = [];
    await speak(replaying(new Response(audioBytes(), { status: 200 }), seen));

    const call = seen[0];
    expect(call?.url).toBe(`${openAiAudioBase}/audio/speech`);
    expect(call?.init?.method).toBe("POST");
    expect(headersOf(call).Authorization).toBe(`Bearer ${key}`);
    expect(bodyOf(call)).toEqual({
      model: openAiTtsModel,
      input: "The first move is what sets everything in motion.",
      voice: "nova",
      response_format: "mp3",
    });
  });

  // The request schema takes either a built-in voice name or `{ id: "voice_1234" }` for
  // one the user cloned; a custom id sent as a bare string is refused.
  it("sends a cloned voice id as the object form the schema asks for", async () => {
    const seen: Seen[] = [];
    await speak(replaying(new Response(audioBytes(), { status: 200 }), seen), "voice_abc123");

    expect(bodyOf(seen[0])).toMatchObject({ voice: { id: "voice_abc123" } });
  });

  it("reads the key again for every call so a key saved mid-run reaches the next one", async () => {
    const seen: Seen[] = [];
    let stored = "sk-proj-first0123456789abcdef0123456789";
    const speaker = openAiTts({
      fetch: replaying(new Response(audioBytes(), { status: 200 }), seen),
      key: () => stored,
    });
    const call = { voiceId, text: "Hello.", signal: new AbortController().signal };
    await speaker.synthesize(call);
    stored = "sk-proj-second0123456789abcdef0123456789";
    await speaker.synthesize(call);

    expect(seen.map((one) => headersOf(one).Authorization)).toEqual([
      "Bearer sk-proj-first0123456789abcdef0123456789",
      "Bearer sk-proj-second0123456789abcdef0123456789",
    ]);
  });

  it("fails without calling the provider when no key is stored", async () => {
    let called = 0;
    const speaker = openAiTts({
      fetch: () => {
        called += 1;
        return Promise.resolve(new Response(null, { status: 200 }));
      },
      key: () => undefined,
    });

    const error: unknown = await speaker
      .synthesize({ voiceId, text: "Hello.", signal: new AbortController().signal })
      .catch((thrown: unknown) => thrown);

    // An absent key is terminal, so it never becomes a request.
    expect(isProviderError(error) && error.fault.kind).toBe("missing_key");
    expect(String(error)).toContain("no OpenAI key is stored");
    expect(called).toBe(0);
  });

  it("names a 401 an auth failure and quotes the provider", async () => {
    const error = await failed(new Response(fixture("openai-401.json"), { status: 401 }));

    expect(isProviderError(error) && error.fault.kind).toBe("auth");
    expect(String(error)).toContain("Incorrect API key provided");
    expect(String(error)).toContain("401");
  });

  it("names a 429 a rate limit and carries the provider's Retry-After", async () => {
    const error = await failed(
      new Response(fixture("openai-429.json"), {
        status: 429,
        headers: { "Retry-After": "20" },
      }),
    );

    expect(isProviderError(error) && error.fault.kind).toBe("rate_limit");
    expect(isProviderError(error) && error.fault.retryAfterMs).toBe(20_000);
    expect(String(error)).toContain("Rate limit reached");
  });

  // The 4096-character cap is the provider's, and its 400 is what the
  // stage shows. Nothing here counts characters before sending.
  it("surfaces the 4096-character 400 verbatim instead of checking the length itself", async () => {
    const seen: Seen[] = [];
    const long = "word ".repeat(2000);
    const speaker = openAiTts({
      fetch: replaying(new Response(fixture("openai-400-length.json"), { status: 400 }), seen),
      key: () => key,
    });

    const error: unknown = await speaker
      .synthesize({ voiceId, text: long, signal: new AbortController().signal })
      .catch((thrown: unknown) => thrown);

    // The over-long text was sent, not refused locally.
    expect((bodyOf(seen[0]) as { input: string }).input).toHaveLength(long.length);
    expect(isProviderError(error) && error.fault.kind).toBe("other");
    expect(String(error)).toContain("maximum length 4096");
  });

  // A rejected voice ID names the voice.
  it("names the voice every failure was asked for", async () => {
    const error = await failed(new Response(fixture("openai-401.json"), { status: 401 }));

    expect(String(error)).toContain(`for voice ${voiceId}`);
  });

  it("quotes a body that is not the documented envelope", async () => {
    const error = await failed(new Response("<html>bad gateway</html>", { status: 502 }));

    expect(String(error)).toContain("bad gateway");
  });

  it("never lets the key reach the error a failed call throws", async () => {
    const body = JSON.stringify({ error: { message: `the key ${key} is not valid` } });
    const error = await failed(new Response(body, { status: 401 }));

    const text = `${String(error)}${error instanceof Error ? error.stack : ""}`;
    expect(text).not.toContain(key);
    expect(text).toContain("[redacted]");
  });

  it("fails when the response carries no audio at all", async () => {
    const error = await failed(new Response(null, { status: 200 }));

    expect(String(error)).toContain("no audio");
  });
});

describe("openAiTts capabilities", () => {
  it("declares what the provider can do", () => {
    const speaker = port(replaying(new Response(null, { status: 200 })));
    expect(speaker.id).toBe("openai-tts");
    expect(speaker.capabilities).toEqual({ streams: true });
  });
});
