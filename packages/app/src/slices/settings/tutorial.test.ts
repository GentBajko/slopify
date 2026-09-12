import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { readSetting, writeSetting } from "./repo.js";
import {
  readTutorial,
  saveTutorial,
  tutorialSessionSchema,
  tutorialWriteSchema,
} from "./tutorial.js";

const session = {
  schemaVersion: 1,
  active: true,
  stepId: "play-subtitles",
  articleId: "confirmed-article",
  imageId: "confirmed-image",
  projectId: "confirmed-project",
} as const;

it("retains a stable Play step across reopen without form or key data", () => {
  const h = draftFixture();
  try {
    expect(readTutorial(h.deps.db)).toEqual({
      version: 0,
      readable: true,
      session: { schemaVersion: 1, active: false, stepId: "text-key" },
    });
    const saved = saveTutorial(h.deps.db, { baseVersion: 0, mutationId: randomUUID(), session });
    expect(saved).toEqual({ ok: true, value: { version: 1, readable: true, session } });
    h.reopen();
    expect(readTutorial(h.deps.db)).toEqual({ version: 1, readable: true, session });
    expect(Object.keys(JSON.parse(readSetting(h.deps.db, "tutorial.session") ?? "{}"))).toEqual([
      "version",
      "session",
      "mutationId",
      "requestHash",
    ]);
    for (const extra of [{ formText: "not allowed" }, { key: "not allowed" }]) {
      expect(tutorialSessionSchema.safeParse({ ...session, ...extra }).success).toBe(false);
    }
    expect(
      tutorialWriteSchema.safeParse({
        baseVersion: 0,
        mutationId: randomUUID(),
        session,
        extra: true,
      }).success,
    ).toBe(false);
    expect(tutorialSessionSchema.safeParse({ ...session, stepId: "unknown" }).success).toBe(false);
  } finally {
    h.close();
  }
});

it("replays only the identical latest mutation and preserves the newer cursor on conflicts", () => {
  const h = draftFixture();
  try {
    const input = { baseVersion: 0, mutationId: randomUUID(), session };
    const saved = saveTutorial(h.deps.db, input);
    h.reopen();
    expect(saveTutorial(h.deps.db, input)).toEqual(saved);
    for (const changed of [
      { ...input, baseVersion: 1 },
      { ...input, session: { ...session, active: false } },
      { ...input, mutationId: randomUUID() },
    ])
      expect(saveTutorial(h.deps.db, changed)).toEqual({ ok: false, reason: "conflict" });
    expect(readTutorial(h.deps.db).version).toBe(1);
    const next = saveTutorial(h.deps.db, {
      baseVersion: 1,
      mutationId: randomUUID(),
      session: { ...session, stepId: "download" },
    });
    expect(next).toMatchObject({ ok: true, value: { version: 2 } });
    expect(saveTutorial(h.deps.db, input)).toEqual({ ok: false, reason: "conflict" });
    expect(readTutorial(h.deps.db).session.stepId).toBe("download");
  } finally {
    h.close();
  }
});

it.each([
  "broken JSON",
  "null",
  "{}",
  JSON.stringify({ version: 1, session, mutationId: randomUUID(), requestHash: "invalid" }),
])("preserves an unreadable record on read and save: %s", (raw) => {
  const h = draftFixture();
  try {
    writeSetting(h.deps.db, "tutorial.session", raw);
    expect(readTutorial(h.deps.db)).toEqual({
      version: 0,
      readable: false,
      session: { schemaVersion: 1, active: false, stepId: "text-key" },
    });
    expect(saveTutorial(h.deps.db, { baseVersion: 0, mutationId: randomUUID(), session })).toEqual({
      ok: false,
      reason: "unreadable",
    });
    expect(readSetting(h.deps.db, "tutorial.session")).toBe(raw);
  } finally {
    h.close();
  }
});

it("refuses a version increment that cannot remain a safe integer", () => {
  const h = draftFixture();
  try {
    writeSetting(
      h.deps.db,
      "tutorial.session",
      JSON.stringify({
        version: Number.MAX_SAFE_INTEGER,
        session,
        mutationId: randomUUID(),
        requestHash: "0".repeat(64),
      }),
    );
    expect(
      saveTutorial(h.deps.db, {
        baseVersion: Number.MAX_SAFE_INTEGER,
        mutationId: randomUUID(),
        session,
      }),
    ).toEqual({ ok: false, reason: "conflict" });
    expect(readTutorial(h.deps.db).version).toBe(Number.MAX_SAFE_INTEGER);
  } finally {
    h.close();
  }
});
