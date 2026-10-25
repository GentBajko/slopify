import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SchedulesView } from "@/schedules/view";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";

afterEach(cleanup);

const templateId = "11111111-1111-4111-8111-111111111111";

function deps(create: (request: Request) => Promise<Response> | Response) {
  return testDeps({
    "GET /api/schedules": jsonAnswer({ schedules: [] }),
    "GET /api/project-templates": jsonAnswer({
      templates: [
        { id: templateId, name: "Stories", version: 1, updatedAt: "2026-09-12T00:00:00.000Z" },
      ],
    }),
    "POST /api/schedules": create,
  });
}

it("marks each refused field in words, focuses the first, and keeps what was typed", async () => {
  const create = vi.fn(() => Response.json({}));
  const user = userEvent.setup();
  renderRouted(<SchedulesView />, deps(create));
  await user.click(await screen.findByRole("button", { name: "New schedule" }));
  await user.clear(screen.getByLabelText("Timezone"));
  await user.type(screen.getByLabelText("Timezone"), "Mars/Olympus");
  await user.type(screen.getByLabelText("Spend ceiling per run (US$, optional)"), "abc");
  await user.click(screen.getByRole("button", { name: "Save schedule" }));

  expect(create).not.toHaveBeenCalled();
  const name = screen.getByLabelText("Name");
  expect(document.activeElement).toBe(name);
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("Give the schedule a name.")).not.toBeNull();
  expect(screen.getByText(/^Enter a timezone name like Europe\/Tirane/)).not.toBeNull();
  expect(screen.getByText(/^Enter the ceiling in US dollars/)).not.toBeNull();
  expect((screen.getByLabelText("Timezone") as HTMLInputElement).value).toBe("Mars/Olympus");
  // A fixed field loses its mark as it is typed.
  await user.type(name, "Evening");
  expect(screen.queryByText("Give the schedule a name.")).toBeNull();
});

it("sends the spend ceiling typed in dollars as cents", async () => {
  const bodies: { spendLimitCents: number | null }[] = [];
  const user = userEvent.setup();
  renderRouted(
    <SchedulesView />,
    deps(async (request) => {
      bodies.push(await request.json());
      return Response.json({});
    }),
  );
  await user.click(await screen.findByRole("button", { name: "New schedule" }));
  await user.type(screen.getByLabelText("Name"), "Dollars");
  await screen.findByRole("option", { name: "Stories · v1" });
  await user.selectOptions(screen.getByLabelText("Template"), templateId);
  await user.clear(screen.getByLabelText("Timezone"));
  await user.type(screen.getByLabelText("Timezone"), "UTC");
  await user.type(screen.getByLabelText("Spend ceiling per run (US$, optional)"), "2.50");
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0]?.spendLimitCents).toBe(250);
});

// Ranking by what the library covers is free and local, so it scores the person's own topics
// too: it is offered whether or not Slopify finds new topics.
it("ranks topics with or without generated ones, and says what search sends", async () => {
  const user = userEvent.setup();
  renderRouted(
    <SchedulesView />,
    deps(() => Response.json({})),
  );
  await user.click(await screen.findByRole("button", { name: "New schedule" }));
  const rank = screen.getByLabelText("Rank topics") as HTMLSelectElement;
  expect(rank.disabled).toBe(false);
  expect(rank.value).toBe("off");
  await user.selectOptions(rank, "library");
  expect(
    screen.getByText(
      "Scores your topics when you press Rescore; your own and moved topics keep their place.",
    ),
  ).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("New topics"), "queue");
  await user.selectOptions(rank, "search");
  expect(
    screen.getByText(
      "Sends each new topic's title to Google, DuckDuckGo and Wikipedia. Nothing else leaves this computer.",
    ),
  ).toBeTruthy();
});

// Each choice's line says what it does and what it spends, not what another choice would.
it("says under New topics and the AI model what the picked choice does", async () => {
  const user = userEvent.setup();
  renderRouted(
    <SchedulesView />,
    deps(() => Response.json({})),
  );
  await user.click(await screen.findByRole("button", { name: "New schedule" }));
  const mode = screen.getByLabelText("New topics");
  expect(screen.getByText("Or have the AI suggest topics, one AI call per batch.")).toBeTruthy();
  await user.selectOptions(mode, "queue");
  expect(
    screen.getByText("They join the end of the queue. Each batch is one AI call."),
  ).toBeTruthy();
  await user.selectOptions(mode, "hold");
  expect(
    screen.getByText(
      "They wait under Topics waiting until you approve them. Each batch is one AI call.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("Untick to pick another, such as a cheaper model.")).toBeTruthy();
  await user.click(screen.getByRole("checkbox", { name: /Use the template's AI model/ }));
  expect(screen.getByText("Topics are suggested by the service and model below.")).toBeTruthy();
});
