import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { RunDraft } from "../admission/model.js";
import type { LibraryDeps } from "./save.js";
import { createEntry, createPrompt } from "./save.js";
import { pickTemplates, renderPicked } from "./slots.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");

function library(): LibraryDeps {
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

function draft(over: Partial<RunDraft> = {}): RunDraft {
  return {
    title: "Rope Tricks",
    format: "16:9",
    sources: {
      research: "off",
      article: "generate",
      audio: "provide",
      images: "generate",
      thumbnail: "off",
      video: "generate",
    },
    imagePrompts: [],
    values: {},
    provided: {},
    silenceGapSeconds: 3,
    ...over,
  };
}

describe("pickTemplates", () => {
  it("asks for the slots of the picked article prompt", () => {
    const deps = library();
    createPrompt(deps, { kind: "article", name: "Dossier", body: "{{topic}} in {{tone}}" });

    const picked = pickTemplates(deps.db, draft({ articlePrompt: "Dossier" }));

    expect(picked.requiredSlots).toEqual(["topic", "tone"]);
    expect(picked.missing).toEqual([]);
  });

  // Names are matched case-insensitively, so the picker's spelling
  // does not have to match the saved one.
  it("finds a prompt by a differently cased name", () => {
    const deps = library();
    createPrompt(deps, { kind: "article", name: "Dossier", body: "{{topic}}" });

    expect(pickTemplates(deps.db, draft({ articlePrompt: "DOSSIER" })).requiredSlots).toEqual([
      "topic",
    ]);
  });

  // Article body order, then image prompts in selection order, then the
  // thumbnail prompt; each distinct name once.
  it("orders the slots by first appearance across the picked bodies", () => {
    const deps = library();
    createPrompt(deps, { kind: "article", name: "Dossier", body: "{{topic}} {{tone}}" });
    createPrompt(deps, { kind: "image", name: "Oils", body: "{{topic}} {{era}}" });
    createPrompt(deps, { kind: "image", name: "Maps", body: "{{scale}}" });
    createPrompt(deps, { kind: "thumbnail", name: "Card", body: "{{title}} {{topic}}" });

    const picked = pickTemplates(
      deps.db,
      draft({
        articlePrompt: "Dossier",
        imagePrompts: [
          { name: "Oils", number: 2 },
          { name: "Maps", number: 1 },
        ],
        thumbnailPrompt: "Card",
        sources: { ...draft().sources, thumbnail: "from_prompt" },
      }),
    );

    expect(picked.requiredSlots).toEqual(["topic", "tone", "era", "scale", "title"]);
  });

  // Only stages set to Generate contribute.
  it("ignores a prompt left selected on a stage set to Provide", () => {
    const deps = library();
    createPrompt(deps, { kind: "article", name: "Dossier", body: "{{topic}}" });

    const picked = pickTemplates(
      deps.db,
      draft({
        articlePrompt: "Dossier",
        sources: { ...draft().sources, article: "provide" },
      }),
    );

    expect(picked.requiredSlots).toEqual([]);
    expect(picked.bodies).toEqual([]);
  });

  it("ignores a thumbnail prompt while the thumbnail is off", () => {
    const deps = library();
    createPrompt(deps, { kind: "thumbnail", name: "Card", body: "{{title}}" });

    expect(pickTemplates(deps.db, draft({ thumbnailPrompt: "Card" })).requiredSlots).toEqual([]);
  });

  it("reads the thumbnail template in both Generate modes", () => {
    const deps = library();
    createPrompt(deps, { kind: "thumbnail", name: "Card", body: "{{title}}" });

    for (const thumbnail of ["from_prompt", "prompt_by_llm"] as const) {
      const picked = pickTemplates(
        deps.db,
        draft({ thumbnailPrompt: "Card", sources: { ...draft().sources, thumbnail } }),
      );
      expect(picked.requiredSlots).toEqual(["title"]);
    }
  });

  it("adds the picked intro and outro entries to the text side", () => {
    const deps = library();
    createEntry(deps, { category: "intro", mode: "text", name: "Welcome", body: "{{greeting}}" });
    createEntry(deps, { category: "outro", mode: "text", name: "Bye", body: "{{signoff}}" });

    const picked = pickTemplates(
      deps.db,
      draft({
        intro: { name: "Welcome", mode: "text" },
        outro: { name: "Bye", mode: "text" },
      }),
    );

    expect(picked.requiredSlots).toEqual(["greeting", "signoff"]);
  });

  // Whether the run needs an LLM depends on the entry's saved mode, so
  // the request's claim about it is replaced, not trusted.
  it("takes a picked entry's mode from the saved entry", () => {
    const deps = library();
    createEntry(deps, { category: "intro", mode: "llm", name: "Welcome", body: "Greet them." });

    const picked = pickTemplates(deps.db, draft({ intro: { name: "welcome", mode: "text" } }));

    expect(picked.draft.intro).toEqual({ name: "Welcome", mode: "llm" });
  });

  it("leaves the draft's entries alone when none is picked", () => {
    const deps = library();

    expect(pickTemplates(deps.db, draft()).draft.intro).toBeUndefined();
  });

  // A template deleted between selection and Play.
  it("marks a picked prompt that no longer exists", () => {
    const deps = library();

    const picked = pickTemplates(
      deps.db,
      draft({
        articlePrompt: "Gone",
        imagePrompts: [{ name: "Vanished", number: 1 }],
      }),
    );

    expect(picked.missing).toEqual([
      { field: "articlePrompt", message: "That article prompt no longer exists; pick another." },
      {
        field: "imagePrompts.0.name",
        message: "That image prompt no longer exists; pick another.",
      },
    ]);
  });

  it("marks a picked entry that no longer exists", () => {
    const deps = library();

    expect(
      pickTemplates(deps.db, draft({ outro: { name: "Gone", mode: "text" } })).missing,
    ).toEqual([{ field: "outro", message: "That outro entry no longer exists; pick another." }]);
  });

  // An unpicked prompt is admission's rule to state, so the field is marked once.
  it("says nothing about a stage that has no prompt picked at all", () => {
    expect(pickTemplates(library().db, draft({ articlePrompt: "  " })).missing).toEqual([]);
  });
});

describe("renderPicked", () => {
  it("keys every rendered body by the draft field that picked it", () => {
    const deps = library();
    createPrompt(deps, { kind: "article", name: "Dossier", body: "Write about {{topic}}." });
    createPrompt(deps, { kind: "image", name: "Oils", body: "An oil painting of {{topic}}." });
    createPrompt(deps, { kind: "thumbnail", name: "Card", body: "{{topic}} card" });
    createEntry(deps, {
      category: "intro",
      mode: "text",
      name: "Welcome",
      body: "Today: {{topic}}.",
    });

    const picked = pickTemplates(
      deps.db,
      draft({
        articlePrompt: "Dossier",
        imagePrompts: [{ name: "Oils", number: 2 }],
        thumbnailPrompt: "Card",
        intro: { name: "Welcome", mode: "text" },
        sources: { ...draft().sources, thumbnail: "from_prompt" },
      }),
    );

    expect(renderPicked(picked, { topic: "rope" })).toEqual({
      article: "Write about rope.",
      intro: "Today: rope.",
      "imagePrompts.0": "An oil painting of rope.",
      thumbnailPrompt: "rope card",
    });
  });

  // One name, one value, in every prompt of the run.
  it("gives the same name the same value in every body", () => {
    const deps = library();
    createPrompt(deps, { kind: "article", name: "A", body: "{{topic}}" });
    createPrompt(deps, { kind: "image", name: "B", body: "{{topic}}" });

    const picked = pickTemplates(
      deps.db,
      draft({ articlePrompt: "A", imagePrompts: [{ name: "B", number: 1 }] }),
    );

    expect(renderPicked(picked, { topic: "rope" })).toEqual({
      article: "rope",
      "imagePrompts.0": "rope",
    });
  });

  // A slot name is user-authored, so a body may name a member of Object's prototype.
  it("does not read a slot's value off Object's prototype", () => {
    const deps = library();
    createPrompt(deps, { kind: "article", name: "A", body: "Write {{constructor}} now." });

    const picked = pickTemplates(deps.db, draft({ articlePrompt: "A" }));

    expect(picked.requiredSlots).toEqual(["constructor"]);
    expect(renderPicked(picked, {})).toEqual({ article: "Write {{constructor}} now." });
    expect(renderPicked(picked, { constructor: "a rope" })).toEqual({
      article: "Write a rope now.",
    });
  });

  it("renders nothing when no template is picked", () => {
    expect(renderPicked(pickTemplates(library().db, draft()), {})).toEqual({});
  });
});
