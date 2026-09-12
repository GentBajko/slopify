import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { usePlayDraft } from "@/lib/form-drafts";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { PlayDraftProvider, type PlaySession, usePlaySession } from "./draft-context";
import { draftView, playRoutes } from "./play-test-fixture";

afterEach(cleanup);
it("retains restored raw numbers and dormant controls when the legacy title control changes", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const saved = draftView(id);
  const document = {
    ...saved.draft.document,
    form: {
      ...saved.draft.document.form,
      imagePrompts: [{ name: "Oils", number: "" }],
      chunking: { mode: "words" as const, words: "", characters: "garbage" },
      subtitles: { ...saved.draft.document.form.subtitles, fontSize: "oops" },
    },
  };
  let session: PlaySession | undefined;
  function Consumer() {
    session = usePlaySession();
    const [form, setForm] = usePlayDraft();
    return (
      <input
        aria-label="Title"
        value={form.title}
        onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
      />
    );
  }
  renderApp(
    <PlayDraftProvider>
      <Consumer />
    </PlayDraftProvider>,
    testDeps(
      playRoutes({
        [`GET /api/drafts/${id}`]: jsonAnswer({ ...saved, draft: { ...saved.draft, document } }),
      }),
    ),
  );
  await act(() => session?.open(id));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Different" } });
  expect(session?.document.form).toMatchObject({
    title: "Different",
    imagePrompts: [{ number: "" }],
    chunking: { words: "", characters: "garbage" },
    subtitles: { fontSize: "oops" },
  });
});
