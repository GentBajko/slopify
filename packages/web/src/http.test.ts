import { describe, expect, it } from "vitest";
import { errorOf, reachingFetch, sentence, understood, unreachable, unrecognised } from "./http";

describe("reachingFetch", () => {
  it("says the server is not responding when nothing answered", async () => {
    const lost = new TypeError("Failed to fetch");
    const fetch = reachingFetch(async () => {
      throw lost;
    });
    const caught = await fetch("http://localhost/api").catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as Error).message).toBe(unreachable);
    expect((caught as Error).cause).toBe(lost);
  });

  it("passes aborts and other failures through untouched", async () => {
    const aborted = new DOMException("The operation was aborted.", "AbortError");
    const fetch = reachingFetch(async () => {
      throw aborted;
    });
    await expect(fetch("http://localhost/api")).rejects.toBe(aborted);
  });
});

describe("errorOf", () => {
  it("treats a gateway error with no problem document as the server being down", () => {
    expect(errorOf(new Response(null, { status: 502 }), undefined).message).toBe(unreachable);
  });

  it("names the status and the next step for any other unexplained reply", () => {
    const message = errorOf(new Response(null, { status: 500 }), undefined).message;
    expect(message).toContain("(500)");
    expect(message).toContain("Download diagnostics");
  });
});

describe("understood", () => {
  it("replaces a schema mismatch with a reload hint", () => {
    const schema = {
      parse: (): never => {
        throw new Error("expected string at path.x");
      },
    };
    expect(() => understood(schema, {})).toThrow(unrecognised);
  });
});

it("ends a message with exactly one full stop", () => {
  expect(sentence("Lost")).toBe("Lost.");
  expect(sentence("Lost.")).toBe("Lost.");
});
