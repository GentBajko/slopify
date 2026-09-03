import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixedClock, manualClock } from "../../kernel/clock.fake.js";
import { isProviderError } from "../../kernel/ports/model.js";
import type { ReplicateImageDeps } from "./replicate.js";
import {
  replicateBase,
  replicateImage,
  replicateModels,
  replicatePollMs,
  replicateWaitSeconds,
} from "./replicate.js";

// Fixture provenance: `fixtures/replicate-*.json` are constructed, not captured. No
// Replicate token exists on this machine or in `~/.slopify/slopify.db`, so nothing here
// ran against the live API. The prediction envelope is the one Replicate documents for
// `POST /v1/models/{owner}/{name}/predictions` (`id`, `status`, `output`, `error`,
// `urls.get`); the 401 and 429 are its RFC 9457 problem bodies. Ids and URLs are invented.

const key = "r8_00000000000000000000000000000000000000";
const model = "black-forest-labs/flux-schnell";
const prompt = "a coil of manila rope on a weathered dock";
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const clock = fixedClock("2026-09-02T10:00:00.000Z");
const predictions = `${replicateBase}/models/${model}/predictions`;

interface Seen {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

type Make = () => Response;

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function answering(name: string, status = 201, headers: Record<string, string> = {}): Make {
  return () => new Response(fixture(name), { status, headers });
}

const delivered: Make = () => new Response(jpegBytes, { status: 200 });

// The double answers by host: api.replicate.com is the prediction, anything else is the
// delivery link. The API answers are a queue, so a poll can be scripted after a wait.
function replaying(api: readonly Make[], delivery: Make = delivered, seen: Seen[] = []) {
  const queue = [...api];
  const fetcher: ReplicateImageDeps["fetch"] = (input, init) => {
    const url = String(input);
    seen.push({ url, init });
    if (!url.startsWith(replicateBase)) {
      return Promise.resolve(delivery());
    }
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`the double was asked for an answer it does not have: ${url}`);
    }
    return Promise.resolve(next());
  };
  return fetcher;
}

function port(fetcher: ReplicateImageDeps["fetch"], deps: Partial<ReplicateImageDeps> = {}) {
  return replicateImage({ fetch: fetcher, key: () => key, clock, ...deps });
}

function generate(fetcher: ReplicateImageDeps["fetch"], aspect: "16:9" | "9:16" = "16:9") {
  return port(fetcher).generate({
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

function failed(fetcher: ReplicateImageDeps["fetch"]): Promise<unknown> {
  return generate(fetcher).then(
    () => new Error("the call should have failed"),
    (thrown: unknown) => thrown,
  );
}

function kindOf(thrown: unknown): string | undefined {
  return isProviderError(thrown) ? thrown.fault.kind : undefined;
}

describe("replicateImage.models", () => {
  it("offers the curated list, so a newer model is data rather than code", async () => {
    expect(await port(replaying([])).models()).toEqual(replicateModels);
    expect(replicateModels.map((one) => one.id)).toContain("black-forest-labs/flux-schnell");
  });
});

describe("replicateImage.generate", () => {
  it("posts to the model's own endpoint with the token and the wait header", async () => {
    const seen: Seen[] = [];
    await generate(replaying([answering("replicate-succeeded.json")], undefined, seen));

    const call = seen[0];
    expect(call?.url).toBe(predictions);
    expect(call?.init?.method).toBe("POST");
    expect(headersOf(call).Authorization).toBe(`Bearer ${key}`);
    expect(headersOf(call).Prefer).toBe(`wait=${String(replicateWaitSeconds)}`);
    expect(bodyOf(call)).toEqual({
      input: { prompt, aspect_ratio: "16:9", output_format: "png" },
    });
  });

  it("sends the run's own aspect, which Replicate takes directly", async () => {
    const seen: Seen[] = [];
    await generate(replaying([answering("replicate-succeeded.json")], undefined, seen), "9:16");

    expect(bodyOf(seen[0])).toMatchObject({ input: { aspect_ratio: "9:16" } });
  });

  it("downloads the output link and reports the mime the bytes say", async () => {
    const seen: Seen[] = [];
    const image = await generate(
      replaying([answering("replicate-succeeded.json")], undefined, seen),
    );

    expect(image).toEqual({ bytes: jpegBytes, mime: "image/jpeg" });
    expect(seen[1]?.url).toBe("https://replicate.delivery/xezq/2Ktr9fWq/out-0.png");
  });

  it("reads a bare-string output as well as an array of them", async () => {
    const single = (): Response =>
      new Response(
        JSON.stringify({ status: "succeeded", output: "https://replicate.delivery/one.png" }),
        { status: 201 },
      );

    expect(await generate(replaying([single]))).toMatchObject({ mime: "image/jpeg" });
  });

  // `Prefer: wait` gives up after 60 s and answers `starting`, so a slower model has to be
  // polled at `urls.get` until it settles. The wait is spent on the injected clock.
  it("polls the prediction when the wait header ran out before the model did", async () => {
    const seen: Seen[] = [];
    const waiting = manualClock();
    const image = await waiting.settle(
      port(
        replaying(
          [answering("replicate-starting.json"), answering("replicate-succeeded.json", 200)],
          undefined,
          seen,
        ),
        { clock: waiting },
      ).generate({ model, prompt, aspect: "16:9", signal: new AbortController().signal }),
    );

    expect(image).toMatchObject({ mime: "image/jpeg" });
    expect(waiting.waits).toEqual([replicatePollMs]);
    expect(seen[1]?.url).toBe(
      "https://api.replicate.com/v1/predictions/s7x2m4kqf9rj20ct1abcd0efgh",
    );
    expect(headersOf(seen[1]).Authorization).toBe(`Bearer ${key}`);
  });

  it("fails without calling when no key is stored", async () => {
    const seen: Seen[] = [];
    const thrown = await port(replaying([], undefined, seen), { key: () => undefined })
      .generate({ model, prompt, aspect: "16:9", signal: new AbortController().signal })
      .then(
        () => new Error("the call should have failed"),
        (error: unknown) => error,
      );

    expect(kindOf(thrown)).toBe("missing_key");
    expect(seen).toHaveLength(0);
  });

  it("names a rejected token `auth` with Replicate's own words", async () => {
    const thrown = await failed(replaying([answering("replicate-401.json", 401)]));

    expect(kindOf(thrown)).toBe("auth");
    expect(String(thrown)).toBe(
      "Error: Replicate answered 401: You did not pass a valid authentication token",
    );
  });

  it("takes the wait from a 429's Retry-After instead of the fixed backoff", async () => {
    const thrown = await failed(
      replaying([answering("replicate-429.json", 429, { "Retry-After": "30" })]),
    );

    expect(kindOf(thrown)).toBe("rate_limit");
    expect(isProviderError(thrown) && thrown.fault.retryAfterMs).toBe(30_000);
    expect(String(thrown)).toContain("Request was throttled");
  });

  // §Q74: the refusal arrives as a settled prediction, with the same 201 a success has.
  it("calls a content refusal a refusal, in Replicate's own words", async () => {
    const seen: Seen[] = [];
    const thrown = await failed(replaying([answering("replicate-nsfw.json")], undefined, seen));

    expect(kindOf(thrown)).toBe("refusal");
    expect(String(thrown)).toBe(
      "Error: Replicate answered: NSFW content detected. Try running it again, or try a different prompt.",
    );
    // Nothing is downloaded, and the wrapper spends no further attempt on it.
    expect(seen).toHaveLength(1);
  });

  it("retries a prediction that failed for a reason that is not a refusal", async () => {
    const thrown = await failed(replaying([answering("replicate-failed.json")]));

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("CUDA out of memory on the worker");
  });

  it("fails the attempt when the delivery link answers with something that is not an image", async () => {
    const thrown = await failed(
      replaying(
        [answering("replicate-succeeded.json")],
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
      replaying(
        [answering("replicate-succeeded.json")],
        () => new Response("gone", { status: 404 }),
      ),
    );

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("Replicate answered 404 for the image it said it had made");
  });

  it("says so when a prediction is unfinished and names no address to read it from", async () => {
    const stuck = (): Response =>
      new Response(JSON.stringify({ status: "processing", output: null }), { status: 201 });
    const thrown = await failed(replaying([stuck]));

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("named no address to read it from");
  });

  it("says so when a succeeded prediction carries no output at all", async () => {
    const empty = (): Response =>
      new Response(JSON.stringify({ status: "succeeded", output: [] }), { status: 201 });
    const thrown = await failed(replaying([empty]));

    expect(kindOf(thrown)).toBe("other");
    expect(String(thrown)).toContain("Replicate succeeded with no image");
  });
});
