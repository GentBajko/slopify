import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import { listVersions, versionsOrCurrent } from "./history.js";
import { entryById, promptById } from "./repo.js";
import type { LibraryDeps } from "./save.js";
import {
  createEntry,
  createPrompt,
  removeEntry,
  removePrompt,
  restoreEntry,
  restorePrompt,
  updateEntry,
  updatePrompt,
} from "./save.js";

// A clock that moves a minute per save, so every version has its own time.
function ticking(): Clock {
  let at = Date.parse("2026-09-27T10:00:00.000Z");
  return {
    now: () => {
      at += 60_000;
      return new Date(at);
    },
    sleep: () => Promise.resolve(),
  };
}

function deps(): LibraryDeps {
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-09-27T09:00:00.000Z"));
  let n = 0;
  const ids: Ids = {
    next: () => {
      n += 1;
      return `p${String(n)}`;
    },
  };
  return { db, ids, clock: ticking() };
}

function saved<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error("expected the save to succeed");
  return result.value;
}

describe("prompt history", () => {
  it("keeps a version for every save that changed something, by you, newest first", () => {
    const library = deps();
    const prompt = saved(createPrompt(library, { kind: "article", name: "Essay", body: "one" }));
    updatePrompt(library, prompt.id, { kind: "article", name: "Essay", body: "one two" });
    // Saved again unchanged: nothing new to keep.
    updatePrompt(library, prompt.id, { kind: "article", name: "Essay", body: "one two" });
    updatePrompt(library, prompt.id, { kind: "article", name: "Long essay", body: "one two" });

    const versions = listVersions(library.db, "prompt", prompt.id);
    expect(versions.map((one) => [one.version, one.name, one.body, one.author])).toEqual([
      [3, "Long essay", "one two", "you"],
      [2, "Essay", "one two", "you"],
      [1, "Essay", "one", "you"],
    ]);
    expect(new Set(versions.map((one) => one.createdAt)).size).toBe(3);
  });

  it("restores a version as a new version that names where it came from", () => {
    const library = deps();
    const prompt = saved(createPrompt(library, { kind: "image", name: "Style", body: "ink" }));
    updatePrompt(library, prompt.id, { kind: "image", name: "Style", body: "oil paint" });

    const restored = saved(restorePrompt(library, prompt.id, 1));

    expect(restored.body).toBe("ink");
    expect(promptById(library.db, prompt.id)?.body).toBe("ink");
    const [latest, ...rest] = listVersions(library.db, "prompt", prompt.id);
    expect(latest).toMatchObject({ version: 3, body: "ink", restoredFrom: 1 });
    expect(rest.map((one) => one.version)).toEqual([2, 1]);
  });

  it("refuses to restore a version or a prompt that does not exist", () => {
    const library = deps();
    const prompt = saved(createPrompt(library, { kind: "image", name: "Style", body: "ink" }));
    expect(restorePrompt(library, prompt.id, 9)).toEqual({ ok: false, reason: "not-found" });
    expect(restorePrompt(library, "gone", 1)).toEqual({ ok: false, reason: "not-found" });
  });

  it("refuses a restore whose name another prompt took since, and keeps no version", () => {
    const library = deps();
    const prompt = saved(createPrompt(library, { kind: "article", name: "A", body: "x" }));
    updatePrompt(library, prompt.id, { kind: "article", name: "B", body: "x" });
    createPrompt(library, { kind: "article", name: "A", body: "y" });

    expect(restorePrompt(library, prompt.id, 1)).toEqual({
      ok: false,
      reason: "duplicate-name",
    });
    expect(listVersions(library.db, "prompt", prompt.id)).toHaveLength(2);
  });

  it("drops the versions with the prompt", () => {
    const library = deps();
    const prompt = saved(createPrompt(library, { kind: "article", name: "A", body: "x" }));
    removePrompt(library, prompt.id);
    expect(listVersions(library.db, "prompt", prompt.id)).toEqual([]);
  });

  it("starts an imported prompt's history from its saved text", () => {
    const library = deps();
    library.db
      .prepare(
        "INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES ('imported','article','Old','as imported','[]','2026-01-01T00:00:00.000Z')",
      )
      .run();
    const imported = promptById(library.db, "imported");
    if (imported === undefined) throw new Error("missing");
    expect(versionsOrCurrent(library.db, "prompt", imported).map((one) => one.body)).toEqual([
      "as imported",
    ]);

    updatePrompt(library, "imported", { kind: "article", name: "Old", body: "edited" });

    expect(
      listVersions(library.db, "prompt", "imported").map((one) => [one.version, one.body]),
    ).toEqual([
      [2, "edited"],
      [1, "as imported"],
    ]);
  });
});

describe("intro and outro history", () => {
  it("keeps the mode and category with each version and restores them", () => {
    const library = deps();
    const entry = saved(
      createEntry(library, { category: "intro", mode: "text", name: "Hello", body: "Hi." }),
    );
    updateEntry(library, entry.id, { category: "intro", mode: "llm", name: "Hello", body: "Hey" });

    saved(restoreEntry(library, entry.id, 1));

    expect(entryById(library.db, entry.id)).toMatchObject({ mode: "text", body: "Hi." });
    expect(listVersions(library.db, "entry", entry.id)[0]).toMatchObject({
      version: 3,
      kind: "intro",
      mode: "text",
      restoredFrom: 1,
    });
    removeEntry(library, entry.id);
    expect(listVersions(library.db, "entry", entry.id)).toEqual([]);
  });
});

describe("migration 31", () => {
  it("makes every saved prompt and entry's current text its version 1", () => {
    const db = openDb(":memory:");
    const clock = fixedClock("2026-09-27T09:00:00.000Z");
    migrate(db, clock, { through: 24 });
    db.prepare(
      "INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES ('p','narration','Calm','Read it calmly.','[]','2026-05-01T00:00:00.000Z')",
    ).run();
    db.prepare(
      "INSERT INTO entries (id,category,mode,name,body,slots,updated_at) VALUES ('e','outro','llm','Bye','Say bye.','[]','2026-05-02T00:00:00.000Z')",
    ).run();

    migrate(db, clock);

    expect(listVersions(db, "prompt", "p")).toEqual([
      {
        version: 1,
        kind: "narration",
        mode: null,
        name: "Calm",
        body: "Read it calmly.",
        author: "you",
        restoredFrom: null,
        createdAt: "2026-05-01T00:00:00.000Z",
      },
    ]);
    expect(listVersions(db, "entry", "e")).toEqual([
      {
        version: 1,
        kind: "outro",
        mode: "llm",
        name: "Bye",
        body: "Say bye.",
        author: "you",
        restoredFrom: null,
        createdAt: "2026-05-02T00:00:00.000Z",
      },
    ]);
  });
});
