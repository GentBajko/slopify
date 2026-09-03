import { describe, expect, it } from "vitest";
import type { ManualClock } from "../clock.fake.js";
import { manualClock } from "../clock.fake.js";
import type { Log, LogFields, LogLevel } from "../log.js";
import { isProviderError, providerError } from "../ports/model.js";
import type { AttemptContext, ProviderCall } from "./attempt.js";
import { attempt } from "./attempt.js";
import type { Attempt, AttemptEnd, AttemptStart, AttemptStore } from "./attempt-repo.js";

interface Recorder extends AttemptStore {
  readonly rows: readonly Attempt[];
}

function recorder(): Recorder {
  const rows: Attempt[] = [];
  return {
    rows,
    start: (start: AttemptStart): string => {
      const id = `a${rows.length + 1}`;
      rows.push({ ...start, id, endedAt: null, outcome: null, errorText: null });
      return id;
    },
    end: (id: string, ended: AttemptEnd): void => {
      const at = rows.findIndex((row) => row.id === id);
      const row = rows[at];
      if (row !== undefined) {
        rows[at] = { ...row, ...ended };
      }
    },
  };
}

interface Harness {
  readonly clock: ManualClock;
  readonly attempts: Recorder;
  readonly lines: readonly string[];
  readonly context: AttemptContext;
  readonly controller: AbortController;
}

function harness(): Harness {
  const clock = manualClock("2026-09-02T10:00:00.000Z");
  const attempts = recorder();
  const lines: string[] = [];
  const log: Log = {
    write: (level: LogLevel, event: string, fields?: LogFields): void => {
      lines.push(`${level} ${event} ${fields?.detail ?? ""}`);
    },
  };
  const controller = new AbortController();
  return {
    clock,
    attempts,
    lines,
    controller,
    context: {
      clock,
      log,
      attempts,
      projectId: "p1",
      stage: "article",
      stageId: "s1",
      signal: controller.signal,
    },
  };
}

// The gaps the wrapper waited, read off the rows it wrote.
function gaps(rows: readonly Attempt[]): number[] {
  return rows.slice(1).map((row, index) => {
    const previous = rows[index];
    return previous === undefined
      ? 0
      : new Date(row.startedAt).getTime() - new Date(previous.startedAt).getTime();
  });
}

function alwaysFails(error: unknown): ProviderCall<string> {
  return (): Promise<string> => Promise.reject(error);
}

describe("attempt", () => {
  it("answers with the first result and records one attempt", async () => {
    const h = harness();

    const out = await h.clock.settle(
      attempt(h.context, () => Promise.resolve("hello"), { kind: "llm" }),
    );

    expect(out).toBe("hello");
    expect(h.attempts.rows).toEqual([
      {
        id: "a1",
        stageId: "s1",
        pieceId: null,
        n: 1,
        startedAt: "2026-09-02T10:00:00.000Z",
        endedAt: "2026-09-02T10:00:00.000Z",
        outcome: "ok",
        errorText: null,
      },
    ]);
  });

  // logic/01 step 6: "attempted up to 4 times: the first attempt plus 3 retries, waiting
  // 2 s, 8 s, 30 s between attempts".
  it("makes four attempts in all, waiting 2 s, 8 s and 30 s between them", async () => {
    const h = harness();
    let calls = 0;
    const call: ProviderCall<string> = () => {
      calls += 1;
      return Promise.reject(providerError({ kind: "other", message: "socket hang up" }));
    };

    await expect(h.clock.settle(attempt(h.context, call, { kind: "llm" }))).rejects.toThrow(
      "socket hang up",
    );

    expect(calls).toBe(4);
    expect(h.attempts.rows.map((row) => row.n)).toEqual([1, 2, 3, 4]);
    expect(gaps(h.attempts.rows)).toEqual([2000, 8000, 30_000]);
    expect(h.attempts.rows.map((row) => row.outcome)).toEqual(["other", "other", "other", "other"]);
    expect(h.attempts.rows.at(-1)?.errorText).toBe("socket hang up");
  });

  it("waits the provider's Retry-After in place of the fixed backoff", async () => {
    const h = harness();
    let calls = 0;
    const call: ProviderCall<string> = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(
            providerError({ kind: "rate_limit", message: "429 slow down", retryAfterMs: 45_000 }),
          )
        : Promise.resolve("second time lucky");
    };

    const out = await h.clock.settle(attempt(h.context, call, { kind: "llm" }));

    expect(out).toBe("second time lucky");
    expect(gaps(h.attempts.rows)).toEqual([45_000]);
  });

  it("still backs off by the schedule when a 429 names no Retry-After", async () => {
    const h = harness();
    let calls = 0;
    const call: ProviderCall<string> = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(providerError({ kind: "rate_limit", message: "429" }))
        : Promise.resolve("ok");
    };

    await h.clock.settle(attempt(h.context, call, { kind: "llm" }));

    expect(gaps(h.attempts.rows)).toEqual([2000]);
  });

  // logic/09 §Q74: a content-policy refusal fails that call immediately, no retries.
  it("stops on a refusal and fails with the provider's own words", async () => {
    const h = harness();
    let calls = 0;
    const call: ProviderCall<string> = () => {
      calls += 1;
      return Promise.reject(
        providerError({ kind: "refusal", message: "I can't create that image." }),
      );
    };

    await expect(h.clock.settle(attempt(h.context, call, { kind: "image" }))).rejects.toThrow(
      "I can't create that image.",
    );

    expect(calls).toBe(1);
    expect(h.attempts.rows).toHaveLength(1);
    expect(h.attempts.rows[0]?.outcome).toBe("refusal");
    // No backoff was served: the clock never moved.
    expect(h.clock.now().toISOString()).toBe("2026-09-02T10:00:00.000Z");
  });

  // logic/06 §Q47: a model that cannot ground on the web fails the stage, no fallback.
  it("stops on an unsupported capability", async () => {
    const h = harness();
    let calls = 0;
    const call: ProviderCall<string> = () => {
      calls += 1;
      return Promise.reject(
        providerError({ kind: "unsupported", message: "web research unsupported by this model" }),
      );
    };

    await expect(h.clock.settle(attempt(h.context, call, { kind: "llm" }))).rejects.toThrow(
      "web research unsupported by this model",
    );

    expect(calls).toBe(1);
  });

  // logic/02 §Q13: "the next attempt finds no key, fails immediately without retries".
  it("stops when the provider has no key stored", async () => {
    const h = harness();
    let calls = 0;
    const call: ProviderCall<string> = () => {
      calls += 1;
      return Promise.reject(
        providerError({ kind: "missing_key", message: "no OpenRouter key is stored" }),
      );
    };

    await expect(h.clock.settle(attempt(h.context, call, { kind: "llm" }))).rejects.toThrow(
      "no OpenRouter key is stored",
    );

    expect(calls).toBe(1);
    expect(h.attempts.rows).toHaveLength(1);
    expect(h.attempts.rows[0]?.outcome).toBe("missing_key");
    // No backoff was served: the clock never moved.
    expect(h.clock.now().toISOString()).toBe("2026-09-02T10:00:00.000Z");
  });

  // logic/02 §Q11: a bad key fails the call and the retry policy runs like any other.
  it("retries an auth failure like any other", async () => {
    const h = harness();
    let calls = 0;
    const call: ProviderCall<string> = () => {
      calls += 1;
      return Promise.reject(providerError({ kind: "auth", message: "401 Unauthorized" }));
    };

    await expect(h.clock.settle(attempt(h.context, call, { kind: "llm" }))).rejects.toThrow("401");

    expect(calls).toBe(4);
  });

  describe("timeouts", () => {
    // A call that yields a chunk every `gapMs` until it has yielded `chunks` of them.
    function producing(clock: ManualClock, chunks: number, gapMs: number): ProviderCall<string> {
      return async (signal: AbortSignal, progress: () => void): Promise<string> => {
        let text = "";
        for (let n = 0; n < chunks; n += 1) {
          await clock.sleep(gapMs, signal);
          progress();
          text += "x";
        }
        return text;
      };
    }

    // logic/01 §Q62: a streaming call's 120 s is measured between chunks.
    it("lets a streaming call run past 120 s while chunks keep arriving", async () => {
      const h = harness();

      const out = await h.clock.settle(
        attempt(h.context, producing(h.clock, 5, 60_000), { kind: "llm", streaming: true }),
      );

      expect(out).toBe("xxxxx");
      expect(h.attempts.rows).toHaveLength(1);
      expect(h.clock.now().toISOString()).toBe("2026-09-02T10:05:00.000Z");
    });

    // The same call, measured over the whole call instead: this is the difference.
    it("kills the same call at 120 s when it is not streaming", async () => {
      const h = harness();

      await expect(
        h.clock.settle(attempt(h.context, producing(h.clock, 5, 60_000), { kind: "llm" })),
      ).rejects.toThrow("120 s");

      expect(h.attempts.rows).toHaveLength(4);
      expect(h.attempts.rows.map((row) => row.outcome)).toEqual([
        "timeout",
        "timeout",
        "timeout",
        "timeout",
      ]);
    });

    it("kills a streaming call that has gone quiet for 120 s", async () => {
      const h = harness();
      const call: ProviderCall<string> = async (
        signal: AbortSignal,
        progress: () => void,
      ): Promise<string> => {
        await h.clock.sleep(1000, signal);
        progress();
        await h.clock.sleep(600_000, signal);
        return "never";
      };

      await expect(
        h.clock.settle(attempt(h.context, call, { kind: "llm", streaming: true })),
      ).rejects.toThrow("sent nothing for 120 s");

      // The first attempt started at 10:00:00 and died 120 s after its last chunk.
      expect(h.attempts.rows[0]?.endedAt).toBe("2026-09-02T10:02:01.000Z");
    });

    // logic/09 §Q77: an image call gets 300 s.
    it("gives an image call 300 s and a narration call 120 s", async () => {
      const h = harness();

      const out = await h.clock.settle(
        attempt(h.context, producing(h.clock, 1, 280_000), { kind: "image" }),
      );
      expect(out).toBe("x");

      const tts = harness();
      await expect(
        tts.clock.settle(attempt(tts.context, producing(tts.clock, 1, 280_000), { kind: "tts" })),
      ).rejects.toThrow("120 s");
    });
  });

  // logic/13 §Q109 and §Q112: the stage's own abort ends the call where it stands, and
  // the wrapper does not retry a call nobody is waiting for any more.
  it("stops for good when the stage is aborted mid-attempt", async () => {
    const h = harness();
    let calls = 0;
    const call: ProviderCall<string> = async (signal: AbortSignal): Promise<string> => {
      calls += 1;
      h.controller.abort(new Error("canceled by user"));
      await h.clock.sleep(10_000, signal);
      return "never";
    };

    await expect(h.clock.settle(attempt(h.context, call, { kind: "llm" }))).rejects.toThrow(
      "canceled by user",
    );

    expect(calls).toBe(1);
    expect(h.attempts.rows[0]?.outcome).toBe("canceled");
    expect(h.attempts.rows[0]?.errorText).toBeNull();
    expect(h.clock.waits).not.toContain(2000);
  });

  it("refuses to start when the stage was already aborted", async () => {
    const h = harness();
    h.controller.abort(new Error("canceled by user"));

    await expect(
      h.clock.settle(attempt(h.context, () => Promise.resolve("hello"), { kind: "llm" })),
    ).rejects.toThrow("canceled by user");
    expect(h.attempts.rows).toEqual([]);
  });

  // A key must never reach a row, a log line or the sentence the project page shows.
  it("keeps a provider key out of the row, the log and the failure", async () => {
    const h = harness();
    const key = "sk-live-4f9Qa2Xb7Lm0PzR8Tn6Vd3Wc";
    const error = providerError({
      kind: "auth",
      message: `401 Unauthorized: the key ${key} is not valid`,
    });

    const failure = await h.clock
      .settle(attempt(h.context, alwaysFails(error), { kind: "llm" }))
      .catch((thrown: unknown) => thrown);

    const shown = failure instanceof Error ? failure.message : String(failure);
    const written = [...h.attempts.rows.map((row) => row.errorText ?? ""), ...h.lines, shown];
    for (const text of written) {
      expect(text).not.toContain(key);
    }
    expect(shown).toContain("401 Unauthorized");
    expect(shown).toContain("[redacted]");
  });

  it("hands anything that is not a provider error through as `other`", async () => {
    const h = harness();

    await expect(
      h.clock.settle(
        attempt(h.context, alwaysFails(new TypeError("fetch failed")), { kind: "llm" }),
      ),
    ).rejects.toThrow("fetch failed");

    expect(h.attempts.rows.map((row) => row.outcome)).toEqual(["other", "other", "other", "other"]);
    const thrown = await h.clock
      .settle(attempt(h.context, alwaysFails("just a string"), { kind: "llm" }))
      .catch((error: unknown) => error);
    expect(isProviderError(thrown)).toBe(true);
  });

  it("names the piece an attempt belongs to", async () => {
    const h = harness();
    const context: AttemptContext = { ...h.context, pieceId: "image-3" };

    await h.clock.settle(attempt(context, () => Promise.resolve("bytes"), { kind: "image" }));

    expect(h.attempts.rows[0]?.pieceId).toBe("image-3");
  });
});
