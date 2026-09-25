import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { emptyAnswer, renderApp, testDeps } from "@/test-app";
import { NarrationEditor, narrationGroups, orderedGroups } from "./narration-editor.js";
import { deferred, narrationView, response, staged } from "./revision-editor-test-fixtures.js";
import { revisionView } from "./revision-fixture.js";
import { formOfRevision } from "./revision-form-state.js";

afterEach(cleanup);
it("records a stable text override without dispatching", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  const base = revisionView();
  const view = {
    ...base,
    pieces: [
      {
        recordId: "rp1",
        publicationId: null,
        selected: true,
        available: true,
        key: "audio:body:chunk1:1",
        stageKind: "audio" as const,
        assetId: "a1",
        fingerprint: "fp1",
        piece: {
          id: "piece1",
          stageId: "s-audio",
          kind: "chunk" as const,
          idx: 1,
          state: "done" as const,
          payload: JSON.stringify({
            text: "Hello",
            logicalText: "Hello",
            logicalKey: "audio:body:chunk1",
            segment: "body",
            file: "assets/a1/body.mp3",
          }),
        },
      },
    ],
  };
  const edit = formOfRevision(view);
  renderApp(
    <NarrationEditor view={view} edit={edit} onChange={changed} onPending={() => {}} />,
    testDeps({}),
  );
  await user.clear(screen.getByRole("textbox", { name: "Text for narration chunk 1" }));
  expect(changed).toHaveBeenLastCalledWith({
    ...edit,
    content: {
      ...edit.content,
      narrationOverrides: { "audio:body:chunk1": { kind: "text", text: "" } },
    },
  });
});

it("edits full logical text once across split physical requests and suppresses ambiguous groups", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  const view = narrationView();
  renderApp(
    <NarrationEditor
      view={view}
      edit={formOfRevision(view)}
      onChange={changed}
      onPending={() => {}}
    />,
    testDeps({}),
  );
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.getByText("2 audio parts in this narration chunk.")).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Regenerate narration chunk 1 after review" }),
  );
  expect(changed.mock.lastCall?.[0].regenerate).toEqual(["audio:body:chunk1"]);
  expect(narrationGroups(narrationView(["Hello", "Different", "Hello"]))).toEqual({
    groups: [],
    unmapped: 3,
  });
  const broken = {
    ...view,
    pieces: view.pieces.map((row) => ({ ...row, piece: { ...row.piece, payload: "{bad" } })),
  };
  expect(narrationGroups(broken)).toEqual({ groups: [], unmapped: 2 });
});
it("text edits supersede both a staged replacement and an upload still in flight", async () => {
  const user = userEvent.setup();
  const copied = deferred<Response>();
  const removed = vi.fn(emptyAnswer());
  const changed = vi.fn();
  const view = narrationView();
  function Harness() {
    const [edit, setEdit] = useState<RevisionEdit>({
      ...formOfRevision(view),
      uploads: [
        {
          stagedFileId: "old",
          destination: { kind: "narration" as const, key: "audio:body:chunk1" },
        },
      ],
    });
    return (
      <NarrationEditor
        view={view}
        edit={edit}
        onChange={(next) => {
          changed(next);
          setEdit({ ...next, uploads: [...(next.uploads ?? [])] });
        }}
        onPending={() => {}}
      />
    );
  }
  renderApp(
    <Harness />,
    testDeps({
      "POST /api/staging/audio": () => copied.promise,
      "DELETE /api/staging/upload1": removed,
    }),
  );
  fireEvent.change(screen.getByLabelText("Replace narration chunk 1"), {
    target: { files: [new File(["audio"], "chunk.mp3", { type: "audio/mpeg" })] },
  });
  await user.clear(screen.getByRole("textbox", { name: "Text for narration chunk 1" }));
  copied.resolve(response({ ...staged, stageKind: "audio" }));
  await waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
  expect(changed.mock.lastCall?.[0].uploads).toEqual([]);
  expect(changed.mock.lastCall?.[0].content.narrationOverrides["audio:body:chunk1"]).toEqual({
    kind: "text",
    text: "",
  });
  expect(changed).toHaveBeenCalledTimes(1);
});

it("lists only the current chunks, in spoken order, once the order is known", () => {
  const chunk = (key: string) => ({ key, text: key, parts: 1 });
  const listed = [chunk("audio:body:old"), chunk("audio:body:second"), chunk("audio:body:first")];
  expect(
    orderedGroups(listed, { body: ["audio:body:first", "audio:body:second"] }).map(
      (group) => group.key,
    ),
  ).toEqual(["audio:body:first", "audio:body:second"]);
  expect(orderedGroups(listed, null)).toBe(listed);
  expect(orderedGroups(listed, undefined)).toBe(listed);
});

it("shows a chunk queued for regeneration and can take it back", async () => {
  const user = userEvent.setup();
  const view = narrationView();
  function Harness() {
    const [edit, setEdit] = useState<RevisionEdit>(formOfRevision(view));
    return <NarrationEditor view={view} edit={edit} onChange={setEdit} onPending={() => {}} />;
  }
  renderApp(<Harness />, testDeps({}));
  await user.click(
    screen.getByRole("button", { name: "Regenerate narration chunk 1 after review" }),
  );
  expect(
    screen.getByText("Narration chunk 1 will be regenerated when you save and Resume."),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Keep narration chunk 1" }));
  expect(
    screen.getByRole("button", { name: "Regenerate narration chunk 1 after review" }),
  ).toBeTruthy();
});
