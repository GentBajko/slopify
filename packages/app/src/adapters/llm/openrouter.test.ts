import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LlmEvent, Message } from "../../kernel/ports/llm.js";
import { isProviderError } from "../../kernel/ports/model.js";
import type { OpenRouterDeps } from "./openrouter.js";
import { openRouterBase, openRouterLlm, retryAfter } from "./openrouter.js";

// Fixture provenance: `fixtures/openrouter-*.txt` are constructed, not captured. No
// OpenRouter key exists on this machine or in `~/.slopify/slopify.db`, so the live third
// of the spike did not run. The framing is transcribed from OpenRouter's own streaming
// reference (the ": OPENROUTER PROCESSING" keep-alive comment, the `data:` frames, the
// `data: [DONE]` terminator, usage on the final frame) and the error envelope from its
// API reference; the token values are invented.

const key = "sk-or-v1-0123456789abcdef0123456789abcdef";

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

// The recorded bytes, handed back a few at a time so the adapter meets every awkward
// chunk boundary the network can produce.
function streamed(text: string, size = 13): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller): void {
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}

interface Seen {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function replaying(
  response: Response,
  seen: Seen[] = [],
): { readonly fetch: OpenRouterDeps["fetch"]; readonly seen: Seen[] } {
  const fake: OpenRouterDeps["fetch"] = (input, init) => {
    seen.push({ url: String(input), init });
    return Promise.resolve(response);
  };
  return { fetch: fake, seen };
}

function streaming(body: string, seen: Seen[] = []): OpenRouterDeps["fetch"] {
  return (input, init) => {
    seen.push({ url: String(input), init });
    return Promise.resolve(new Response(streamed(body), { status: 200 }));
  };
}

function authOf(call: Seen): string {
  const headers = call.init?.headers;
  return headers === undefined ? "" : String((headers as Record<string, string>).Authorization);
}

const messages: readonly Message[] = [{ role: "user", content: "What is SSE?" }];

async function drain(port: ReturnType<typeof openRouterLlm>): Promise<LlmEvent[]> {
  const out: LlmEvent[] = [];
  for await (const event of port.complete({
    model: "openai/gpt-4o-mini",
    messages,
    signal: new AbortController().signal,
  })) {
    out.push(event);
  }
  return out;
}

describe("openRouterLlm.complete", () => {
  it("replays the recorded stream into deltas, usage and the finish reason", async () => {
    const port = openRouterLlm({
      fetch: streaming(fixture("openrouter-stream.txt")),
      key: () => key,
    });
    expect(await drain(port)).toEqual([
      { type: "delta", text: "Server-Sent " },
      { type: "delta", text: "Events aré " },
      { type: "delta", text: "one-way 𝄞 push." },
      { type: "done", usage: { inputTokens: 14, outputTokens: 23 }, finishReason: "stop" },
    ]);
  });

  it("keeps the finish reason that arrived a frame before the usage frame", async () => {
    const port = openRouterLlm({
      fetch: streaming(fixture("openrouter-length.txt")),
      key: () => key,
    });
    const events = await drain(port);
    // `logic/07` §Q59 starts a continuation off this, so reading it off the usage frame -
    // which carries no choices at all - would silently truncate every long article.
    expect(events.at(-1)).toEqual({
      type: "done",
      usage: { inputTokens: 9, outputTokens: 4096 },
      finishReason: "length",
    });
  });

  it("sends the key, the app headers, the streaming flag and usage accounting", async () => {
    const seen: Seen[] = [];
    const port = openRouterLlm({
      fetch: streaming(fixture("openrouter-stream.txt"), seen),
      key: () => key,
    });
    await drain(port);
    const call = seen[0];
    expect(call?.url).toBe(`${openRouterBase}/chat/completions`);
    const headers = call?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${key}`);
    expect(headers["X-Title"]).toBe("Slopify");
    expect(headers["HTTP-Referer"]).toBe("https://slopify.stream");
    expect(JSON.parse(String(call?.init?.body))).toMatchObject({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "What is SSE?" }],
      stream: true,
      usage: { include: true },
    });
  });

  it("asks for the web plugin only when the caller asked for grounding", async () => {
    const seen: Seen[] = [];
    const port = openRouterLlm({
      fetch: streaming(fixture("openrouter-stream.txt"), seen),
      key: () => key,
    });
    for await (const _event of port.complete({
      model: "m",
      messages,
      signal: new AbortController().signal,
    })) {
      // drained for its side effect on `seen`
    }
    expect(JSON.parse(String(seen[0]?.init?.body)).plugins).toBeUndefined();

    for await (const _event of port.complete({
      model: "m",
      messages,
      webSearch: true,
      signal: new AbortController().signal,
    })) {
      // drained for its side effect on `seen`
    }
    expect(JSON.parse(String(seen[1]?.init?.body)).plugins).toEqual([{ id: "web" }]);
  });

  it("reads the key again for every attempt so a key saved mid-run reaches the next one", async () => {
    const seen: Seen[] = [];
    let stored = "sk-or-v1-first";
    const port = openRouterLlm({
      fetch: streaming(fixture("openrouter-stream.txt"), seen),
      key: () => stored,
    });
    await drain(port);
    stored = "sk-or-v1-second";
    await drain(port);
    expect(seen.map(authOf)).toEqual(["Bearer sk-or-v1-first", "Bearer sk-or-v1-second"]);
  });

  it("fails without calling the provider when no key is stored", async () => {
    let called = 0;
    const port = openRouterLlm({
      fetch: () => {
        called += 1;
        return Promise.resolve(new Response(null, { status: 200 }));
      },
      key: () => undefined,
    });
    const error: unknown = await drain(port).catch((thrown: unknown) => thrown);
    // `logic/02` §Q13: an absent key is terminal, so it carries the kind the wrapper does
    // not retry rather than the `auth` kind a rejected key carries (§Q11).
    expect(isProviderError(error) && error.fault.kind).toBe("missing_key");
    expect(String(error)).toContain("no OpenRouter key is stored");
    expect(called).toBe(0);
  });

  it("names a 401 an auth failure and quotes the provider", async () => {
    const body = JSON.stringify({ error: { code: 401, message: "No auth credentials found" } });
    const port = openRouterLlm({
      ...replaying(new Response(body, { status: 401 })),
      key: () => key,
    });
    const error: unknown = await drain(port).catch((thrown: unknown) => thrown);
    expect(isProviderError(error) && error.fault.kind).toBe("auth");
    expect(String(error)).toContain("No auth credentials found");
    expect(String(error)).toContain("401");
  });

  it("names a 429 a rate limit and carries the provider's Retry-After", async () => {
    const body = JSON.stringify({ error: { code: 429, message: "Rate limit exceeded" } });
    const port = openRouterLlm({
      ...replaying(new Response(body, { status: 429, headers: { "Retry-After": "12" } })),
      key: () => key,
    });
    const error: unknown = await drain(port).catch((thrown: unknown) => thrown);
    expect(isProviderError(error) && error.fault.kind).toBe("rate_limit");
    expect(isProviderError(error) && error.fault.retryAfterMs).toBe(12_000);
    expect(String(error)).toContain("Rate limit exceeded");
  });

  it("names a 400 an other failure and quotes it", async () => {
    const body = JSON.stringify({
      error: { code: 400, message: "openai/gpt-4o-mini is not a valid model ID" },
    });
    const port = openRouterLlm({
      ...replaying(new Response(body, { status: 400 })),
      key: () => key,
    });
    const error: unknown = await drain(port).catch((thrown: unknown) => thrown);
    expect(isProviderError(error) && error.fault.kind).toBe("other");
    expect(String(error)).toContain("is not a valid model ID");
  });

  it("quotes a body that is not the documented envelope", async () => {
    const port = openRouterLlm({
      ...replaying(new Response("<html>upstream is down</html>", { status: 502 })),
      key: () => key,
    });
    await expect(drain(port)).rejects.toThrow("upstream is down");
  });

  it("never lets the key reach the error a failed call throws", async () => {
    // A provider is free to quote the key back; the wrapper redacts, and so does this.
    const body = JSON.stringify({
      error: { code: 401, message: `the key ${key} is not valid` },
    });
    const port = openRouterLlm({
      ...replaying(new Response(body, { status: 401 })),
      key: () => key,
    });
    const error: unknown = await drain(port).catch((thrown: unknown) => thrown);
    const text = `${String(error)}${error instanceof Error ? error.stack : ""}`;
    expect(text).not.toContain(key);
    expect(text).toContain("[redacted]");
  });

  it("fails a stream that stops part-way rather than storing half an answer", async () => {
    const port = openRouterLlm({
      fetch: streaming(fixture("openrouter-truncated.txt")),
      key: () => key,
    });
    const error: unknown = await drain(port).catch((thrown: unknown) => thrown);
    expect(isProviderError(error) && error.fault.kind).toBe("other");
    expect(String(error)).toMatch(/could not read|before the response was complete/);
  });

  it("fails on an error frame that arrives after the 200", async () => {
    const port = openRouterLlm({
      fetch: streaming(fixture("openrouter-midstream-error.txt")),
      key: () => key,
    });
    const error: unknown = await drain(port).catch((thrown: unknown) => thrown);
    expect(isProviderError(error) && error.fault.kind).toBe("rate_limit");
    expect(String(error)).toContain("Provider returned error");
  });

  it("fails when the response carries no body at all", async () => {
    const port = openRouterLlm({
      ...replaying(new Response(null, { status: 200 })),
      key: () => key,
    });
    await expect(drain(port)).rejects.toThrow("no body");
  });
});

describe("openRouterLlm.models", () => {
  it("maps the model list to ids and names", async () => {
    const body = JSON.stringify({
      data: [
        {
          id: "openai/gpt-4o-mini",
          name: "OpenAI: GPT-4o-mini",
          pricing: { prompt: "0.00000015" },
        },
        { id: "anthropic/claude-sonnet-4.5" },
      ],
      total_count: 2,
    });
    const port = openRouterLlm({
      ...replaying(new Response(body, { status: 200 })),
      key: () => key,
    });
    expect(await port.models()).toEqual([
      { id: "openai/gpt-4o-mini", name: "OpenAI: GPT-4o-mini" },
      { id: "anthropic/claude-sonnet-4.5", name: "anthropic/claude-sonnet-4.5" },
    ]);
  });

  it("fails when the list is unreachable, which blocks Play for this provider", async () => {
    const port = openRouterLlm({
      ...replaying(new Response("", { status: 503 })),
      key: () => key,
    });
    await expect(port.models()).rejects.toThrow("OpenRouter answered 503");
  });

  it("fails when the list is not the shape this app reads", async () => {
    const port = openRouterLlm({
      ...replaying(new Response(JSON.stringify({ models: [] }), { status: 200 })),
      key: () => key,
    });
    await expect(port.models()).rejects.toThrow("not in the shape");
  });
});

describe("retryAfter", () => {
  it("reads the seconds form", () => {
    expect(retryAfter("30")).toBe(30_000);
  });

  it("reads the HTTP-date form as the wait from now", () => {
    const at = new Date(Date.now() + 20_000).toUTCString();
    const waited = retryAfter(at) ?? 0;
    expect(waited).toBeGreaterThan(18_000);
    expect(waited).toBeLessThanOrEqual(21_000);
  });

  it("answers nothing for an absent or unreadable header", () => {
    expect(retryAfter(null)).toBeUndefined();
    expect(retryAfter("soon")).toBeUndefined();
  });

  it("never asks for a wait in the past", () => {
    expect(retryAfter(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });
});

describe("openRouterLlm capabilities", () => {
  it("declares what the gateway can do", () => {
    const port = openRouterLlm({
      ...replaying(new Response(null, { status: 200 })),
      key: () => key,
    });
    expect(port.id).toBe("openrouter");
    expect(port.capabilities).toEqual({ streams: true, reportsUsage: true, webSearch: true });
  });
});
