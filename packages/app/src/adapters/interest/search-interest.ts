import { z } from "zod";
import type { InterestResult, TopicInterest } from "../../kernel/ports/interest.js";

// Public search interest without a key: Google's search suggestions (DuckDuckGo's when Google
// doesn't answer) and the Wikipedia article's views last month. Checked keyless on 2026-10-18;
// Google Trends answers 429/404 to such calls, so it isn't asked.

// ceiling: one service that hangs costs a topic this long at most.
export const interestRequestMs = 4000;

const suggestAnswer = z.tuple([z.string(), z.array(z.string())]).rest(z.unknown());
const openSearchAnswer = z.tuple([z.string(), z.array(z.string())]).rest(z.unknown());
const pageviewsAnswer = z.object({ items: z.array(z.object({ views: z.number() }).loose()) });

type Failure = "offline" | "refused" | "timeout";
class Unanswered extends Error {
  constructor(readonly reason: Failure) {
    super(reason);
  }
}

// "en" from "en-GB"; a language Wikipedia names by its two letters.
function languageOf(language: string): string {
  const code = language.trim().toLowerCase().slice(0, 2);
  return /^[a-z]{2}$/.test(code) ? code : "en";
}

// The last whole month before `now`, as the pageviews API names its days.
export function lastMonth(now: Date): { readonly start: string; readonly end: string } {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const day = (date: Date) =>
    `${String(date.getUTCFullYear())}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}00`;
  return { start: day(first), end: day(last) };
}

export function createSearchInterest(deps: {
  readonly fetch: typeof fetch;
  readonly version: string;
  readonly now: () => Date;
}): TopicInterest {
  const headers = {
    "User-Agent": `Slopify/${deps.version} (https://github.com/gentbajko/slopify)`,
    Accept: "application/json",
  };
  const json = async (url: string, signal: AbortSignal): Promise<unknown> => {
    const timeout = AbortSignal.timeout(interestRequestMs);
    let response: Response;
    try {
      response = await deps.fetch(url, { headers, signal: AbortSignal.any([signal, timeout]) });
    } catch {
      throw new Unanswered(timeout.aborted ? "timeout" : "offline");
    }
    if (!response.ok) throw new Unanswered("refused");
    try {
      return await response.json();
    } catch {
      throw new Unanswered("refused");
    }
  };
  const reasonOf = (error: unknown): Failure =>
    error instanceof Unanswered ? error.reason : "offline";

  const suggestions = async (
    topic: string,
    language: string,
    signal: AbortSignal,
  ): Promise<readonly string[] | Failure> => {
    const q = encodeURIComponent(topic);
    let failure: Failure = "offline";
    for (const url of [
      `https://suggestqueries.google.com/complete/search?client=firefox&hl=${language}&q=${q}`,
      `https://duckduckgo.com/ac/?q=${q}&type=list&kl=wt-wt`,
    ]) {
      try {
        const parsed = suggestAnswer.safeParse(await json(url, signal));
        if (parsed.success) return parsed.data[1].slice(0, 10);
        failure = "refused";
      } catch (error) {
        failure = reasonOf(error);
      }
    }
    return failure;
  };

  const wikiViews = async (
    topic: string,
    language: string,
    signal: AbortSignal,
  ): Promise<number | null | Failure> => {
    try {
      const found = openSearchAnswer.safeParse(
        await json(
          `https://${language}.wikipedia.org/w/api.php?action=opensearch&format=json&namespace=0&limit=1&search=${encodeURIComponent(topic)}`,
          signal,
        ),
      );
      if (!found.success) return "refused";
      const title = found.data[1][0];
      if (title === undefined) return null;
      const { start, end } = lastMonth(deps.now());
      let answer: unknown;
      try {
        answer = await json(
          `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${language}.wikipedia/all-access/user/${encodeURIComponent(title.replaceAll(" ", "_"))}/monthly/${start}/${end}`,
          signal,
        );
      } catch (error) {
        // An article too new to have a month of views answers 404.
        if (reasonOf(error) === "refused") return null;
        throw error;
      }
      const views = pageviewsAnswer.safeParse(answer);
      return views.success ? views.data.items.reduce((sum, item) => sum + item.views, 0) : null;
    } catch (error) {
      return reasonOf(error);
    }
  };

  return async (topic, rawLanguage, signal): Promise<InterestResult> => {
    const language = languageOf(rawLanguage);
    const [offered, views] = await Promise.all([
      suggestions(topic, language, signal),
      wikiViews(topic, language, signal),
    ]);
    const failed = (value: unknown): value is Failure => typeof value === "string";
    if (failed(offered) && failed(views)) return { ok: false, reason: offered };
    return {
      ok: true,
      suggestions: failed(offered) ? null : offered,
      wikiViews: failed(views) ? null : views,
    };
  };
}
