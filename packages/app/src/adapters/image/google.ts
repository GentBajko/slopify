import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { GeneratedImage, ImagePort, ImageRequest } from "../../kernel/ports/image.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import { retryAfter } from "../retry-after.js";
import { describeBytes, sniffImage } from "./bytes.js";

// The HTTP gateway adapter for Google's own image generation, billed to a Gemini API key
// rather than to a host reselling the same models. Like the OpenAI one it hands back the
// bytes with the call, so there is no link to follow; unlike it, the whole interaction is
// one `input` string and a `response_format`, with no per-model size table to keep.

export const googleImagesBase = "https://generativelanguage.googleapis.com/v1beta";

// The dropdown is filled from what the provider offers, and Google's model list carries every
// text and embedding model too, so the image shortlist is this adapter's own data. Named as
// Google markets them: "Nano Banana" is the family, `gemini-*-image` is what the API answers
// to, and the picker shows the name a user would recognise. Newest first.
//
// A Gemini model without the `-image` suffix returns text and cannot be used here, whatever
// its version number: `gemini-3.8-flash` is newer than all of these and generates no images.
export const googleImageModels: readonly ModelInfo[] = [
  { id: "gemini-3.1-flash-image", name: "Nano Banana 2" },
  { id: "gemini-3.1-flash-lite-image", name: "Nano Banana 2 Lite" },
  { id: "gemini-3-pro-image", name: "Nano Banana Pro" },
  { id: "gemini-2.5-flash-image", name: "Nano Banana" },
];

// The API takes the aspect in the run's own words, so the closest supported size is exact
// and the render crops nothing. `2K` is the middle of the documented ladder: enough to
// survive the 4x pre-scale the zoom needs without paying for 4K on every slide.
const imageSize = "2K";

export interface GoogleImageDeps {
  // Injected so a test never needs the network.
  readonly fetch: typeof globalThis.fetch;
  // Called for every request, never held.
  readonly key: () => string | undefined;
}

// A wire payload is narrowed, never cast. The image arrives as one content part of a
// `model_output` step, beside any text the model chose to write, so both the step and the
// part are searched for by type rather than read off a fixed index.
const content = z.object({
  type: z.string(),
  data: z.string().nullish(),
  mime_type: z.string().nullish(),
  text: z.string().nullish(),
});
const interaction = z.object({
  status: z.string().nullish(),
  steps: z.array(z.object({ type: z.string(), content: z.array(content).nullish() })).nullish(),
});

const errorBody = z.object({
  error: z.object({
    message: z.string().nullish(),
    status: z.string().nullish(),
    code: z.number().nullish(),
  }),
});

// A content-policy refusal is the provider's final answer and is never retried. Google
// names the safety verdict in the status string on a rejected request.
const refusalStatuses: readonly string[] = ["PERMISSION_DENIED", "FAILED_PRECONDITION"];
const refusalWords = /\b(safety|blocked|content polic|prohibited|violat)/i;

export function googleImage(deps: GoogleImageDeps): ImagePort {
  return {
    id: "google-image",
    models: (): Promise<readonly ModelInfo[]> => Promise.resolve(googleImageModels),
    generate: async (req: ImageRequest): Promise<GeneratedImage> => {
      const response = await deps.fetch(`${googleImagesBase}/interactions`, {
        method: "POST",
        signal: req.signal,
        // The key rides a header of Google's own rather than a query parameter, which would
        // put it in every proxy log between here and them.
        headers: { "x-goog-api-key": keyOf(deps), "Content-Type": "application/json" },
        body: JSON.stringify({
          model: req.model,
          input: req.prompt,
          // The stage sends Number as that many independent calls, one piece each, so one
          // image per request is what it asks for. Nothing about style is set: the stage
          // asks for the provider's own.
          response_format: { type: "image", aspect_ratio: req.aspect, image_size: imageSize },
        }),
      });
      if (!response.ok) {
        throw await failure(response);
      }
      return decode(imageOf(parse(await response.text())));
    },
  };
}

// The first image part of the first `model_output` step. A model that answered with prose
// and no picture is a failed attempt rather than an empty file on the project.
function imageOf(answer: z.infer<typeof interaction>): z.infer<typeof content> {
  for (const step of answer.steps ?? []) {
    if (step.type !== "model_output") {
      continue;
    }
    for (const part of step.content ?? []) {
      if (part.type === "image" && part.data !== undefined && part.data !== null) {
        return part;
      }
    }
  }
  throw providerError({ kind: "other", message: "Google answered with no image" });
}

// The bytes arrive with the call. They are still sniffed rather than trusted: what the port
// stores is a PNG or a JPEG, and a truncated payload that decodes to something else must
// not reach the disk. `mime_type` is read only to name what arrived in the error.
function decode(part: z.infer<typeof content>): GeneratedImage {
  const bytes = new Uint8Array(Buffer.from(part.data ?? "", "base64"));
  const mime = sniffImage(bytes);
  if (mime === undefined) {
    const claimed = part.mime_type ?? "nothing";
    throw providerError({
      kind: "other",
      message: `Google called it ${claimed} but it decoded to ${describeBytes(bytes)} rather than a PNG or a JPEG`,
    });
  }
  return { bytes, mime };
}

function keyOf(deps: GoogleImageDeps): string {
  // `missing_key`, not `auth`, because that rule makes it terminal.
  const key = deps.key();
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: "no Google key is stored" });
  }
  return key;
}

// Only the adapter sees the vendor's status code, so only the adapter names the kind.
function kindOf(
  status: number,
  named: string | null | undefined,
  message: string,
): ProviderErrorKind {
  if (named !== undefined && named !== null && refusalStatuses.includes(named)) {
    return "refusal";
  }
  // ceiling: a safety block that arrives as a plain 400 is read off the sentence, because
  // the body carries no machine-readable reason for one. A phrase this list does not know
  // costs the user three more attempts; a structured field would settle it.
  if (status === 400 && refusalWords.test(message)) {
    return "refusal";
  }
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  // ceiling: everything else is `other` and is retried, so a prompt past the model's limit
  // fails the same way four times over. A terminal "this will never work" kind has to reach
  // the port's error contract first, which is not this adapter's to widen.
  return "other";
}

async function failure(response: Response): Promise<Error> {
  const text = await response.text().catch(() => "");
  const parsed = errorBody.safeParse(safeJson(text));
  // The provider's own words, through the redactor - an error body may quote the key back.
  const named = parsed.success ? parsed.data.error.status : undefined;
  const message = redact(
    (parsed.success ? parsed.data.error.message : undefined) ?? text.trim() ?? response.statusText,
  );
  const retryAfterMs = retryAfter(response.headers.get("retry-after"));
  return providerError({
    kind: kindOf(response.status, named, message),
    message: `Google answered ${String(response.status)}: ${message || response.statusText}`,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

function parse(text: string): z.infer<typeof interaction> {
  const parsed = interaction.safeParse(safeJson(text));
  if (!parsed.success) {
    throw providerError({
      kind: "other",
      message: "Google's answer was not in the shape this app can read",
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
