import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import type { ElevenLabsDeps } from "./elevenlabs.js";
import { elevenLabsBase, elevenLabsFormat, elevenLabsModel, elevenLabsTts } from "./elevenlabs.js";

// Fixture provenance: `fixtures/elevenlabs-*.json` are constructed, not captured. No ElevenLabs
// key exists on this machine or in `~/.slopify/slopify.db`, so nothing here ran against the
// live API. The envelopes are transcribed from ElevenLabs' own error reference - the `detail`
// object carrying `status` and `message`, and the `max_character_limit_exceeded` sentence
// quoted on its 400/401 help-centre page. The voice id is the one its own quickstart uses; the
// audio bytes are invented.

const key = "sk_0123456789abcdef0123456789abcdef0123456789abcdef";
const voiceId = "JBFqnCBsd6RMkjVDRZzb";

interface Seen {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

// An mp3 frame header and a little payload: nothing decodes it, and a test can compare
// the bytes the adapter handed on with the ones the response carried.
function audioBytes(): Uint8Array {
  return Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x01, 0x02, 0x03]);
}

function replaying(response: Response, seen: Seen[] = []): ElevenLabsDeps["fetch"] {
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

function port(fetcher: ElevenLabsDeps["fetch"]) {
  return elevenLabsTts({ fetch: fetcher, key: () => key });
}

function speak(fetcher: ElevenLabsDeps["fetch"]) {
  return port(fetcher).synthesize({
    voiceId,
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

describe("elevenLabsTts.synthesize", () => {
  it("hands back the response body as the audio stream", async () => {
    const bytes = audioBytes();
    const spoken = await speak(replaying(new Response(bytes, { status: 200 })));

    expect(spoken.container).toBe("mp3");
    expect(await drain(spoken.audio)).toEqual(bytes);
  });

  it("posts to the streaming endpoint with the key, the model and the mp3 format", async () => {
    const seen: Seen[] = [];
    await speak(replaying(new Response(audioBytes(), { status: 200 }), seen));

    const call = seen[0];
    expect(call?.url).toBe(
      `${elevenLabsBase}/text-to-speech/${voiceId}/stream?output_format=${elevenLabsFormat}`,
    );
    expect(call?.init?.method).toBe("POST");
    expect(headersOf(call)["xi-api-key"]).toBe(key);
    expect(bodyOf(call)).toEqual({
      text: "The first move is what sets everything in motion.",
      model_id: elevenLabsModel,
    });
  });

  it("escapes a voice id into the path rather than pasting it in", async () => {
    const seen: Seen[] = [];
    await port(replaying(new Response(audioBytes(), { status: 200 }), seen)).synthesize({
      voiceId: "a b/../c",
      text: "Hello.",
      signal: new AbortController().signal,
    });

    expect(seen[0]?.url).toContain("/text-to-speech/a%20b%2F..%2Fc/stream");
  });

  it("reads the key again for every call so a key saved mid-run reaches the next one", async () => {
    const seen: Seen[] = [];
    let stored = "sk_first0123456789abcdef0123456789abcdef";
    const speaker = elevenLabsTts({
      fetch: replaying(new Response(audioBytes(), { status: 200 }), seen),
      key: () => stored,
    });
    const call = { voiceId, text: "Hello.", signal: new AbortController().signal };
    await speaker.synthesize(call);
    stored = "sk_second0123456789abcdef0123456789abcdef";
    await speaker.synthesize(call);

    expect(seen.map((one) => headersOf(one)["xi-api-key"])).toEqual([
      "sk_first0123456789abcdef0123456789abcdef",
      "sk_second0123456789abcdef0123456789abcdef",
    ]);
  });

  it("fails without calling the provider when no key is stored", async () => {
    let called = 0;
    const speaker = elevenLabsTts({
      fetch: () => {
        called += 1;
        return Promise.resolve(new Response(null, { status: 200 }));
      },
      key: () => undefined,
    });
    const error: unknown = await speaker
      .synthesize({ voiceId, text: "Hello.", signal: new AbortController().signal })
      .catch((thrown: unknown) => thrown);

    // An absent key is terminal, so it carries the kind the wrapper does
    // not retry rather than the `auth` kind a rejected key carries.
    expect(isProviderError(error) && error.fault.kind).toBe("missing_key");
    expect(String(error)).toContain("no ElevenLabs key is stored");
    expect(called).toBe(0);
  });

  it("names a 401 an auth failure and quotes the provider", async () => {
    const error = await failed(new Response(fixture("elevenlabs-401.json"), { status: 401 }));

    expect(isProviderError(error) && error.fault.kind).toBe("auth");
    expect(String(error)).toContain("invalid_api_key: Invalid API key");
    expect(String(error)).toContain("401");
  });

  it("names a 429 a rate limit and carries the provider's Retry-After", async () => {
    const error = await failed(
      new Response(fixture("elevenlabs-429.json"), {
        status: 429,
        headers: { "Retry-After": "17" },
      }),
    );

    expect(isProviderError(error) && error.fault.kind).toBe("rate_limit");
    expect(isProviderError(error) && error.fault.retryAfterMs).toBe(17_000);
    expect(String(error)).toContain("too many concurrent requests");
  });

  // Whole text longer than the provider's per-request limit → the provider's error surfaces as
  // the stage failure; no pre-check.
  it("surfaces the character-limit 400 verbatim instead of checking the length itself", async () => {
    const error = await failed(new Response(fixture("elevenlabs-400-limit.json"), { status: 400 }));

    expect(isProviderError(error) && error.fault.kind).toBe("other");
    expect(String(error)).toContain("max_character_limit_exceeded");
    expect(String(error)).toContain("exceeds the character limit of 333 characters");
  });

  // A rejected voice ID names the voice, distinct from an auth failure.
  it("names the voice a rejected voice id was asked for", async () => {
    const error = await failed(new Response(fixture("elevenlabs-400-voice.json"), { status: 400 }));

    expect(String(error)).toContain(`for voice ${voiceId}`);
    expect(String(error)).toContain("voice_not_found");
  });

  it("quotes a body that is not the documented envelope", async () => {
    const error = await failed(new Response("<html>upstream is down</html>", { status: 502 }));

    expect(String(error)).toContain("upstream is down");
  });

  it("never lets the key reach the error a failed call throws", async () => {
    // A provider is free to quote the key back; the wrapper redacts, and so does this.
    const body = JSON.stringify({ detail: { message: `the key ${key} is not valid` } });
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

describe("elevenLabsTts capabilities", () => {
  it("declares what the provider can do", () => {
    const speaker = port(replaying(new Response(null, { status: 200 })));
    expect(speaker.id).toBe("elevenlabs");
    expect(speaker.capabilities).toEqual({ streams: true });
  });
});
