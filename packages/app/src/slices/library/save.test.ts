import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import { entryByName, listEntries, listPrompts, promptById, promptByName } from "./repo.js";
import type { LibraryDeps } from "./save.js";
import {
  createEntry,
  createPrompt,
  removeEntry,
  removePrompt,
  updateEntry,
  updatePrompt,
} from "./save.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");

function deps(): LibraryDeps {
  const db = openDb(":memory:");
  migrate(db, clock);
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `t${String(n)}`;
    },
  };
  return { db, ids, clock };
}

function id<T extends { id: string }>(result: { ok: true; value: T } | { ok: false }): string {
  if (!result.ok) {
    throw new Error("expected the save to succeed");
  }
  return result.value.id;
}

describe("createPrompt", () => {
  it("stores the trimmed name, the body as written, and the detected slots", () => {
    const library = deps();

    const result = createPrompt(library, {
      kind: "article",
      name: "  Documentary dossier  ",
      body: "Compose a {{minWords}}-word dossier on {{topic}}.",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: "t1",
        kind: "article",
        name: "Documentary dossier",
        body: "Compose a {{minWords}}-word dossier on {{topic}}.",
        slots: ["minWords", "topic"],
        updatedAt: "2026-09-02T10:00:00.000Z",
      },
    });
    expect(promptById(library.db, "t1")?.slots).toEqual(["minWords", "topic"]);
  });

  it("stores an empty slot list for a body with no slots", () => {
    const library = deps();

    expect(id(createPrompt(library, { kind: "image", name: "Plain", body: "A photo." }))).toBe(
      "t1",
    );
    expect(promptById(library.db, "t1")?.slots).toEqual([]);
  });

  // Verification 3: lint blocks the save, and nothing is stored.
  it("refuses a malformed slot and stores nothing", () => {
    const library = deps();

    const result = createPrompt(library, {
      kind: "article",
      name: "Broken",
      body: "Write about {{topic",
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      fields: [{ field: "body", message: "The `{{` at line 1, column 13 is never closed." }],
    });
    expect(listPrompts(library.db)).toEqual([]);
  });

  it("refuses an empty body and stores nothing", () => {
    const library = deps();

    expect(createPrompt(library, { kind: "article", name: "Empty", body: "  " })).toEqual({
      ok: false,
      reason: "invalid",
      fields: [{ field: "body", message: "A body is required." }],
    });
    expect(listPrompts(library.db)).toEqual([]);
  });

  it("refuses a name that differs only by case within the same kind", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "Dossier", body: "{{topic}}" });

    const again = createPrompt(library, { kind: "article", name: "DOSSIER", body: "other" });

    expect(again).toEqual({ ok: false, reason: "duplicate-name" });
    expect(listPrompts(library.db)).toHaveLength(1);
  });

  it("allows the same name under a different kind", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "Dossier", body: "{{topic}}" });

    expect(createPrompt(library, { kind: "image", name: "dossier", body: "a scene" }).ok).toBe(
      true,
    );
    expect(createPrompt(library, { kind: "thumbnail", name: "Dossier", body: "a card" }).ok).toBe(
      true,
    );
  });

  // The name is trimmed before the index sees it, so padding cannot smuggle a duplicate.
  it("refuses a name that collides only after trimming", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "Dossier", body: "b" });

    expect(createPrompt(library, { kind: "article", name: "  Dossier ", body: "b" })).toEqual({
      ok: false,
      reason: "duplicate-name",
    });
  });
});

describe("updatePrompt", () => {
  // A save overwrites, and the stored slots follow the new body.
  it("overwrites the body and recomputes the slots", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "Dossier", body: "{{topic}} {{era}}" });

    const result = updatePrompt(library, "t1", {
      kind: "article",
      name: "Dossier",
      body: "only {{era}} now",
    });

    expect(result.ok).toBe(true);
    expect(promptById(library.db, "t1")?.slots).toEqual(["era"]);
  });

  // The kind may be changed after creation.
  it("moves a prompt to another kind", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "Dossier", body: "b" });

    expect(updatePrompt(library, "t1", { kind: "thumbnail", name: "Dossier", body: "b" }).ok).toBe(
      true,
    );
    expect(promptById(library.db, "t1")?.kind).toBe("thumbnail");
  });

  it("keeps its own name without seeing a collision with itself", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "Dossier", body: "b" });

    expect(updatePrompt(library, "t1", { kind: "article", name: "dossier", body: "c" }).ok).toBe(
      true,
    );
    expect(promptByName(library.db, "article", "DOSSIER")?.body).toBe("c");
  });

  it("refuses a rename onto another prompt of the same kind", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "Dossier", body: "b" });
    createPrompt(library, { kind: "article", name: "Listicle", body: "b" });

    expect(updatePrompt(library, "t2", { kind: "article", name: "dossier", body: "b" })).toEqual({
      ok: false,
      reason: "duplicate-name",
    });
  });

  // Moving a prompt into a kind that already has that name is the same collision.
  it("refuses a kind change that collides in the new kind", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "Shared", body: "b" });
    createPrompt(library, { kind: "image", name: "Shared", body: "b" });

    expect(updatePrompt(library, "t2", { kind: "article", name: "Shared", body: "b" })).toEqual({
      ok: false,
      reason: "duplicate-name",
    });
  });

  it("says so when no prompt has that id", () => {
    expect(updatePrompt(deps(), "nope", { kind: "article", name: "N", body: "b" })).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("refuses a malformed slot without touching the stored body", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "Dossier", body: "{{topic}}" });

    expect(
      updatePrompt(library, "t1", { kind: "article", name: "Dossier", body: "{{{{topic}}}}" }).ok,
    ).toBe(false);
    expect(promptById(library.db, "t1")?.body).toBe("{{topic}}");
  });
});

describe("removePrompt", () => {
  it("removes the prompt and frees its name", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "Dossier", body: "b" });

    expect(removePrompt(library, "t1")).toEqual({ ok: true, value: null });
    expect(listPrompts(library.db)).toEqual([]);
    expect(createPrompt(library, { kind: "article", name: "Dossier", body: "b" }).ok).toBe(true);
  });

  it("says so when no prompt has that id", () => {
    expect(removePrompt(deps(), "nope")).toEqual({ ok: false, reason: "not-found" });
  });

  // A project references a template by name inside its config and
  // never by foreign key, so deleting the template leaves the project untouched.
  it("leaves a project that used the prompt exactly as it was", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "Dossier", body: "{{topic}}" });
    const config =
      '{"title":"T","format":"16:9","sources":{"research":"off","article":"generate","audio":"provide","images":"provide","thumbnail":"off","video":"generate"},"articlePrompt":"Dossier","imagePrompts":[],"values":{"topic":"rope"},"provided":{},"silenceGapSeconds":3,"rendered":{"article":"rope"}}';
    library.db
      .prepare("INSERT INTO projects VALUES ('p1','T','16:9',?,'2026-09-02','2026-09-02')")
      .run(config);

    expect(removePrompt(library, "t1").ok).toBe(true);

    const row = library.db.prepare("SELECT config FROM projects WHERE id = 'p1'").get();
    expect(row).toEqual({ config });
  });
});

describe("listPrompts", () => {
  // Sorted by name.
  it("sorts by name without regard to case", () => {
    const library = deps();
    createPrompt(library, { kind: "article", name: "zebra", body: "b" });
    createPrompt(library, { kind: "image", name: "Apple", body: "b" });
    createPrompt(library, { kind: "thumbnail", name: "mango", body: "b" });

    expect(listPrompts(library.db).map((prompt) => prompt.name)).toEqual([
      "Apple",
      "mango",
      "zebra",
    ]);
  });
});

// The entries library obeys the same rules under its own category.
describe("entries", () => {
  it("stores an entry with its mode and detected slots", () => {
    const library = deps();

    expect(
      createEntry(library, {
        category: "intro",
        mode: "llm",
        name: "Welcome",
        body: "Greet the viewer about {{topic}}.",
      }),
    ).toEqual({
      ok: true,
      value: {
        id: "t1",
        category: "intro",
        mode: "llm",
        name: "Welcome",
        body: "Greet the viewer about {{topic}}.",
        slots: ["topic"],
        updatedAt: "2026-09-02T10:00:00.000Z",
      },
    });
  });

  it("refuses a name that differs only by case within the same category", () => {
    const library = deps();
    createEntry(library, { category: "intro", mode: "text", name: "Welcome", body: "Hi." });

    expect(
      createEntry(library, { category: "intro", mode: "llm", name: "WELCOME", body: "Hi." }),
    ).toEqual({ ok: false, reason: "duplicate-name" });
  });

  it("allows the same name under the other category", () => {
    const library = deps();
    createEntry(library, { category: "intro", mode: "text", name: "Welcome", body: "Hi." });

    expect(
      createEntry(library, { category: "outro", mode: "text", name: "welcome", body: "Bye." }).ok,
    ).toBe(true);
    expect(entryByName(library.db, "outro", "WELCOME")?.body).toBe("Bye.");
  });

  it("refuses a malformed slot", () => {
    expect(
      createEntry(deps(), { category: "outro", mode: "text", name: "Bye", body: "{{}}" }),
    ).toEqual({
      ok: false,
      reason: "invalid",
      fields: [{ field: "body", message: "The slot at line 1, column 1 has no name." }],
    });
  });

  it("switches an entry between text and LLM mode", () => {
    const library = deps();
    createEntry(library, { category: "intro", mode: "text", name: "Welcome", body: "Hi." });

    expect(
      updateEntry(library, "t1", {
        category: "intro",
        mode: "llm",
        name: "Welcome",
        body: "Write a greeting.",
      }).ok,
    ).toBe(true);
    expect(entryByName(library.db, "intro", "Welcome")?.mode).toBe("llm");
  });

  it("says so when no entry has that id", () => {
    const library = deps();

    expect(
      updateEntry(library, "nope", { category: "intro", mode: "text", name: "N", body: "b" }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(removeEntry(library, "nope")).toEqual({ ok: false, reason: "not-found" });
  });

  it("removes an entry", () => {
    const library = deps();
    createEntry(library, { category: "intro", mode: "text", name: "Welcome", body: "Hi." });

    expect(removeEntry(library, "t1")).toEqual({ ok: true, value: null });
    expect(listEntries(library.db)).toEqual([]);
  });
});
