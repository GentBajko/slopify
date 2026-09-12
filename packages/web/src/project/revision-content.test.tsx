import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { RevisionContentEditors } from "./revision-content.js";
import { deferred, narrationView, response, staged } from "./revision-editor-test-fixtures.js";
import { formOfRevision } from "./revision-form-state.js";

afterEach(cleanup);
function timingView(): RevisionView {
  const base = narrationView();
  return {
    ...base,
    revision: { ...base.revision, fingerprints: { "subtitles:timing": "timing-fingerprint" } },
    outputs: (["subtitle_words", "audio_export"] as const).map((role) => ({
      recordId: role,
      publicationId: null,
      selected: true,
      slot: role,
      workKey: role,
      assetId: role,
      fingerprint: role,
      state: "ready",
      available: true,
      output: {
        id: role,
        projectId: "p1",
        stageKind: "video",
        role,
        path: role,
        originalFilename: null,
        bytes: 10,
        durationMs: role === "audio_export" ? 2000 : null,
        meta: {},
        createdAt: "today",
      },
    })),
  };
}
function Harness({
  view = timingView(),
  changed = () => {},
  pending = () => {},
}: {
  readonly view?: RevisionView;
  readonly changed?: (edit: RevisionEdit) => void;
  readonly pending?: (active: boolean) => void;
}) {
  const [edit, setEdit] = useState(() => formOfRevision(view));
  const [current, setCurrent] = useState(view);
  function change(next: RevisionEdit): void {
    changed(next);
    setEdit(next);
  }
  return (
    <>
      <button
        type="button"
        onClick={() => change({ ...edit, config: { ...edit.config, title: "New title" } })}
      >
        Change title
      </button>
      <button
        type="button"
        onClick={() =>
          change({ ...edit, content: { ...edit.content, articleMarkdown: "Different article" } })
        }
      >
        Change narration
      </button>
      <button
        type="button"
        onClick={() => setCurrent({ ...view, revision: { ...view.revision, id: "r2" } })}
      >
        Change revision
      </button>
      <RevisionContentEditors
        view={current}
        edit={edit}
        onChange={change}
        onPending={pending}
        fields={[]}
      />
    </>
  );
}
const filePath = "GET /files/p1/revisions/r1/subtitle_words";
const words = { words: [{ text: "Hello.", start: 0, end: 1 }] };
it("loads immutable timing on explicit request and preserves newer unrelated draft edits", async () => {
  const user = userEvent.setup();
  const loaded = deferred<Response>();
  const called = vi.fn(() => loaded.promise);
  const changed = vi.fn();
  const pending = vi.fn();
  renderApp(<Harness changed={changed} pending={pending} />, testDeps({ [filePath]: called }));
  expect(called).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Edit existing caption cues" }));
  expect(pending).toHaveBeenLastCalledWith(true);
  await user.click(screen.getByRole("button", { name: "Change title" }));
  loaded.resolve(response(words));
  await screen.findByRole("textbox", { name: "Text for caption 1" });
  const result = changed.mock.lastCall?.[0];
  expect(result.config.title).toBe("New title");
  expect(result.content.subtitleCues).toEqual({
    audioFingerprint: "timing-fingerprint",
    cues: [{ id: expect.any(String), text: "Hello.", start: 0, end: 1 }],
  });
  expect(called).toHaveBeenCalledTimes(1);
  expect(pending).toHaveBeenLastCalledWith(false);
});
it.each(["Change narration", "Change revision"])(
  "rejects late timing when %s changes its identity",
  async (name) => {
    const user = userEvent.setup();
    const loaded = deferred<Response>();
    const changed = vi.fn();
    const pending = vi.fn();
    renderApp(
      <Harness changed={changed} pending={pending} />,
      testDeps({ [filePath]: () => loaded.promise }),
    );
    await user.click(screen.getByRole("button", { name: "Edit existing caption cues" }));
    await user.click(screen.getByRole("button", { name }));
    changed.mockClear();
    await act(async () => loaded.resolve(response(words)));
    await waitFor(() => expect(pending).toHaveBeenLastCalledWith(false));
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Text for caption 1" })).toBeNull();
  },
);
it("never applies a timing response after the content editor unmounts", async () => {
  const user = userEvent.setup();
  const loaded = deferred<Response>();
  const changed = vi.fn();
  const pending = vi.fn();
  const mounted = renderApp(
    <Harness changed={changed} pending={pending} />,
    testDeps({ [filePath]: () => loaded.promise }),
  );
  await user.click(screen.getByRole("button", { name: "Edit existing caption cues" }));
  mounted.unmount();
  await act(async () => loaded.resolve(response(words)));
  expect(changed).not.toHaveBeenCalled();
  expect(pending).toHaveBeenLastCalledWith(false);
});
it.each([
  { words: [{ text: "Bad", start: 1, end: 0.5 }] },
  { words: [{ text: "Bad", start: 0, end: 3 }] },
  { words: [{ text: "Bad", start: 0, end: null }] },
  { words: [{ text: "Bad", start: -1, end: 0.5 }] },
])("refuses invalid retained word timing %#", async (saved) => {
  const user = userEvent.setup();
  const changed = vi.fn();
  renderApp(<Harness changed={changed} />, testDeps({ [filePath]: jsonAnswer(saved) }));
  await user.click(screen.getByRole("button", { name: "Edit existing caption cues" }));
  await screen.findByRole("alert");
  expect(changed).not.toHaveBeenCalled();
});
it("does not offer cues without current duration and the parent timing fingerprint", () => {
  const view = timingView();
  renderApp(
    <Harness view={{ ...view, revision: { ...view.revision, fingerprints: {} } }} />,
    testDeps({}),
  );
  expect(
    (screen.getByRole("button", { name: "Edit existing caption cues" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByText(/duration or timing is unavailable or stale/)).toBeTruthy();
});
it("keeps independent upload and dirty-caption locks until both complete", async () => {
  const user = userEvent.setup();
  const copied = deferred<Response>();
  const pending = vi.fn();
  const base = timingView();
  const view = {
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, thumbnail: "provide" as const },
      },
      content: {
        ...base.revision.content,
        subtitleCues: {
          audioFingerprint: "timing-fingerprint",
          cues: [{ id: "c1", text: "Hello.", start: 0, end: 1 }],
        },
      },
    },
  };
  renderApp(
    <Harness view={view} pending={pending} />,
    testDeps({ "POST /api/staging/thumbnail": () => copied.promise }),
  );
  fireEvent.change(screen.getByLabelText("Replace provided thumbnail"), {
    target: { files: [new File(["png"], "scene.png", { type: "image/png" })] },
  });
  await user.clear(screen.getByRole("textbox", { name: "End for caption 1" }));
  await user.type(screen.getByRole("textbox", { name: "End for caption 1" }), "1.5");
  await act(async () => copied.resolve(response({ ...staged, stageKind: "thumbnail" })));
  expect(pending).toHaveBeenLastCalledWith(true);
  await user.click(screen.getByRole("button", { name: "Apply caption edits to draft" }));
  expect(pending).toHaveBeenLastCalledWith(false);
});
it("merges simultaneous provided uploads into the latest draft", async () => {
  const audio = deferred<Response>();
  const thumbnail = deferred<Response>();
  const changed = vi.fn();
  const base = timingView();
  const view = {
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        sources: {
          ...base.revision.config.sources,
          audio: "provide" as const,
          thumbnail: "provide" as const,
        },
      },
    },
  };
  renderApp(
    <Harness view={view} changed={changed} />,
    testDeps({
      "POST /api/staging/audio": () => audio.promise,
      "POST /api/staging/thumbnail": () => thumbnail.promise,
    }),
  );
  fireEvent.change(screen.getByLabelText("Replace provided audio"), {
    target: { files: [new File(["mp3"], "voice.mp3", { type: "audio/mpeg" })] },
  });
  fireEvent.change(screen.getByLabelText("Replace provided thumbnail"), {
    target: { files: [new File(["png"], "scene.png", { type: "image/png" })] },
  });
  await act(async () => {
    audio.resolve(response({ ...staged, id: "audio-upload", stageKind: "audio" }));
    thumbnail.resolve(response({ ...staged, id: "thumbnail-upload", stageKind: "thumbnail" }));
  });
  expect(changed.mock.lastCall?.[0].uploads).toEqual([
    { stagedFileId: "audio-upload", destination: { kind: "provided", stage: "audio" } },
    { stagedFileId: "thumbnail-upload", destination: { kind: "provided", stage: "thumbnail" } },
  ]);
});
it("preserves uploads that finish concurrently in separate image and narration editors", async () => {
  const image = deferred<Response>();
  const audio = deferred<Response>();
  const changed = vi.fn();
  const base = timingView();
  const view: RevisionView = {
    ...base,
    revision: {
      ...base.revision,
      content: {
        ...base.revision.content,
        imageOrder: ["i1"],
        imageDefinitions: { i1: { source: "provide", assetId: "a1", prompt: null } },
      },
    },
  };
  renderApp(
    <Harness view={view} changed={changed} />,
    testDeps({
      "POST /api/staging/images": () => image.promise,
      "POST /api/staging/audio": () => audio.promise,
    }),
  );
  fireEvent.change(screen.getByLabelText("Replace image 1"), {
    target: { files: [new File(["png"], "scene.png", { type: "image/png" })] },
  });
  fireEvent.change(screen.getByLabelText("Replace narration chunk 1"), {
    target: { files: [new File(["mp3"], "voice.mp3", { type: "audio/mpeg" })] },
  });
  await act(async () => {
    image.resolve(response(staged));
    audio.resolve(response({ ...staged, id: "audio-upload", stageKind: "audio" }));
  });
  expect(changed.mock.lastCall?.[0].uploads).toEqual([
    { stagedFileId: "upload1", destination: { kind: "image", imageKey: "i1" } },
    { stagedFileId: "audio-upload", destination: { kind: "narration", key: "audio:body:chunk1" } },
  ]);
});
