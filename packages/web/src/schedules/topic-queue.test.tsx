import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { freshDraftDocument } from "@/play/draft-state";
import { SchedulesRoute } from "@/routes/schedules";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";

afterEach(cleanup);

const templateId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const summary = {
  id: scheduleId,
  name: "Nightly lore",
  templateId,
  templateVersion: 1,
  cadence: { kind: "daily", time: "09:00" },
  timezone: "UTC",
  missedPolicy: "skip",
  overlapPolicy: "skip",
  spendLimitCents: null,
  items: [],
  topicKeyword: "Topic",
  values: { "Min. Word Count": "15000" },
  status: "active",
  version: 1,
  nextRunAt: "2026-09-14T09:00:00.000Z",
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
  deletedAt: null,
};
const document = {
  ...freshDraftDocument,
  form: {
    ...freshDraftDocument.form,
    title: "Lore: {{Topic}} ({{Min. Word Count}} words)",
    values: { Topic: "Ashurbanipal", "Min. Word Count": "15000" },
  },
};
const routes = {
  "GET /api/project-templates": jsonAnswer({
    templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
  }),
  [`GET /api/project-templates/${templateId}`]: jsonAnswer({
    template: { id: templateId, name: "Stories", version: 1, updatedAt: "a", document },
  }),
};

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "New schedule" }));
  await user.type(screen.getByLabelText("Name"), "Nightly lore");
  await screen.findByRole("option", { name: "Stories · v1" });
  await user.selectOptions(screen.getByLabelText("Template"), templateId);
  await screen.findByLabelText("Each topic fills");
}

it("sets a keyword per topic in the table, previews each title, and saves it on the topic", async () => {
  const user = userEvent.setup();
  const create = vi.fn(async (request: Request) => {
    expect(await request.json()).toMatchObject({
      topicKeyword: "Topic",
      values: { "Min. Word Count": "15000" },
      items: [
        { title: "Cleopatra", values: { "Min. Word Count": "12000" } },
        { title: "Hypatia", values: {} },
      ],
    });
    return Response.json(summary);
  });
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      ...routes,
      "GET /api/schedules": jsonAnswer({ schedules: [] }),
      "POST /api/schedules": create,
    }),
  );
  await openForm(user);
  await user.type(screen.getByLabelText("One per line"), "Cleopatra{Enter}Hypatia");
  await user.click(screen.getByRole("button", { name: "Table" }));
  await user.selectOptions(screen.getByLabelText("Set a keyword per topic"), "Min. Word Count");
  const table = screen.getByRole("table", { name: "Topics" });
  await user.type(within(table).getByLabelText("Topic 1 Min. Word Count"), "12000");
  expect(within(table).getByText("Lore: Cleopatra (12000 words)")).toBeTruthy();
  // A blank cell uses the every-run value.
  expect(within(table).getByText("Lore: Hypatia (15000 words)")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
});

it("reads a pasted YAML list, names bad rows, and converts back to lines without loss", async () => {
  const user = userEvent.setup();
  const create = vi.fn(() => Response.json(summary));
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      ...routes,
      "GET /api/schedules": jsonAnswer({ schedules: [] }),
      "POST /api/schedules": create,
    }),
  );
  await openForm(user);
  await user.click(screen.getByRole("button", { name: "YAML / JSON" }));
  const yaml = screen.getByLabelText("Topics as YAML or JSON");
  fireEvent.change(yaml, {
    target: { value: "- Topic: Cleopatra\n  Colour: red\n- Hypatia\n" },
  });
  expect(
    await screen.findByText(/Topic 1: “Colour” is not a keyword of this template/),
  ).toBeTruthy();
  // A list that doesn't read keeps you in YAML, and saving is refused.
  await user.click(screen.getByRole("button", { name: "One per line" }));
  expect(screen.getByLabelText("Topics as YAML or JSON")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  expect(create).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Topics as YAML or JSON"), {
    target: { value: '[{"Topic": "Cleopatra", "Min. Word Count": "12000"}, "Hypatia"]' },
  });
  const titles = await screen.findByRole("region", { name: "Project titles" });
  expect(
    within(titles)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["Lore: Cleopatra (12000 words)", "Lore: Hypatia (15000 words)"]);
  // To lines and back: the topic's own word count survives.
  await user.click(screen.getByRole("button", { name: "One per line" }));
  expect(screen.getByLabelText<HTMLTextAreaElement>(/2 topics · next: Cleopatra/).value).toBe(
    "Cleopatra\nHypatia",
  );
  await user.click(screen.getByRole("button", { name: "YAML / JSON" }));
  expect(screen.getByLabelText<HTMLTextAreaElement>("Topics as YAML or JSON").value).toBe(
    '- Topic: Cleopatra\n  Min. Word Count: "12000"\n- Hypatia\n',
  );
});

it("shows the next run's project title from the calendar on the schedule's row", async () => {
  renderRouted(
    <SchedulesRoute />,
    testDeps({
      ...routes,
      "GET /api/schedules": jsonAnswer({ schedules: [summary] }),
      "GET /api/calendar": jsonAnswer({
        from: "a",
        to: "b",
        runs: [
          {
            at: summary.nextRunAt,
            scheduleId,
            scheduleName: summary.name,
            scheduleVersion: 1,
            paused: false,
            templateId,
            templateVersion: 1,
            templateName: "Stories",
            index: 0,
            topic: "Cleopatra",
            topicSource: "queued",
            renderedTitle: "Lore: Cleopatra (12000 words)",
          },
        ],
        projects: [],
        queued: [],
      }),
    }),
  );
  expect(await screen.findByText(/Next: .* · “Lore: Cleopatra \(12000 words\)”/)).toBeTruthy();
});
