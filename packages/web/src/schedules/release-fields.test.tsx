import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { freshDraftDocument } from "@/play/draft-state";
import { SchedulesView } from "@/schedules/view";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";

afterEach(cleanup);

const templateId = "11111111-1111-4111-8111-111111111111";
const form = freshDraftDocument.form;
const document = {
  ...freshDraftDocument,
  form: {
    ...form,
    title: "{{Topic}}",
    values: { Topic: "Lighthouses" },
    sources: { ...form.sources, audio: "generate" },
    shorts: {
      enabled: true,
      count: "2",
      minSeconds: "60",
      maxSeconds: "120",
      prompt: "",
      imagePrompt: "",
    },
  },
};

it("sets each run day's release times, with one time for each short the template makes", async () => {
  const user = userEvent.setup();
  const create = vi.fn(async (request: Request) => {
    const body = (await request.json()) as { releases: unknown };
    expect(body.releases).toEqual([
      {
        day: 1,
        long: { day: 1, time: "20:00" },
        shorts: [
          { day: 3, time: "12:00" },
          { day: 2, time: "17:00" },
        ],
      },
      {
        day: 3,
        long: { day: 3, time: "20:00" },
        shorts: [
          { day: 4, time: "12:00" },
          { day: 4, time: "17:00" },
        ],
      },
    ]);
    return Response.json({});
  });
  renderRouted(
    <SchedulesView />,
    testDeps({
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: "a" }],
      }),
      [`GET /api/project-templates/${templateId}`]: jsonAnswer({
        template: { id: templateId, name: "Stories", version: 1, updatedAt: "a", document },
      }),
      "GET /api/schedules": jsonAnswer({ schedules: [] }),
      "POST /api/schedules": create,
    }),
  );
  await user.click(await screen.findByRole("button", { name: "New schedule" }));
  await user.type(screen.getByLabelText("Name"), "Twice a week");
  await screen.findByRole("option", { name: "Stories · v1" });
  await user.selectOptions(screen.getByLabelText("Template"), templateId);
  await user.selectOptions(screen.getByLabelText("Cadence"), "weekly");
  // Monday, Wednesday and Friday are ticked to start with: Friday goes.
  await user.click(screen.getByRole("checkbox", { name: "Fri" }));
  await user.click(screen.getByRole("button", { name: "Set release times" }));
  expect(await screen.findByText("Monday's run")).toBeTruthy();
  expect(screen.getByText("Wednesday's run")).toBeTruthy();
  expect(screen.getAllByLabelText("Short 2: day")).toHaveLength(2);
  await user.selectOptions(screen.getAllByLabelText("Short 1: day")[0] as HTMLElement, "3");
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
});
