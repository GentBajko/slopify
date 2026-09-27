import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { redact } from "../../kernel/log.js";
import type {
  AnimateRequest,
  GeneratedImage,
  GeneratedVideo,
  ImagePort,
  ImageRequest,
} from "../../kernel/ports/image.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import {
  httpFailure,
  missingKey,
  noImage,
  providerSaid,
  refusedImage,
  unreadable,
} from "../explain.js";
import { retryAfter } from "../retry-after.js";
import { downloadImage } from "./bytes.js";
import { withReferences } from "./reference.js";
import { dataUri, downloadVideo } from "./video.js";

// The HTTP gateway adapter for Replicate: `fetch`, the injected clock and the downloader
// beside this file, no SDK. The `replicate` package wraps exactly the two requests below, so
// the platform's own `fetch` covers it.

export const replicateBase = "https://api.replicate.com/v1";

// `Prefer: wait` holds the connection open while the model runs, up to the 60 s Replicate
// documents. A slower model answers `starting` and has to be polled, which is why this
// adapter takes a clock. The wrapper's 300 s ends the polling.
export const replicateWaitSeconds = 60;
export const replicatePollMs = 2000;

// The model dropdown comes from what the provider offers, but Replicate's index lists every
// model on the platform, so the text-to-image shortlist is this adapter's own data and adding
// one is a line here. ceiling: each entry has to take `prompt`, `aspect_ratio` and
// `output_format` - the convention across Replicate's official image models, not a guarantee. A
// model spelling its inputs differently needs an input map.
export const replicateModels: readonly ModelInfo[] = [
  { id: "black-forest-labs/flux-1.1-pro", name: "FLUX 1.1 [pro]" },
  { id: "black-forest-labs/flux-dev", name: "FLUX.1 [dev]" },
  { id: "black-forest-labs/flux-schnell", name: "FLUX.1 [schnell]" },
];

export interface ReplicateImageDeps {
  // Injected so a test never needs the network.
  readonly fetch: typeof globalThis.fetch;
  // Called for every request, never held.
  readonly key: () => string | undefined;
  // The wait between polls is spent on the app's clock, so a test drives a slow
  // prediction without waiting for one.
  readonly clock: Clock;
}

// A wire payload is narrowed, never cast. `output` is one URL
// on single-image models and an array on the rest, so both shapes are read.
const prediction = z.object({
  status: z.string(),
  output: z.union([z.string(), z.array(z.string())]).nullish(),
  error: z.string().nullish(),
  urls: z.object({ get: z.string().optional() }).nullish(),
});

const errorBody = z.object({ detail: z.string().optional(), title: z.string().optional() });

// `canceled` cannot happen here - nothing cancels a prediction this app made - but reading
// it as terminal beats polling forever.
const settled: readonly string[] = ["succeeded", "failed", "canceled"];

export function replicateImage(deps: ReplicateImageDeps): ImagePort {
  return {
    id: "replicate",
    models: (): Promise<readonly ModelInfo[]> => Promise.resolve(replicateModels),
    generate: async (req: ImageRequest): Promise<GeneratedImage> => {
      // The Replicate models listed take no input image to draw from (the FLUX image inputs
      // copy the picture's composition), so an establishing image is refused, not dropped.
      if (req.reference !== undefined)
        throw providerError({
          kind: "unsupported",
          message:
            "Replicate's image models can't use an establishing image as a reference. Choose Codex CLI, OpenAI, Google or fal.ai under Images → Provider on Play or in Edit project → Providers, or set Establishing image to Off in the Images section.",
        });
      const response = await deps.fetch(`${replicateBase}/models/${req.model}/predictions`, {
        method: "POST",
        signal: req.signal,
        headers: {
          ...auth(deps),
          "Content-Type": "application/json",
          Prefer: `wait=${String(replicateWaitSeconds)}`,
        },
        body: JSON.stringify({
          input: {
            // These models take no input image, so the cast is described in words.
            prompt: withReferences(req.prompt, req, 0),
            // Replicate takes the aspect, so the closest size is exact.
            aspect_ratio: req.aspect,
            // The port stores PNG or JPEG and these models default to WebP. Nothing else
            // is set: the stage asks for the provider's own quality and style.
            output_format: "png",
          },
        }),
      });
      if (!response.ok) {
        throw await failure(response);
      }
      const url = await settle(deps, parse(await response.text()), req.signal);
      // The download rides inside the attempt: a link that 404s is a failed attempt.
      return await downloadImage({
        fetch: deps.fetch,
        provider: "Replicate",
        url,
        signal: req.signal,
      });
    },
    // The same prediction, polled the same way; a clip outlives `Prefer: wait` every time, so
    // it is not asked for.
    animate: async (req: AnimateRequest): Promise<GeneratedVideo> => {
      const response = await deps.fetch(`${replicateBase}/models/${req.model}/predictions`, {
        method: "POST",
        signal: req.signal,
        headers: { ...auth(deps), "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            prompt: req.prompt,
            [Object.hasOwn(videoImageField, req.model)
              ? (videoImageField[req.model] ?? "image")
              : "image"]: dataUri(req.image),
            duration: Math.round(req.seconds),
            ...(Object.hasOwn(videoResolution, req.model) ? { resolution: "720p" } : {}),
          },
        }),
      });
      if (!response.ok) throw await failure(response, "video clip request");
      const url = await settle(deps, parse(await response.text()), req.signal);
      return await downloadVideo({
        fetch: deps.fetch,
        provider: "Replicate",
        url,
        signal: req.signal,
      });
    },
  };
}

// Replicate's image-to-video models name the still differently: Kling calls it
// `start_image`, the others `image`. Wan and Seedance default to larger frames than the
// render needs, so they are asked for 720p, which is what the catalogue prices.
const videoImageField: Readonly<Record<string, string>> = {
  "kwaivgi/kling-v2.5-turbo-pro": "start_image",
};
const videoResolution: Readonly<Record<string, true>> = {
  "wan-video/wan-2.5-i2v": true,
  "bytedance/seedance-1-pro-fast": true,
};

// `Prefer: wait` answers `starting` when the model outlived its 60 s; Replicate's guidance
// is to poll `urls.get` until the prediction settles.
async function settle(
  deps: ReplicateImageDeps,
  first: z.infer<typeof prediction>,
  signal: AbortSignal,
): Promise<string> {
  let current = first;
  while (!settled.includes(current.status)) {
    const next = current.urls?.get;
    if (next === undefined) {
      throw providerError({
        kind: "other",
        message: unreadable("Replicate"),
      });
    }
    await deps.clock.sleep(replicatePollMs, signal);
    const response = await deps.fetch(next, { signal, headers: auth(deps) });
    if (!response.ok) {
      throw await failure(response);
    }
    current = parse(await response.text());
  }
  return outputOf(current);
}

function outputOf(current: z.infer<typeof prediction>): string {
  if (current.status !== "succeeded") {
    throw declined(current);
  }
  const output = current.output;
  const url = typeof output === "string" ? output : output?.[0];
  if (url === undefined || url === "") {
    throw providerError({ kind: "other", message: noImage("Replicate") });
  }
  return url;
}

// A content-policy refusal is final and never retried. Replicate reports one as a settled
// prediction whose `error` says so, under the same 201 a success gets, so the text is all that
// tells them apart.
const refusalWords = /\b(nsfw|sensitive|safety|content polic|flagged|moderat)/i;

function declined(current: z.infer<typeof prediction>): Error {
  // The provider's own words, verbatim, through the same redactor the wrapper uses.
  const message = redact(current.error ?? `the prediction ended ${current.status}`);
  // ceiling: read off the sentence, because a failed prediction carries no machine-readable
  // reason. A phrase the list does not know costs the user three more images; the upgrade
  // is a structured field, when Replicate ships one.
  const refusal = refusalWords.test(message);
  return providerError({
    kind: refusal ? "refusal" : "other",
    message: refusal
      ? refusedImage("Replicate", message)
      : providerSaid(
          "Replicate",
          "could not make the image",
          message,
          "Use Try again; if it keeps happening, reword the image prompt in the Images section of Edit project or choose another image model in its Providers section.",
        ),
  });
}

function auth(deps: ReplicateImageDeps): Record<string, string> {
  // `missing_key`, not `auth`, because that rule makes it terminal.
  const key = deps.key();
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: missingKey("Replicate") });
  }
  return { Authorization: `Bearer ${key}` };
}

// Only the adapter sees the vendor's status code, so only the adapter names the kind.
function kindOf(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  // ceiling: everything else is `other` and is retried, so a 402 with no credit left fails the
  // same way four times over. A terminal "this will never work" kind has to reach the port's
  // error contract first, which is not this adapter's to widen.
  // The provider's own server failed; the same request may well succeed later.
  if (status >= 500) return "dropped";
  return "other";
}

async function failure(response: Response, subject = "image request"): Promise<Error> {
  const text = await response.text().catch(() => "");
  const parsed = errorBody.safeParse(safeJson(text));
  // The provider's own words, through the redactor - an error body may quote the key back.
  const detail = parsed.success ? (parsed.data.detail ?? parsed.data.title) : undefined;
  const message = redact(detail ?? text.trim());
  const retryAfterMs = retryAfter(response.headers.get("retry-after"));
  return providerError({
    kind: kindOf(response.status),
    message: httpFailure({
      provider: "Replicate",
      status: response.status,
      detail: message || response.statusText,
      subject,
    }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

function parse(text: string): z.infer<typeof prediction> {
  const parsed = prediction.safeParse(safeJson(text));
  if (!parsed.success) {
    throw providerError({
      kind: "other",
      message: unreadable("Replicate"),
    });
  }
  return parsed.data;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
