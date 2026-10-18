import { describe, expect, it } from "vitest";
import { createSearchInterest, lastMonth } from "./search-interest.js";

type Route = (url: URL) => Response | "down" | "hang";

function interest(route: Route) {
  const seen: { url: string; agent: string | null }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = new URL(String(input));
    seen.push({ url: url.toString(), agent: new Headers(init?.headers).get("user-agent") });
    const answer = route(url);
    if (answer === "down") return Promise.reject(new TypeError("fetch failed"));
    if (answer === "hang")
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    return Promise.resolve(answer);
  };
  return {
    seen,
    read: createSearchInterest({
      fetch: fetchImpl,
      version: "4.0.0",
      now: () => new Date("2026-10-18T10:00:00.000Z"),
    }),
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const wiki = (url: URL): Response | "down" => {
  if (url.hostname === "en.wikipedia.org")
    return json(["bent pyramid", ["Bent Pyramid"], [""], [""]]);
  if (url.hostname === "wikimedia.org") return json({ items: [{ views: 41_000 }] });
  return "down";
};

describe("createSearchInterest", () => {
  it("reads Google's suggestions and the article's views last month, naming itself", async () => {
    const h = interest((url) =>
      url.hostname === "suggestqueries.google.com"
        ? json(["bent pyramid", ["bent pyramid", "bent pyramid inside"]])
        : wiki(url),
    );
    expect(await h.read("Bent Pyramid", "en-GB", AbortSignal.timeout(10_000))).toEqual({
      ok: true,
      suggestions: ["bent pyramid", "bent pyramid inside"],
      wikiViews: 41_000,
    });
    expect(h.seen.map((one) => one.url)).toEqual([
      "https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=Bent%20Pyramid",
      "https://en.wikipedia.org/w/api.php?action=opensearch&format=json&namespace=0&limit=1&search=Bent%20Pyramid",
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Bent_Pyramid/monthly/2026090100/2026093000",
    ]);
    expect(
      h.seen.every((one) => one.agent === "Slopify/4.0.0 (https://github.com/gentbajko/slopify)"),
    ).toBe(true);
  });

  it("asks DuckDuckGo when Google is down", async () => {
    const h = interest((url) =>
      url.hostname === "duckduckgo.com"
        ? json(["rope", ["rope knots"]])
        : url.hostname === "suggestqueries.google.com"
          ? json({}, 429)
          : wiki(url),
    );
    const read = await h.read("Rope", "en", AbortSignal.timeout(10_000));
    expect(read).toEqual({ ok: true, suggestions: ["rope knots"], wikiViews: 41_000 });
  });

  it("says offline when nothing answers, and keeps what one service said when the rest are down", async () => {
    expect(await interest(() => "down").read("Rope", "en", AbortSignal.timeout(10_000))).toEqual({
      ok: false,
      reason: "offline",
    });
    expect(
      await interest((url) =>
        url.hostname === "duckduckgo.com" ? json(["rope", []]) : "down",
      ).read("Rope", "en", AbortSignal.timeout(10_000)),
    ).toEqual({ ok: true, suggestions: [], wikiViews: null });
  });

  it("reads a topic with no article, or an article with no month of views, as no views", async () => {
    const none = interest((url) =>
      url.hostname === "en.wikipedia.org"
        ? json(["zzq", [], [], []])
        : url.hostname === "wikimedia.org"
          ? json({}, 404)
          : json(["zzq", []]),
    );
    expect(await none.read("zzq", "en", AbortSignal.timeout(10_000))).toEqual({
      ok: true,
      suggestions: [],
      wikiViews: null,
    });
    const fresh = interest((url) =>
      url.hostname === "en.wikipedia.org"
        ? json(["x", ["X"], [""], [""]])
        : url.hostname === "wikimedia.org"
          ? json({ detail: "Not found" }, 404)
          : json(["x", []]),
    );
    expect((await fresh.read("x", "en", AbortSignal.timeout(10_000))).ok).toBe(true);
  });

  it("gives up on a service after 4 seconds and says it timed out", async () => {
    const h = interest(() => "hang");
    expect(await h.read("Rope", "en", AbortSignal.timeout(20_000))).toEqual({
      ok: false,
      reason: "timeout",
    });
  }, 20_000);

  it("asks the Wikipedia of the topic's language, and English for a code it can't read", async () => {
    const h = interest(() => "down");
    await h.read("Seil", "de", AbortSignal.timeout(10_000));
    await h.read("Rope", "??", AbortSignal.timeout(10_000));
    expect(
      h.seen
        .filter((one) => one.url.includes("wikipedia.org"))
        .map((one) => new URL(one.url).hostname),
    ).toEqual(["de.wikipedia.org", "en.wikipedia.org"]);
  });
});

describe("lastMonth", () => {
  it("names the last whole month, across a year's end", () => {
    expect(lastMonth(new Date("2026-01-05T00:00:00.000Z"))).toEqual({
      start: "2025120100",
      end: "2025123100",
    });
  });
});
