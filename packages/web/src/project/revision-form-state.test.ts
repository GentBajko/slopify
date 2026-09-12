import { expect, it } from "vitest";
import { revisionView } from "./revision-fixture.js";
import { changeSource, editOfForm, formOfRevision, setPrompt } from "./revision-form-state.js";

it("preserves missing raw snapshots and renders only an explicitly chosen replacement", () => {
  const base = revisionView();
  const edit = formOfRevision({
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        values: { topic: "new" },
        rendered: { article: "old wording", extra: "kept" },
      },
      content: { ...base.revision.content, promptTemplates: { article: null } },
    },
  });
  expect(editOfForm(edit).config.rendered).toEqual({ article: "old wording", extra: "kept" });
  expect(setPrompt(edit, "article", "Write {{topic}}").config.rendered.article).toBe("Write new");
  expect(edit.content.promptTemplates.article).toBeNull();
});
it("keeps raw image template bindings when image order changes", () => {
  const base = formOfRevision(revisionView());
  const edit = {
    ...base,
    config: { ...base.config, values: { topic: "new" } },
    content: {
      ...base.content,
      imageOrder: ["second", "first"],
      promptTemplates: { "imagePrompts.0": "Paint {{topic}}" },
      imageDefinitions: {
        first: {
          source: "generate" as const,
          assetId: null,
          prompt: "Paint old",
          templateKey: "imagePrompts.0",
        },
        second: {
          source: "generate" as const,
          assetId: null,
          prompt: "Exact legacy literal",
          templateKey: null,
        },
      },
    },
  };
  const next = editOfForm(edit);
  expect(next.content.imageOrder).toEqual(["second", "first"]);
  expect(next.content.imageDefinitions.first?.prompt).toBe("Paint new");
  expect(next.content.imageDefinitions.second?.prompt).toBe("Exact legacy literal");
  expect(edit.content.imageDefinitions.first.prompt).toBe("Paint old");
});
it("deep clones the saved state and retains non-edited content references", () => {
  const base = revisionView();
  const view = {
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        intro: { name: "Old intro", mode: "text" as const },
        chunking: { mode: "characters" as const, characters: 1800 },
      },
      content: {
        ...base.revision.content,
        provided: { audio: "audio-1" },
        narrationOverrides: { "body:1": { kind: "asset" as const, assetId: "narration-1" } },
        regenerationTokens: { "article:body": "token" },
      },
    },
  };
  const next = formOfRevision(view);
  expect(next.config).not.toBe(view.revision.config);
  expect(next.content.provided).not.toBe(view.revision.content.provided);
  expect(editOfForm(next)).toEqual(next);
  expect(changeSource(next, "images", "off").config.sources.video).toBe("off");
});
