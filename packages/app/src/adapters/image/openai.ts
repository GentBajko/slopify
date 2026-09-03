import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { GeneratedImage, ImagePort, ImageRequest } from "../../kernel/ports/image.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import { retryAfter } from "../retry-after.js";
import { describeBytes, sniffImage } from "./bytes.js";

// The HTTP gateway adapter for OpenAI's images endpoint: the platform's own `fetch` and
// nothing else, because the whole call is one request. Unlike fal and Replicate this one
// hands back the image itself - a GPT image model always answers with base64, never a URL -
// so there is no link to follow.

export const openAiImagesBase = "https://api.openai.com/v1";

// The dropdown is filled from what the provider offers, and `/v1/models`
// lists every model on the account, chat and embeddings among them, so the image
// shortlist is this adapter's own data. These are the four GPT image models OpenAI
// documents; adding the next one is a line here and no code change anywhere else.
export const openAiImageModels: readonly ModelInfo[] = [
  { id: "gpt-image-2", name: "GPT Image 2" },
  { id: "gpt-image-1.5", name: "GPT Image 1.5" },
  { id: "gpt-image-1", name: "GPT Image 1" },
  { id: "gpt-image-1-mini", name: "GPT Image 1 mini" },
];

// The provider's closest supported size to the run's aspect. The standard GPT image sizes are
// 3:2 and 2:3, so 16:9 is asked for as 1536×1024 and the remaining sliver is cropped by the
// render.
const standard: Readonly<Record<ImageRequest["aspect"], string>> = {
  "16:9": "1536x1024",
  "9:16": "1024x1536",
};
// gpt-image-2 takes an arbitrary WIDTH×HEIGHT whose sides divide by 16, between 1:3 and
// 3:1, so on that model the closest supported size is the aspect exactly and the render
// crops nothing.
const exact: Readonly<Record<ImageRequest["aspect"], string>> = {
  "16:9": "1536x864",
  "9:16": "864x1536",
};
const arbitrarySizes = /^gpt-image-2/;

export interface OpenAiImageDeps {
  // Injected so a test never needs the network.
  readonly fetch: typeof globalThis.fetch;
  // Called for every request, never held.
  readonly key: () => string | undefined;
}

// A wire payload is narrowed, never cast.
const generated = z.object({ data: z.array(z.object({ b64_json: z.string().nullish() })) });

const errorBody = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    code: z.string().nullish(),
  }),
});

// A content-policy refusal is the provider's final answer and is never
// retried. OpenAI names it in the body rather than in the status, so the code is what
// tells a declined prompt from a malformed request that shares its 400.
const refusalCodes: readonly string[] = ["moderation_blocked", "content_policy_violation"];

export function sizeFor(model: string, aspect: ImageRequest["aspect"]): string {
  return arbitrarySizes.test(model) ? exact[aspect] : standard[aspect];
}

export function openAiImage(deps: OpenAiImageDeps): ImagePort {
  return {
    id: "openai-image",
    models: (): Promise<readonly ModelInfo[]> => Promise.resolve(openAiImageModels),
    generate: async (req: ImageRequest): Promise<GeneratedImage> => {
      const response = await deps.fetch(`${openAiImagesBase}/images/generations`, {
        method: "POST",
        signal: req.signal,
        headers: { Authorization: `Bearer ${keyOf(deps)}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: req.model,
          prompt: req.prompt,
          // The stage sends Number as that many independent calls, one piece each, so one
          // image per request is what it asks for.
          n: 1,
          size: sizeFor(req.model, req.aspect),
          // No `quality` and no `background`: the stage asks for the provider's default
          // quality and style, which is what leaving them off means.
        }),
      });
      if (!response.ok) {
        throw await failure(response);
      }
      const first = parse(await response.text()).data[0]?.b64_json;
      if (first === undefined || first === null || first === "") {
        throw providerError({ kind: "other", message: "OpenAI answered with no image" });
      }
      return decode(first);
    },
  };
}

// A GPT image model always answers with base64, so the bytes arrive with the call and
// there is no link to follow. They are still sniffed: what the port stores is a PNG or a
// JPEG, and a truncated payload that decodes to something else must not reach the disk.
function decode(b64: string): GeneratedImage {
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  const mime = sniffImage(bytes);
  if (mime === undefined) {
    throw providerError({
      kind: "other",
      message: `OpenAI's image decoded to ${describeBytes(bytes)} rather than a PNG or a JPEG`,
    });
  }
  return { bytes, mime };
}

function keyOf(deps: OpenAiImageDeps): string {
  // `missing_key`, not `auth`, because that rule makes it terminal.
  const key = deps.key();
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: "no OpenAI image key is stored" });
  }
  return key;
}

// Only the adapter sees the vendor's status code, so only the adapter names the kind.
function kindOf(status: number, code: string | null | undefined): ProviderErrorKind {
  if (code !== undefined && code !== null && refusalCodes.includes(code)) {
    return "refusal";
  }
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  // ceiling: everything else is `other` and is retried, so a prompt past the model's length
  // limit fails the same way four times over. A terminal "this will never work" kind has to
  // reach the port's error contract first, which is not this adapter's to widen.
  return "other";
}

async function failure(response: Response): Promise<Error> {
  const text = await response.text().catch(() => "");
  const parsed = errorBody.safeParse(safeJson(text));
  // The provider's own words, through the redactor - an error body may quote the key back.
  const message = redact(
    parsed.success ? parsed.data.error.message : text.trim() || response.statusText,
  );
  const retryAfterMs = retryAfter(response.headers.get("retry-after"));
  return providerError({
    kind: kindOf(response.status, parsed.success ? parsed.data.error.code : undefined),
    message: `OpenAI answered ${String(response.status)}: ${message}`,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

function parse(text: string): z.infer<typeof generated> {
  const parsed = generated.safeParse(safeJson(text));
  if (!parsed.success) {
    throw providerError({
      kind: "other",
      message: "OpenAI's answer was not in the shape this app can read",
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
