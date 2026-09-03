// The vocabulary that crosses the provider seam. Domain types only: a vendor's payload
// shape never leaves its adapter (01-architecture §Q10, §Q33).

export const providerFamilies = ["llm", "tts", "image"] as const;
export type ProviderFamily = (typeof providerFamilies)[number];

// What Play's model dropdown is filled from, fetched per load (`logic/02` §Q15).
export interface ModelInfo {
  readonly id: string;
  readonly name: string;
}

// What Settings and Play both read per provider. `hasKey` and `installed` are the two
// ways a provider can be usable; neither carries key material. It lives here because
// the registry lists it and the kernel may not import the settings slice that fills it.
export type Readiness =
  | { readonly kind: "keyed"; readonly hasKey: boolean }
  | { readonly kind: "cli"; readonly installed: boolean; readonly version?: string };

export const providerErrorKinds = [
  "auth",
  // Distinct from `auth`, which is a key the provider rejected. `logic/02` §Q13 splits
  // them: a bad key runs the whole retry policy (§Q11) and an absent one "fails
  // immediately, without retries", so the wrapper needs two kinds to tell apart.
  "missing_key",
  "rate_limit",
  "refusal",
  "unsupported",
  "timeout",
  "other",
] as const;
export type ProviderErrorKind = (typeof providerErrorKinds)[number];

export interface ProviderFault {
  readonly kind: ProviderErrorKind;
  // `logic/01` §Q4: a 429 carrying Retry-After replaces the fixed backoff for that wait.
  readonly retryAfterMs?: number | undefined;
}

// An Error, so a stack survives and every existing catch still works, carrying the one
// field the attempt wrapper reads. Adapters name the kind because only the adapter can
// read the vendor's status code; nothing downstream classifies again (03-standards).
export type ProviderError = Error & { readonly fault: ProviderFault };

export interface ProviderErrorInit {
  readonly kind: ProviderErrorKind;
  // The provider's own words, verbatim: `logic/01` unhappy paths show this on the stage.
  readonly message: string;
  readonly retryAfterMs?: number | undefined;
}

export function providerError(init: ProviderErrorInit): ProviderError {
  return Object.assign(new Error(init.message), {
    fault: {
      kind: init.kind,
      ...(init.retryAfterMs === undefined ? {} : { retryAfterMs: init.retryAfterMs }),
    },
  });
}

export function isProviderError(value: unknown): value is ProviderError {
  if (!(value instanceof Error) || !("fault" in value)) {
    return false;
  }
  const fault: unknown = value.fault;
  if (typeof fault !== "object" || fault === null || !("kind" in fault)) {
    return false;
  }
  const kinds: readonly string[] = providerErrorKinds;
  return typeof fault.kind === "string" && kinds.includes(fault.kind);
}
