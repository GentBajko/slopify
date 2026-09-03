import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { LlmCompletion, LlmEvent, LlmPort, Usage } from "../../kernel/ports/llm.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import { sseData } from "./sse-lines.js";

// The HTTP gateway adapter (01-architecture Module boundaries). `fetch` plus the line
// reader beside this file, no SDK: 05-dependencies records global `fetch` at rung 3 and
// the reader at rung 6, so nothing here is worth a dependency.

export const openRouterBase = "https://openrouter.ai/api/v1";

export interface OpenRouterDeps {
  // Injected so a test never needs the network and `main.ts` owns the real one.
  readonly fetch: typeof globalThis.fetch;
  // Called for every request, never held: an attempt in flight finishes on the key it
  // started with and the next one picks up a key saved since (`logic/02` §Q16).
  readonly key: () => string | undefined;
}

// OpenRouter ranks apps by these two headers; they carry no user data.
const appHeaders = {
  "HTTP-Referer": "https://slopify.stream",
  "X-Title": "Slopify",
} as const;

// A wire payload is narrowed, never cast: everything unlisted is dropped at the seam so
// no vendor shape can leak past this file (01-architecture §Q10, §Q33).
const modelList = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string().optional() })),
});

const errorBody = z.object({
  error: z.object({ message: z.string(), code: z.union([z.number(), z.string()]).optional() }),
});

const streamChunk = z.object({
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish() }).optional(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullish(),
  error: z
    .object({ message: z.string(), code: z.union([z.number(), z.string()]).optional() })
    .optional(),
});

export function openRouterLlm(deps: OpenRouterDeps): LlmPort {
  async function* complete(req: LlmCompletion): AsyncGenerator<LlmEvent> {
    const response = await deps.fetch(`${openRouterBase}/chat/completions`, {
      method: "POST",
      signal: req.signal,
      headers: { ...headers(deps.key()), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        stream: true,
        // The usage-accounting flag: without it the final chunk carries no token counts
        // and the Usage page would have nothing to count (`logic/16`).
        usage: { include: true },
        // `logic/06` §Q47: web grounding is asked for explicitly. OpenRouter runs the
        // search itself, so the plugin works whatever model was picked.
        ...(req.webSearch === true ? { plugins: [{ id: "web" }] } : {}),
      }),
    });
    if (!response.ok) {
      throw await failure(response);
    }
    if (response.body === null) {
      throw providerError({ kind: "other", message: "OpenRouter answered with no body" });
    }

    let usage: Usage | null = null;
    let finishReason: string | null = null;
    let complete = false;
    for await (const data of sseData(response.body, req.signal)) {
      if (data === "") {
        continue;
      }
      if (data === "[DONE]") {
        complete = true;
        break;
      }
      const chunk = parseChunk(data);
      if (chunk.error !== undefined) {
        // A stream that has already answered 200 reports a mid-flight failure in a data
        // frame; without this the stage would store half an article as a success.
        throw providerError({
          kind: kindOf(statusOf(chunk.error.code)),
          message: redact(chunk.error.message),
        });
      }
      const choice = chunk.choices?.[0];
      const text = choice?.delta?.content;
      if (text !== undefined && text !== null && text !== "") {
        yield { type: "delta", text };
      }
      if (choice?.finish_reason !== undefined && choice.finish_reason !== null) {
        // It arrives on the last choice chunk, one frame before the usage frame, so it is
        // held rather than read off whichever chunk happens to be last (`logic/07` §Q59
        // reads it to tell a finished article from a truncated one).
        finishReason = choice.finish_reason;
      }
      if (chunk.usage !== undefined && chunk.usage !== null) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
        complete = true;
      }
    }
    if (!complete) {
      // Neither `[DONE]` nor the usage frame arrived, so the connection dropped part-way.
      // Saying so is what stops a truncated answer being stored as a whole one.
      throw providerError({
        kind: "other",
        message: "OpenRouter's stream ended before the response was complete",
      });
    }
    yield { type: "done", usage, finishReason };
  }

  return {
    id: "openrouter",
    capabilities: { streams: true, reportsUsage: true, webSearch: true },
    models: async (): Promise<readonly ModelInfo[]> => {
      const response = await deps.fetch(`${openRouterBase}/models`, {
        headers: headers(deps.key()),
      });
      if (!response.ok) {
        throw await failure(response);
      }
      const parsed = modelList.safeParse(await response.json());
      if (!parsed.success) {
        throw providerError({
          kind: "other",
          message: "OpenRouter's model list was not in the shape this app can read",
        });
      }
      return parsed.data.data.map((model) => ({ id: model.id, name: model.name ?? model.id }));
    },
    complete,
  };
}

function headers(key: string | undefined): Record<string, string> {
  // `logic/02` §Q13: an attempt that finds no key fails rather than calling anonymously
  // and being told off by the provider in words the user cannot act on.
  if (key === undefined || key === "") {
    throw providerError({ kind: "auth", message: "no OpenRouter key is stored" });
  }
  return { Authorization: `Bearer ${key}`, ...appHeaders };
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
  // ceiling: everything else is `other` and is retried. 400 and 402 will fail the same
  // way four times over; a terminal kind for "this request will never work" would have to
  // be added to the port's error contract first, which is not this adapter's to widen.
  return "other";
}

async function failure(response: Response): Promise<Error> {
  const text = await response.text().catch(() => "");
  const parsed = errorBody.safeParse(safeJson(text));
  // The provider's own words, verbatim, through the same redactor the wrapper uses: an
  // error body is free to quote the key back and this is the first place it is held.
  const message = redact(
    parsed.success ? parsed.data.error.message : text.trim() || response.statusText,
  );
  const retryAfterMs = retryAfter(response.headers.get("retry-after"));
  return providerError({
    kind: kindOf(response.status),
    message: `OpenRouter answered ${response.status}: ${message}`,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

// `logic/01` §Q4: a 429 naming a Retry-After replaces the fixed backoff for that wait.
// RFC 9110 allows seconds or an HTTP date; `Date.parse` is the platform's own reader for
// the second form, so no date parsing is written here.
export function retryAfter(header: string | null): number | undefined {
  if (header === null) {
    return undefined;
  }
  const value = header.trim();
  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }
  const at = Date.parse(value);
  if (Number.isNaN(at)) {
    return undefined;
  }
  return Math.max(0, at - Date.now());
}

function statusOf(code: number | string | undefined): number {
  return typeof code === "number" ? code : Number(code ?? 0);
}

function parseChunk(data: string): z.infer<typeof streamChunk> {
  const parsed = streamChunk.safeParse(safeJson(data));
  if (!parsed.success) {
    // A frame that will not parse is a stream cut mid-line or a payload this app does not
    // understand. Either way the answer is incomplete, and the text is not echoed back:
    // a half-written frame is noise, and the wrapper stores whatever is thrown.
    throw providerError({
      kind: "other",
      message: "OpenRouter sent a stream frame this app could not read",
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
