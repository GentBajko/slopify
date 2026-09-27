import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CommandPaletteProvider, CommandRegistry } from "@/components/kit/command-palette";
import { freshDraftDocument } from "@/play/draft-state";
import { jsonAnswer, renderRouted, testDeps } from "../test-app";
import { SchedulesRoute } from "./schedules";

afterEach(cleanup);

// Edit, Pause or Resume, and Delete are visible on each row; Cancel sits in the picked
// schedule's detail. Each is named for its schedule: "Pause Morning stories".
async function choose(user: ReturnType<typeof userEvent.setup>, action: string): Promise<void> {
  await user.click(await screen.findByRole("button", { name: `${action} Morning stories` }));
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
  await screen.findByRole("button", { name: "Morning stories" });
  expect(screen.getByText(/Daily at 09:00/)).toBeTruthy();
  await choose(user, "Pause");
  await waitFor(() => expect(pause).toHaveBeenCalledOnce());
  if (pauseRequest === undefined) throw new Error("pause request was not captured");
  expect(pauseRequest.method).toBe("POST");
  expect(JSON.parse(await pauseRequest.text())).toEqual({ baseVersion: 1 });
});

it("offers New schedule and pausing the picked schedule in the command palette", async () => {
  const registry = new CommandRegistry();
  const pause = vi.fn(jsonAnswer({ ...summary, status: "paused", version: 2 }));
  renderRouted(
    <CommandPaletteProvider registry={registry}>
      <SchedulesRoute />
    </CommandPaletteProvider>,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [summary] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
      [`POST /api/schedules/${summary.id}/pause`]: pause,
    }),
  );
  await screen.findByRole("region", { name: "Morning stories detail" });
  const commands = registry.list();
  expect(commands.map((command) => [command.title, command.group, command.context])).toEqual(
    expect.arrayContaining([
      ["New schedule", "Schedules", undefined],
      ["Pause schedule", "Schedules", "Morning stories"],
    ]),
  );
  commands.find((command) => command.title === "Pause schedule")?.run();
  await waitFor(() => expect(pause).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "New schedule" }).hasAttribute("disabled")).toBe(
      false,
    ),
  );
  registry
    .list()
    .find((command) => command.title === "New schedule")
    ?.run();
  expect(await screen.findByRole("region", { name: "New schedule" })).toBeTruthy();
});

it("approves a held topic from its row in the picked schedule's detail", async () => {
  const user = userEvent.setup();
  const topicId = "55555555-5555-4555-8555-555555555555";
  const approve = vi.fn(jsonAnswer({ ...summary, version: 2 }));
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({
        schedules: [
          {
            ...summary,
            topicGeneration: { mode: "hold", keepAtLeast: 3, llm: null },
            topics: {
              held: 1,
              generatingSince: null,
              generatedAt: null,
              failedAt: null,
              error: null,
            },
          },
        ],
      }),
      "GET /api/project-templates": jsonAnswer({ templates: [] }),
      [`GET /api/schedules/${summary.id}/topics/held`]: jsonAnswer({
        topics: [{ id: topicId, title: "Owlbears", rank: 0, createdAt: summary.createdAt }],
      }),
      [`POST /api/schedules/${summary.id}/topics/held/${topicId}/approve`]: approve,
    }),
  );
  const waiting = await screen.findByRole("list", { name: "Topics waiting" });
  expect(within(waiting).getByText("Owlbears")).toBeTruthy();
  await user.click(within(waiting).getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(approve).toHaveBeenCalledOnce());
});

it("edits a held topic's keywords beside its title, showing the every-run value to fall back on", async () => {
  const user = userEvent.setup();
  const topicId = "55555555-5555-4555-8555-555555555555";
  let body: unknown;
  const edit = vi.fn(async (request: Request) => {
    body = await request.json();
    return jsonAnswer({
      id: topicId,
      title: "Owlbears",
      values: { "Word Count": "12000" },
      rank: 0,
      createdAt: summary.createdAt,
    })(request);
  });
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({
        schedules: [
          {
            ...summary,
            topicKeyword: "Topic",
            values: { Tone: "calm" },
            topicGeneration: { mode: "hold", keepAtLeast: 3, llm: null },
            topics: {
              held: 1,
              generatingSince: null,
              generatedAt: null,
              failedAt: null,
              error: null,
            },
          },
        ],
      }),
      "GET /api/project-templates": jsonAnswer({ templates: [] }),
      [`GET /api/project-templates/${templateId}`]: jsonAnswer({
        template: {
          id: templateId,
          name: "Stories",
          version: 1,
          updatedAt: "a",
          document: {
            ...freshDraftDocument,
            form: {
              ...freshDraftDocument.form,
              title: "Lore: {{Topic}}",
              values: { Topic: "", "Word Count": "8000", Tone: "" },
            },
          },
        },
      }),
      [`GET /api/schedules/${summary.id}/topics/held`]: jsonAnswer({
        topics: [
          {
            id: topicId,
            title: "Owlbears",
            values: { Tone: "grim" },
            rank: 0,
            createdAt: summary.createdAt,
          },
        ],
      }),
      [`PUT /api/schedules/${summary.id}/topics/held/${topicId}`]: edit,
    }),
  );
  const waiting = await screen.findByRole("list", { name: "Topics waiting" });
  expect(within(waiting).getByText("Tone: grim")).toBeTruthy();
  await user.click(within(waiting).getByRole("button", { name: "Edit" }));
  const words = await within(waiting).findByLabelText("Word Count");
  expect(words.getAttribute("placeholder")).toBe("8000");
  expect(within(waiting).queryByLabelText("Topic")).toBeNull();
  await user.type(words, "12000");
  await user.clear(within(waiting).getByLabelText("Tone"));
  await user.click(within(waiting).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(edit).toHaveBeenCalledOnce());
  expect(body).toEqual({ title: "Owlbears", values: { "Word Count": "12000" } });
});
