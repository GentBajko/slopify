import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import type { FalImageDeps } from "./fal.js";
import { falBase, falImage, falModels } from "./fal.js";

// Fixture provenance: `fixtures/fal-*.json` are constructed, not captured. No fal key
// exists on this machine or in `~/.slopify/slopify.db`, so nothing here ran against the
// live API. The success and NSFW envelopes are the output schema fal documents for its
// FLUX models (`images[]`, `timings`, `seed`, `has_nsfw_concepts`, `prompt`); the 401,
// 429 and 422 are FastAPI's own `detail`, which is what fal serves. Ids, seeds and URLs
// are invented.

const key = "8f2a1c04-0000-4d3e-9abc-000000000000:5f0a9b3c1d2e4f6a8b0c2d4e6f8a0b2c";
const model = "fal-ai/flux/schnell";
const prompt = "a coil of manila rope on a weathered dock";
const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x1f, 0x2e]);

interface Seen {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

// The call and the download are two requests to two hosts, so the double answers by URL:
// anything on fal.run is the generation, anything else is the delivery link. Each answer
// is built per request, because a Response body can only be read once.
type Make = () => Response;

const delivered: Make = () => new Response(pngBytes, { status: 200 });

function replaying(
  generation: Make,
  delivery: Make = delivered,
  seen: Seen[] = [],
): FalImageDeps["fetch"] {
  return (input, init) => {
    const url = String(input);
    seen.push({ url, init });
    return Promise.resolve(url.startsWith(falBase) ? generation() : delivery());
  };
}

function answering(name: string, status = 200, headers: Record<string, string> = {}): Make {
  return () => new Response(fixture(name), { status, headers });
}

function generate(fetcher: FalImageDeps["fetch"], aspect: "16:9" | "9:16" = "16:9") {
  return falImage({ fetch: fetcher, key: () => key }).generate({
    model,
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

function failed(fetcher: FalImageDeps["fetch"]): Promise<unknown> {
  return generate(fetcher).then(
    () => new Error("the call should have failed"),
    (thrown: unknown) => thrown,
  );
}

function kindOf(thrown: unknown): string | undefined {
  return isProviderError(thrown) ? thrown.fault.kind : undefined;
}

describe("falImage.models", () => {
  it("offers the curated list, so a newer model is data rather than code", async () => {
    expect(
      await falImage({ fetch: replaying(() => new Response()), key: () => key }).models(),
    ).toEqual(falModels);
    expect(falModels.map((one) => one.id)).toContain("fal-ai/flux/schnell");
  });
});

describe("falImage.generate", () => {
  it("posts the prompt and the aspect to the model's own address with the key", async () => {
    const seen: Seen[] = [];
    await generate(replaying(answering("fal-success.json"), undefined, seen));

    const call = seen[0];
    expect(call?.url).toBe(`${falBase}/${model}`);
    expect(call?.init?.method).toBe("POST");
    expect(headersOf(call).Authorization).toBe(`Key ${key}`);
    expect(bodyOf(call)).toEqual({
      prompt,
      image_size: "landscape_16_9",
      num_images: 1,
      output_format: "png",
    });
  });

  it("asks for the portrait frame when the run is 9:16", async () => {
    const seen: Seen[] = [];
    await generate(replaying(answering("fal-success.json"), undefined, seen), "9:16");

    expect(bodyOf(seen[0])).toMatchObject({ image_size: "portrait_16_9" });
  });

  it("downloads the image it was handed a link to and reports the mime the bytes say", async () => {
    const seen: Seen[] = [];
    const image = await generate(replaying(answering("fal-success.json"), undefined, seen));

    expect(image).toEqual({ bytes: pngBytes, mime: "image/png" });
    expect(seen[1]?.url).toBe("https://v3.fal.media/files/koala/dTldnOpRSFVBvWiyfOeO1.png");
  });

  it("reads the key again for every call so a key saved mid-run reaches the next one", async () => {
    const seen: Seen[] = [];
    let stored = "first-key";
    const port = falImage({
      fetch: replaying(answering("fal-success.json"), undefined, seen),
      key: () => stored,
    });
    const call = { model, prompt, aspect: "16:9", signal: new AbortController().signal } as const;
    await port.generate(call);
    stored = "second-key";
    await port.generate(call);

    expect(headersOf(seen[0]).Authorization).toBe("Key first-key");
    expect(headersOf(seen[2]).Authorization).toBe("Key second-key");
  });

  it("fails without calling when no key is stored", async () => {
    const seen: Seen[] = [];
    const port = falImage({
      fetch: replaying(answering("fal-success.json"), undefined, seen),
      key: () => undefined,
    });
    const thrown = await port
      .generate({ model, prompt, aspect: "16:9", signal: new AbortController().signal })
      .then(
        () => new Error("the call should have failed"),
        (error: unknown) => error,
      );

    expect(kindOf(thrown)).toBe("missing_key");
    expect(seen).toHaveLength(0);
  });

  it("names a rejected key `auth` with fal's own words", async () => {
    const thrown = await failed(replaying(answering("fal-401.json", 401)));

    expect(kindOf(thrown)).toBe("auth");
    expect(String(thrown)).toBe("Error: fal answered 401: Unauthorized");
  });

  it("takes the wait from a 429's Retry-After instead of the fixed backoff", async () => {
    const thrown = await failed(replaying(answering("fal-429.json", 429, { "Retry-After": "17" })));

    expect(kindOf(thrown)).toBe("rate_limit");
    expect(isProviderError(thrown) && thrown.fault.retryAfterMs).toBe(17_000);
    expect(String(thrown)).toContain("Rate limit exceeded");
  });

  it("joins a validation body's own messages rather than dumping the envelope", async () => {
    const thrown = await failed(replaying(answering("fal-422.json", 422)));

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("value is not a valid enumeration member");
  });

  // §Q74: the safety checker's verdict is fal's final answer, so the wrapper must not
  // spend three more images finding that out.
  it("calls a flagged answer a refusal, which the wrapper never retries", async () => {
    const seen: Seen[] = [];
    const thrown = await failed(replaying(answering("fal-nsfw.json"), undefined, seen));

    expect(kindOf(thrown)).toBe("refusal");
    expect(String(thrown)).toContain("fal's safety checker rejected every image");
    // The blank image fal made is never fetched, let alone stored.
    expect(seen).toHaveLength(1);
  });

  it("fails the attempt when the delivery link answers with something that is not an image", async () => {
    const thrown = await failed(
      replaying(
        answering("fal-success.json"),
        () =>
          new Response("<!doctype html><html>gateway timeout</html>", {
            status: 200,
            headers: { "Content-Type": "image/png" },
          }),
      ),
    );

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("rather than a PNG or a JPEG");
  });

  it("fails the attempt when the delivery link has expired", async () => {
    const thrown = await failed(
      replaying(answering("fal-success.json"), () => new Response("gone", { status: 404 })),
    );

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("fal answered 404 for the image it said it had made");
  });

  it("says so when the answer is not the shape this app reads", async () => {
    const thrown = await failed(replaying(() => new Response("<html>502</html>", { status: 200 })));

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("not in the shape this app can read");
  });
});
