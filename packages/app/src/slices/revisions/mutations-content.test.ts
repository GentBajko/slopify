import { afterEach, expect, it } from "vitest";
import type { RevisionView } from "./model.js";
import { imageFixture, mutationFixture, preparedOutput, publicationFor } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";
import { commitRevisionOutputs } from "./publish.js";
import { getRevisionView } from "./view.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
async function fixture() {
  const h = await mutationFixture();
  cleanups.push(h.close);
  return h;
}
function request(view: RevisionView, key: string) {
  return {
    projectId: view.revision.projectId,
    baseRevisionId: view.revision.id,
    idempotencyKey: key,
  };
}
it("keeps generated article provenance on prompt edits and preserves manual edits until explicit regeneration", async () => {
  const h = await fixture();
  const config = {
    ...h.config,
    sources: { ...h.config.sources, article: "generate" as const },
    llm: { provider: "text", model: "llm" },
    rendered: { article: "Write something." },
  };
  const first = await saveRevision(h.deps, {
    ...request(h.base, "generate"),
    edit: {
      config,
      content: { ...h.base.revision.content, promptTemplates: { article: "Write something." } },
    },
  });
  if (!first.ok) throw new Error(JSON.stringify(first));
  const publication = publicationFor(h.deps, first.view, "article:body");
  const output = preparedOutput(h.deps, publication, "article:body", "article_md");
  commitRevisionOutputs(h.deps, publication, [output], []);
  const base = getRevisionView(h.deps, h.projectId, first.view.revision.id);
  if (base === undefined) throw new Error("Missing view.");
  const changed = await saveRevision(h.deps, {
    ...request(base, "prompt"),
    edit: {
      config: base.revision.config,
      content: {
        ...base.revision.content,
        articleMarkdown: base.articleMarkdown ?? "",
        promptTemplates: { article: "Write differently." },
      },
    },
  });
  if (!changed.ok) throw new Error(JSON.stringify(changed));
  expect(changed.view.revision.content.articleEdited).toBe(false);
  expect(changed.view.outputs.find((row) => row.output.role === "article_md")?.state).toBe(
    "outdated",
  );
  const manual = await saveRevision(h.deps, {
    ...request(changed.view, "manual"),
    edit: {
      config: changed.view.revision.config,
      content: { ...changed.view.revision.content, articleMarkdown: "My edited article." },
    },
  });
  if (!manual.ok) throw new Error(JSON.stringify(manual));
  expect(manual.view.revision.content.articleEdited).toBe(true);
  const provider = await saveRevision(h.deps, {
    ...request(manual.view, "provider"),
    edit: {
      config: { ...manual.view.revision.config, llm: { provider: "other", model: "new" } },
      content: { ...manual.view.revision.content, articleEdited: false },
    },
  });
  if (!provider.ok) throw new Error(JSON.stringify(provider));
  expect(provider.view.revision.content.articleEdited).toBe(true);
  const regen = await saveRevision(h.deps, {
    ...request(provider.view, "regenerate"),
    edit: {
      config: provider.view.revision.config,
      content: provider.view.revision.content,
      regenerate: ["article:body"],
    },
  });
  if (!regen.ok) throw new Error(JSON.stringify(regen));
  expect(regen.view.revision.content.articleEdited).toBe(false);
  expect(regen.view.revision.content.articleMarkdown).toBe("My edited article.");
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()).toEqual({ n: 0 });
});
it.each(["deleted", "modified"] as const)(
  "refuses ambiguous legacy keyword edits when the original library template was %s",
  async (mode) => {
    const h = await fixture();
    h.deps.db.exec(
      "INSERT INTO prompts VALUES ('lib','article','Original','Write {{topic}}','[\"topic\"]','old')",
    );
    const generated = {
      ...h.config,
      sources: { ...h.config.sources, article: "generate" as const },
      llm: { provider: "text", model: "llm" },
      rendered: { article: "Write boats" },
      values: { topic: "boats" },
    };
    const saved = await saveRevision(h.deps, {
      ...request(h.base, "legacy"),
      edit: {
        config: generated,
        content: { ...h.base.revision.content, promptTemplates: { article: null } },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    if (mode === "deleted") h.deps.db.exec("DELETE FROM prompts WHERE id='lib'");
    else h.deps.db.exec("UPDATE prompts SET body='Updated {{topic}}' WHERE id='lib'");
    const edit = {
      config: { ...saved.view.revision.config, values: { topic: "trains" } },
      content: saved.view.revision.content,
    };
    expect(await saveRevision(h.deps, { ...request(saved.view, "ambiguous"), edit })).toMatchObject(
      { ok: false, reason: "invalid-edit" },
    );
    const before = h.deps.db.prepare("SELECT * FROM prompts").all();
    const chosen = await saveRevision(h.deps, {
      ...request(saved.view, "chosen"),
      edit: {
        ...edit,
        content: { ...edit.content, promptTemplates: { article: "Chosen {{topic}}" } },
      },
    });
    expect(chosen).toMatchObject({
      ok: true,
      view: { revision: { config: { rendered: { article: "Chosen trains" } } } },
    });
    expect(h.deps.db.prepare("SELECT * FROM prompts").all()).toEqual(before);
  },
);
it("binds per-image raw templates by stable key through reorder and requires Images plus Video off for the last deletion", async () => {
  const h = await imageFixture();
  cleanups.push(h.close);
  const first = h.base.revision.content.imageDefinitions.first;
  if (first === undefined) throw new Error("Missing image.");
  const content = {
    ...h.base.revision.content,
    imageOrder: ["second", "first"],
    promptTemplates: { "image:first": "A {{topic}}" },
    imageDefinitions: {
      ...h.base.revision.content.imageDefinitions,
      first: { ...first, templateKey: "image:first" },
    },
  };
  const saved = await saveRevision(h.deps, {
    ...request(h.base, "template"),
    edit: { config: { ...h.base.revision.config, values: { topic: "boat" } }, content },
  });
  expect(saved).toMatchObject({ ok: false, reason: "invalid-edit" });
  const explicit = {
    ...content,
    promptTemplates: { ...content.promptTemplates, "image:second": "Second" },
    imageDefinitions: {
      ...content.imageDefinitions,
      second: {
        source: "generate" as const,
        assetId: null,
        prompt: "Second",
        templateKey: "image:second",
      },
    },
  };
  const valid = await saveRevision(h.deps, {
    ...request(h.base, "explicit"),
    edit: { config: { ...h.base.revision.config, values: { topic: "boat" } }, content: explicit },
  });
  if (!valid.ok) throw new Error(JSON.stringify(valid));
  expect(valid.view.revision.content.imageDefinitions.first?.templateKey).toBe("image:first");
  expect(
    await saveRevision(h.deps, {
      ...request(valid.view, "delete"),
      edit: {
        config: valid.view.revision.config,
        content: { ...valid.view.revision.content, imageOrder: [], imageDefinitions: {} },
      },
    }),
  ).toMatchObject({ ok: false, reason: "invalid-edit" });
});
