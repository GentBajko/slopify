import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { KeyProbe, KeyProbes } from "../../kernel/ports/key-probe.js";
import { keyGuides } from "./key-guides.js";
import { keyWithShared } from "./keys.js";
import type { ProviderId } from "./model.js";
import { providerById } from "./model.js";

// What the Test button found. `ok` is the only thing the screen needs to colour the line;
// `message` says what happened and, when it failed, exactly what to do.
export const keyTestResults = [
  "valid",
  "no-key",
  "rejected",
  "forbidden",
  "no-credit",
  "rate-limited",
  "provider-down",
  "unreachable",
  "unexpected",
] as const;
export type KeyTestResult = (typeof keyTestResults)[number];
export interface KeyTestOutcome {
  readonly provider: ProviderId;
  readonly result: KeyTestResult;
  readonly ok: boolean;
  readonly message: string;
  readonly checkedAt: string;
}

export type KeyTestAnswer =
  | { readonly status: number; readonly body?: string }
  | { readonly failure: "timeout" | "network" }
  | { readonly failure: "no-key" };

// The mapping from what came back to what the user reads. Pure, so every branch is tested
// without a network.
export function keyTestOutcome(
  provider: ProviderId,
  answer: KeyTestAnswer,
  checkedAt: string,
  badKey?: KeyProbe["badKey"],
): KeyTestOutcome {
  const name = providerById(provider).displayName;
  const guide = keyGuides[provider];
  const keyPage = guide === undefined ? "the provider's website" : guide.keyPage.url;
  const billing = guide?.billing?.url;
  const place = `Settings → Providers → ${name}`;
  const done = (result: KeyTestResult, message: string): KeyTestOutcome => ({
    provider,
    result,
    ok: result === "valid",
    message,
    checkedAt,
  });
  if ("failure" in answer) {
    if (answer.failure === "no-key")
      return done(
        "no-key",
        `No ${name} key is saved yet. Make one at ${keyPage}, paste it in ${place} and choose Save, then Test.`,
      );
    return done(
      "unreachable",
      answer.failure === "timeout"
        ? `${name} did not answer within 15 seconds, so the key could not be checked. Check your internet connection, then choose Test again.`
        : `Slopify could not reach ${name}, so the key could not be checked. Check your internet connection (and any firewall or proxy), then choose Test again.`,
    );
  }
  const { status } = answer;
  if (status >= 200 && status < 300)
    return done(
      "valid",
      provider === "openrouter"
        ? `${name} accepted this key.`
        : `${name} accepted this key. The account's credit is only checked when Slopify first generates with it.`,
    );
  if (status === 401 || badKey?.(status, answer.body ?? "") === true)
    return done(
      "rejected",
      `${name} did not accept this key (HTTP ${status}): it is mistyped, revoked or for another account. Make a new key at ${keyPage}, paste it in ${place}, choose Save, then Test again.`,
    );
  if (status === 402)
    return done(
      "no-credit",
      `${name} accepted the key but the account has no credit or payment method (HTTP 402). Add credit${billing === undefined ? " in your account" : ` at ${billing}`}, then choose Test again.`,
    );
  if (status === 403)
    return done(
      "forbidden",
      `${name} recognised the key but refused this request (HTTP 403). The key may be restricted, or the account may need verifying or billing set up. ${guide?.permissions ?? ""} Fix it at ${keyPage}, then choose Test again.`.replace(
        /\s+/g,
        " ",
      ),
    );
  if (status === 429)
    return done(
      "rate-limited",
      `${name} said "too many requests" (HTTP 429), so the key could not be checked just now. It is usually valid; wait a minute and choose Test again. If it keeps happening, check the account's limits and credit${billing === undefined ? "" : ` at ${billing}`}.`,
    );
  if (status >= 500)
    return done(
      "provider-down",
      `${name} had a problem on its side (HTTP ${status}), so the key could not be checked. Wait a few minutes and choose Test again.`,
    );
  return done(
    "unexpected",
    `${name} answered the key check with HTTP ${status}, which Slopify did not expect. Check the key at ${keyPage}, then choose Test again; if it keeps happening, use Download diagnostics in Settings and report it.`,
  );
}

export interface KeyTestDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly fetch: typeof globalThis.fetch;
  // Each provider's cheapest authenticated read (adapters/key-probes.ts).
  readonly probes: KeyProbes;
}
// The Test button. The key is read for this one request, sent only to its own provider, and
// never appears in the answer, a log line or an error. `pasted` is a key typed into the field
// and not saved yet: it is tried instead of the saved one and is not stored.
export async function testProviderKey(
  deps: KeyTestDeps,
  provider: ProviderId,
  pasted?: string,
): Promise<KeyTestOutcome> {
  const at = () => deps.clock.now().toISOString();
  const probe = Object.hasOwn(deps.probes, provider) ? deps.probes[provider] : undefined;
  if (probe === undefined || providerById(provider).auth !== "key")
    throw new Error(`${provider} has no key to test`);
  const candidate = pasted?.trim();
  const key =
    candidate === undefined || candidate === "" ? keyWithShared(deps.db, provider) : candidate;
  if (key === undefined) return keyTestOutcome(provider, { failure: "no-key" }, at());
  const outcome = await probeKey(deps, provider, probe, key, at);
  return candidate === undefined || candidate === "" || !outcome.ok
    ? outcome
    : { ...outcome, message: `${outcome.message} It is not saved yet: choose Save to keep it.` };
}

async function probeKey(
  deps: KeyTestDeps,
  provider: ProviderId,
  probe: KeyProbe,
  key: string,
  at: () => string,
): Promise<KeyTestOutcome> {
  let status: number;
  let body = "";
  try {
    const response = await deps.fetch(probe.url, {
      headers: probe.headers(key),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    status = response.status;
    // Only an error body is read, and only its start: enough for the provider's error code.
    body = status >= 400 ? (await response.text()).slice(0, 4096) : "";
    if (status < 400) await response.body?.cancel().catch(() => {});
  } catch (error) {
    const timeout =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return keyTestOutcome(provider, { failure: timeout ? "timeout" : "network" }, at());
  }
  return keyTestOutcome(provider, { status, body }, at(), probe.badKey);
}
