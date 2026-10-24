import { useLocation } from "@tanstack/react-router";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
const card = {
  id: templateId,
  still: null,
  format: "16:9",
  video: true,
  words: 2200,
  voice: { provider: "openai-tts", voiceId: "fable", name: "Fable" },
  captions: "burn-in",
  shorts: 2,
  pdf: false,
  asks: ["Topic"],
  schedules: 0,
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
  "GET /api/design-templates": jsonAnswer({ templates: [] }),
  "GET /api/project-templates": jsonAnswer({ templates: [template] }),
  "GET /api/template-studio/cards": jsonAnswer({ cards: [card] }),
  "GET /api/providers": jsonAnswer({
    providers: [
      {
        id: "openai-tts",
        family: "tts",
        displayName: "OpenAI",
        readiness: { kind: "keyed", hasKey: true },
      },
    ],
  }),
  [`GET /api/drafts/${sourceId}`]: jsonAnswer(draftView),
};
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
const makeName = `Make a video with ${template.name}`;

it("shows each template as a card: what it makes, what it asks for, and what to do with it", async () => {
  renderRouted(<TemplatesRoute onApplied={vi.fn()} />, testDeps(routes));
  const list = await screen.findByRole("list", { name: "Video templates" });
  const one = within(list).getByRole("listitem", { name: template.name });
  expect(
    await within(one).findByText(
      "Landscape 16:9 · Voice: Fable, OpenAI · about 2,200 words · captions on the video · 2 shorts",
    ),
  ).not.toBeNull();
  expect(within(one).getByText("Asks for: Topic")).not.toBeNull();
  expect(within(one).getByText("No preview yet")).not.toBeNull();
  const make = within(one).getByRole("button", { name: makeName });
  expect(make.className).toContain("sl-btn--primary");
  expect(
    within(one)
      .getByRole("link", { name: `Edit template ${template.name}` })
      .getAttribute("href"),
  ).toBe(`/templates/${templateId}`);
  // Nobody needs schedule words on a template no schedule runs.
  expect(within(one).queryByText(/schedules/)).toBeNull();
});

it("shows a template's still once it has one, in its shape", async () => {
  renderRouted(
    <TemplatesRoute onApplied={vi.fn()} />,
    testDeps({
      ...routes,
      "GET /api/template-studio/cards": jsonAnswer({
        cards: [{ ...card, still: "/files/P1/revisions/R1/t", format: "9:16" }],
      }),
    }),
  );
  const still = await screen.findByRole("img", {
    name: `A still from ${template.name}'s sample`,
  });
  expect(still.getAttribute("src")).toBe("http://slopify.test/files/P1/revisions/R1/t");
  expect(still.parentElement?.getAttribute("data-format")).toBe("9:16");
});

it("makes a video as a fresh draft and keeps its identity after a lost response", async () => {
  const user = userEvent.setup();
  const identities: unknown[] = [];
  const applied = vi.fn();
  const apply = vi.fn(async (request: Request) => {
    const body: unknown = await request.json();
    identities.push(body);
    if (identities.length === 1) throw new Error("Connection lost");
    return Response.json({ draft: { ...draftView, draft: { ...draftView.draft, version: 1 } } });
  });
  renderRouted(
    <TemplatesRoute onApplied={applied} />,
    testDeps({ ...routes, [`POST /api/project-templates/${templateId}/instantiate`]: apply }),
  );
  const button = await screen.findByRole("button", { name: makeName });
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

it("makes a video under StrictMode effect replay", async () => {
  const user = userEvent.setup();
  const apply = vi.fn(() => Response.json({ draft: draftView }));
  renderRouted(
    <StrictMode>
      <TemplatesRoute onApplied={vi.fn()} />
    </StrictMode>,
    testDeps({ ...routes, [`POST /api/project-templates/${templateId}/instantiate`]: apply }),
  );
  await user.click(await screen.findByRole("button", { name: makeName }));
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
});

// The real Create session loads and saves its draft between steps: past the 1 s default wait
// under a loaded full suite.
const playSession = { timeout: 5_000 };

it("opens the template's draft through the real Create session", async () => {
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
      "GET /api/drafts": jsonAnswer({ drafts: [] }),
      [`POST /api/project-templates/${templateId}/instantiate`]: () =>
        Response.json({ draft: draftView }),
    }),
  );
  await user.click(await screen.findByRole("button", { name: makeName }, playSession));
  await waitFor(() => expect(opened).toBe(true), playSession);
}, 20_000);

it("does not open a draft after the page unmounts while it loads", async () => {
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
  const instantiate = vi.fn(() => Response.json({ draft: draftView }));
  renderRouted(
    <PlayDraftProvider>
      <Harness />
    </PlayDraftProvider>,
    testDeps({
      ...routes,
      "GET /api/drafts": jsonAnswer({ drafts: [] }),
      [`GET /api/drafts/${sourceId}`]: () => draftResponse.promise,
      [`POST /api/project-templates/${templateId}/instantiate`]: instantiate,
    }),
  );
  await user.click(await screen.findByRole("button", { name: makeName }, playSession));
  await waitFor(() => expect(instantiate).toHaveBeenCalledOnce(), playSession);
  // Inside act, so the page's unmount effects (its `mounted` flag) have run, not only its DOM
  // removal, before the draft answers.
  act(() => {
    leave();
  });
  await screen.findByText("Templates left", {}, playSession);
  draftResponse.resolve(Response.json(draftView));
  await waitFor(() => expect(opened).toBe(false), playSession);
}, 20_000);

it("confirms deletion and keeps the template when the server refuses", async () => {
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
  await user.click(await screen.findByRole("button", { name: `More for ${template.name}` }));
  await user.click(await screen.findByRole("menuitem", { name: `Delete ${template.name}` }));
  expect(remove).not.toHaveBeenCalled();
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete template" }));
  await screen.findByText("Template changed elsewhere.");
  await user.click(within(dialog).getByRole("button", { name: "Keep it" }));
  expect(
    within(screen.getByRole("list", { name: "Video templates" })).getByText(template.name),
  ).not.toBeNull();
  expect(remove).toHaveBeenCalledOnce();
});

it("keeps the made draft's identity when opening it fails", async () => {
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
  const button = await screen.findByRole("button", { name: makeName });
  await user.click(button);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Create didn't open it. Press Make a video again",
  );
  await user.click(button);
  await waitFor(() => expect(apply).toHaveBeenCalledTimes(2));
  expect(opened).toHaveBeenCalledTimes(2);
  expect(bodies[0]).toEqual(bodies[1]);
});

it("does not open a late draft after the Create session moved on", async () => {
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
  await user.click(await screen.findByRole("button", { name: makeName }));
  generation = 1;
  response.resolve(Response.json({ draft: draftView }));
  await waitFor(() => expect(opened).not.toHaveBeenCalled());
});

it("keeps an unsaved Create draft first, and says so when it can't be saved", async () => {
  const apply = vi.fn();
  renderRouted(
    <TemplatesRoute onApplied={vi.fn()} beforeApply={async () => false} />,
    testDeps({ ...routes, [`POST /api/project-templates/${templateId}/instantiate`]: apply }),
  );
  fireEvent.click(await screen.findByRole("button", { name: makeName }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("The draft open on Create couldn't be saved"),
  );
  expect(apply).not.toHaveBeenCalled();
});

it("deletes a template and teaches what a template is for once none is left", async () => {
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
  await user.click(await screen.findByRole("button", { name: `More for ${template.name}` }));
  await user.click(await screen.findByRole("menuitem", { name: `Delete ${template.name}` }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete template" }),
  );
  await screen.findByRole("heading", { name: "No templates yet" });
  expect(screen.getByText(/A template keeps a whole setup/)).not.toBeNull();
  // The empty list teaches with its own button; the header doesn't repeat it.
  expect(screen.getAllByRole("button", { name: "Add starter templates" })).toHaveLength(1);
  expect(remove).toHaveBeenCalledOnce();
});

it("adds starter templates from the header, and imports a file from More", async () => {
  const user = userEvent.setup();
  renderRouted(<TemplatesRoute onApplied={vi.fn()} />, testDeps(routes));
  await screen.findByRole("list", { name: "Video templates" });
  const header = screen.getByRole("banner");
  expect(
    within(header)
      .getAllByRole("button")
      .map((one) => one.textContent),
  ).toEqual(["Add starter templates", "More"]);
  await user.click(within(header).getByRole("button", { name: "More ways to add templates" }));
  expect(
    await screen.findByRole("menuitem", { name: "Import a template file (.zip)" }),
  ).not.toBeNull();
});

it("duplicates a template as a named copy", async () => {
  const user = userEvent.setup();
  const names: string[] = [];
  const created = vi.fn(async (request: Request) => {
    const body = (await request.json()) as { id: string; name: string };
    names.push(body.name);
    return Response.json(
      { ...template, id: body.id, name: body.name, document: freshDraftDocument },
      { status: 201 },
    );
  });
  renderRouted(
    <TemplatesRoute onApplied={vi.fn()} />,
    testDeps({
      ...routes,
      [`GET /api/project-templates/${templateId}`]: jsonAnswer({
        ...template,
        document: freshDraftDocument,
      }),
      "POST /api/project-templates": created,
    }),
  );
  await user.click(await screen.findByRole("button", { name: `More for ${template.name}` }));
  await user.click(await screen.findByRole("menuitem", { name: `Duplicate ${template.name}` }));
  await waitFor(() => expect(created).toHaveBeenCalledOnce());
  expect(names).toEqual([`${template.name} copy`]);
});

it("lists a template's versions and restores an older one as a new version", async () => {
  const user = userEvent.setup();
  const second = { ...template, version: 2, name: "Weekly documentary" };
  const restored: unknown[] = [];
  renderRouted(
    <TemplatesRoute onApplied={vi.fn()} />,
    testDeps({
      ...routes,
      "GET /api/project-templates": jsonAnswer({ templates: [second] }),
      [`GET /api/project-templates/${templateId}`]: (request) => {
        const version = new URL(request.url).searchParams.get("version");
        return Response.json({
          ...second,
          version: Number(version ?? 2),
          name: version === "1" ? "Old documentary" : second.name,
          document: freshDraftDocument,
        });
      },
      [`PUT /api/project-templates/${templateId}`]: async (request) => {
        const body = (await request.json()) as { name: string };
        restored.push(body);
        return Response.json({
          ...second,
          version: 3,
          name: body.name,
          document: freshDraftDocument,
        });
      },
    }),
  );
  await user.click(await screen.findByRole("button", { name: `More for ${second.name}` }));
  await user.click(await screen.findByRole("menuitem", { name: `Versions of ${second.name}` }));
  const drawer = await screen.findByRole("dialog", { name: `Versions of ${second.name}` });
  const versions = within(drawer).getByRole("list", { name: `Versions of ${second.name}` });
  expect(within(versions).getAllByRole("listitem")).toHaveLength(2);
  expect(await within(drawer).findByText(/Renamed from "Old documentary"/u)).not.toBeNull();
  await user.click(within(drawer).getByRole("button", { name: "Restore version 1" }));
  await waitFor(() => expect(restored).toHaveLength(1));
  expect(restored[0]).toMatchObject({ baseVersion: 2, name: "Old documentary" });
});

const many = Array.from({ length: 7 }, (_, index) => ({
  ...template,
  id: `33333333-3333-4333-8333-33333333333${String(index)}`,
  name: index === 0 ? "Archive explainer" : `Weekly ${String(index)}`,
  updatedAt: `2026-08-0${String(index + 1)}T09:30:15Z`,
}));

function cardNames(): string[] {
  return within(screen.getByRole("list", { name: "Video templates" }))
    .getAllByRole("listitem")
    .map((row) => row.getAttribute("aria-label") ?? "");
}

it("searches and sorts only once there are enough templates to look through", async () => {
  renderRouted(<TemplatesRoute onApplied={vi.fn()} />, testDeps(routes));
  await screen.findByRole("list", { name: "Video templates" });
  expect(screen.queryByRole("searchbox", { name: "Search templates" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Sort templates/ })).toBeNull();
  cleanup();

  const user = userEvent.setup();
  renderRouted(
    <TemplatesRoute onApplied={vi.fn()} />,
    testDeps({ ...routes, "GET /api/project-templates": jsonAnswer({ templates: many }) }),
  );
  await screen.findByRole("list", { name: "Video templates" });
  expect(cardNames()[0]).toBe("Archive explainer");
  await user.click(screen.getByRole("button", { name: "Sort templates: Name" }));
  await user.click(await screen.findByRole("menuitem", { name: /^Sort by last changed/u }));
  expect(cardNames()[0]).toBe("Weekly 6");
  await user.type(screen.getByRole("searchbox", { name: "Search templates" }), "archive");
  expect(cardNames()).toEqual(["Archive explainer"]);
  await user.type(screen.getByRole("searchbox", { name: "Search templates" }), "zzz");
  expect(await screen.findByText('No templates match "archivezzz".')).not.toBeNull();
});

it("marks the template a link names", async () => {
  renderRouted(
    <TemplatesRoute onApplied={vi.fn()} item={many[2]?.id} />,
    testDeps({ ...routes, "GET /api/project-templates": jsonAnswer({ templates: many }) }),
  );
  const list = await screen.findByRole("list", { name: "Video templates" });
  expect(
    within(list).getByRole("listitem", { name: "Weekly 2" }).getAttribute("aria-current"),
  ).toBe("true");
});

it("says whether schedules can run a template only where a schedule runs it or it was approved", async () => {
  renderRouted(
    <TemplatesRoute onApplied={() => undefined} />,
    testDeps({
      ...routes,
      "GET /api/project-templates": jsonAnswer({
        templates: [
          { ...template, gate: { head: 1, runs: 1, gated: false, gate: "unchecked" } },
          {
            ...template,
            id: "33333333-3333-4333-8333-333333333333",
            name: "Shorts",
            version: 4,
            gate: { head: 4, runs: 3, gated: true, gate: "ready" },
          },
          {
            ...template,
            id: "44444444-4444-4444-8444-444444444444",
            name: "Fresh",
            gate: { head: 1, runs: 1, gated: true, gate: "ready" },
          },
        ],
      }),
    }),
  );
  const list = await screen.findByRole("list", { name: "Video templates" });
  expect(
    within(within(list).getByRole("listitem", { name: template.name })).queryByText(/schedules/),
  ).toBeNull();
  const waiting = within(list).getByRole("listitem", { name: "Shorts" });
  expect(within(waiting).getByText("Not ready for schedules")).not.toBeNull();
  expect(
    within(waiting).getByText(
      "Schedules run version 3 until you approve version 4 in Edit template.",
    ),
  ).not.toBeNull();
  expect(
    within(within(list).getByRole("listitem", { name: "Fresh" })).getByText("Ready for schedules"),
  ).not.toBeNull();
});

it("lists the poster templates on their own tab, each opened in its editor", async () => {
  const user = userEvent.setup();
  renderRouted(
    <TemplatesRoute onApplied={vi.fn()} />,
    testDeps({
      ...routes,
      "GET /api/design-templates": jsonAnswer({
        templates: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            name: "Event poster",
            headVersion: 2,
            readyVersion: 2,
            document: { schedule: { leadDays: 3 } },
          },
        ],
      }),
    }),
  );
  await screen.findByRole("list", { name: "Video templates" });
  expect(screen.queryByRole("list", { name: "Poster templates" })).toBeNull();
  await user.click(screen.getByRole("tab", { name: "Poster templates" }));
  const list = await screen.findByRole("list", { name: "Poster templates" });
  expect(
    within(list).getByRole("link", { name: "Edit template Event poster" }).getAttribute("href"),
  ).toBe("/design-templates/55555555-5555-4555-8555-555555555555");
  expect(within(list).getByText("Ready for schedules")).not.toBeNull();
  expect(screen.getByRole("button", { name: "New poster template" })).not.toBeNull();
});

it("imports a template file and opens it in Edit template", async () => {
  const user = userEvent.setup();
  let path = "";
  function Probe() {
    path = useLocation().pathname;
    return null;
  }
  const imported = vi.fn(async () =>
    Response.json(
      {
        templateId: "66666666-6666-4666-8666-666666666666",
        name: "Weekly history",
        added: 1,
        renamed: [],
        voiceKnown: false,
        samples: 2,
      },
      { status: 201 },
    ),
  );
  const { container } = renderRouted(
    <>
      <TemplatesRoute onApplied={vi.fn()} />
      <Probe />
    </>,
    testDeps({ ...routes, "POST /api/template-studio/packs/import": imported }),
  );
  await screen.findByRole("list", { name: "Video templates" });
  const input = container.ownerDocument.querySelector<HTMLInputElement>(
    'input[type="file"][accept=".zip,application/zip"]',
  );
  if (input === null) throw new Error("no file input");
  await user.upload(
    input,
    new File(["zip"], "weekly.slopify-pack.zip", { type: "application/zip" }),
  );
  await waitFor(() => expect(path).toBe("/templates/66666666-6666-4666-8666-666666666666"));
  expect(imported).toHaveBeenCalledTimes(1);
});

it("says why a template file wasn't imported", async () => {
  const user = userEvent.setup();
  const { container } = renderRouted(
    <TemplatesRoute onApplied={vi.fn()} />,
    testDeps({
      ...routes,
      "POST /api/template-studio/packs/import": () =>
        Response.json(
          {
            title: "Bad Request",
            status: 400,
            detail: "This file holds what looks like an API key or a login token.",
            reason: "invalid-input",
          },
          { status: 400, headers: { "content-type": "application/problem+json" } },
        ),
    }),
  );
  await screen.findByRole("list", { name: "Video templates" });
  const input = container.ownerDocument.querySelector<HTMLInputElement>(
    'input[type="file"][accept=".zip,application/zip"]',
  );
  if (input === null) throw new Error("no file input");
  await user.upload(input, new File(["zip"], "x.zip", { type: "application/zip" }));
  expect((await screen.findByText(/looks like an API key/)).getAttribute("role")).toBe("alert");
});
