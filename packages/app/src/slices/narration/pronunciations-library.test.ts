import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { readSetting } from "../settings/repo.js";
import { libraryPronunciationsMax } from "./pronunciation.js";
import {
  libraryGlossary,
  libraryPronunciationsKey,
  readLibraryPronunciations,
  saveLibraryPronunciations,
} from "./pronunciations-library.js";

const clock = fixedClock("2026-11-08T09:00:00.000Z");

function store() {
  const db = openDb(":memory:");
  migrate(db, clock);
  return { db, clock };
}

it("keeps one list and says what narration makes of it", () => {
  const deps = store();
  const empty = readLibraryPronunciations(deps.db);
  expect(empty.text).toBe("");
  expect(empty.terms).toBe(0);
  const saved = saveLibraryPronunciations(
    deps,
    "  Gygax: /ˈɡaɪɡæks/\nFaerûn: /feɪˈruːn/\nLolthite: /ˈloʊlθaɪt/\nToril: —\nNew York: /njuː/\n",
    empty.version,
  );
  if (!saved.ok) throw new Error(saved.detail);
  expect(saved.list.terms).toBe(3);
  // The name left without a pronunciation on purpose is counted, not called an error; the row
  // with one IPA word for two written words is named by its number so it can be fixed.
  expect(saved.list.unpronounced).toBe(1);
  expect(saved.list.skipped).toEqual([
    {
      row: 5,
      reason: "supply one IPA word for each written word, or for each hyphen-separated part of it",
    },
  ]);
  expect(saved.list.savedAt).toBe("2026-11-08T09:00:00.000Z");
  expect(saved.list.savedBy).toBe("person");
  expect(readLibraryPronunciations(deps.db).text.startsWith("Gygax:")).toBe(true);
});

it("forgets the list when it is emptied, and refuses one too long to carry", () => {
  const deps = store();
  const first = saveLibraryPronunciations(deps, "Gygax: /ˈɡaɪɡæks/");
  if (!first.ok) throw new Error(first.detail);
  const cleared = saveLibraryPronunciations(deps, "   \n ", first.list.version);
  expect(cleared.ok).toBe(true);
  expect(readSetting(deps.db, libraryPronunciationsKey)).toBeUndefined();
  const long = saveLibraryPronunciations(deps, "x".repeat(libraryPronunciationsMax + 1));
  expect(long).toMatchObject({ ok: false, reason: "refused" });
  if (long.ok) throw new Error("expected a refusal");
  expect(long.detail).toContain("Keep the list under");
  expect(saveLibraryPronunciations(deps, 7)).toMatchObject({ ok: false, reason: "refused" });
});

it("refuses a save made from an older list rather than replacing what is there", () => {
  const deps = store();
  // Opened in two windows: both read the same list.
  const opened = saveLibraryPronunciations(deps, "Gygax: /ˈɡaɪɡæks/");
  if (!opened.ok) throw new Error(opened.detail);
  const seenByBoth = opened.list.version;
  const agent = saveLibraryPronunciations(
    deps,
    "Gygax: /ˈɡaɪɡæks/\nIuz: /aɪˈuːz/",
    seenByBoth,
    "agent",
  );
  expect(agent.ok).toBe(true);

  const stale = saveLibraryPronunciations(deps, "Gygax: /ˈɡaɪɡæks/\nThay: /θeɪ/", seenByBoth);
  expect(stale).toMatchObject({ ok: false, reason: "conflict" });
  if (stale.ok || stale.reason !== "conflict") throw new Error("expected a conflict");
  expect(stale.detail).toContain("2 names now, saved by an agent");
  expect(stale.current.text).toContain("Iuz");
  // Nothing was written: the agent's save still stands.
  expect(readLibraryPronunciations(deps.db).text).toContain("Iuz");
  // Saving again from what the refusal handed back keeps the person's own work.
  const kept = saveLibraryPronunciations(
    deps,
    "Gygax: /ˈɡaɪɡæks/\nThay: /θeɪ/",
    stale.current.version,
  );
  expect(kept.ok).toBe(true);
  expect(readLibraryPronunciations(deps.db).text).toContain("Thay");
});

it("refuses a save that names no version once a list exists", () => {
  const deps = store();
  // The first save has nothing to lose, so it needs no version.
  expect(saveLibraryPronunciations(deps, "Gygax: /ˈɡaɪɡæks/").ok).toBe(true);
  const blind = saveLibraryPronunciations(deps, "Lolth: /loʊlθ/");
  expect(blind).toMatchObject({ ok: false, reason: "conflict" });
  if (blind.ok || blind.reason !== "conflict") throw new Error("expected a conflict");
  expect(blind.detail).toContain("Read it first");
  expect(readLibraryPronunciations(deps.db).text).toContain("Gygax");
});

it("reads the list under the project's own language and rules", () => {
  // English takes the standard-English atoms Inworld asks for; another language takes full IPA.
  expect(libraryGlossary("Köln: /kœln/", "de")).toEqual({
    ok: true,
    entries: [{ term: "Köln", ipa: ["kœln"] }],
  });
  expect(libraryGlossary("Köln: /kœln/", "en")).toMatchObject({ ok: true, entries: [] });
  // Rules 1 projects never learnt possessives or hyphenated names, and must not change now.
  expect(libraryGlossary("Arach-Tinilith: /əˈræk ˈtɪnɪlɪθ/", "en", 2)).toEqual({
    ok: true,
    entries: [{ term: "Arach-Tinilith", ipa: ["əˈræk.ˈtɪnɪlɪθ"] }],
  });
  expect(libraryGlossary("Arach-Tinilith: /əˈræk ˈtɪnɪlɪθ/", "en", 1)).toMatchObject({
    ok: true,
    entries: [],
  });
  expect(libraryGlossary(undefined)).toEqual({ ok: true, entries: [] });
});
