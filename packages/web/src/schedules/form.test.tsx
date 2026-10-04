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
