import type { FirstRunView } from "@app/slices/onboarding/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { WelcomeRoute } from "./welcome.js";

afterEach(cleanup);

const view: FirstRunView = {
  show: true,
  sampleProjectId: "sample-1",
  samples: { library: "sample-1", audiobook: "sample-2", podcast: null },
  clis: [
    {
      id: "claude-code",
      name: "Claude Code CLI",
      installed: true,
      ready: true,
      version: "2.1.300",
      issue: null,
      draws: false,
    },
    {
      id: "codex",
      name: "Codex CLI",
      installed: true,
      ready: true,
      version: "0.160.0",
      issue: null,
      draws: true,
    },
    {
      id: "gemini",
      name: "Gemini CLI",
      installed: false,
      ready: false,
      version: null,
      issue: null,
      draws: false,
    },
  ],
  packs: [
    {
      id: "history",
      name: "History",
      summary: "Narrative history.",
      installed: false,
      templateId: null,
    },
    {
      id: "science",
      name: "Science explainers",
      summary: "Clear.",
      installed: true,
      templateId: "t",
    },
  ],
};

describe("the first-run screen", () => {
  it("says what this computer can already do and links the sample", async () => {
    renderRouted(<WelcomeRoute />, testDeps({ "GET /api/onboarding": jsonAnswer(view) }));
    expect(
      await screen.findByText(/no API keys are needed for the text or the images/),
    ).not.toBeNull();
    expect(screen.getByText("Ready · 0.160.0 · writes and draws")).not.toBeNull();
    expect(screen.getByText("Not found")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Explore the sample" }).getAttribute("href")).toBe(
      "/projects/sample-1",
    );
    expect(screen.getByRole("link", { name: "See an audiobook" }).getAttribute("href")).toBe(
      "/projects/sample-2",
    );
    // A sample that was deleted points to where it comes back.
    expect(screen.queryByRole("link", { name: "Hear a podcast" })).toBeNull();
    expect(screen.getByRole("link", { name: "Restore samples in Settings" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Added" }).hasAttribute("disabled")).toBe(true);
  });

  it("starts a short from a topic with the picked pack, and says why it can't", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    let refuse = true;
    renderRouted(
      <WelcomeRoute />,
      testDeps({
        "GET /api/onboarding": jsonAnswer(view),
        "POST /api/onboarding/short": async (request) => {
          sent.push(await request.json());
          return refuse
            ? problemAnswer("No voice is ready to narrate the short.", 409)(request)
            : jsonAnswer({ projectId: "p9", replayed: false }, 201)(request);
        },
      }),
    );
    const button = await screen.findByRole("button", { name: "Make a 60-second short" });
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.type(screen.getByPlaceholderText("Why the sea glows at night"), "Tides");
    await user.selectOptions(screen.getByLabelText("Starter pack"), "history");
    await user.click(button);
    expect(await screen.findByText("No voice is ready to narrate the short.")).not.toBeNull();
    refuse = false;
    await user.click(button);
    await waitFor(() => expect(sent).toHaveLength(2));
    // The retry of the same press carries the same request id, so it can't start two.
    expect(sent[0]).toMatchObject({ topic: "Tides", packId: "history" });
    expect((sent[1] as { requestId: string }).requestId).toBe(
      (sent[0] as { requestId: string }).requestId,
    );
  });

  it("is skipped for good with Skip", async () => {
    const user = userEvent.setup();
    let dismissed = false;
    renderRouted(
      <WelcomeRoute />,
      testDeps({
        "GET /api/onboarding": jsonAnswer(view),
        "POST /api/onboarding/dismiss": (request) => {
          dismissed = true;
          return jsonAnswer({ dismissed: true })(request);
        },
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Skip" }));
    await waitFor(() => expect(dismissed).toBe(true));
  });
});
