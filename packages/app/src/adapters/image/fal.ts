import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { GeneratedImage, ImagePort, ImageRequest } from "../../kernel/ports/image.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import { retryAfter } from "../retry-after.js";
import { downloadImage } from "./bytes.js";

// The HTTP gateway adapter for fal.ai (01-architecture Module boundaries). `fetch` and
// the downloader beside this file, no SDK: `@fal-ai/client` exists and would buy the
// queue polling this endpoint does not need, so 05-dependencies' rung 3 - the platform's
// own `fetch` - already covers the whole call. The synchronous host runs the model on the
// open connection, which is what the attempt wrapper's 300 s is measuring.

export const falBase = "https://fal.run";

// `logic/02` §Q15: the model dropdown is filled from what the provider offers, and fal has
// no endpoint that lists only its text-to-image models, so the list is this adapter's own
// data. Adding next month's model is a line here and no code change anywhere else.
// Every entry takes the same input shape: `image_size` as an enum, `num_images`, and
// `output_format`. ceiling: a fal model that spells its aspect `aspect_ratio` instead -
// `xai/grok-imagine-image` does - cannot be added to this list without a per-model input
// map, which is the upgrade when one is wanted.
export const falModels: readonly ModelInfo[] = [
  { id: "fal-ai/flux-2", name: "FLUX.2" },
  { id: "fal-ai/flux/dev", name: "FLUX.1 [dev]" },
  { id: "fal-ai/flux/schnell", name: "FLUX.1 [schnell]" },
];

// `logic/09` step 1: the closest supported size to the run's aspect. fal names the two
// 16:9 frames from the orientation, so the portrait one is "portrait_16_9" and is 9:16.
const sizes: Readonly<Record<ImageRequest["aspect"], string>> = {
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

export interface FalImageDeps {
  // Injected so a test never needs the network and `main.ts` owns the real one.
  readonly fetch: typeof globalThis.fetch;
  // Called for every request, never held: an attempt in flight finishes on the key it
  // started with and the next one picks up a key saved since (`logic/02` §Q16).
  readonly key: () => string | undefined;
}

// A wire payload is narrowed, never cast: everything unlisted is dropped at the seam so
// no vendor shape can leak past this file (01-architecture §Q10, §Q33).
const generated = z.object({
  images: z.array(z.object({ url: z.string() })),
  // The safety checker's verdict, one flag per image. It is how fal says it declined:
  // the request is a 200 and the image that comes back is blank.
  has_nsfw_concepts: z.array(z.boolean()).nullish(),
});

// fal answers a rejected request with FastAPI's own envelope: an object per failed field
// for a validation error, a bare string for everything else.
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
          // `logic/09` step 2 sends Number as that many independent calls, each its own
          // resumable piece, so one image per request is what the stage asks for.
          num_images: 1,
          // The port stores a PNG or a JPEG; fal's own default is WebP on some models and
          // the download would refuse it. Nothing else about quality or style is set:
          // step 2 asks for the provider's defaults.
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
      // The download is inside the attempt with the call that produced the link, so a
      // link that 404s is a failed attempt rather than a broken file on the project.
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
  // `logic/02` §Q13: an attempt that finds no key fails rather than calling anonymously.
  // `missing_key` rather than `auth` because the same rule makes it terminal.
  const key = deps.key();
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: "no fal key is stored" });
  }
  return key;
}

// `logic/09` §Q74: a content-policy refusal is the provider's final answer, so it is named
// here and the wrapper makes it terminal. fal declines inside a 200: the safety checker
// flags the image and hands back a blank one. There is no sentence to quote, so this is
// the one refusal in the app whose words are the app's; fal's own verdict is the flag.
function refused(answer: z.infer<typeof generated>, prompt: string): void {
  const flags = answer.has_nsfw_concepts ?? [];
  if (flags.length > 0 && flags.every((flagged) => flagged)) {
    throw providerError({
      kind: "refusal",
      message: `fal's safety checker rejected every image for this prompt: ${redact(prompt)}`,
    });
  }
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
  // ceiling: everything else is `other` and is retried, so a 422 naming an input this
  // model does not take fails the same way four times over. A terminal kind for "this
  // request will never work" would have to be added to the port's error contract first,
  // which is not this adapter's to widen.
  return "other";
}

async function failure(response: Response): Promise<Error> {
  const text = await response.text().catch(() => "");
  // The provider's own words, verbatim, through the same redactor the wrapper uses: an
  // error body is free to quote the key back and this is the first place it is held.
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
