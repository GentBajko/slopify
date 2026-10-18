import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { attachSamples } from "../../kernel/paths.js";
import { storeArticleText } from "../article/store.js";
import { listNarrationAliases, saveNarrationAliases } from "../narration/aliases-library.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { createTemplate } from "../project-templates/service.js";
import { writeStudioSettings } from "./budget.js";
import { queuedJob } from "./jobs.js";
import { makePaidSample } from "./paid.js";
import { sampleOf, sampleProjects, sampleVersions } from "./repo.js";
import type { SaveDeps } from "./save.js";
import { linesWith, namesToCheck, pronunciationsOf, quoteSayItAs, sayItAs } from "./say-it-as.js";
import { paidDocument, paidSampleDeps } from "./studio.fake.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

const script =
  "Cleopatra ruled from Alexandria. Her rival was Octavian! Later, cleopatra lost.\n\nThe end came in Egypt.";
const glossary =
  "| Term | IPA |\n|---|---|\n| Cleopatra | kliːəˈpætrə |\n| Octavian | ɒkˈteɪviən |";

describe("namesToCheck", () => {
  it("lists the glossary's names with the first line each is said in and any alias it has", () => {
    expect(
      namesToCheck(glossary, script, [
        { written: "octavian", spoken: "Ock-TAY-vee-an", wholeWord: true, caseSensitive: false },
      ]),
    ).toEqual([
      {
        term: "Cleopatra",
        ipa: ["kliːəˈpætrə"],
        line: "Cleopatra ruled from Alexandria.",
        spokenAs: null,
      },
      {
        term: "Octavian",
        ipa: ["ɒkˈteɪviən"],
        line: "Her rival was Octavian!",
        spokenAs: "Ock-TAY-vee-an",
      },
    ]);
  });

  it("adds a Library alias's word the script says even without a glossary, and nothing else", () => {
    expect(
      namesToCheck(undefined, script, [
        { written: "Egypt", spoken: "Ee-jipt", wholeWord: true, caseSensitive: false },
        { written: "Rome", spoken: "Roam", wholeWord: true, caseSensitive: false },
      ]),
    ).toEqual([{ term: "Egypt", ipa: [], line: "The end came in Egypt.", spokenAs: "Ee-jipt" }]);
    expect(namesToCheck("not a glossary", undefined, [])).toEqual([]);
  });
});

describe("linesWith", () => {
  it("finds every sentence that says the word, whole words only, in any case", () => {
    expect(linesWith(script, "cleopatra")).toEqual([
      "Cleopatra ruled from Alexandria.",
      "Later, cleopatra lost.",
    ]);
    expect(linesWith(script, "Alex")).toEqual([]);
  });
});

function harness(options: { readonly aliasesOn?: boolean } = {}) {
  const h = draftFixture();
  open.push(h.close);
  attachSamples(h.deps.paths, sampleProjects(h.deps.db, h.deps.paths.dataDir));
  const { review, paid } = paidSampleDeps(h.deps);
  const base = paidDocument(review);
  const document: PlayDraftDocument = {
    ...base,
    form: {
      ...base.form,
      audio: { ...base.form.audio, useNarrationAliases: options.aliasesOn ?? true },
    },
  };
  const id = randomUUID();
  const created = createTemplate(h.deps, { id, name: "Show", document });
  if (!created.ok) throw new Error(created.reason);
  const deps: SaveDeps = {
    db: h.deps.db,
    clock: h.deps.clock,
    review,
    acks: paid.acks,
    timeZone: "UTC",
  };
  const withSample = async () => {
    await makePaidSample(
      paid,
      { templateId: id, templateVersion: 1, ackHigh: 5, kind: "save", requestedAt: "a" },
      new AbortController().signal,
    );
    const projectId = sampleOf(h.deps.db, id)?.projectId ?? "";
    storeArticleText(h.deps, {
      projectId,
      markdown: `${script}\n\n## Pronunciation Glossary\n\n${glossary}`,
    });
    return projectId;
  };
  const studio = { db: h.deps.db, paths: h.deps.paths, ids: h.deps.ids, clock: h.deps.clock };
  return { h, deps, id, withSample, studio };
}

describe("pronunciationsOf", () => {
  it("reads the names from the sample's own script and glossary", async () => {
    const { id, withSample, studio } = harness();
    await withSample();
    const result = pronunciationsOf(studio, id);
    expect(result).toMatchObject({ aliasesOn: true, problem: null });
    expect(result.names.map((name) => name.term)).toEqual(["Cleopatra", "Octavian"]);
    expect(result.voice).toMatchObject({ provider: "elevenlabs" });
  });

  it("says how to get the list before the template has a paid sample", () => {
    const { id, studio } = harness();
    expect(pronunciationsOf(studio, id)).toMatchObject({
      names: [],
      problem:
        "The names to check come from the sample's script. Press Save or Make sample to make one.",
    });
  });
});

describe("quoteSayItAs and sayItAs", () => {
  it("prices voicing only the lines that say the word, the new way", async () => {
    const { deps, id, withSample, studio } = harness();
    await withSample();
    const quote = quoteSayItAs({ ...deps, ...studio }, id, {
      written: "Cleopatra",
      spoken: "Klee-oh-PAT-ra",
    });
    if (!quote.ok) throw new Error(quote.message);
    expect(quote.value).toMatchObject({ lines: 2, problem: null });
    expect(quote.value.high).toBeGreaterThan(0);
  });

  it("writes the Library alias and re-voices only those lines at the price shown", async () => {
    const { deps, id, withSample, studio } = harness();
    await withSample();
    saveNarrationAliases(studio, [
      { written: "cleopatra", spoken: "Old", wholeWord: true, caseSensitive: false },
      { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false },
    ]);
    const quote = quoteSayItAs({ ...deps, ...studio }, id, {
      written: "Cleopatra",
      spoken: "Klee-oh-PAT-ra",
    });
    if (!quote.ok) throw new Error(quote.message);
    const result = await sayItAs({ ...deps, ...studio }, id, {
      written: "Cleopatra",
      spoken: "Klee-oh-PAT-ra",
      acknowledgedHigh: quote.value.high,
    });
    expect(result).toMatchObject({ ok: true, value: { queued: true } });
    expect(listNarrationAliases(deps.db)).toEqual([
      { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false },
      { written: "Cleopatra", spoken: "Klee-oh-PAT-ra", wholeWord: true, caseSensitive: false },
    ]);
    expect(queuedJob(deps.db, id)).toMatchObject({
      kind: "save",
      templateVersion: 1,
      ackHigh: quote.value.high,
    });
    expect(sampleVersions(deps.db, id)[0]).toMatchObject({ state: "queued" });
  });

  it("refuses past today's budget, writing nothing", async () => {
    const { deps, id, withSample, studio } = harness();
    await withSample();
    writeStudioSettings(deps.db, { dailyBudget: 0 });
    const result = await sayItAs({ ...deps, ...studio }, id, {
      written: "Cleopatra",
      spoken: "Klee-oh-PAT-ra",
      acknowledgedHigh: 1,
    });
    expect(result).toMatchObject({ ok: false, reason: "over-budget" });
    expect(listNarrationAliases(deps.db)).toEqual([]);
  });

  it("says to turn on narration aliases when the template's voice doesn't use them", async () => {
    const { deps, id, studio } = harness({ aliasesOn: false });
    const result = await sayItAs({ ...deps, ...studio }, id, {
      written: "Cleopatra",
      spoken: "Klee-oh-PAT-ra",
      acknowledgedHigh: 1,
    });
    expect(result).toEqual({
      ok: false,
      reason: "invalid-input",
      message:
        "This template's voice doesn't use Library → Narration aliases, so “Say it as” would change nothing. Turn on Use narration aliases in Voice → Fine-tune, press Save, then try again.",
    });
  });

  it("writes the alias without re-voicing anything when the script never says the word", async () => {
    const { deps, id, withSample, studio } = harness();
    await withSample();
    const result = await sayItAs({ ...deps, ...studio }, id, {
      written: "Ramses",
      spoken: "Ram-seez",
      acknowledgedHigh: 0,
    });
    expect(result).toMatchObject({ ok: true, value: { queued: false } });
    expect(listNarrationAliases(deps.db)).toHaveLength(1);
    expect(queuedJob(deps.db, id)).toBeUndefined();
  });
});
