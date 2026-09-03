import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { GeneratedImage, ImagePort, ImageRequest } from "../../kernel/ports/image.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import { retryAfter } from "../retry-after.js";
import { downloadImage } from "./bytes.js";

// The HTTP gateway adapter for fal.ai: `fetch` and the downloader beside this file, no SDK.
// `@fal-ai/client` would buy queue polling this endpoint does not need, so the platform's
// own `fetch` covers the whole call. The synchronous host runs the model on the open
// connection, which is what the wrapper's 300 s measures.

export const falBase = "https://fal.run";

// fal has no endpoint listing only its text-to-image models, so the list is this adapter's own
// data and adding one is a line here. Every entry takes the same input shape: `image_size` as
// an enum, `num_images`, `output_format`. ceiling: a model spelling its aspect `aspect_ratio`
// instead - `xai/grok-imagine-image` does - needs a per-model input map first.
export const falModels: readonly ModelInfo[] = [
  { id: "fal-ai/flux-2", name: "FLUX.2" },
  { id: "fal-ai/flux/dev", name: "FLUX.1 [dev]" },
  { id: "fal-ai/flux/schnell", name: "FLUX.1 [schnell]" },
];

// The closest supported size. fal names both 16:9 frames from the
// orientation, so the portrait one is "portrait_16_9" and is 9:16.
const sizes: Readonly<Record<ImageRequest["aspect"], string>> = {
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

export interface FalImageDeps {
  // Injected so a test never needs the network.
  readonly fetch: typeof globalThis.fetch;
  // Called per request, never held: an attempt finishes on the key it started with.
  readonly key: () => string | undefined;
}

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
      const response = await deps.fetch(`${falBase}/${req.model}`, {
        method: "POST",
        signal: req.signal,
        headers: { Authorization: `Key ${keyOf(deps)}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: req.prompt,
          image_size: sizes[req.aspect],
          // The stage sends Number as that many independent calls, one piece each.
          num_images: 1,
          // The port stores PNG or JPEG; fal defaults to WebP on some models and the
          // download would refuse it. The stage asks for the provider's own quality.
          output_format: "png",
        }),
      });
      if (!response.ok) {
        throw await failure(response);
      }
      const answer = parse(await response.text());
      refused(answer, req.prompt);
      const first = answer.images[0];
      if (first === undefined) {
        throw providerError({ kind: "other", message: "fal answered with no image" });
      }
      // The download rides inside the attempt: a link that 404s is a failed attempt.
      return await downloadImage({
        fetch: deps.fetch,
        provider: "fal",
        url: first.url,
        signal: req.signal,
      });
    },
  };
}

function keyOf(deps: FalImageDeps): string {
  // `missing_key`, not `auth`, because that rule makes it terminal.
  const key = deps.key();
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: "no fal key is stored" });
  }
  return key;
}

// A content-policy refusal is final, named here and made terminal by the wrapper. fal declines
// inside a 200 - the safety checker flags the image and hands back a blank one. With no
// sentence to quote, this is the one refusal whose words are the app's.
function refused(answer: z.infer<typeof generated>, prompt: string): void {
  const flags = answer.has_nsfw_concepts ?? [];
  if (flags.length > 0 && flags.every((flagged) => flagged)) {
    throw providerError({
      kind: "refusal",
      message: `fal's safety checker rejected every image for this prompt: ${redact(prompt)}`,
    });
  }
}

// Only the adapter sees the vendor's status code, so only the adapter names the kind.
function kindOf(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  // ceiling: everything else is `other` and is retried, so a 422 naming an input this model
  // does not take fails the same way four times over. A terminal "this will never work" kind
  // has to reach the port's error contract first, which is not this adapter's to widen.
  return "other";
}

async function failure(response: Response): Promise<Error> {
  const text = await response.text().catch(() => "");
  // The provider's own words, through the redactor - an error body may quote the key back.
  const message = redact(detailOf(text) || response.statusText);
  const retryAfterMs = retryAfter(response.headers.get("retry-after"));
  return providerError({
    kind: kindOf(response.status),
    message: `fal answered ${String(response.status)}: ${message}`,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
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
      message: "fal's answer was not in the shape this app can read",
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
