import type { FirstRunView } from "@app/slices/onboarding/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { WelcomeRoute } from "./welcome.js";

afterEach(cleanup);

const view: FirstRunView = {
  show: true,
  settle: false,
  voice: { keyed: null, system: { available: true, engine: "eSpeak NG", issue: null } },
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

describe("the first-run steps", () => {
  it("starts with what this computer can already do, the voice included", async () => {
    renderRouted(<WelcomeRoute />, testDeps({ "GET /api/onboarding": jsonAnswer(view) }));
    expect(
      await screen.findByText(
        "You can make a video now: no API keys are needed for the text, the images or the narration.",
      ),
    ).not.toBeNull();
    expect(screen.getByText("Ready · 0.160.0 · writes and draws")).not.toBeNull();
    expect(screen.getByText("Not found")).not.toBeNull();
    expect(
      screen.getByText(
        "Narration uses your computer's built-in voice (eSpeak NG); add an ElevenLabs or OpenAI key later for a better one.",
      ),
    ).not.toBeNull();
    expect(
      screen.getByRole("tab", { name: "1 · What you have" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("offers the fix inline when no voice can narrate", async () => {
    renderRouted(
      <WelcomeRoute />,
      testDeps({
        "GET /api/onboarding": jsonAnswer({
          ...view,
          voice: {
            keyed: null,
            system: {
              available: false,
              engine: null,
              issue: "No speech program was found on this computer. Install espeak-ng.",
            },
          },
        }),
      }),
    );
    // Said on the first step, and again on the last one beside Make.
    expect(await screen.findAllByText("No voice can narrate the short yet.")).toHaveLength(2);
    expect(screen.getAllByText(/Install espeak-ng/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Add a voice key" })[0]?.getAttribute("href")).toBe(
      "/settings?section=providers",
    );
    expect(screen.getByRole("button", { name: "Check again" })).not.toBeNull();
  });

  it("walks to a style, then makes the short from a topic and links its live view", async () => {
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
    await user.click(await screen.findByRole("button", { name: "Next: Pick a style" }));
    expect(
      screen.getByRole("button", { name: "Add History to library" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen.getByRole("button", { name: "Science explainers is in your library" }),
    ).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Use History" }));
    await user.click(screen.getByRole("button", { name: "Next: Make your first short" }));
    expect(screen.getByText(/^Style: History\./)).not.toBeNull();
    const button = screen.getByRole("button", { name: "Make a 60-second short" });
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.type(screen.getByPlaceholderText("Why the sea glows at night"), "Tides");
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
    expect(await screen.findByText("Your short is being made.")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Watch it being made" }).getAttribute("href")).toBe(
      "/projects/p9",
    );
    // The samples are there as extras while it runs.
    expect(screen.getByRole("link", { name: "Explore the sample" }).getAttribute("href")).toBe(
      "/projects/sample-1",
    );
    expect(screen.getByRole("link", { name: "See an audiobook" }).getAttribute("href")).toBe(
      "/projects/sample-2",
    );
    // A sample that was deleted points to where it comes back.
    expect(screen.queryByRole("link", { name: "Hear a podcast" })).toBeNull();
    expect(screen.getByRole("link", { name: "Restore samples in Settings" })).not.toBeNull();
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
