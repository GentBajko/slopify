import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { redact } from "../../kernel/log.js";
import type { GeneratedImage, ImagePort, ImageRequest } from "../../kernel/ports/image.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import { retryAfter } from "../retry-after.js";
import { downloadImage } from "./bytes.js";

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
  };
}

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
  return providerError({
    kind: refusalWords.test(message) ? "refusal" : "other",
    message: `Replicate answered: ${message}`,
  });
}

function auth(deps: ReplicateImageDeps): Record<string, string> {
  // `missing_key`, not `auth`, because that rule makes it terminal.
  const key = deps.key();
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: "no Replicate key is stored" });
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
  return "other";
}

async function failure(response: Response): Promise<Error> {
  const text = await response.text().catch(() => "");
  const parsed = errorBody.safeParse(safeJson(text));
  // The provider's own words, through the redactor - an error body may quote the key back.
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
