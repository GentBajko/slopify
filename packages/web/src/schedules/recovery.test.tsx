import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

import { scheduleUpdateSchema } from "@app/slices/schedules/schema.js";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SchedulesRoute } from "@/routes/schedules";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";

// Pause, Resume, Cancel and Delete live in each row's "More" menu.
async function choose(user: ReturnType<typeof userEvent.setup>, action: string): Promise<void> {
  const [more] = await screen.findAllByRole("button", { name: /^More for / });
  if (!more) throw new Error("no schedule row menu");
  await user.click(more);
  await user.click(await screen.findByRole("menuitem", { name: action }));
}

// The form opens in a drawer from the toolbar.
async function openNew(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole("button", { name: "New schedule" }));
}

const templateId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const summary = {
  id: scheduleId,
  name: "Morning stories",
  templateId,
  templateVersion: 1,
  cadence: { kind: "daily", time: "09:00" },
  timezone: "UTC",
  missedPolicy: "skip",
  overlapPolicy: "skip",
  spendLimitCents: null,
  items: [],
  status: "active",
  version: 1,
  nextRunAt: "2026-09-14T09:00:00.000Z",
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
  deletedAt: null,
};

it("shows schedules and sends a pause action with the current version", async () => {
  let pauseRequest: Request | undefined;
  const pause = vi.fn((request: Request) => {
    pauseRequest = request;
    return jsonAnswer({ ...summary, status: "paused", version: 2 })(request);
  });
  const user = userEvent.setup();
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [summary] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
      "POST /api/schedules/22222222-2222-4222-8222-222222222222/pause": pause,
    }),
  );
  await screen.findByText("Morning stories");
  expect(screen.getByText(/Daily at 09:00/)).toBeTruthy();
  await choose(user, "Pause");
  await waitFor(() => expect(pause).toHaveBeenCalledOnce());
  if (pauseRequest === undefined) throw new Error("pause request was not captured");
  expect(pauseRequest.method).toBe("POST");
  expect(JSON.parse(await pauseRequest.text())).toEqual({ baseVersion: 1 });
});

it("does not submit a second independently identified schedule while first is pending", async () => {
  const bodies: { id: string }[] = [];
  const user = userEvent.setup();
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
      "POST /api/schedules": async (request) => {
        bodies.push(await request.json());
        return new Promise<Response>(() => {});
      },
    }),
  );
  await openNew(user);
  await user.type(screen.getByLabelText("Name"), "Duplicated");
  await screen.findByRole("option", { name: "Stories · v1" });
  await user.selectOptions(screen.getByLabelText("Template"), templateId);
  await user.dblClick(screen.getByRole("button", { name: "Save schedule" }));
  expect(bodies).toHaveLength(1);
});
it("shows failed Pause transport errors", async () => {
  const user = userEvent.setup();
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [summary] }),
      "GET /api/project-templates": jsonAnswer({ templates: [] }),
      [`POST /api/schedules/${scheduleId}/pause`]: () =>
        Response.json({ title: "Pause failed", detail: "Disk unavailable" }, { status: 500 }),
    }),
  );
  await choose(user, "Pause");
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Disk unavailable"),
  );
});

it("refreshes schedule state when an action commits but its response is lost", async () => {
  let committed = false;
  const user = userEvent.setup();
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": (request) =>
        jsonAnswer({
          schedules: [committed ? { ...summary, status: "paused", version: 2 } : summary],
        })(request),
      "GET /api/project-templates": jsonAnswer({ templates: [] }),
      [`POST /api/schedules/${scheduleId}/pause`]: () => {
        committed = true;
        throw new Error("Connection lost after save");
      },
    }),
  );
  await choose(user, "Pause");

  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Connection lost after save"),
  );
  await user.click(
    (await screen.findAllByRole("button", { name: /^More for / }))[0] as HTMLElement,
  );
  expect(await screen.findByRole("menuitem", { name: "Resume" })).toBeTruthy();
});
it("resolves one-off Run at in the selected timezone", async () => {
  const bodies: { cadence: { at: string } }[] = [];
  const user = userEvent.setup();
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
      "POST /api/schedules": async (request) => {
        bodies.push(await request.json());
        return Response.json(summary);
      },
    }),
  );
  await openNew(user);
  await user.type(screen.getByLabelText("Name"), "Time test");
  await screen.findByRole("option", { name: "Stories · v1" });
  await user.selectOptions(screen.getByLabelText("Template"), templateId);
  await user.selectOptions(screen.getByLabelText("Cadence"), "once");
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.change(screen.getByLabelText("Run at"), { target: { value: "2027-01-15T12:00" } });
  await user.clear(screen.getByLabelText("Timezone"));
  await user.type(screen.getByLabelText("Timezone"), "America/New_York");
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0]?.cadence.at).toBe("2027-01-15T17:00:00.000Z");
});

it("rejects an invalid recurring timezone before submission", async () => {
  const create = vi.fn(() => Response.json(summary));
  const user = userEvent.setup();
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
      "POST /api/schedules": create,
    }),
  );
  await openNew(user);
  await user.type(screen.getByLabelText("Name"), "Bad timezone");
  await screen.findByRole("option", { name: "Stories · v1" });
  await user.selectOptions(screen.getByLabelText("Template"), templateId);
  await user.clear(screen.getByLabelText("Timezone"));
  await user.type(screen.getByLabelText("Timezone"), "Mars/Olympus");
  await user.click(screen.getByRole("button", { name: "Save schedule" }));

  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("valid IANA timezone"),
  );
  expect(create).not.toHaveBeenCalled();
});

it("edits the displayed version and retains values after conflict", async () => {
  const user = userEvent.setup();
  const update = vi.fn(async (request: Request) => {
    const body: unknown = await request.json();
    expect(scheduleUpdateSchema.unwrap().omit({ id: true }).safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty("id");
    expect(body).toMatchObject({
      name: "Edited",
      baseVersion: 1,
      mutationId: expect.any(String),
    });
    return Response.json(
      { title: "Conflict", detail: "Schedule changed elsewhere.", reason: "conflict" },
      { status: 409 },
    );
  });
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [summary] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
      [`PUT /api/schedules/${scheduleId}`]: update,
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Edited");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText(/Schedule changed elsewhere/);
  expect(screen.getByLabelText("Name")).toHaveProperty("value", "Edited");
  expect(update).toHaveBeenCalledOnce();
});

it("preserves pinned template version and keyword text during a title edit", async () => {
  const user = userEvent.setup();
  const items = [{ title: "A | B", values: { topic: "One, two\nthree" } }];
  const update = vi.fn(async (request: Request) => {
    expect(await request.json()).toMatchObject({ templateVersion: 1, items });
    return Response.json({ ...summary, version: 2 });
  });
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [{ ...summary, items }] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 3, updatedAt: summary.updatedAt }],
      }),
      [`PUT /api/schedules/${scheduleId}`]: update,
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  expect(screen.getByRole("option", { name: "Stories · v1" })).toBeTruthy();
  await user.type(screen.getByLabelText("Name"), " edited");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
});

it("requires confirmation before deletion and shows failures inside the dialog", async () => {
  const user = userEvent.setup();
  const remove = vi.fn(() =>
    Response.json({ title: "Unavailable", detail: "Could not archive schedule" }, { status: 500 }),
  );
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [{ ...summary, status: "completed" }] }),
      "GET /api/project-templates": jsonAnswer({ templates: [] }),
      [`DELETE /api/schedules/${scheduleId}`]: remove,
    }),
  );
  await choose(user, "Delete");
  expect(remove).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Delete schedule" }));
  await waitFor(() =>
    expect(screen.getByRole("dialog").textContent).toContain("Could not archive schedule"),
  );
});
it("requires confirmation before canceling a schedule", async () => {
  const user = userEvent.setup();
  const cancel = vi.fn(() => Response.json({ ...summary, status: "canceled", version: 2 }));
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [summary] }),
      "GET /api/project-templates": jsonAnswer({ templates: [] }),
      [`POST /api/schedules/${scheduleId}/cancel`]: cancel,
    }),
  );
  await choose(user, "Cancel");
  expect(cancel).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel schedule" }));
  await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
});
it("retries an uncertain create with the exact identity and input", async () => {
  const user = userEvent.setup();
  const bodies: unknown[] = [];
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
      "POST /api/schedules": async (request) => {
        bodies.push(await request.json());
        return bodies.length === 1
          ? Response.json({ title: "Unavailable" }, { status: 500 })
          : Response.json(summary);
      },
    }),
  );
  await openNew(user);
  await user.type(screen.getByLabelText("Name"), "Retried");
  await screen.findByRole("option", { name: "Stories · v1" });
  await user.selectOptions(screen.getByLabelText("Template"), templateId);
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(bodies).toHaveLength(2));
  expect(bodies[1]).toEqual(bodies[0]);
});

it("edits a variant without changing punctuation or multiline values in other variants", async () => {
  const user = userEvent.setup();
  const items = [
    { title: "A | B\nC", values: { "topic,name": "One, two\nthree | four" } },
    { title: "Second", values: { topic: "Before" } },
  ];
  const update = vi.fn(async (request: Request) => {
    expect(await request.json()).toMatchObject({
      items: [
        items[0],
        { title: "Changed", values: { topic: "After, with | punctuation\nand a newline" } },
      ],
    });
    return Response.json({ ...summary, version: 2 });
  });
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [{ ...summary, items }] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
      [`PUT /api/schedules/${scheduleId}`]: update,
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  await user.clear(screen.getByLabelText("Variant 2 title"));
  await user.type(screen.getByLabelText("Variant 2 title"), "Changed");
  await user.clear(screen.getByLabelText("Variant 2 keyword 1 value"));
  await user.type(
    screen.getByLabelText("Variant 2 keyword 1 value"),
    "After, with | punctuation\nand a newline",
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
});

it.each(["completed", "canceled"])("does not offer Edit for a %s schedule", async (status) => {
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [{ ...summary, status, nextRunAt: null }] }),
      "GET /api/project-templates": jsonAnswer({ templates: [] }),
    }),
  );
  await screen.findByText("Morning stories");
  expect(screen.getByRole("button", { name: "Edit" }).hasAttribute("disabled")).toBe(true);
});

it("keeps deleted schedule history discoverable with project links and no live controls", async () => {
  const projectId = "44444444-4444-4444-8444-444444444444";
  const deleted = {
    ...summary,
    status: "canceled",
    nextRunAt: null,
    deletedAt: "2026-09-13T12:00:00.000Z",
  };
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [deleted] }),
      "GET /api/project-templates": jsonAnswer({ templates: [] }),
      [`GET /api/schedules/${scheduleId}`]: jsonAnswer({
        schedule: deleted,
        runs: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            scheduleId,
            scheduledFor: "2026-09-12T09:00:00.000Z",
            status: "succeeded",
            requestId: null,
            projectIds: [projectId],
            estimate: null,
            startedAt: "2026-09-12T09:00:00.000Z",
            endedAt: "2026-09-12T09:00:01.000Z",
            error: null,
          },
        ],
      }),
    }),
  );

  expect(await screen.findByText(/No active schedules/)).toBeTruthy();
  await userEvent.setup().click(await screen.findByText(/^Deleted schedules ·/));
  expect(screen.getByText(/Deleted:/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "History" }));
  expect(await screen.findByText(/succeeded/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Project 1" }).getAttribute("href")).toBe(
    `/projects/${projectId}`,
  );
});

it("creates structured variants and refuses duplicate keyword names before submission", async () => {
  const user = userEvent.setup();
  const create = vi.fn(async (request: Request) => {
    expect(await request.json()).toMatchObject({
      items: [{ title: "A | B", values: { topic: "One, two\nthree" } }],
    });
    return Response.json(summary);
  });
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
      "POST /api/schedules": create,
    }),
  );
  await openNew(user);
  await user.type(screen.getByLabelText("Name"), "Structured");
  await screen.findByRole("option", { name: "Stories · v1" });
  await user.selectOptions(screen.getByLabelText("Template"), templateId);
  await user.click(screen.getByRole("button", { name: "Add variant" }));
  await user.type(screen.getByLabelText("Variant 1 title"), "A | B");
  await user.click(screen.getByRole("button", { name: "Add keyword to variant 1" }));
  await user.type(screen.getByLabelText("Variant 1 keyword 1 name"), " topic ");
  await user.type(screen.getByLabelText("Variant 1 keyword 1 value"), "One, two\nthree");
  await user.click(screen.getByRole("button", { name: "Add keyword to variant 1" }));
  await user.type(screen.getByLabelText("Variant 1 keyword 2 name"), "topic");
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("unique keyword names"),
  );
  expect(create).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Remove keyword 2 from variant 1" }));
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
});

it("explains that nonexistent one-off times are refused", async () => {
  const user = userEvent.setup();
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
    }),
  );

  await openNew(user);
  await user.selectOptions(screen.getByLabelText("Cadence"), "once");
  await user.click(screen.getByRole("button", { name: "About Timezone" }));

  expect(await screen.findByText(/nonexistent spring-forward times are refused/)).toBeTruthy();
});
