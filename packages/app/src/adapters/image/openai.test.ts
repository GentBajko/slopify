import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import type { OpenAiImageDeps } from "./openai.js";
import { openAiImage, openAiImageModels, openAiImagesBase, sizeFor } from "./openai.js";

// Fixture provenance: `fixtures/openai-image-*.json` are constructed, not captured. No
// OpenAI key exists on this machine or in `~/.slopify/slopify.db`, so nothing here ran
// against the live API. The success envelope is the documented `{ created, data[],
// usage }` with a real 1×1 PNG in `b64_json`; the errors are OpenAI's `{ error: {
// message, type, param, code } }`, with `moderation_blocked` as the safety rejection it
// documents. The organisation details and counts are invented.

const key = "sk-proj-0123456789abcdef0123456789abcdef0123456789abcdef";
const model = "gpt-image-1";
const prompt = "a coil of manila rope on a weathered dock";
// The first ten bytes of the 1×1 PNG the success fixture carries.
const pngHead = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00];

interface Seen {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function replaying(make: () => Response, seen: Seen[] = []): OpenAiImageDeps["fetch"] {
  return (input, init) => {
    seen.push({ url: String(input), init });
    return Promise.resolve(make());
  };
}

function answering(name: string, status = 200, headers: Record<string, string> = {}) {
  return () => new Response(fixture(name), { status, headers });
}

function generate(
  fetcher: OpenAiImageDeps["fetch"],
  aspect: "16:9" | "9:16" = "16:9",
  named = model,
) {
  return openAiImage({ fetch: fetcher, key: () => key }).generate({
    model: named,
    prompt,
    aspect,
    signal: new AbortController().signal,
  });
}

function headersOf(call: Seen | undefined): Record<string, string> {
  return (call?.init?.headers ?? {}) as Record<string, string>;
}

function bodyOf(call: Seen | undefined): unknown {
  return JSON.parse(String(call?.init?.body));
}

function failed(fetcher: OpenAiImageDeps["fetch"]): Promise<unknown> {
  return generate(fetcher).then(
    () => new Error("the call should have failed"),
    (thrown: unknown) => thrown,
  );
}

function kindOf(thrown: unknown): string | undefined {
  return isProviderError(thrown) ? thrown.fault.kind : undefined;
}

describe("openAiImage.models", () => {
  it("offers the curated list, so a newer model is data rather than code", async () => {
    expect(
      await openAiImage({ fetch: replaying(() => new Response()), key: () => key }).models(),
    ).toEqual(openAiImageModels);
    expect(openAiImageModels.map((one) => one.id)).toEqual([
      "gpt-image-2",
      "gpt-image-1.5",
      "gpt-image-1",
      "gpt-image-1-mini",
    ]);
  });
});

// The adapter asks for the provider's closest supported size to the run's aspect. The
// standard GPT image frames are 3:2, so 16:9 is asked for as 1536×1024 and the render crops
// the rest; gpt-image-2 takes an arbitrary frame, where the closest is the exact one.
describe("sizeFor", () => {
  it("asks the standard models for the nearest standard frame", () => {
    expect(sizeFor("gpt-image-1", "16:9")).toBe("1536x1024");
    expect(sizeFor("gpt-image-1", "9:16")).toBe("1024x1536");
    expect(sizeFor("gpt-image-1-mini", "16:9")).toBe("1536x1024");
    expect(sizeFor("gpt-image-1.5", "9:16")).toBe("1024x1536");
  });

  it("asks gpt-image-2 for the aspect exactly, both sides divisible by 16", () => {
    expect(sizeFor("gpt-image-2", "16:9")).toBe("1536x864");
    expect(sizeFor("gpt-image-2-2026-04-21", "9:16")).toBe("864x1536");
    expect(1536 % 16).toBe(0);
    expect(864 % 16).toBe(0);
    expect(1536 / 864).toBeCloseTo(16 / 9, 10);
  });
});

describe("openAiImage.generate", () => {
  it("posts the model, the prompt, one image and the size with the key", async () => {
    const seen: Seen[] = [];
    await generate(replaying(answering("openai-image-success.json"), seen));

    const call = seen[0];
    expect(call?.url).toBe(`${openAiImagesBase}/images/generations`);
    expect(call?.init?.method).toBe("POST");
    expect(headersOf(call).Authorization).toBe(`Bearer ${key}`);
    // The provider's own quality and style are what the stage asks for, so neither
    // `quality` nor `background` is sent: leaving them off is what default means.
    expect(bodyOf(call)).toEqual({ model, prompt, n: 1, size: "1536x1024" });
  });

  it("asks for the portrait frame when the run is 9:16", async () => {
    const seen: Seen[] = [];
    await generate(replaying(answering("openai-image-success.json"), seen), "9:16");

    expect(bodyOf(seen[0])).toMatchObject({ size: "1024x1536" });
  });

  // A GPT image model always answers with base64 and never with a URL, so there is no
  // second request: the bytes arrive with the call.
  it("decodes the base64 it answers with, without following any link", async () => {
    const seen: Seen[] = [];
    const image = await generate(replaying(answering("openai-image-success.json"), seen));

    expect(seen).toHaveLength(1);
    expect(image.mime).toBe("image/png");
    expect([...image.bytes.slice(0, 10)]).toEqual(pngHead);
  });

  it("reads the key again for every call so a key saved mid-run reaches the next one", async () => {
    const seen: Seen[] = [];
    let stored = "sk-proj-first";
    const port = openAiImage({
      fetch: replaying(answering("openai-image-success.json"), seen),
      key: () => stored,
    });
    const call = { model, prompt, aspect: "16:9", signal: new AbortController().signal } as const;
    await port.generate(call);
    stored = "sk-proj-second";
    await port.generate(call);

    expect(headersOf(seen[0]).Authorization).toBe("Bearer sk-proj-first");
    expect(headersOf(seen[1]).Authorization).toBe("Bearer sk-proj-second");
  });

  it("fails without calling when no key is stored", async () => {
    const seen: Seen[] = [];
    const thrown = await openAiImage({
      fetch: replaying(answering("openai-image-success.json"), seen),
      key: () => undefined,
    })
      .generate({ model, prompt, aspect: "16:9", signal: new AbortController().signal })
      .then(
        () => new Error("the call should have failed"),
        (error: unknown) => error,
      );

    expect(kindOf(thrown)).toBe("missing_key");
    expect(seen).toHaveLength(0);
  });

  it("names a rejected key `auth` with OpenAI's own words", async () => {
    const thrown = await failed(replaying(answering("openai-image-401.json", 401)));

    expect(kindOf(thrown)).toBe("auth");
    expect(String(thrown)).toContain("OpenAI answered 401: Incorrect API key provided");
  });

  it("takes the wait from a 429's Retry-After instead of the fixed backoff", async () => {
    const thrown = await failed(
      replaying(answering("openai-image-429.json", 429, { "Retry-After": "12" })),
    );

    expect(kindOf(thrown)).toBe("rate_limit");
    expect(isProviderError(thrown) && thrown.fault.retryAfterMs).toBe(12_000);
    expect(String(thrown)).toContain("Rate limit reached for images per min");
  });

  // `moderation_blocked` shares its 400 with a malformed request, so the code and
  // not the status is what makes it terminal.
  it("calls a moderation rejection a refusal, in OpenAI's own words", async () => {
    const thrown = await failed(replaying(answering("openai-image-moderation.json", 400)));

    expect(kindOf(thrown)).toBe("refusal");
    expect(String(thrown)).toBe(
      "Error: OpenAI answered 400: Your request was rejected as a result of our safety system. Your request may contain content that is not allowed by our safety system.",
    );
  });

  it("retries a 400 that is not a refusal", async () => {
    const malformed = (): Response =>
      new Response(
        JSON.stringify({
          error: { message: "Invalid value for 'size'", type: "invalid_request_error", code: null },
        }),
        { status: 400 },
      );
    const thrown = await failed(replaying(malformed));

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("Invalid value for 'size'");
  });

  it("fails the attempt when the base64 decodes to something that is not an image", async () => {
    const thrown = await failed(replaying(answering("openai-image-truncated.json")));

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("rather than a PNG or a JPEG");
  });

  it("says so when the answer carries no image", async () => {
    const empty = (): Response => new Response(JSON.stringify({ data: [] }), { status: 200 });
    const thrown = await failed(replaying(empty));

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("OpenAI answered with no image");
  });

  it("says so when the answer is not the shape this app reads", async () => {
    const thrown = await failed(replaying(() => new Response("<html>502</html>", { status: 200 })));

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("not in the shape this app can read");
  });
});
