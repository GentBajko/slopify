import { draftViewSchema } from "@app/slices/play-drafts/schema.js";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { usePlayDraft } from "@/lib/form-drafts";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { PlayDraftProvider, type PlaySession, usePlaySession } from "./draft-context";
import { draftView, playRoutes } from "./play-test-fixture";
import { PronunciationGlossary } from "./pronunciation-glossary";

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

it.each([undefined, false, true])(
  "keeps saved preference %s through the legacy form bridge and draft save/reopen",
  async (preference) => {
    window.localStorage?.clear();
    const id = "00000000-0000-4000-8000-000000000002";
    let saved = draftView(id);
    const audio = {
      provider: "inworld",
      model: "inworld-tts-2",
      voice: "v",
      ...(preference === undefined ? {} : { usePronunciationGlossary: preference }),
    };
    saved = {
      ...saved,
      draft: {
        ...saved.draft,
        document: { ...saved.draft.document, form: { ...saved.draft.document.form, audio } },
      },
    };
    let session: PlaySession | undefined;
    function current(): PlaySession {
      if (session === undefined) throw new Error("Missing Play session");
      return session;
    }
    function Consumer() {
      session = usePlaySession();
      const [form, setForm] = usePlayDraft();
      return (
        <>
          <input
            aria-label="Title"
            value={form.title}
            onChange={(event) => setForm((old) => ({ ...old, title: event.target.value }))}
          />
          <PronunciationGlossary
            value={form.audio.usePronunciationGlossary}
            supported
            onChange={(usePronunciationGlossary) =>
              setForm((old) => ({ ...old, audio: { ...old.audio, usePronunciationGlossary } }))
            }
          />
        </>
      );
    }
    const routes = playRoutes({
      [`GET /api/drafts/${id}`]: (request) => jsonAnswer(saved)(request),
    });
    const save = routes["PUT /api/drafts/:id"];
    if (save === undefined) throw new Error("Missing fake draft save route");
    renderApp(
      <PlayDraftProvider>
        <Consumer />
      </PlayDraftProvider>,
      testDeps({
        ...routes,
        [`GET /api/drafts/${id}`]: (request) => jsonAnswer(saved)(request),
        [`PUT /api/drafts/${id}`]: async (request) => {
          const response = await save(request);
          if (response.ok) {
            const raw: unknown = await response.clone().json();
            saved = draftViewSchema.parse(raw);
          }
          return response;
        },
      }),
    );
    await act(async () => {
      expect(await current().open(id)).toBe(true);
    });
    const checkbox = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Use Pronunciation Glossary",
    });
    expect(checkbox.checked).toBe(preference === true);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Edited title" } });
    await act(async () => {
      expect(await current().flush()).toBe(true);
    });
    expect(saved.draft.document.form.audio).toStrictEqual(audio);
    await act(async () => {
      expect(await current().open(id)).toBe(true);
    });
    expect(current().document.form.audio).toStrictEqual(audio);
    fireEvent.click(checkbox);
    const changed = { ...audio, usePronunciationGlossary: preference !== true };
    await act(async () => {
      expect(await current().flush()).toBe(true);
    });
    expect(saved.draft.document.form.audio).toStrictEqual(changed);
    await act(async () => {
      expect(await current().open(id)).toBe(true);
    });
    expect(current().document.form.audio).toStrictEqual(changed);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Use Pronunciation Glossary" })
        .checked,
    ).toBe(preference !== true);
    window.localStorage?.clear();
  },
);

it("reads a draft saved before the Document stage as Off with the default theme, and saves it unchanged", async () => {
  const id = "00000000-0000-4000-8000-000000000003";
  const saved = draftView(id);
  expect(saved.draft.document.form.sources.document).toBeUndefined();
  let session: PlaySession | undefined;
  let read: { readonly source: string; readonly theme: string } | undefined;
  function Consumer() {
    session = usePlaySession();
    const [form, setForm] = usePlayDraft();
    read = { source: form.sources.document, theme: form.document.theme };
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
    testDeps(playRoutes({ [`GET /api/drafts/${id}`]: jsonAnswer(saved) })),
  );
  await act(() => session?.open(id));
  expect(read).toEqual({ source: "off", theme: "dicemaster" });
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Different" } });
  expect(session?.document.form.title).toBe("Different");
  expect(session?.document.form.sources).not.toHaveProperty("document");
  expect(session?.document.form).not.toHaveProperty("document");
});
