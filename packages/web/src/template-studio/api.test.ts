import { describe, expect, it } from "vitest";
import type { Api } from "@/api";
import {
  about,
  makeSamplesForAll,
  markTemplateReady,
  readTemplateStudio,
  StudioNotFound,
  saveInStudio,
  templateStudioQuery,
} from "./api";

// The studio's API file on its own: how a price is said, and how a refusal reads through the
// shared `refusalFrom`, with the studio's own extensions (a new quote, the problems to fix).

function apiAnswering(status: number, body: unknown): Api {
  const fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/problem+json" },
    })) as typeof globalThis.fetch;
  return { fetch, origin: "http://slopify.test" } as unknown as Api;
}

describe("about", () => {
  it("says a fraction of a cent with its digits, never $0.00", () => {
    expect(about(0.0032)).toBe("about $0.0032");
    expect(about(0.12)).toBe("about $0.12");
    expect(about(0)).toBe("about $0");
  });
});

describe("studio refusals", () => {
  it("reads a cost-changed refusal's reason, sentence and new quote", async () => {
    const quote = {
      version: 2,
      first: false,
      sections: ["script"],
      rows: [],
      low: 0.4,
      high: 0.61,
      unknown: 0,
      onPlan: false,
      budget: { budget: 2, spent: 0, left: 2 },
      fits: true,
      problem: null,
    };
    const result = await saveInStudio(
      apiAnswering(409, {
        title: "Conflict",
        status: 409,
        detail: "This sample now costs about $0.61.",
        reason: "cost-changed",
        quote,
      }),
      "t",
      {
        mutationId: "m",
        baseVersion: 1,
        name: "n",
        document: {} as never,
        sample: "make",
        acknowledgedHigh: 0.4,
        acknowledgedUnknown: false,
      },
    );
    expect(result).toEqual({
      ok: false,
      reason: "cost-changed",
      message: "This sample now costs about $0.61.",
      quote,
    });
  });

  it("keeps Mark ready's problems and Make samples for all's sentence", async () => {
    const ready = await markTemplateReady(
      apiAnswering(409, {
        title: "Conflict",
        status: 409,
        detail: "Fix these first.",
        reason: "not-ready",
        problems: [{ label: "Voice", sentence: "Choose a voice." }],
      }),
      "t",
      2,
    );
    expect(ready).toEqual({
      ok: false,
      message: "Fix these first.",
      problems: [{ label: "Voice", sentence: "Choose a voice." }],
    });
    const forAll = await makeSamplesForAll(
      apiAnswering(409, { title: "Conflict", status: 409, detail: "Over today's budget." }),
      { acknowledgedTotal: 1, acknowledgedUnknown: false },
    );
    expect(forAll).toEqual({ ok: false, message: "Over today's budget.", quote: null });
  });

  it("throws the server's sentence for a refusal the studio doesn't expect", async () => {
    await expect(
      markTemplateReady(
        apiAnswering(404, { title: "Not found", status: 404, detail: "This template is gone." }),
        "t",
        1,
      ),
    ).rejects.toThrow("This template is gone.");
  });
});

describe("templateStudioQuery", () => {
  it("doesn't ask again for a template that doesn't exist, so a design template's id opens at once", async () => {
    const api = apiAnswering(404, { title: "Not Found", status: 404, detail: "No such template." });
    const query = templateStudioQuery(api, "t");
    const error = await readTemplateStudio(api, "t").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StudioNotFound);
    const retry = query.retry as (count: number, error: Error) => boolean;
    expect(retry(0, error as Error)).toBe(false);
    expect(retry(0, new Error("Slopify isn't answering."))).toBe(true);
    expect(retry(3, new Error("Slopify isn't answering."))).toBe(false);
  });
});
