// `logic/01` §Q4: a 429 naming a Retry-After replaces the fixed backoff for that wait.
// RFC 9110 allows seconds or an HTTP date; `Date.parse` is the platform's own reader for
// the second form, so no date parsing is written here.
//
// It sits beside the adapters rather than inside one because the rule is the retry
// policy's, not any provider's: four adapters read the same header off the same kind of
// response. Nothing else is shared between them.

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
