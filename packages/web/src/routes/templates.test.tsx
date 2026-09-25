import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PlayDraftProvider, usePlaySession } from "@/play/draft-context";
import { freshDraftDocument } from "@/play/draft-state";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { TemplatesRoute } from "./templates.js";

afterEach(cleanup);
const templateId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
const template = {
  id: templateId,
  name: "Weekly documentary",
  version: 1,
  createdAt: "2026-09-12T00:00:00Z",
  updatedAt: "2026-09-13T00:00:00Z",
};
const drafts = {
  drafts: [
    {
      id: sourceId,
      title: "My setup",
      version: 3,
      updatedAt: "2026-09-13T00:00:00Z",
      readable: true,
    },
  ],
};
const draftView = {
  draft: {
    id: sourceId,
    version: 3,
    createdAt: "now",
    updatedAt: "now",
    document: freshDraftDocument,
  },
  attachments: [],
  review: null,
  pendingStart: null,
  start: null,
};
const routes = {
  "GET /api/project-templates": jsonAnswer({ templates: [template] }),
  "GET /api/drafts": jsonAnswer(drafts),
  [`GET /api/drafts/${sourceId}`]: jsonAnswer(draftView),
};
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

it("lists templates and saves a named setup from an existing draft without starting a run", async () => {
  const user = userEvent.setup();
  const save = vi.fn(async (request: Request) => {
    const input: unknown = await request.json();
    expect(input).toEqual({
      id: expect.any(String),
      name: "New template",
      document: freshDraftDocument,
    });
    return Response.json({ ...template, document: freshDraftDocument });
  });
  const applied = vi.fn();
  renderRouted(
    <TemplatesRoute onApplied={applied} />,
    testDeps({ ...routes, "POST /api/project-templates": save }),
  );
  expect(await screen.findByRole("heading", { name: template.name })).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Save a setup" }));
  await user.selectOptions(await screen.findByLabelText("Saved Play draft"), sourceId);
  await user.type(screen.getByLabelText("Template name"), "New template");
  await user.click(screen.getByRole("button", { name: "Save template" }));
  await screen.findByText("Template saved.");
  expect(save).toHaveBeenCalledOnce();
  expect(applied).not.toHaveBeenCalled();
});

it("applies a template as a fresh draft and preserves its identity after a lost response", async () => {
  const user = userEvent.setup();
  const identities: unknown[] = [];
  const applied = vi.fn();
  const apply = vi.fn(async (request: Request) => {
    const body: unknown = await request.json();
    identities.push(body);
    if (identities.length === 1) throw new Error("Connection lost");
    return Response.json({
      draft: {
        draft: {
          id: sourceId,
          version: 1,
          createdAt: "now",
          updatedAt: "now",
          document: freshDraftDocument,
        },
        attachments: [],
        review: null,
        pendingStart: null,
        start: null,
      },
    });
  });
  renderRouted(
    <TemplatesRoute onApplied={applied} />,
    testDeps({ ...routes, [`POST /api/project-templates/${templateId}/instantiate`]: apply }),
  );
  const button = await screen.findByRole("button", { name: `Apply ${template.name}` });
  await user.click(button);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Connection lost"),
  );
  await user.click(button);
  await waitFor(() => expect(applied).toHaveBeenCalledWith(sourceId, expect.any(Function)));
  expect(identities[0]).toEqual(identities[1]);
  expect(identities[0]).toEqual({ id: expect.any(String), version: template.version });
});

it("applies a template under StrictMode effect replay", async () => {
  const user = userEvent.setup();
  const apply = vi.fn(() => Response.json({ draft: draftView }));
  renderRouted(
    <StrictMode>
      <TemplatesRoute onApplied={vi.fn()} />
    </StrictMode>,
    testDeps({ ...routes, [`POST /api/project-templates/${templateId}/instantiate`]: apply }),
  );
  await user.click(await screen.findByRole("button", { name: `Apply ${template.name}` }));
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
});

it("opens an applied template through the real Play session", async () => {
  const user = userEvent.setup();
  let opened = false;
  function Harness() {
    const session = usePlaySession();
    return (
      <TemplatesRoute
        getGeneration={session.generation}
        beforeApply={session.flush}
        onApplied={async (id, isCurrent) => {
          opened = await session.open(id);
          return opened && isCurrent();
        }}
      />
    );
  }
  renderRouted(
    <PlayDraftProvider>
      <Harness />
    </PlayDraftProvider>,
    testDeps({
      ...routes,
      [`POST /api/project-templates/${templateId}/instantiate`]: () =>
        Response.json({ draft: draftView }),
    }),
  );
  await user.click(await screen.findByRole("button", { name: `Apply ${template.name}` }));
  await waitFor(() => expect(opened).toBe(true));
});

it("does not install a template after the route unmounts during draft loading", async () => {
  const user = userEvent.setup();
  const draftResponse = deferred<Response>();
  let leave!: () => void;
  let opened: boolean | undefined;
  function Harness() {
    const session = usePlaySession();
    const [visible, setVisible] = useState(true);
    leave = () => setVisible(false);
    return visible ? (
      <TemplatesRoute
        getGeneration={session.generation}
        beforeApply={session.flush}
        onApplied={async (id, isCurrent) => {
          opened = await session.open(id, isCurrent);
          return opened && isCurrent();
        }}
      />
    ) : (
      <p>Templates left</p>
    );
  }
  renderRouted(
    <PlayDraftProvider>
      <Harness />
    </PlayDraftProvider>,
    testDeps({
      ...routes,
      [`GET /api/drafts/${sourceId}`]: () => draftResponse.promise,
      [`POST /api/project-templates/${templateId}/instantiate`]: () =>
        Response.json({ draft: draftView }),
    }),
  );
  await user.click(await screen.findByRole("button", { name: `Apply ${template.name}` }));
  await screen.findByRole("button", { name: "Refresh templates" });
  leave();
  await screen.findByText("Templates left");
  draftResponse.resolve(Response.json(draftView));
  await waitFor(() => expect(opened).toBe(false));
});

it("confirms deletion and keeps the template visible when the server refuses", async () => {
  const user = userEvent.setup();
  const remove = vi.fn(() =>
    Response.json(
      { title: "Conflict", status: 409, detail: "Template changed elsewhere." },
      { status: 409 },
    ),
  );
  renderRouted(
    <TemplatesRoute onApplied={vi.fn()} />,
    testDeps({ ...routes, [`DELETE /api/project-templates/${templateId}`]: remove }),
  );
  await user.click(await screen.findByRole("button", { name: `Delete ${template.name}` }));
  expect(remove).not.toHaveBeenCalled();
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete template" }));
  await screen.findByText("Template changed elsewhere.");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("heading", { name: template.name })).not.toBeNull();
  expect(remove).toHaveBeenCalledOnce();
});

it("retains the created draft identity when opening the new draft fails", async () => {
  const user = userEvent.setup();
  const bodies: unknown[] = [];
  const apply = vi.fn(async (request: Request) => {
    bodies.push(await request.json());
    return Response.json({ draft: draftView });
  });
  const opened = vi.fn(() => false);
  renderRouted(
    <TemplatesRoute onApplied={opened} />,
    testDeps({ ...routes, [`POST /api/project-templates/${templateId}/instantiate`]: apply }),
  );
  const button = await screen.findByRole("button", { name: `Apply ${template.name}` });
  await user.click(button);
  await screen.findByRole("alert");
  await user.click(button);
  await waitFor(() => expect(apply).toHaveBeenCalledTimes(2));
  expect(opened).toHaveBeenCalledTimes(2);
  expect(bodies[0]).toEqual(bodies[1]);
});

it("does not apply a delayed template after the Play session generation changes", async () => {
  const user = userEvent.setup();
  const response = deferred<Response>();
  let generation = 0;
  const opened = vi.fn();
  renderRouted(
    <TemplatesRoute onApplied={opened} getGeneration={() => generation} />,
    testDeps({
      ...routes,
      [`POST /api/project-templates/${templateId}/instantiate`]: () => response.promise,
    }),
  );
  await user.click(await screen.findByRole("button", { name: `Apply ${template.name}` }));
  generation = 1;
  response.resolve(Response.json({ draft: draftView }));
  await waitFor(() => expect(opened).not.toHaveBeenCalled());
});

it("keeps an unsaved or uncertain Play session authoritative before applying", async () => {
  const apply = vi.fn();
  renderRouted(
    <TemplatesRoute onApplied={vi.fn()} beforeApply={async () => false} />,
    testDeps({ ...routes, [`POST /api/project-templates/${templateId}/instantiate`]: apply }),
  );
  fireEvent.click(await screen.findByRole("button", { name: `Apply ${template.name}` }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Resolve the current Play draft"),
  );
  expect(apply).not.toHaveBeenCalled();
});

it("deletes the selected version and refreshes the list", async () => {
  const user = userEvent.setup();
  let deleted = false;
  const remove = vi.fn(async (request: Request) => {
    expect(await request.json()).toEqual({ baseVersion: template.version });
    deleted = true;
    return Response.json({ deleted: true });
  });
  renderRouted(
    <TemplatesRoute onApplied={vi.fn()} />,
    testDeps({
      ...routes,
      "GET /api/project-templates": () => Response.json({ templates: deleted ? [] : [template] }),
      [`DELETE /api/project-templates/${templateId}`]: remove,
    }),
  );
  await user.click(await screen.findByRole("button", { name: `Delete ${template.name}` }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete template" }),
  );
  await screen.findByText("No templates yet. Use Save a setup to keep a Play draft for reuse.");
  expect(remove).toHaveBeenCalledOnce();
});
