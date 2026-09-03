import type { Usage } from "@app/slices/telemetry/usage.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { UsageRoute } from "./usage.js";

afterEach(cleanup);

const empty: Usage = {
  machineId: "7f3c2a19-4b0e-4d61-9c7a-2e58d0f19a1e",
  appVersion: "0.4.2",
  counters: { videosMade: 0, audioSeconds: 0, imagesMade: 0, tokensUsed: 0, projects: 0 },
  byStage: [],
};

const busy: Usage = {
  machineId: "7f3c2a19-4b0e-4d61-9c7a-2e58d0f19a1e",
  appVersion: "0.4.2",
  counters: {
    videosMade: 42,
    audioSeconds: 55_080,
    imagesMade: 612,
    tokensUsed: 8_400_000,
    projects: 47,
  },
  byStage: [
    {
      stage: "article",
      provider: "openrouter",
      model: "anthropic/claude-sonnet",
      tokensIn: 1_204_311,
      tokensOut: 3_882_904,
    },
    {
      stage: "research",
      provider: "openrouter",
      model: null,
      tokensIn: 2_110_450,
      tokensOut: 1_006_220,
    },
  ],
};

// The screen groups digits for the machine's own locale, which is the machine running
// this test; the assertions ask for the same grouping rather than pinning en-US.
function group(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function deps(usage: Usage) {
  return testDeps({ "GET /api/usage": jsonAnswer(usage) });
}

describe("the usage screen", () => {
  it("says whose numbers these are", async () => {
    renderApp(<UsageRoute />, deps(empty));
    expect(await screen.findByRole("heading", { name: "Usage" })).not.toBeNull();
    expect(
      screen.getByText("This machine only. The same counters, anonymised, feed slopify.stream."),
    ).not.toBeNull();
  });

  it("shows the board and the table's shape while the numbers are coming", async () => {
    const { container } = renderApp(<UsageRoute />, testDeps({}));
    await waitFor(() => {
      expect(container.querySelectorAll(".rounded-control").length).toBeGreaterThan(9);
    });
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("teaches a fresh install what fills it, with every counter at zero", async () => {
    renderApp(<UsageRoute />, deps(empty));

    expect(await screen.findByText("Numbers appear after your first run.")).not.toBeNull();
    expect(screen.getAllByText("0")).toHaveLength(5);
    expect(screen.getByText("No stages have run yet.")).not.toBeNull();
  });

  it("counts the five things the marketing page counts", async () => {
    renderApp(<UsageRoute />, deps(busy));

    const videos = await screen.findByText("Videos made");
    expect(videos.parentElement?.textContent).toBe("Videos made42");
    // The API answers in seconds; the hours are this screen's arithmetic.
    expect(screen.getByText("Hours of audio").parentElement?.textContent).toBe(
      "Hours of audio15.3",
    );
    expect(screen.getByText("Images made").parentElement?.textContent).toBe("Images made612");
    expect(screen.getByText("Tokens used").parentElement?.textContent).toBe("Tokens used8.4M");
    expect(screen.getByText("Projects").parentElement?.textContent).toBe("Projects47");
    expect(screen.queryByText("Numbers appear after your first run.")).toBeNull();
  });

  it("tabulates the tokens by stage, in the order the server sorted them", async () => {
    renderApp(<UsageRoute />, deps(busy));

    const table = await screen.findByRole("table", { name: "Tokens by stage" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ["Article", "openrouter · anthropic/claude-sonnet", group(1_204_311), group(3_882_904)],
      // A provider that named no model is named alone rather than with a dangling dot.
      ["Research", "openrouter", group(2_110_450), group(1_006_220)],
    ]);
  });

  it("groups a token total that has not yet reached a million", async () => {
    renderApp(
      <UsageRoute />,
      deps({ ...busy, counters: { ...busy.counters, tokensUsed: 940_120 } }),
    );
    expect((await screen.findByText("Tokens used")).parentElement?.textContent).toBe(
      `Tokens used${group(940_120)}`,
    );
  });

  it("engraves the machine id and the version that goes out with each report", async () => {
    renderApp(<UsageRoute />, deps(busy));
    expect(
      await screen.findByText("Machine ID 7f3c2a19-4b0e-4d61-9c7a-2e58d0f19a1e · Slopify 0.4.2"),
    ).not.toBeNull();
  });

  it("says the machine id is not made yet before the notice is dismissed", async () => {
    renderApp(<UsageRoute />, deps({ ...empty, machineId: null }));
    expect(await screen.findByText("Machine ID not made yet · Slopify 0.4.2")).not.toBeNull();
  });

  it("names the problem when the numbers cannot be read", async () => {
    renderApp(
      <UsageRoute />,
      testDeps({ "GET /api/usage": problemAnswer("The database is locked.", 500) }),
    );
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
  });
});
