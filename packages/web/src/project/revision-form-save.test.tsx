import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { saveRevisionSchema } from "@app/slices/revisions/schema.js";
import { defaultSubtitles } from "@app/slices/subtitles/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { stageWords } from "@/lib/stage-words";
import { jsonAnswer, openEditSection, renderRouted, testDeps } from "@/test-app";
import { revisionView } from "./revision-fixture.js";
import { RevisionForm } from "./revision-form.js";
import { RevisionWorkspace } from "./revision-workspace.js";

afterEach(cleanup);
function mount(view: RevisionView) {
  const saves: RevisionEdit[] = [];
  renderRouted(
    <RevisionWorkspace
      projectId="p1"
      currentRevisionId="r1"
      renderEditor={(props) => <RevisionForm {...props} />}
    />,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
      "POST /api/projects/p1/revisions/prepare": jsonAnswer({ ok: true, view, created: false }),
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
      "GET /api/fonts": jsonAnswer({ fonts: [] }),
      "GET /api/providers/llm/models": jsonAnswer({ models: [], allowsCustom: false }),
      "GET /api/providers/tts/models": jsonAnswer({ models: [], allowsCustom: false }),
      "POST /api/projects/p1/revisions": async (request) => {
        const { edit } = saveRevisionSchema.parse(await request.json());
        saves.push(edit);
        return jsonAnswer(
          { detail: "Draft retained for inspection.", reason: "conflict", fields: [] },
          409,
        )(request);
      },
    }),
  );
  return saves;
}
function generatedArticle(): RevisionView {
  const base = revisionView();
  return {
    ...base,
    articleMarkdown: "Newly regenerated article.",
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, article: "generate" },
        llm: { provider: "llm", model: "text-model" },
        rendered: { article: "Write an article." },
      },
      content: {
        ...base.revision.content,
        articleMarkdown: "Earlier article.",
        articleEdited: false,
      },
    },
  };
}
it("opens regenerated article text, keeps title-only saves generated, and retains manual drafts", async () => {
  const user = userEvent.setup();
  const saves = mount(generatedArticle());
  await user.click(await screen.findByRole("button", { name: "Edit settings again" }));
  await openEditSection("Article");
  const article = await screen.findByRole<HTMLTextAreaElement>("textbox", { name: "Article text" });
  expect(article.value).toBe("Newly regenerated article.");
  await user.type(screen.getByLabelText("Project title"), " renamed");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0]?.content.articleEdited).toBe(false);
  expect(saves[0]?.content.articleMarkdown).toBe("Earlier article.");
  await user.clear(article);
  await user.type(article, "Earlier article.");
  await user.type(screen.getByLabelText("Project title"), " again");
  expect(article.value).toBe("Earlier article.");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saves).toHaveLength(2));
  expect(saves[1]?.content.articleMarkdown).toBe("Earlier article.");
  expect(saves[1]?.content.articleEdited).toBe(true);
});
it.each([false, true])(
  "switches generated article to Provide using current text with manual draft %s",
  async (manual) => {
    const user = userEvent.setup();
    const saves = mount(generatedArticle());
    await user.click(await screen.findByRole("button", { name: "Edit settings again" }));
    await openEditSection("Article");
    const article = await screen.findByRole<HTMLTextAreaElement>("textbox", {
      name: "Article text",
    });
    if (manual) {
      await user.clear(article);
      await user.type(article, "My unsaved article.");
    }
    await user.click(
      within(screen.getByRole("radiogroup", { name: "Article" })).getByRole("radio", {
        name: "Use my text as written",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]?.config.sources.article).toBe("provide");
    expect(saves[0]?.content.articleMarkdown).toBe(
      manual ? "My unsaved article." : "Newly regenerated article.",
    );
  },
);
// Where each stage's strip is, and what its Off is called there.
const sections = { audio: "Narration", video: "Video and style", images: "Images" } as const;
const offWords = { audio: "Off", video: "Off (sound only)", images: "None" } as const;
it.each([
  ["audio", "files", "off"],
  ["audio", "burn-in", "off"],
  ["video", "burn-in", "files"],
  ["images", "burn-in", "files"],
] as const)(
  "normalizes subtitles when %s is Off from %s to %s before Save",
  async (source, before, after) => {
    const user = userEvent.setup();
    const base = revisionView();
    const subtitles = { ...defaultSubtitles, mode: before, fontSize: 64, position: "top" as const };
    const saves = mount({
      ...base,
      revision: {
        ...base.revision,
        config: {
          ...base.revision.config,
          sources: {
            ...base.revision.config.sources,
            audio: "generate",
            images: "provide",
            video: "generate",
          },
          audio: { provider: "tts", model: "voice-model", voice: "voice" },
          subtitles,
        },
        content: {
          ...base.revision.content,
          imageOrder: ["image"],
          imageDefinitions: { image: { source: "provide", assetId: "image-asset", prompt: null } },
        },
      },
    });
    await user.click(await screen.findByRole("button", { name: "Edit settings again" }));
    await openEditSection(sections[source]);
    await user.click(
      within(screen.getByRole("radiogroup", { name: stageWords[source] })).getByRole("radio", {
        name: offWords[source],
      }),
    );
    await openEditSection("Captions");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Captions" }).value).toBe(after);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]?.config.subtitles).toEqual({ ...subtitles, mode: after });
  },
);
