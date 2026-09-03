import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import type { GoogleImageDeps } from "./google.js";
import { googleImage, googleImageModels, googleImagesBase } from "./google.js";

// Fixture provenance: `fixtures/google-*.json` are constructed, not captured. No Gemini key
// exists on this machine or in `~/.slopify/slopify.db`, so nothing here ran against the live
// API. The success envelope is the Interactions response the API documents - a `model_output`
// step whose `content` carries a `text` part beside an `image` part with base64 `data` and a
// `mime_type` - and the failures are Google's own `{error:{code,message,status}}`. The base64
// in google-success.json is a real PNG magic number followed by filler, so the sniffer sees a
// PNG; google-truncated.json decodes to ASCII, which it must refuse.

const key = "AIzaSyD0000000000000000000000000000000";
const model = "gemini-3.1-flash-image";
const prompt = "a coil of manila rope on a weathered dock";

interface Seen {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function answering(name: string, status = 200): GoogleImageDeps["fetch"] {
  return () => Promise.resolve(new Response(fixture(name), { status }));
}

function watching(name: string, seen: Seen[], status = 200): GoogleImageDeps["fetch"] {
  return (input, init) => {
    seen.push({ url: String(input), init });
    return Promise.resolve(new Response(fixture(name), { status }));
  };
}

// `stored` takes null rather than undefined for the no-key case: passing undefined to a
// defaulted parameter re-triggers the default, which would quietly test the opposite.
function generate(
  fetcher: GoogleImageDeps["fetch"],
  aspect: "16:9" | "9:16" = "16:9",
  stored: string | null = key,
) {
  return googleImage({ fetch: fetcher, key: () => stored ?? undefined }).generate({
    model,
    prompt,
    aspect,
    signal: new AbortController().signal,
  });
}

function bodyOf(call: Seen | undefined): unknown {
  return JSON.parse(String(call?.init?.body ?? "{}"));
}

function headersOf(call: Seen | undefined): Record<string, string> {
  return (call?.init?.headers ?? {}) as Record<string, string>;
}

describe("googleImage.models", () => {
  it("offers the documented image model", async () => {
    const offered = await googleImage({
      fetch: answering("google-success.json"),
      key: () => key,
    }).models();

    expect(offered).toEqual(googleImageModels);
    expect(offered.map((one) => one.id)).toContain("gemini-3.1-flash-image");
  });
});

describe("googleImage.generate", () => {
  it("posts the prompt to the interactions endpoint with the key in Google's own header", async () => {
    const seen: Seen[] = [];
    await generate(watching("google-success.json", seen));

    expect(seen[0]?.url).toBe(`${googleImagesBase}/interactions`);
    expect(seen[0]?.init?.method).toBe("POST");
    // A query parameter would put the key in every proxy log between here and Google.
    expect(headersOf(seen[0])["x-goog-api-key"]).toBe(key);
    expect(seen[0]?.url).not.toContain(key);
    expect(bodyOf(seen[0])).toEqual({
      model,
      input: prompt,
      response_format: { type: "image", aspect_ratio: "16:9", image_size: "2K" },
    });
  });

  // Google takes the aspect in the run's own words, so the closest supported size is exact.
  it("asks for the portrait frame when the run is 9:16", async () => {
    const seen: Seen[] = [];
    await generate(watching("google-success.json", seen), "9:16");

    expect(bodyOf(seen[0])).toMatchObject({
      response_format: { aspect_ratio: "9:16", image_size: "2K" },
    });
  });

  it("decodes the image and reports the mime the bytes say", async () => {
    const image = await generate(answering("google-success.json"));

    expect(image.mime).toBe("image/png");
    expect(image.bytes.slice(0, 4)).toEqual(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
  });

  // The image is one content part beside the model's prose, so it is found by type rather
  // than read off a fixed index.
  it("finds the image beside the text the model wrote", async () => {
    await expect(generate(answering("google-success.json"))).resolves.toBeDefined();
  });

  it("refuses an answer that carries prose and no picture", async () => {
    await expect(generate(answering("google-no-image.json"))).rejects.toThrow(/no image/i);
  });

  // A truncated payload that decodes to something else must not reach the disk, whatever
  // the provider called it.
  it("refuses bytes that are not a PNG or a JPEG however they are labelled", async () => {
    await expect(generate(answering("google-truncated.json"))).rejects.toThrow(
      /decoded to .* rather than a PNG or a JPEG/,
    );
  });
});

describe("googleImage failures", () => {
  it("names a rejected key auth so the wrapper retries it", async () => {
    const error = await generate(answering("google-401.json", 401)).catch((e: unknown) => e);

    expect(isProviderError(error) && error.fault.kind).toBe("auth");
    expect(String(error)).toContain("API key not valid");
  });

  it("names a quota answer rate_limit", async () => {
    const error = await generate(answering("google-429.json", 429)).catch((e: unknown) => e);

    expect(isProviderError(error) && error.fault.kind).toBe("rate_limit");
  });

  // A safety block arrives as a plain 400 with no machine-readable reason, so it is read
  // off the sentence. Retrying it would spend the user's quota on the same answer.
  it("names a safety block a refusal so it is never retried", async () => {
    const error = await generate(answering("google-blocked.json", 400)).catch((e: unknown) => e);

    expect(isProviderError(error) && error.fault.kind).toBe("refusal");
  });

  // An absent key is terminal, so it never becomes a request.
  it("fails without calling when no key is stored", async () => {
    const seen: Seen[] = [];
    const error = await generate(watching("google-success.json", seen), "16:9", null).catch(
      (e: unknown) => e,
    );

    expect(isProviderError(error) && error.fault.kind).toBe("missing_key");
    expect(seen).toHaveLength(0);
  });

  it("refuses an answer that is not in the shape this app can read", async () => {
    const shapeless: GoogleImageDeps["fetch"] = () =>
      Promise.resolve(new Response("<html>502</html>", { status: 200 }));

    await expect(generate(shapeless)).rejects.toThrow(/not in the shape/);
  });
});
