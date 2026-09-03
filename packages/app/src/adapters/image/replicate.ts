import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { redact } from "../../kernel/log.js";
import type { GeneratedImage, ImagePort, ImageRequest } from "../../kernel/ports/image.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import { retryAfter } from "../retry-after.js";
import { downloadImage } from "./bytes.js";

// The HTTP gateway adapter for Replicate (01-architecture Module boundaries). `fetch`,
// the injected clock, and the downloader beside this file; no SDK. `replicate` the package
// exists and wraps exactly the two requests below, so 05-dependencies' rung 3 covers it.

export const replicateBase = "https://api.replicate.com/v1";

// `Prefer: wait` holds the connection open while the model runs, up to the 60 s ceiling
// Replicate documents. A model slower than that answers `starting` instead, and the
// prediction has to be polled - which is why this adapter takes a clock. The attempt
// wrapper's 300 s (`logic/09` §Q77) is what ends the polling, through the request signal.
export const replicateWaitSeconds = 60;
export const replicatePollMs = 2000;

// `logic/02` §Q15: the model dropdown is filled from what the provider offers. Replicate's
// model index lists every model on the platform, text and video among them, so the
// text-to-image shortlist is this adapter's own data and adding one is a line here.
// ceiling: each entry has to take `prompt`, `aspect_ratio` and `output_format`, which is
// the convention across Replicate's official image models but not a guarantee; a model
// that spells its inputs differently needs a per-model input map first.
export const replicateModels: readonly ModelInfo[] = [
  { id: "black-forest-labs/flux-1.1-pro", name: "FLUX 1.1 [pro]" },
  { id: "black-forest-labs/flux-dev", name: "FLUX.1 [dev]" },
  { id: "black-forest-labs/flux-schnell", name: "FLUX.1 [schnell]" },
];

export interface ReplicateImageDeps {
  // Injected so a test never needs the network and `main.ts` owns the real one.
  readonly fetch: typeof globalThis.fetch;
  // Called for every request, never held (`logic/02` §Q16).
  readonly key: () => string | undefined;
  // The wait between polls is spent on the app's clock, so a test drives a slow
  // prediction without waiting for one (06-testing Doubles).
  readonly clock: Clock;
}

// A wire payload is narrowed, never cast (01-architecture §Q10, §Q33). `output` is one
// URL on the models that make a single image and an array on the ones that can make
// several, so both shapes are read and the first is taken.
const prediction = z.object({
  status: z.string(),
  output: z.union([z.string(), z.array(z.string())]).nullish(),
  error: z.string().nullish(),
  urls: z.object({ get: z.string().optional() }).nullish(),
});

const errorBody = z.object({ detail: z.string().optional(), title: z.string().optional() });

// The two terminal states that are not success. `canceled` cannot happen here - nothing
// cancels a prediction this app made - but reading it as terminal beats polling forever.
const settled: readonly string[] = ["succeeded", "failed", "canceled"];

export function replicateImage(deps: ReplicateImageDeps): ImagePort {
  return {
    id: "replicate",
    models: (): Promise<readonly ModelInfo[]> => Promise.resolve(replicateModels),
    generate: async (req: ImageRequest): Promise<GeneratedImage> => {
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
            prompt: req.prompt,
            // `logic/09` step 1: Replicate takes the aspect itself, so the closest
            // supported size is the exact one.
            aspect_ratio: req.aspect,
            // The port stores a PNG or a JPEG and these models default to WebP.
            // Nothing else is set: step 2 asks for the provider's own quality and style.
            output_format: "png",
          },
        }),
      });
      if (!response.ok) {
        throw await failure(response);
      }
      const url = await settle(deps, parse(await response.text()), req.signal);
      // The download is inside the attempt with the call that produced the link, so a
      // link that 404s is a failed attempt rather than a broken file on the project.
      return await downloadImage({
        fetch: deps.fetch,
        provider: "Replicate",
        url,
        signal: req.signal,
      });
    },
  };
}

// `Prefer: wait` answers `starting` when the model outlived its 60 s, and Replicate's own
// guidance is to poll `urls.get` until the prediction settles.
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
        message: `Replicate left the prediction ${current.status} and named no address to read it from`,
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
    throw providerError({ kind: "other", message: "Replicate succeeded with no image" });
  }
  return url;
}

// `logic/09` §Q74: a content-policy refusal is the provider's final answer and is never
// retried. Replicate reports one as a settled prediction whose `error` says so, with the
// same 201 the successful call had, so the text is what tells them apart.
const refusalWords = /\b(nsfw|sensitive|safety|content polic|flagged|moderat)/i;

function declined(current: z.infer<typeof prediction>): Error {
  // The provider's own words, verbatim, through the same redactor the wrapper uses.
  const message = redact(current.error ?? `the prediction ended ${current.status}`);
  // ceiling: read off the sentence, because Replicate carries no machine-readable reason
  // on a failed prediction. A phrase the list does not know is retried three more times
  // and costs the user three more images; a structured field would settle it, and the
  // upgrade is to read one when Replicate ships it.
  return providerError({
    kind: refusalWords.test(message) ? "refusal" : "other",
    message: `Replicate answered: ${message}`,
  });
}

function auth(deps: ReplicateImageDeps): Record<string, string> {
  // `logic/02` §Q13: an attempt that finds no key fails rather than calling anonymously.
  // `missing_key` rather than `auth` because the same rule makes it terminal.
  const key = deps.key();
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: "no Replicate key is stored" });
  }
  return { Authorization: `Bearer ${key}` };
}

// Only the adapter can read a vendor's status code, so only the adapter names the kind;
// the attempt wrapper maps it and nothing downstream classifies again (03-conventions).
function kindOf(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  // ceiling: everything else is `other` and is retried, so a 402 with no credit left
  // fails the same way four times over. A terminal kind for "this request will never
  // work" would have to be added to the port's error contract first, which is not this
  // adapter's to widen.
  return "other";
}

async function failure(response: Response): Promise<Error> {
  const text = await response.text().catch(() => "");
  const parsed = errorBody.safeParse(safeJson(text));
  // The provider's own words, verbatim, through the same redactor the wrapper uses: an
  // error body is free to quote the key back and this is the first place it is held.
  const detail = parsed.success ? (parsed.data.detail ?? parsed.data.title) : undefined;
  const message = redact(detail ?? text.trim());
  const retryAfterMs = retryAfter(response.headers.get("retry-after"));
  return providerError({
    kind: kindOf(response.status),
    message: `Replicate answered ${String(response.status)}: ${message || response.statusText}`,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

function parse(text: string): z.infer<typeof prediction> {
  const parsed = prediction.safeParse(safeJson(text));
  if (!parsed.success) {
    throw providerError({
      kind: "other",
      message: "Replicate's answer was not in the shape this app can read",
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
