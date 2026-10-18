import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { internalError } from "../../kernel/errors.js";
import { redact } from "../../kernel/log.js";
import type {
  AnimateRequest,
  GeneratedImage,
  GeneratedVideo,
  ImagePort,
  ImageRequest,
} from "../../kernel/ports/image.js";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import { httpFailure, noImage, providerSaid, unreadable } from "../explain.js";
import {
  failureText,
  httpProviderError,
  kindOfStatus,
  requireKey,
  safeJson,
} from "../http-failure.js";
import { modelAccessOf } from "../model-access.js";
import { downloadImage } from "./bytes.js";
import { referencePictures, withReferences } from "./reference.js";
import { dataUri, downloadVideo } from "./video.js";

// The HTTP gateway adapter for fal.ai: `fetch` and the downloader beside this file, no SDK.
// `@fal-ai/client` would buy queue polling, which only the video clips need and which is three
// plain requests, so the platform's own `fetch` covers every call. Images use the synchronous
// host, which runs the model on the open connection the wrapper's 300 s measures.

export const falBase = "https://fal.run";

// fal has no endpoint listing only its text-to-image models, so the list is this adapter's own
// data and adding one is a line here plus its aspect shape below.
export const falModels: readonly ModelInfo[] = [
  { id: "fal-ai/flux-2", name: "FLUX.2" },
  { id: "fal-ai/flux/dev", name: "FLUX.1 [dev]" },
  { id: "fal-ai/flux/schnell", name: "FLUX.1 [schnell]" },
  { id: "fal-ai/nano-banana", name: "Nano Banana" },
  { id: "fal-ai/nano-banana-2", name: "Nano Banana 2" },
  { id: "fal-ai/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image" },
];

// fal spells the frame two ways and the difference is per model, not per family: the FLUX
// endpoints take an `image_size` enum naming the orientation, the Google ones take a plain
// `aspect_ratio` string. Both accept everything else identically, so the shape is the only
// thing a model entry has to declare.
const aspectFields = ["image_size", "aspect_ratio"] as const;
type AspectField = (typeof aspectFields)[number];

// The closest supported size, per shape. fal names both 16:9 `image_size` frames from the
// orientation, so the portrait one is "portrait_16_9" and is 9:16; `aspect_ratio` takes the
// run's own words.
const sizes: Readonly<Record<AspectField, Readonly<Record<ImageRequest["aspect"], string>>>> = {
  image_size: { "16:9": "landscape_16_9", "9:16": "portrait_16_9", "1:1": "square_hd" },
  aspect_ratio: { "16:9": "16:9", "9:16": "9:16", "1:1": "1:1" },
};

const modelAspects: Readonly<Record<string, AspectField>> = {
  "fal-ai/flux-2": "image_size",
  "fal-ai/flux/dev": "image_size",
  "fal-ai/flux/schnell": "image_size",
  "fal-ai/nano-banana": "aspect_ratio",
  "fal-ai/nano-banana-2": "aspect_ratio",
  "fal-ai/gemini-3.1-flash-image-preview": "aspect_ratio",
};

// A model the map does not know is one the user typed rather than picked, so it falls back to
// `image_size` - the shape the FLUX endpoints use and the one this adapter shipped with.
// `Object.hasOwn` because a model id is user input and a plain lookup would answer
// "constructor" from Object's own prototype.
function aspectOf(model: string, aspect: ImageRequest["aspect"]): Record<string, string> {
  const field = Object.hasOwn(modelAspects, model) ? modelAspects[model] : undefined;
  const shape: AspectField = field ?? "image_size";
  return { [shape]: sizes[shape][aspect] };
}

// The text-to-image models whose fal endpoint has an `/edit` twin taking the same fields plus
// `image_urls`, which is how an establishing image is sent.
const editModels: readonly string[] = [
  "fal-ai/flux-2",
  "fal-ai/nano-banana",
  "fal-ai/nano-banana-2",
];
function editEndpoint(model: string): string | undefined {
  return editModels.includes(model) ? `${model}/edit` : undefined;
}

export interface FalImageDeps {
  // Injected so a test never needs the network.
  readonly fetch: typeof globalThis.fetch;
  // Called per request, never held: an attempt finishes on the key it started with.
  readonly key: () => string | undefined;
  // The wait between polls of a queued video clip, spent on the app's clock so a test drives
  // a slow clip without waiting for one.
  readonly clock?: Clock | undefined;
}

// Image-to-video runs on fal's queue, not the synchronous host: a clip takes one to five
// minutes, and fal documents the queue as the way to call anything that slow. A request is
// submitted, its status polled until it completes, and its answer fetched from the links the
// submission gave.
export const falQueueBase = "https://queue.fal.run";
export const falPollMs = 5000;

// The image-to-video models this adapter knows the inputs of. Each takes `prompt`,
// `image_url` and a `duration` string; the rest is per model. A model not listed gets only
// those three.
const videoInputs: Readonly<Record<string, (aspect: ImageRequest["aspect"]) => object>> = {
  "fal-ai/kling-video/v2.5-turbo/pro/image-to-video": () => ({}),
  "fal-ai/wan-25-preview/image-to-video": () => ({ resolution: "720p" }),
  "fal-ai/bytedance/seedance/v1/pro/fast/image-to-video": (aspect) => ({
    resolution: "720p",
    aspect_ratio: aspect,
  }),
};

const queued = z.object({ status_url: z.string(), response_url: z.string() });
const queueStatus = z.object({ status: z.string(), error: z.string().nullish() });
const video = z.object({ video: z.object({ url: z.string() }) });

// A wire payload is narrowed, never cast: everything unlisted is dropped at the seam.
const generated = z.object({
  images: z.array(z.object({ url: z.string() })),
  // The safety checker's verdict, one flag per image - how fal declines: a 200 with a
  // blank image.
  has_nsfw_concepts: z.array(z.boolean()).nullish(),
});

// FastAPI's envelope: an object per failed field for a validation error, a bare string
// otherwise.
const errorBody = z.object({
  detail: z.union([
    z.string(),
    z.array(z.object({ msg: z.string(), type: z.string().optional() })),
  ]),
});

export function falImage(deps: FalImageDeps): ImagePort {
  return {
    id: "fal",
    models: (): Promise<readonly ModelInfo[]> => Promise.resolve(falModels),
    generate: async (req: ImageRequest): Promise<GeneratedImage> => {
      // An establishing image goes to the model's edit endpoint, which takes input images as
      // `image_urls`; only the models that have one are marked as taking a reference.
      // Cast pictures ride the same list; a model without an edit endpoint gets the cast in
      // words instead, since only the establishing image is something the user turned on.
      const pictures = referencePictures(req);
      const edit = pictures.length === 0 ? undefined : editEndpoint(req.model);
      if (req.reference !== undefined && edit === undefined)
        throw providerError({
          kind: "unsupported",
          message:
            "This fal.ai model can't use an establishing image as a reference. Choose FLUX.2 or Nano Banana 2 under Images → Model on Play or in Edit project → Providers, or set Establishing image to Off in the Images section.",
        });
      const response = await deps.fetch(`${falBase}/${edit ?? req.model}`, {
        method: "POST",
        signal: req.signal,
        headers: { Authorization: `Key ${keyOf(deps)}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: withReferences(req.prompt, req, edit === undefined ? 0 : pictures.length),
          ...(edit === undefined
            ? {}
            : { image_urls: pictures.map((picture) => dataUri(picture.image)) }),
          ...aspectOf(req.model, req.aspect),
          // The stage sends Number as that many independent calls, one piece each.
          num_images: 1,
          // The port stores PNG or JPEG; fal defaults to WebP on some models and the
          // download would refuse it. The stage asks for the provider's own quality.
          output_format: "png",
        }),
      });
      if (!response.ok) {
        throw await failure(response, "image request", true);
      }
      const answer = parse(await response.text());
      refused(answer, req.prompt);
      const first = answer.images[0];
      if (first === undefined) {
        throw providerError({ kind: "other", message: noImage("fal.ai") });
      }
      // The download rides inside the attempt: a link that 404s is a failed attempt.
      return await downloadImage({
        fetch: deps.fetch,
        provider: "fal.ai",
        url: first.url,
        signal: req.signal,
      });
    },
    animate: async (req: AnimateRequest): Promise<GeneratedVideo> => {
      const clock = deps.clock;
      if (clock === undefined)
        throw providerError({ kind: "other", message: internalError("fal.ai has no clock") });
      const headers = { Authorization: `Key ${keyOf(deps)}`, "Content-Type": "application/json" };
      const submitted = await deps.fetch(`${falQueueBase}/${req.model}`, {
        method: "POST",
        signal: req.signal,
        headers,
        body: JSON.stringify({
          prompt: req.prompt,
          image_url: dataUri(req.image),
          duration: String(Math.round(req.seconds)),
          ...(Object.hasOwn(videoInputs, req.model) ? videoInputs[req.model]?.(req.aspect) : {}),
        }),
      });
      if (!submitted.ok) throw await failure(submitted, "video clip request", true);
      const links = read(queued, await submitted.text());
      for (;;) {
        const status = await deps.fetch(links.status_url, { signal: req.signal, headers });
        if (!status.ok) throw await failure(status, "video clip request");
        const current = read(queueStatus, await status.text());
        if (current.error)
          throw providerError({
            kind: "other",
            message: providerSaid(
              "fal.ai",
              "could not make the video clip",
              redact(current.error),
              "Use Try again; if it keeps happening, choose another image-to-video model under Animate images in Edit project → Inputs → Look.",
            ),
          });
        if (current.status === "COMPLETED") break;
        await clock.sleep(falPollMs, req.signal);
      }
      const answer = await deps.fetch(links.response_url, { signal: req.signal, headers });
      if (!answer.ok) throw await failure(answer, "video clip request");
      const made = read(video, await answer.text());
      return await downloadVideo({
        fetch: deps.fetch,
        provider: "fal.ai",
        url: made.video.url,
        signal: req.signal,
      });
    },
  };
}

function read<T>(schema: z.ZodType<T>, text: string): T {
  const parsed = schema.safeParse(safeJson(text));
  if (!parsed.success) throw providerError({ kind: "other", message: unreadable("fal.ai") });
  return parsed.data;
}

function keyOf(deps: FalImageDeps): string {
  return requireKey(deps.key(), "fal.ai");
}

// A content-policy refusal is final, named here and made terminal by the wrapper. fal declines
// inside a 200 - the safety checker flags the image and hands back a blank one. With no
// sentence to quote, this is the one refusal whose words are the app's.
function refused(answer: z.infer<typeof generated>, prompt: string): void {
  const flags = answer.has_nsfw_concepts ?? [];
  if (flags.length > 0 && flags.every((flagged) => flagged)) {
    throw providerError({
      kind: "refusal",
      message: `fal.ai's safety checker blocked the image for this prompt: "${redact(prompt)}". Reword the image prompt in the Images section of Edit project, or choose another image provider in its Providers section.`,
    });
  }
}

// `atModel`: the request went to the model's own address, so a 404 or 403 is about the model.
async function failure(
  response: Response,
  subject = "image request",
  atModel = false,
): Promise<Error> {
  const text = await failureText(response);
  // The provider's own words, through the redactor - an error body may quote the key back.
  const message = redact(detailOf(text) || response.statusText);
  return httpProviderError(
    response,
    kindOfStatus(response.status),
    httpFailure({ provider: "fal.ai", status: response.status, detail: message, subject }),
    undefined,
    modelAccessOf(response.status, text, atModel),
  );
}

function detailOf(text: string): string {
  const parsed = errorBody.safeParse(safeJson(text));
  if (!parsed.success) {
    return text.trim();
  }
  const { detail } = parsed.data;
  if (typeof detail === "string") {
    return detail;
  }
  return detail.map((one) => one.msg).join("; ");
}

function parse(text: string): z.infer<typeof generated> {
  const parsed = generated.safeParse(safeJson(text));
  if (!parsed.success) {
    throw providerError({
      kind: "other",
      message: unreadable("fal.ai"),
    });
  }
  return parsed.data;
}
