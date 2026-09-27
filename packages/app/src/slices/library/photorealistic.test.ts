import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import {
  namesPhotorealisticPrompt,
  setPromptPhotorealistic,
  withPhotorealistic,
} from "./photorealistic.js";
import { listPrompts } from "./repo.js";
import type { LibraryDeps } from "./save.js";
import { createPrompt, updatePrompt } from "./save.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");

function deps(): LibraryDeps {
  const db = openDb(":memory:");
  migrate(db, clock);
  let n = 0;
  return { db, ids: { next: (): string => `t${String(++n)}` }, clock };
}

function created(library: LibraryDeps, kind: "image" | "article", name: string): string {
  const result = createPrompt(library, { kind, name, body: "A picture." });
  if (!result.ok) throw new Error("expected the prompt to save");
  return result.value.id;
}

describe("an Image prompt's photorealistic tick", () => {
  it("is off until set, and follows the prompt through a rename", () => {
    const library = deps();
    const id = created(library, "image", "Oil painting");
    expect(namesPhotorealisticPrompt(library.db, "Oil painting")).toBe(false);
    expect(setPromptPhotorealistic(library.db, id, true)).toEqual({ ok: true });
    expect(namesPhotorealisticPrompt(library.db, "oil painting")).toBe(true);
    expect(withPhotorealistic(library.db, listPrompts(library.db))[0]).toMatchObject({
      photorealistic: true,
    });
    updatePrompt(library, id, { kind: "image", name: "Photo", body: "A photo." });
    expect(namesPhotorealisticPrompt(library.db, "Photo")).toBe(true);
    // A name the Library no longer has is not ticked.
    expect(namesPhotorealisticPrompt(library.db, "Oil painting")).toBe(false);
    expect(namesPhotorealisticPrompt(library.db, undefined)).toBe(false);
    setPromptPhotorealistic(library.db, id, false);
    expect(namesPhotorealisticPrompt(library.db, "Photo")).toBe(false);
  });

  it("is refused for a prompt that isn't an Image prompt, or doesn't exist", () => {
    const library = deps();
    const id = created(library, "article", "Essay");
    expect(setPromptPhotorealistic(library.db, id, true)).toEqual({
      ok: false,
      reason: "not-an-image-prompt",
    });
    expect(setPromptPhotorealistic(library.db, "missing", true)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});
