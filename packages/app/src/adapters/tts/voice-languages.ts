import { z } from "zod";

// What each provider's voice API says a voice speaks, reduced to lower-case primary language
// subtags ("es-MX" and "ES_MX" are both "es"). Undefined when the provider said nothing
// usable: an unknown voice speaks every language as far as the app is concerned.

export function primaryLanguages(
  values: readonly (string | null | undefined)[],
): readonly string[] | undefined {
  const codes = values.flatMap((value) => {
    const code = value?.trim().split(/[-_]/)[0]?.toLowerCase();
    return code !== undefined && /^[a-z]{2,3}$/.test(code) ? [code] : [];
  });
  return codes.length === 0 ? undefined : [...new Set(codes)];
}

// Asks once, briefly: the answer only fills a hint in Settings → Voices, so a slow or failed
// lookup is simply no answer.
export async function lookUp(
  fetcher: typeof globalThis.fetch,
  url: string,
  headers: Readonly<Record<string, string>>,
  signal: AbortSignal,
): Promise<unknown> {
  try {
    const response = await fetcher(url, {
      headers,
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return undefined;
    }
    return await response.json();
  } catch {
    signal.throwIfAborted();
    return undefined;
  }
}

// GET /v1/voices/{id}: `verified_languages[].language` (or `.locale`), and the older
// `labels.language` and `fine_tuning.language`.
const elevenLabsVoice = z.object({
  verified_languages: z
    .array(z.object({ language: z.string().nullish(), locale: z.string().nullish() }))
    .nullish(),
  labels: z.object({ language: z.string().nullish() }).partial().nullish(),
  fine_tuning: z.object({ language: z.string().nullish() }).partial().nullish(),
});
export function elevenLabsLanguages(body: unknown): readonly string[] | undefined {
  const parsed = elevenLabsVoice.safeParse(body);
  if (!parsed.success) return undefined;
  return primaryLanguages([
    ...(parsed.data.verified_languages ?? []).flatMap((one) => [one.language, one.locale]),
    parsed.data.labels?.language,
    parsed.data.fine_tuning?.language,
  ]);
}

// GET /voices/{id}: `language` (ISO 639-1) and `accents[].locale`.
const cartesiaVoice = z.object({
  language: z.string().nullish(),
  accents: z.array(z.object({ locale: z.string().nullish() })).nullish(),
});
export function cartesiaLanguages(body: unknown): readonly string[] | undefined {
  const parsed = cartesiaVoice.safeParse(body);
  if (!parsed.success) return undefined;
  return primaryLanguages([
    parsed.data.language,
    ...(parsed.data.accents ?? []).map((one) => one.locale),
  ]);
}

// GET /voices/v1/voices/{id}: `languageCode` ("en-US"), `langCode` ("EN_US") and, for a
// multilingual voice, `promptLanguages`.
const inworldVoice = z.object({
  languageCode: z.string().nullish(),
  langCode: z.string().nullish(),
  promptLanguages: z.array(z.string()).nullish(),
});
export function inworldLanguages(body: unknown): readonly string[] | undefined {
  const parsed = inworldVoice.safeParse(
    typeof body === "object" && body !== null && "voice" in body ? body.voice : body,
  );
  if (!parsed.success) return undefined;
  return primaryLanguages([
    parsed.data.languageCode,
    parsed.data.langCode,
    ...(parsed.data.promptLanguages ?? []),
  ]);
}
