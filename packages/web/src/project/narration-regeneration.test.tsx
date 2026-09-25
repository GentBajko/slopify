import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { saveRevisionSchema } from "@app/slices/revisions/schema.js";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { emptyAnswer, jsonAnswer, openEditSection, renderApp, testDeps } from "@/test-app";
import { RevisionContentEditors } from "./revision-content.js";
import { deferred, narrationView, response, staged } from "./revision-editor-test-fixtures.js";
import { RevisionForm } from "./revision-form.js";
import { RevisionWorkspace } from "./revision-workspace.js";

afterEach(cleanup);
function generatedNarration(): { readonly view: RevisionView; readonly key: string } {
  const base = narrationView();
  return {
    key: "audio:body:chunk1",
    view: {
      ...base,
      revision: {
        ...base.revision,
        config: {
          ...base.revision.config,
          audio: { provider: "tts", model: "voice-model", voice: "voice" },
        },
      },
    },
  };
}
function mount(view: RevisionView, upload: () => Promise<Response>) {
  const saves: RevisionEdit[] = [];
  const removed = vi.fn(emptyAnswer());
  renderApp(
    <RevisionWorkspace
      projectId="p1"
      currentRevisionId="r1"
      renderEditor={(props) => (
        <RevisionForm
          {...props}
          renderContent={(content) => <RevisionContentEditors {...content} />}
        />
      )}
    />,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
      "POST /api/projects/p1/revisions/prepare": jsonAnswer({ ok: true, view, created: false }),
      "GET /api/providers": jsonAnswer({ providers: [] }),
      "GET /api/settings/voices": jsonAnswer({ voices: [] }),
      "GET /api/prompts": jsonAnswer({ prompts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
      "GET /api/providers/tts/models": jsonAnswer({ models: [], allowsCustom: false }),
      "POST /api/staging/audio": upload,
      "DELETE /api/staging/upload1": removed,
      "POST /api/projects/p1/revisions": async (request) => {
        saves.push(saveRevisionSchema.parse(await request.json()).edit);
        return jsonAnswer(
          { detail: "Draft retained for inspection.", reason: "conflict", fields: [] },
          409,
        )(request);
      },
    }),
  );
  return { saves, removed };
}
it.each(["saved replacement", "staged replacement", "text override"] as const)(
  "saves regeneration intent after %s through the mounted Save flow",
  async (scenario) => {
    const user = userEvent.setup();
    const generated = generatedNarration();
    const override =
      scenario === "text override"
        ? { kind: "text" as const, text: "My current narration." }
        : { kind: "asset" as const, assetId: "replacement-audio" };
    const view = {
      ...generated.view,
      revision: {
        ...generated.view.revision,
        content: {
          ...generated.view.revision.content,
          narrationOverrides: { [generated.key]: override },
        },
      },
    };
    const { saves } = mount(view, async () => response({ ...staged, stageKind: "audio" }));
    await user.click(screen.getByRole("button", { name: "Edit project" }));
    await openEditSection("Narration");
    await screen.findByLabelText("Replace narration chunk 1");
    if (scenario !== "saved replacement") {
      fireEvent.change(screen.getByLabelText("Replace narration chunk 1"), {
        target: { files: [new File(["audio"], "replacement.mp3", { type: "audio/mpeg" })] },
      });
      await waitFor(() =>
        expect(
          screen.getByRole<HTMLButtonElement>("button", { name: "Save changes" }).disabled,
        ).toBe(false),
      );
    }
    await user.click(
      screen.getByRole("button", { name: "Regenerate narration chunk 1 after review" }),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    const edit = saves[0];
    if (edit === undefined) throw new Error("Expected saved narration edit.");
    expect(edit.uploads ?? []).toEqual([]);
    expect(edit.regenerate).toEqual([generated.key]);
    expect(edit.content.narrationOverrides[generated.key]).toEqual(
      scenario === "text override" ? override : undefined,
    );
  },
);
it("discards an upload that settles after regeneration without undoing the saved intent", async () => {
  const user = userEvent.setup();
  const copied = deferred<Response>();
  const { view, key } = generatedNarration();
  const { saves, removed } = mount(view, () => copied.promise);
  await user.click(screen.getByRole("button", { name: "Edit project" }));
  await openEditSection("Narration");
  fireEvent.change(await screen.findByLabelText("Replace narration chunk 1"), {
    target: { files: [new File(["audio"], "replacement.mp3", { type: "audio/mpeg" })] },
  });
  await within(screen.getByRole("region", { name: "Narration" })).findByRole("status");
  await user.click(
    screen.getByRole("button", { name: "Regenerate narration chunk 1 after review" }),
  );
  copied.resolve(response({ ...staged, stageKind: "audio" }));
  await waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0]?.regenerate).toEqual([key]);
  expect(saves[0]?.uploads ?? []).toEqual([]);
});
