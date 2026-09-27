import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { WhatsNewTour, whatsNewTours } from "./tour.js";

afterEach(cleanup);

const noticeSeen = jsonAnswer({ seen: true, appVersion: "3.0.0" });
const title = "What's new in 3.0";

describe("the what's new tour", () => {
  it("walks through every 3.0 step, each with a link to its screen", async () => {
    const steps = whatsNewTours[3] ?? [];
    renderRouted(
      <WhatsNewTour />,
      testDeps({
        "GET /api/telemetry/notice": noticeSeen,
        "GET /api/whats-new": jsonAnswer({ show: true, major: 3 }),
      }),
    );

    expect(await screen.findByRole("dialog", { name: title })).not.toBeNull();
    expect(steps.map((step) => step.id)).toEqual([
      "home",
      "play",
      "reviews",
      "channels",
      "memory",
      "calendar",
      "run-cost",
      "studio",
      "voices",
      "long-videos",
      "languages",
      "trash",
    ]);
    for (const [index, step] of steps.entries()) {
      expect(screen.getByRole("heading", { name: step.title })).not.toBeNull();
      expect(screen.getByText(`${String(index + 1)} of ${String(steps.length)}`)).not.toBeNull();
      const link = screen.getByRole("link", { name: `Open ${step.place}` });
      const query = step.search === undefined ? "" : `?section=${step.search.section ?? ""}`;
      expect(link.getAttribute("href")).toBe(`${step.to}${query}`);
      if (index < steps.length - 1)
        await userEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Other languages" })).not.toBeNull();
  });

  it("records closing it on the server and does not come back", async () => {
    const seen = vi.fn(jsonAnswer({ show: false, major: 3 }));
    renderRouted(
      <WhatsNewTour />,
      testDeps({
        "GET /api/telemetry/notice": noticeSeen,
        "GET /api/whats-new": jsonAnswer({ show: true, major: 3 }),
        "POST /api/whats-new/seen": seen,
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Close tour" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: title })).toBeNull();
    });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("stays open and says so when closing it could not be saved", async () => {
    renderRouted(
      <WhatsNewTour />,
      testDeps({
        "GET /api/telemetry/notice": noticeSeen,
        "GET /api/whats-new": jsonAnswer({ show: true, major: 3 }),
        "POST /api/whats-new/seen": problemAnswer("The database is busy.", 503),
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not save that you closed this tour",
    );
    expect(screen.getByRole("dialog", { name: title })).not.toBeNull();
  });

  it.each([
    ["the server says it is not due", { show: false, major: 3 }],
    ["there is no tour for that major", { show: true, major: 99 }],
  ])("shows nothing when %s", async (_case, body) => {
    const asked = vi.fn(jsonAnswer(body));
    renderRouted(
      <WhatsNewTour />,
      testDeps({ "GET /api/telemetry/notice": noticeSeen, "GET /api/whats-new": asked }),
    );
    await waitFor(() => {
      expect(asked).toHaveBeenCalled();
    });
    expect(screen.queryByRole("dialog", { name: title })).toBeNull();
  });

  it("waits for the first-run notice before asking", async () => {
    const asked = vi.fn(jsonAnswer({ show: true, major: 3 }));
    renderRouted(
      <WhatsNewTour />,
      testDeps({
        "GET /api/telemetry/notice": jsonAnswer({ seen: false, appVersion: "3.0.0" }),
        "GET /api/whats-new": asked,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: title })).toBeNull();
  });
});
