import { startRebuildSchema } from "@app/slices/rebuild/model.js";
import { restoreRevisionSchema, saveRevisionSchema } from "@app/slices/revisions/schema.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { revisionView } from "./revision-fixture.js";
import type { EditorProps } from "./revision-workspace.js";
import { RevisionWorkspace } from "./revision-workspace.js";

afterEach(cleanup);
it("saves a title without starting any rebuild", async () => {
  const user = userEvent.setup();
  const baseline = revisionView();
  const next = revisionView("r2", "Changed");
  const save = vi.fn(jsonAnswer({ ok: true, view: next, duplicate: false }));
  const start = vi.fn(
    jsonAnswer(
      { ok: true, value: { revisionId: "r2", admissionId: "a1", workIds: [], replayed: false } },
      202,
    ),
  );
  renderApp(
    <RevisionWorkspace
      projectId="p1"
      currentRevisionId="r1"
      renderEditor={({ edit, onChange }) => (
        <label>
          Project title
          <input
            value={edit.config.title}
            onChange={(event) =>
              onChange({ ...edit, config: { ...edit.config, title: event.target.value } })
            }
          />
        </label>
      )}
    />,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view: baseline }),
      "POST /api/projects/p1/revisions/prepare": jsonAnswer({
        ok: true,
        view: baseline,
        created: false,
      }),
      "POST /api/projects/p1/revisions": save,
      "POST /api/projects/p1/rebuild": start,
      "GET /api/projects/p1": jsonAnswer({
        revisionId: "r2",
        stages: [],
        outputs: [],
        project: {
          id: "p1",
          title: "Changed",
          format: "16:9",
          config: next.revision.config,
          createdAt: next.revision.createdAt,
          updatedAt: next.revision.createdAt,
          status: "done",
        },
      }),
    }),
  );
  await user.click(screen.getByRole("button", { name: "Edit project" }));
  const title = await screen.findByRole("textbox", { name: "Project title" });
  await user.clear(title);
  await user.type(title, "Changed");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(start).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "Project title" })).toBeNull());
});
function titleEditor({ edit, onChange }: EditorProps): ReactElement {
  return (
    <label>
      Project title
      <input
        value={edit.config.title}
        onChange={(event) =>
          onChange({ ...edit, config: { ...edit.config, title: event.target.value } })
        }
      />
    </label>
  );
}
function currentBody(view: ReturnType<typeof revisionView>) {
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
it("preserves an unsaved title when another tab advanced the base", async () => {
  const user = userEvent.setup();
  renderApp(
    <RevisionWorkspace projectId="p1" currentRevisionId="r1" renderEditor={titleEditor} />,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view: revisionView() }),
      "POST /api/projects/p1/revisions/prepare": jsonAnswer({
        ok: true,
        view: revisionView(),
        created: false,
      }),
      "POST /api/projects/p1/revisions": () =>
        new Response(
          JSON.stringify({
            title: "Conflict",
            status: 409,
            reason: "conflict",
            currentRevisionId: "r2",
            detail: "Project changed.",
            fields: [],
          }),
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
    }),
  );
  await user.click(screen.getByRole("button", { name: "Edit project" }));
  const title = await screen.findByRole("textbox", { name: "Project title" });
  await user.clear(title);
  await user.type(title, "Changed");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText("Project changed.");
  if (!(title instanceof HTMLInputElement)) throw new Error("Expected title input.");
  expect(title.value).toBe("Changed");
});
it("retries a transport failure with the original idempotency key", async () => {
  const user = userEvent.setup();
  const keys: string[] = [];
  const next = revisionView("r2", "Changed");
  renderApp(
    <RevisionWorkspace projectId="p1" currentRevisionId="r1" renderEditor={titleEditor} />,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view: revisionView() }),
      "POST /api/projects/p1/revisions/prepare": jsonAnswer({
        ok: true,
        view: revisionView(),
        created: false,
      }),
      "POST /api/projects/p1/revisions": async (request) => {
        const body = saveRevisionSchema.parse(await request.json());
        keys.push(body.idempotencyKey);
        if (keys.length === 1) throw new TypeError("Connection lost");
        return jsonAnswer({ ok: true, view: next, duplicate: true })(request);
      },
      "GET /api/projects/p1": jsonAnswer(currentBody(next)),
    }),
  );
  await user.click(screen.getByRole("button", { name: "Edit project" }));
  const title = await screen.findByRole("textbox", { name: "Project title" });
  await user.clear(title);
  await user.type(title, "Changed");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText("Connection lost");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(keys.length).toBe(2));
  expect(keys[0]).toBe(keys[1]);
});
it("does not adopt an old successful receipt as the current editor", async () => {
  const user = userEvent.setup();
  const old = { ...revisionView("r2", "Changed"), current: false };
  renderApp(
    <RevisionWorkspace projectId="p1" currentRevisionId="r1" renderEditor={titleEditor} />,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view: revisionView() }),
      "POST /api/projects/p1/revisions/prepare": jsonAnswer({
        ok: true,
        view: revisionView(),
        created: false,
      }),
      "POST /api/projects/p1/revisions": jsonAnswer({ ok: true, view: old, duplicate: true }),
      "GET /api/projects/p1": jsonAnswer(currentBody(revisionView("r3", "Latest"))),
    }),
  );
  await user.click(screen.getByRole("button", { name: "Edit project" }));
  const title = await screen.findByRole("textbox", { name: "Project title" });
  await user.clear(title);
  await user.type(title, "Changed");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText("The project changed again. Your draft is preserved.");
  if (!(title instanceof HTMLInputElement)) throw new Error("Expected title input.");
  expect(title.value).toBe("Changed");
});

it("recovers a history restore conflict without requiring an open editor", async () => {
  const user = userEvent.setup();
  let current = revisionView();
  const prepare = vi.fn(() =>
    jsonAnswer({ ok: true, view: current, created: false })(new Request("http://test")),
  );
  const restore = vi.fn(async (request: Request) => {
    const body = restoreRevisionSchema.parse(await request.json());
    if (body.baseRevisionId === "r1") {
      current = revisionView("r2", "New head");
      return new Response(
        JSON.stringify({
          title: "Conflict",
          status: 409,
          reason: "conflict",
          currentRevisionId: "r2",
          detail: "Project changed.",
        }),
        { status: 409 },
      );
    }
    return jsonAnswer({ ok: true, view: revisionView("r3", "Restored"), duplicate: false })(
      request,
    );
  });
  renderApp(
    <RevisionWorkspace projectId="p1" currentRevisionId="r1" renderEditor={titleEditor} />,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view: revisionView() }),
      "GET /api/projects/p1/revisions/old": jsonAnswer({
        view: { ...revisionView("old", "Earlier"), current: false },
      }),
      "GET /api/projects/p1/revisions": jsonAnswer({
        revisions: [
          {
            id: "old",
            projectId: "p1",
            parentId: null,
            restoredFromId: null,
            title: "Earlier",
            createdAt: "2026-09-10T00:00:00.000Z",
            current: false,
          },
        ],
      }),
      "POST /api/projects/p1/revisions/prepare": prepare,
      "POST /api/projects/p1/revisions/restore": restore,
      "GET /api/projects/p1": jsonAnswer(currentBody(revisionView("r3", "Restored"))),
    }),
  );
  await user.click(screen.getByRole("tab", { name: "History" }));
  await user.click(await screen.findByRole("button", { name: /Earlier ·/ }));
  await user.click(await screen.findByRole("button", { name: "Restore this revision" }));
  await screen.findByText("Project changed.");
  await user.click(screen.getByRole("button", { name: "Reload current revision" }));
  await waitFor(() => expect(prepare).toHaveBeenCalledOnce());
  await user.click(screen.getByRole("button", { name: "Restore this revision" }));
  await waitFor(() => expect(restore).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("textbox")).toBeNull();
});

it.each(["transport", "readiness", "stale-preview", "conflict"] as const)(
  "shows %s errors beside Start and retries with the same key",
  async (failure) => {
    const user = userEvent.setup();
    const sent: string[] = [];
    const preview = {
      id: "pv1",
      projectId: "p1",
      baseRevisionId: "r1",
      planFingerprint: "f1",
      selection: { kind: "allAffected" },
      changedInputs: [],
      retained: [],
      warnings: [],
      work: [],
      wholeRequestNotice: null,
      providedReuseRequired: [],
      costs: {
        currency: "USD",
        rows: [],
        low: 0,
        high: 0,
        unknown: 1,
        expectedWords: 0,
        catalogueDate: null,
        assumptions: [],
      },
    };
    renderApp(
      <RevisionWorkspace projectId="p1" currentRevisionId="r1" renderEditor={titleEditor} />,
      testDeps({
        "GET /api/projects/p1/revisions/r1": jsonAnswer({ view: revisionView() }),
        "POST /api/projects/p1/revisions/prepare": jsonAnswer({
          ok: true,
          view: revisionView(),
          created: false,
        }),
        "POST /api/projects/p1/rebuild/preview": jsonAnswer({ ok: true, value: preview }),
        "POST /api/projects/p1/rebuild": async (request) => {
          const body = startRebuildSchema.parse(await request.json());
          sent.push(body.idempotencyKey);
          if (sent.length === 1) {
            if (failure === "transport") throw new TypeError("Start response lost");
            if (failure !== "readiness")
              return new Response(
                JSON.stringify({
                  title: "Conflict",
                  status: 409,
                  reason: failure,
                  detail: "Review this project again.",
                }),
                { status: 409 },
              );
            return new Response(
              JSON.stringify({
                title: "Conflict",
                status: 409,
                reason: "readiness",
                detail: "readiness",
                fields: [
                  { field: "llm.model", message: "Choose an available model before rebuilding." },
                ],
              }),
              { status: 409 },
            );
          }
          return jsonAnswer({
            ok: true,
            value: { revisionId: "r1", admissionId: "a1", workIds: [], replayed: true },
          })(request);
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Rebuild affected outputs" }));
    await screen.findByRole("button", { name: "Start rebuild" });
    expect(screen.getByRole("button", { name: "Edit project" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(sent).toEqual([]);
    const acknowledgement = screen.getByRole("checkbox", { name: /cost estimates are unknown/ });
    await user.click(acknowledgement);
    await user.click(screen.getByRole("button", { name: "Start rebuild" }));
    if (failure === "stale-preview" || failure === "conflict") {
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Review this project again.");
      expect(screen.queryByRole("region", { name: "Review affected rebuild" })).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(alert));
      expect(
        screen.getByRole("button", { name: "Rebuild affected outputs" }).hasAttribute("disabled"),
      ).toBe(false);
      return;
    }
    const review = screen.getByRole("region", { name: "Review affected rebuild" });
    const alert = await within(review).findByRole("alert");
    expect(alert.textContent).toContain(
      failure === "transport"
        ? "Start response lost"
        : "Choose an available model before rebuilding.",
    );
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(acknowledgement instanceof HTMLInputElement && acknowledgement.checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Start rebuild" }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[0]).toBe(sent[1]);
  },
);
