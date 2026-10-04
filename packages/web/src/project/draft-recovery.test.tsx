import type { RevisionView } from "@app/slices/revisions/model.js";
import { saveRevisionSchema } from "@app/slices/revisions/schema.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, use } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDraft, writeDraft } from "@/lib/draft-store";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { describeEdit, isRevisionEdit, reapplyEdit } from "./draft-merge.js";
import { RegenerateNowContext } from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import type { EditorProps } from "./revision-workspace.js";
import { RevisionWorkspace } from "./revision-workspace.js";
import { revisionDraftKey } from "./use-durable-draft.js";

// The test environment has no localStorage of its own.
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage() });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "localStorage", { configurable: true, value: undefined });
});

function editor({ edit, onChange }: EditorProps): ReactElement {
  return (
    <>
      <label>
        Project title
        <input
          value={edit.config.title}
          onChange={(event) =>
            onChange({ ...edit, config: { ...edit.config, title: event.target.value } })
          }
        />
      </label>
      <label>
        Image seconds
        <input
          value={String(edit.config.imageSeconds)}
          onChange={(event) =>
            onChange({
              ...edit,
              config: { ...edit.config, imageSeconds: Number(event.target.value) },
            })
          }
        />
      </label>
    </>
  );
}

function body(view: RevisionView) {
  return {
    revisionId: view.revision.id,
    stages: [],
    outputs: [],
    project: {
      id: "p1",
      title: view.revision.config.title,
      format: "16:9",
      config: view.revision.config,
      createdAt: view.revision.createdAt,
      updatedAt: view.revision.createdAt,
      status: "done",
    },
  };
}

const base = {
  "GET /api/projects/p1/revisions/r1": jsonAnswer({ view: revisionView() }),
  "POST /api/projects/p1/revisions/prepare": jsonAnswer({
    ok: true,
    view: revisionView(),
    created: false,
  }),
};

describe("a project's unsaved edit", () => {
  it("is kept in this browser and offered back on the next visit", async () => {
    const user = userEvent.setup();
    const first = renderApp(
      <RevisionWorkspace projectId="p1" currentRevisionId="r1" renderEditor={editor} />,
      testDeps(base),
    );
    await user.click(screen.getByRole("button", { name: "Edit project" }));
    const title = await screen.findByRole("textbox", { name: "Project title" });
    await user.clear(title);
    await user.type(title, "Kept title");
    first.unmount();
    expect(readDraft(revisionDraftKey("p1"), isRevisionEdit)?.value.config.title).toBe(
      "Kept title",
    );

    renderApp(
      <RevisionWorkspace projectId="p1" currentRevisionId="r1" renderEditor={editor} />,
      testDeps(base),
    );
    const restored = await screen.findByRole("textbox", { name: "Project title" });
    expect((restored as HTMLInputElement).value).toBe("Kept title");
    expect(await screen.findByText(/Restored your unsaved edit from/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByText(/Restored your unsaved edit/)).toBeNull();
    expect((restored as HTMLInputElement).value).toBe("Kept title");
  });

  it("can be brought back with Undo after Discard changes", async () => {
    const user = userEvent.setup();
    renderApp(
      <RevisionWorkspace projectId="p1" currentRevisionId="r1" renderEditor={editor} />,
      testDeps(base),
    );
    await user.click(screen.getByRole("button", { name: "Edit project" }));
    const title = await screen.findByRole("textbox", { name: "Project title" });
    await user.clear(title);
    await user.type(title, "Second thoughts");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("textbox", { name: "Project title" })).toBeNull();
    expect(readDraft(revisionDraftKey("p1"), isRevisionEdit)).toBeUndefined();
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    const back = await screen.findByRole("textbox", { name: "Project title" });
    expect((back as HTMLInputElement).value).toBe("Second thoughts");
  });

  it("re-applies onto the latest revision after a conflict, keeping the other change", async () => {
    const user = userEvent.setup();
    let head = revisionView();
    const latest = revisionView("r2", "Saved");
    const newer: RevisionView = {
      ...latest,
      revision: { ...latest.revision, config: { ...latest.revision.config, imageSeconds: 9 } },
    };
    const saved: unknown[] = [];
    renderApp(
      <RevisionWorkspace projectId="p1" currentRevisionId="r1" renderEditor={editor} />,
      testDeps({
        "GET /api/projects/p1/revisions/r1": jsonAnswer({ view: revisionView() }),
        "POST /api/projects/p1/revisions/prepare": () =>
          jsonAnswer({ ok: true, view: head, created: false })(new Request("http://x")),
        "POST /api/projects/p1/revisions": async (request) => {
          const parsed = saveRevisionSchema.parse(await request.json());
          saved.push(parsed);
          if (parsed.baseRevisionId === "r1") {
            head = newer;
            return new Response(
              JSON.stringify({
                title: "Conflict",
                status: 409,
                reason: "conflict",
                currentRevisionId: "r2",
                detail: "Project changed.",
                fields: [],
              }),
              { status: 409, headers: { "content-type": "application/problem+json" } },
            );
          }
          return jsonAnswer({ ok: true, view: revisionView("r3", "Mine"), duplicate: false })(
            request,
          );
        },
        "GET /api/projects/p1": jsonAnswer(body(revisionView("r3", "Mine"))),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Edit project" }));
    const title = await screen.findByRole("textbox", { name: "Project title" });
    await user.clear(title);
    await user.type(title, "Mine");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Project changed.");
    expect(screen.getByRole("button", { name: "Copy my edit" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reload latest and re-apply my edit" }));
    await screen.findByText(/Your edit is laid over the latest revision/);
    expect((title as HTMLInputElement).value).toBe("Mine");
    const seconds = screen.getByRole("textbox", { name: "Image seconds" });
    expect((seconds as HTMLInputElement).value).toBe("9");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]).toMatchObject({
      baseRevisionId: "r2",
      edit: { config: { title: "Mine", imageSeconds: 9 } },
    });
  });
});

describe("re-applying and describing an edit", () => {
  it("takes the draft's changed values and the newer revision's others", () => {
    const old = revisionView().revision;
    const mine = {
      config: { ...old.config, title: "Mine" },
      content: old.content,
      regenerate: ["image:a"],
    };
    const newer = { config: { ...old.config, imageSeconds: 9 }, content: old.content };
    const merged = reapplyEdit(old, mine, newer);
    expect(merged.config.title).toBe("Mine");
    expect(merged.config.imageSeconds).toBe(9);
    expect(merged.regenerate).toEqual(["image:a"]);
    expect(describeEdit(old, mine)).toContain("config.title:\nMine");
  });
});

function Regenerate({ approvedUpTo }: { readonly approvedUpTo?: number }): ReactElement {
  const regenerateNow = use(RegenerateNowContext);
  return (
    <button
      type="button"
      disabled={regenerateNow === undefined}
      onClick={() => regenerateNow?.(["image:a"], { approvedUpTo })}
    >
      Regenerate image a
    </button>
  );
}

function preview(high: number, kind: "provider" | "local") {
  return {
    id: "pv1",
    projectId: "p1",
    baseRevisionId: "r2",
    planFingerprint: "f1",
    selection: { kind: "selected", workKeys: ["image:a"] },
    changedInputs: [],
    retained: [],
    warnings: [],
    work: [
      {
        key: "image:a",
        stage: "images",
        kind,
        disposition: kind === "local" ? "local" : "generate",
        requestFingerprint: "q",
        fingerprint: "f",
        dependsOn: [],
        reason: "Marked to make again.",
        inflight: false,
        pieceIds: [],
      },
    ],
    wholeRequestNotice: null,
    providedReuseRequired: [],
    costs: {
      currency: "USD",
      rows: [],
      low: high,
      high,
      unknown: 0,
      expectedWords: 0,
      catalogueDate: null,
      assumptions: [],
    },
  };
}

describe("a remake asked for from a button", () => {
  function render(shown: ReturnType<typeof preview>, approvedUpTo?: number) {
    const start = vi.fn(
      jsonAnswer(
        { ok: true, value: { revisionId: "r2", admissionId: "a1", workIds: [], replayed: false } },
        202,
      ),
    );
    const next = revisionView("r2", "Saved");
    renderApp(
      <RevisionWorkspace
        projectId="p1"
        currentRevisionId="r1"
        renderEditor={editor}
        output={<Regenerate {...(approvedUpTo === undefined ? {} : { approvedUpTo })} />}
      />,
      testDeps({
        ...base,
        "POST /api/projects/p1/revisions": jsonAnswer({ ok: true, view: next, duplicate: false }),
        "GET /api/projects/p1": jsonAnswer(body(next)),
        "POST /api/projects/p1/rebuild/preview": jsonAnswer({ ok: true, value: shown }),
        "POST /api/projects/p1/rebuild": start,
      }),
    );
    return start;
  }

  it("shows its scope and charge before a paid call starts", async () => {
    const user = userEvent.setup();
    const start = render(preview(0.04, "provider"));
    await user.click(await screen.findByRole("button", { name: "Regenerate image a" }));
    expect(await screen.findByRole("dialog", { name: "Choose what to remake" })).toBeTruthy();
    expect(screen.getByText("$0.04")).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remake 1 output" }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });

  it("opens the review when the estimate is above what the button showed", async () => {
    const user = userEvent.setup();
    const start = render(preview(0.4, "provider"), 0.04);
    await user.click(await screen.findByRole("button", { name: "Regenerate image a" }));
    expect(await screen.findByRole("dialog", { name: "Choose what to remake" })).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
  });

  it("starts at once when the work runs on this computer for nothing", async () => {
    const user = userEvent.setup();
    const start = render(preview(0, "local"));
    await user.click(await screen.findByRole("button", { name: "Regenerate image a" }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Choose what to remake" })).toBeNull();
  });
});

describe("a stored draft", () => {
  it("is ignored when it is not a project edit", () => {
    writeDraft(revisionDraftKey("p9"), { nope: true }, "r1");
    expect(readDraft(revisionDraftKey("p9"), isRevisionEdit)).toBeUndefined();
  });
});
