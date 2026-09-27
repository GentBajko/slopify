import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { isProviderError } from "../../kernel/ports/model.js";
import { falImage, falQueueBase } from "./fal.js";
import { replicateBase, replicateImage } from "./replicate.js";
import { sniffVideo } from "./video.js";

// Image-to-video on the two providers that host it, against doubles: nothing here reaches
// the network, and no clip is paid for. The request shapes are the ones fal's and
// Replicate's model pages document (checked 2026-09-26); the answers are constructed.

const key = "test-key-0000";
const clock = fixedClock("2026-09-26T10:00:00.000Z");
const still = {
  bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
  mime: "image/jpeg" as const,
};
// The smallest thing that reads as an MP4: a box whose type at byte 4 is `ftyp`.
const clip = Uint8Array.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0]);

interface Seen {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function headersOf(call: Seen | undefined): Record<string, string | undefined> {
  return (call?.init?.headers ?? {}) as Record<string, string | undefined>;
}

function answers(table: readonly ((url: string) => Response | undefined)[], seen: Seen[]) {
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    seen.push({ url, init });
    for (const answer of table) {
      const response = answer(url);
      if (response !== undefined) return Promise.resolve(response);
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  };
}

const request = (model: string) => ({
  model,
  prompt: "Slow push-in.",
  image: still,
  aspect: "16:9" as const,
  seconds: 5,
  signal: new AbortController().signal,
});

describe("fal.ai image-to-video", () => {
  const model = "fal-ai/kling-video/v2.5-turbo/pro/image-to-video";
  const status = `${falQueueBase}/${model}/requests/r1/status`;
  const response = `${falQueueBase}/${model}/requests/r1`;

  it("queues the clip, polls until it completes, and downloads it", async () => {
    const seen: Seen[] = [];
    let polls = 0;
    const port = falImage({
      key: () => key,
      clock,
      fetch: answers(
        [
          (url) =>
            url === `${falQueueBase}/${model}`
              ? Response.json({ request_id: "r1", status_url: status, response_url: response })
              : undefined,
          (url) => {
            if (url !== status) return undefined;
            polls += 1;
            return Response.json({ status: polls < 3 ? "IN_PROGRESS" : "COMPLETED" });
          },
          (url) =>
            url === response
              ? Response.json({ video: { url: "https://v3.fal.media/clip.mp4" } })
              : undefined,
          (url) => (url === "https://v3.fal.media/clip.mp4" ? new Response(clip) : undefined),
        ],
        seen,
      ),
    });
    const made = await port.animate?.(request(model));
    expect(made?.mime).toBe("video/mp4");
    expect(made?.bytes).toEqual(clip);
    expect(polls).toBe(3);
    const body = JSON.parse(String(seen[0]?.init?.body));
    expect(body).toEqual({
      prompt: "Slow push-in.",
      image_url: `data:image/jpeg;base64,${Buffer.from(still.bytes).toString("base64")}`,
      duration: "5",
    });
    expect(headersOf(seen[0]).Authorization).toBe(`Key ${key}`);
    // Every queue request carries the key; the delivery link does not need it.
    expect(seen.slice(1, -1).every((one) => headersOf(one).Authorization === `Key ${key}`)).toBe(
      true,
    );
  });

  it("asks Seedance for 720p in the run's shape", async () => {
    const seen: Seen[] = [];
    const seedance = "fal-ai/bytedance/seedance/v1/pro/fast/image-to-video";
    await falImage({
      key: () => key,
      clock,
      fetch: answers([() => new Response("{}", { status: 500 })], seen),
    })
      .animate?.({ ...request(seedance), aspect: "9:16" })
      .catch(() => undefined);
    expect(JSON.parse(String(seen[0]?.init?.body))).toMatchObject({
      resolution: "720p",
      aspect_ratio: "9:16",
    });
  });

  it("says in fal's own words when the clip failed in the queue", async () => {
    const port = falImage({
      key: () => key,
      clock,
      fetch: answers(
        [
          (url) =>
            url === `${falQueueBase}/${model}`
              ? Response.json({ request_id: "r1", status_url: status, response_url: response })
              : undefined,
          (url) =>
            url === status
              ? Response.json({ status: "COMPLETED", error: "GPU ran out" })
              : undefined,
        ],
        [],
      ),
    });
    const error = await port.animate?.(request(model)).catch((failure: unknown) => failure);
    expect(isProviderError(error)).toBe(true);
    expect(String((error as Error).message)).toMatch(
      /fal\.ai could not make the video clip.*GPU ran out.*Try again/,
    );
  });

  it("refuses a download that is not a video clip", async () => {
    const port = falImage({
      key: () => key,
      clock,
      fetch: answers(
        [
          (url) =>
            url === `${falQueueBase}/${model}`
              ? Response.json({ request_id: "r1", status_url: status, response_url: response })
              : undefined,
          (url) => (url === status ? Response.json({ status: "COMPLETED" }) : undefined),
          (url) =>
            url === response ? Response.json({ video: { url: "https://cdn/x.mp4" } }) : undefined,
          (url) => (url === "https://cdn/x.mp4" ? new Response("<html>") : undefined),
        ],
        [],
      ),
    });
    await expect(port.animate?.(request(model))).rejects.toThrow(/not an MP4 video clip/);
  });

  it("names a missing key rather than calling", async () => {
    const seen: Seen[] = [];
    const port = falImage({ key: () => undefined, clock, fetch: answers([], seen) });
    await expect(port.animate?.(request(model))).rejects.toThrow(/fal\.ai/);
    expect(seen).toEqual([]);
  });
});

describe("Replicate image-to-video", () => {
  it("sends Kling's still as start_image and downloads the clip once the prediction succeeds", async () => {
    const seen: Seen[] = [];
    const model = "kwaivgi/kling-v2.5-turbo-pro";
    const port = replicateImage({
      key: () => key,
      clock,
      fetch: answers(
        [
          (url) =>
            url === `${replicateBase}/models/${model}/predictions`
              ? Response.json(
                  { status: "starting", urls: { get: `${replicateBase}/predictions/p1` } },
                  { status: 201 },
                )
              : undefined,
          (url) =>
            url === `${replicateBase}/predictions/p1`
              ? Response.json({ status: "succeeded", output: "https://replicate.delivery/c.mp4" })
              : undefined,
          (url) => (url === "https://replicate.delivery/c.mp4" ? new Response(clip) : undefined),
        ],
        seen,
      ),
    });
    const made = await port.animate?.(request(model));
    expect(made?.bytes).toEqual(clip);
    const body = JSON.parse(String(seen[0]?.init?.body));
    expect(body.input).toEqual({
      prompt: "Slow push-in.",
      start_image: `data:image/jpeg;base64,${Buffer.from(still.bytes).toString("base64")}`,
      duration: 5,
    });
    // A clip outlives the synchronous wait every time, so none is asked for.
    expect(headersOf(seen[0]).Prefer).toBeUndefined();
  });

  it("asks Wan for 720p with the still as image", async () => {
    const seen: Seen[] = [];
    await replicateImage({
      key: () => key,
      clock,
      fetch: answers([() => new Response("{}", { status: 500 })], seen),
    })
      .animate?.(request("wan-video/wan-2.5-i2v"))
      .catch(() => undefined);
    expect(JSON.parse(String(seen[0]?.init?.body)).input).toMatchObject({
      image: expect.stringMatching(/^data:image\/jpeg;base64,/),
      resolution: "720p",
    });
  });
});

describe("sniffVideo", () => {
  it("knows an MP4 by its ftyp box", () => {
    expect(sniffVideo(clip)).toBe(true);
    expect(sniffVideo(new TextEncoder().encode("<html><body>nope</body></html>"))).toBe(false);
  });
});
