import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import type { CartesiaDeps } from "./cartesia.js";
import { cartesiaBase, cartesiaModel, cartesiaTts, cartesiaVersion } from "./cartesia.js";

// Fixture provenance: `fixtures/cartesia-*.json` are constructed, not captured. No
// Cartesia key exists on this machine or in `~/.slopify/slopify.db`, so nothing here ran
// against the live API. The envelope is the structured error Cartesia documents for API
// version 2026-03-01 and newer - `{ error_code, title, message, request_id }` - and the
// codes are taken from its own error-code table; the request ids are invented.

const key = "sk_car_0123456789abcdef0123456789abcdef";
const voiceId = "bf0a246a-8642-498a-9950-80c35e9276b5";

interface Seen {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function audioBytes(): Uint8Array {
  return Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 0x07, 0x08]);
}

function replaying(response: Response, seen: Seen[] = []): CartesiaDeps["fetch"] {
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

function port(fetcher: CartesiaDeps["fetch"]) {
  return cartesiaTts({ fetch: fetcher, key: () => key });
}

function speak(fetcher: CartesiaDeps["fetch"]) {
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

describe("cartesiaTts.synthesize", () => {
  it("hands back the response body as the audio stream", async () => {
    const bytes = audioBytes();
    const spoken = await speak(replaying(new Response(bytes, { status: 200 })));

    expect(spoken.container).toBe("mp3");
    expect(await drain(spoken.audio)).toEqual(bytes);
  });

  it("posts the transcript, the voice and the mp3 output format with both headers", async () => {
    const seen: Seen[] = [];
    await speak(replaying(new Response(audioBytes(), { status: 200 }), seen));

    const call = seen[0];
    expect(call?.url).toBe(`${cartesiaBase}/tts/bytes`);
    expect(call?.init?.method).toBe("POST");
    expect(headersOf(call)["X-API-Key"]).toBe(key);
    // The version header is required; a request without one is refused.
    expect(headersOf(call)["Cartesia-Version"]).toBe(cartesiaVersion);
    expect(bodyOf(call)).toEqual({
      model_id: cartesiaModel,
      transcript: "The first move is what sets everything in motion.",
      voice: { mode: "id", id: voiceId },
      output_format: { container: "mp3", bit_rate: 128_000, sample_rate: 44_100 },
    });
  });

  it("reads the key again for every call so a key saved mid-run reaches the next one", async () => {
    const seen: Seen[] = [];
    let stored = "sk_car_first0123456789abcdef0123456";
    const speaker = cartesiaTts({
      fetch: replaying(new Response(audioBytes(), { status: 200 }), seen),
      key: () => stored,
    });
    const call = { voiceId, text: "Hello.", signal: new AbortController().signal };
    await speaker.synthesize(call);
    stored = "sk_car_second0123456789abcdef012345";
    await speaker.synthesize(call);

    expect(seen.map((one) => headersOf(one)["X-API-Key"])).toEqual([
      "sk_car_first0123456789abcdef0123456",
      "sk_car_second0123456789abcdef012345",
    ]);
  });

  it("fails without calling the provider when no key is stored", async () => {
    let called = 0;
    const speaker = cartesiaTts({
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
    expect(String(error)).toContain("no Cartesia key is stored");
    expect(called).toBe(0);
  });

  it("names a 401 an auth failure and quotes the provider", async () => {
    const error = await failed(new Response(fixture("cartesia-401.json"), { status: 401 }));

    expect(isProviderError(error) && error.fault.kind).toBe("auth");
    expect(String(error)).toContain("invalid_api_key: The API key provided is not valid.");
    expect(String(error)).toContain("401");
  });

  it("names a 429 a rate limit and carries the provider's Retry-After", async () => {
    const error = await failed(
      new Response(fixture("cartesia-429.json"), {
        status: 429,
        headers: { "Retry-After": "9" },
      }),
    );

    expect(isProviderError(error) && error.fault.kind).toBe("rate_limit");
    expect(isProviderError(error) && error.fault.retryAfterMs).toBe(9000);
    expect(String(error)).toContain("concurrency_limited");
  });

  // A rejected voice ID names the voice. Cartesia's own message does not
  // repeat the id, so the adapter puts it back.
  it("names the voice a rejected voice id was asked for", async () => {
    const error = await failed(new Response(fixture("cartesia-404-voice.json"), { status: 404 }));

    expect(String(error)).toContain(`for voice ${voiceId}`);
    expect(String(error)).toContain("voice_not_found");
  });

  it("quotes a body that is not the documented envelope", async () => {
    const error = await failed(new Response("upstream is down", { status: 502 }));

    expect(String(error)).toContain("upstream is down");
  });

  it("never lets the key reach the error a failed call throws", async () => {
    const body = JSON.stringify({ error_code: "invalid_api_key", message: `${key} is not valid` });
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

describe("cartesiaTts capabilities", () => {
  it("declares what the provider can do", () => {
    const speaker = port(replaying(new Response(null, { status: 200 })));
    expect(speaker.id).toBe("cartesia");
    expect(speaker.capabilities).toEqual({ streams: true });
  });
});
