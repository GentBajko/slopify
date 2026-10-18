import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { upsertKey } from "../settings/repo.js";
import { accessRecorder } from "./record.js";
import { readChecks } from "./repo.js";

const clock = fixedClock("2026-10-18T10:00:00.000Z");
function setup() {
  const db = openDb(":memory:");
  migrate(db, clock);
  return { db, recorder: accessRecorder({ db, clock }) };
}

describe("accessRecorder", () => {
  it("marks a model a run used as working, already seen", () => {
    const { db, recorder } = setup();
    recorder.worked({ provider: "codex", family: "llm", model: "gpt-5" });
    expect(readChecks(db)).toMatchObject([
      {
        provider: "codex",
        model: "gpt-5",
        account: "codex",
        verdict: "works",
        verdictSource: "run",
        noticeSeen: true,
      },
    ]);
  });

  it("marks a refused model not on the plan, with the provider's sentence", () => {
    const { db, recorder } = setup();
    upsertKey(db, "openrouter", "placeholder", "2026-10-18");
    recorder.denied({
      provider: "openrouter",
      family: "llm",
      model: "x/y",
      sentence: "No endpoints.",
    });
    expect(readChecks(db)).toMatchObject([
      { model: "x/y", verdict: "no-access", sentence: "No endpoints.", verdictSource: "run" },
    ]);
  });

  it("learns nothing without a key on file, or for a provider it doesn't know", () => {
    const { db, recorder } = setup();
    recorder.worked({ provider: "openrouter", family: "llm", model: "x/y" });
    recorder.worked({ provider: "someone-else", family: "llm", model: "x/y" });
    expect(readChecks(db)).toEqual([]);
  });
});
