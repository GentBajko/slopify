import { type ModelAccess, type ProviderErrorKind, providerError } from "../kernel/ports/model.js";
import { missingKey } from "./explain.js";
import { retryAfter } from "./retry-after.js";

// The plumbing every HTTP provider adapter repeats around a failed call. What the provider
// said and which sentence it earns stay in each adapter; only the shape is shared.

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// The body of a failed response, or nothing when it cannot be read.
export async function failureText(response: Response): Promise<string> {
  return await response.text().catch(() => "");
}

// Only the adapter sees the vendor's status code, so only the adapter names the kind.
export function kindOfStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  // ceiling: everything else is `other` and is retried, so a request the provider will never
  // accept fails the same way four times over. A terminal "this will never work" kind has to
  // reach the port's error contract first, which is not an adapter's to widen.
  // The provider's own server failed; the same request may well succeed later.
  if (status >= 500) return "dropped";
  return "other";
}

// `missing_key`, not `auth`, because that rule makes it terminal: an absent key never becomes
// a request.
export function requireKey(key: string | undefined, provider: string): string {
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: missingKey(provider) });
  }
  return key;
}

// A 429's Retry-After replaces the fixed backoff; `fallbackRetryMs` is the provider's own
// hint, used when the header is absent. `access` is what the failure says about the chosen
// model (see model-access.ts); it never changes the kind.
export function httpProviderError(
  response: Response,
  kind: ProviderErrorKind,
  message: string,
  fallbackRetryMs?: number | undefined,
  access?: ModelAccess | undefined,
): Error {
  const retryAfterMs = retryAfter(response.headers.get("retry-after")) ?? fallbackRetryMs;
  return providerError({
    kind,
    message,
    ...(access === undefined ? {} : { access }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}
