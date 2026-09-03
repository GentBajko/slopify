import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { FirstRunNotice } from "./notice.js";

afterEach(cleanup);

const title = "Anonymous usage stats";

describe("the first-run notice", () => {
  it("is shown when this machine has not seen it", async () => {
    renderApp(
      <FirstRunNotice />,
      testDeps({ "GET /api/telemetry/notice": jsonAnswer({ seen: false }) }),
    );

    expect(await screen.findByText(title)).not.toBeNull();
    // The disclosure itself: what is counted and what never is (logic/16 steps 3-4).
    expect(screen.getByText("Tracked")).not.toBeNull();
    expect(screen.getByText("Never tracked")).not.toBeNull();
    expect(screen.getByText("API keys")).not.toBeNull();
    expect(screen.getByText("videos rendered")).not.toBeNull();
  });

  it("is never shown again once the machine has seen it", async () => {
    renderApp(
      <FirstRunNotice />,
      testDeps({ "GET /api/telemetry/notice": jsonAnswer({ seen: true }) }),
    );

    await waitFor(() => {
      expect(screen.queryByText(title)).toBeNull();
    });
  });

  it("shows nothing while the answer is still coming", () => {
    renderApp(<FirstRunNotice />, testDeps({}));
    expect(screen.queryByText(title)).toBeNull();
  });

  it("creates the machine id on Got it and does not come back", async () => {
    const dismissed = vi.fn(jsonAnswer({ seen: true }));
    renderApp(
      <FirstRunNotice />,
      testDeps({
        "GET /api/telemetry/notice": jsonAnswer({ seen: false }),
        "POST /api/telemetry/notice": dismissed,
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Got it" }));

    await waitFor(() => {
      expect(screen.queryByText(title)).toBeNull();
    });
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it("cannot be escaped: it must be acknowledged", async () => {
    renderApp(
      <FirstRunNotice />,
      testDeps({ "GET /api/telemetry/notice": jsonAnswer({ seen: false }) }),
    );

    await screen.findByText(title);
    await userEvent.keyboard("{Escape}");

    expect(screen.getByText(title)).not.toBeNull();
  });

  it("stays open and names the problem when the dismissal fails", async () => {
    renderApp(
      <FirstRunNotice />,
      testDeps({
        "GET /api/telemetry/notice": jsonAnswer({ seen: false }),
        "POST /api/telemetry/notice": problemAnswer("The data directory is read-only.", 500),
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Got it" }));

    expect(await screen.findByText("The data directory is read-only.")).not.toBeNull();
    expect(screen.getByText(title)).not.toBeNull();
  });
});
