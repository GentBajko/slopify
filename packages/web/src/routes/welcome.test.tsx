import type { FirstRunView, ShortGap } from "@app/slices/onboarding/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Answer, jsonAnswer, renderRouted, testDeps, testVersion } from "@/test-app";
import { WelcomeRoute } from "./welcome.js";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

const voiceGap: ShortGap = {
  need: "voice",
  fix: "key",
  message:
    "Nothing can read the article aloud yet. Add a voice key: an OpenAI key works at once with the voices Slopify sets up.",
  install: {
    text: "Install espeak-ng with one of these:",
    commands: ["sudo apt install espeak-ng", "sudo pacman -S espeak-ng"],
  },
};
const imagesGap: ShortGap = {
  need: "images",
  fix: "key",
  message:
    "Nothing can make the images yet. Add an image key (OpenAI, Google, fal.ai or Replicate), or sign in to Codex on this computer.",
};

// Claude Code found and signed in; no voice and nothing to make the images.
const view: FirstRunView = {
  show: true,
  settle: false,
  needs: {
    text: { by: "Claude Code CLI", how: "sign-in" },
    voice: { by: null, how: null },
    images: { by: null, how: null },
    gaps: [imagesGap, voiceGap],
  },
  sampleProjectId: "sample-1",
  samples: { library: "sample-1", audiobook: "sample-2", podcast: null },
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

const ready: FirstRunView = {
  ...view,
  needs: {
    text: { by: "Claude Code CLI", how: "sign-in" },
    voice: { by: "OpenAI", how: "key" },
    images: { by: "Codex CLI", how: "sign-in" },
    gaps: [],
  },
};

const refusal =
  (gaps: readonly ShortGap[]): Answer =>
  () =>
    new Response(
      JSON.stringify({
        title: "Conflict",
        status: 409,
        detail: gaps.map((gap) => gap.message).join(" "),
        gaps,
      }),
      {
        status: 409,
        headers: { "content-type": "application/problem+json", "X-Slopify-Version": testVersion },
      },
    );

const row = (name: string) => {
  const rows = screen.getAllByRole("listitem");
  const found = rows.find((one) => one.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`No row starts with ${name}`);
  return found;
};

describe("step 1: what a short needs", () => {
  it("lists the article, the narration and the images, each with its state and its fix", async () => {
    renderRouted(<WelcomeRoute />, testDeps({ "GET /api/onboarding": jsonAnswer(view) }));
    expect(await screen.findByText("Claude Code writes it with your sign-in.")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "What a short needs" })).not.toBeNull();
    expect(screen.getByText("Step 1 of 3")).not.toBeNull();
    // The stages and the state words are the ones Keys & services uses.
    expect(within(row("Article")).getByText("Ready")).not.toBeNull();
    expect(within(row("Narration")).getByText("No key")).not.toBeNull();
    expect(within(row("Images")).getByText("No key")).not.toBeNull();
    // No tool is named by how Slopify talks to it.
    expect(screen.queryByText(/CLI/)).toBeNull();
    // Each fix opens Settings at the service that works at once, and says where to come back.
    const voiceKey = screen.getByRole("link", { name: "Add a voice key" });
    expect(voiceKey.getAttribute("href")).toBe(
      "/settings?section=providers&family=tts&provider=openai-tts&return=welcome&step=found",
    );
    expect(screen.getByRole("link", { name: "Add an image key" }).getAttribute("href")).toContain(
      "family=image&provider=openai-image",
    );
    // The fixes are secondary: the lime is the bar's Next.
    expect(voiceKey.className).toContain("sl-btn--secondary");
    expect(screen.getByRole("button", { name: "Next: Pick a style" }).className).toContain(
      "sl-btn--primary",
    );
    // No tool report: no versions, no "Not found", no CLI rows.
    expect(screen.queryByText(/Not found/)).toBeNull();
    expect(screen.queryByText(/Codex CLI ·|Antigravity/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Other tools and services Slopify can use" }),
    ).not.toBeNull();
  });

  it("says the install commands once, folded, and Check again looks afresh", async () => {
    const user = userEvent.setup();
    const checked = vi.fn(jsonAnswer(ready));
    renderRouted(
      <WelcomeRoute />,
      testDeps({ "GET /api/onboarding": jsonAnswer(view), "POST /api/onboarding/check": checked }),
    );
    const fold = (await screen.findByText("Use your computer's free voice instead")).closest(
      "details",
    );
    expect(fold?.open).toBe(false);
    expect(screen.getAllByText(/sudo apt install espeak-ng/)).toHaveLength(1);
    expect(within(fold as HTMLElement).getByText("Then press Check again.")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText("OpenAI reads it aloud with your key.")).not.toBeNull();
    expect(checked).toHaveBeenCalledTimes(1);
    // Nothing is missing, so there is nothing to check again.
    expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
  });

  it("offers a better voice beside the computer's own, and sends a saved-voice gap to Voices", async () => {
    renderRouted(
      <WelcomeRoute />,
      testDeps({
        "GET /api/onboarding": jsonAnswer({
          ...view,
          needs: {
            ...view.needs,
            voice: { by: "eSpeak NG", how: "computer" },
            gaps: [imagesGap],
          },
        }),
      }),
    );
    expect(
      await screen.findByText(
        "Your computer's own voice (eSpeak NG) reads it aloud, for free. A voice key sounds better.",
      ),
    ).not.toBeNull();
    expect(
      within(row("Narration")).getByRole("link", { name: "Add a voice key" }).className,
    ).toContain("sl-btn--quiet");
    cleanup();
    renderRouted(
      <WelcomeRoute />,
      testDeps({
        "GET /api/onboarding": jsonAnswer({
          ...view,
          needs: {
            ...view.needs,
            gaps: [
              {
                need: "voice",
                fix: "saved-voice",
                message: "ElevenLabs has a key but no voice saved yet.",
              },
            ],
          },
        }),
      }),
    );
    expect(await screen.findByText("No voice saved")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Save a voice" }).getAttribute("href")).toBe(
      "/settings?section=voices&return=welcome&step=found",
    );
    // The line also offers the OpenAI key it names, which narrates at once.
    expect(screen.getByRole("link", { name: "Add an OpenAI key" }).getAttribute("href")).toBe(
      "/settings?section=providers&family=tts&provider=openai-tts&return=welcome&step=found",
    );
  });
});

describe("step 2: pick a style", () => {
  it("is one press on the row, with the picked one ticked and nothing else to press", async () => {
    const user = userEvent.setup();
    renderRouted(
      <WelcomeRoute step="style" onStep={() => undefined} />,
      testDeps({
        "GET /api/onboarding": jsonAnswer(view),
      }),
    );
    await user.click(await screen.findByRole("button", { name: "History" }));
    expect(within(row("History")).getByText("Picked")).not.toBeNull();
    expect(within(row("General")).queryByText("Picked")).toBeNull();
    expect(screen.queryByRole("button", { name: /library/i })).toBeNull();
    expect(screen.queryByText(/Add to library/)).toBeNull();
  });
});

describe("step 3: make the first short", () => {
  it("keeps Make in the bar, and an empty topic gets the field, not a request", async () => {
    const user = userEvent.setup();
    const made = vi.fn(jsonAnswer({ projectId: "p9", replayed: false }, 201));
    renderRouted(
      <WelcomeRoute step="make" onStep={() => undefined} />,
      testDeps({ "GET /api/onboarding": jsonAnswer(ready), "POST /api/onboarding/short": made }),
    );
    const make = await screen.findByRole("button", { name: "Make a 60-second short" });
    expect(make.hasAttribute("disabled")).toBe(false);
    expect(make.className).toContain("sl-btn--primary");
    await user.click(make);
    expect(await screen.findByText("Type a topic first.")).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Topic"));
    expect(made).not.toHaveBeenCalled();
    // What will happen, in one line under the topic.
    expect(
      screen.getByText(
        "General style: Claude Code writes it, OpenAI reads it aloud, Codex makes the images. About five minutes.",
      ),
    ).not.toBeNull();
  });

  it("arrives from Next on the step, not on a refused empty topic", async () => {
    const user = userEvent.setup();
    const made = vi.fn(jsonAnswer({ projectId: "p9", replayed: false }, 201));
    renderRouted(
      <WelcomeRoute step="style" />,
      testDeps({ "GET /api/onboarding": jsonAnswer(ready), "POST /api/onboarding/short": made }),
    );
    // Make takes Next's place in the bar. In a browser the click's default action runs after
    // the step has changed, so Make must be a new button, not Next turned into a submit button,
    // or the press that moved here would also press Make with an empty topic.
    const next = await screen.findByRole("button", { name: "Next: Make your first short" });
    await user.click(next);
    const make = await screen.findByRole("button", { name: "Make a 60-second short" });
    expect(make).not.toBe(next);
    expect(next.isConnected).toBe(false);
    await waitFor(() => expect(document.activeElement?.id).toBe("welcome-step-make"));
    expect(screen.queryByText("Type a topic first.")).toBeNull();
    expect(made).not.toHaveBeenCalled();
  });

  it("names what is still missing above the topic, with its fix, before anything is pressed", async () => {
    renderRouted(
      <WelcomeRoute step="make" onStep={() => undefined} />,
      testDeps({ "GET /api/onboarding": jsonAnswer(view) }),
    );
    expect(
      await screen.findByText("The short needs every line Ready before it can start."),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Add a voice key" }).getAttribute("href")).toContain(
      "return=welcome&step=make",
    );
    // Make still answers a press, but the lime waits until nothing is missing.
    const make = screen.getByRole("button", { name: "Make a 60-second short" });
    expect(make.hasAttribute("disabled")).toBe(false);
    expect(make.className).not.toContain("sl-btn--primary");
  });

  it("makes the short with the style and topic, the same request across a refusal", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    let refuse = true;
    renderRouted(
      <WelcomeRoute />,
      testDeps({
        "GET /api/onboarding": (request) => jsonAnswer(refuse ? view : ready)(request),
        "POST /api/onboarding/short": async (request) => {
          sent.push(await request.json());
          return refuse
            ? refusal([imagesGap, voiceGap])(request)
            : jsonAnswer({ projectId: "p9", replayed: false }, 201)(request);
        },
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Next: Pick a style" }));
    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Next: Make your first short" }));
    await user.type(screen.getByLabelText("Topic"), "Tides");
    await user.click(screen.getByRole("button", { name: "Make a 60-second short" }));
    expect(
      await screen.findByText(
        "The short didn't start. Fix the lines above that are not Ready, then press Make a 60-second short again.",
      ),
    ).not.toBeNull();
    refuse = false;
    await user.click(screen.getByRole("button", { name: "Make a 60-second short" }));
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
    // The style's prompts the short installed are named once, with where they are now.
    expect(screen.getByText(/Its History prompts are now in/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Prompts" }).getAttribute("href")).toBe(
      "/prompts?kind=article",
    );
    expect(screen.getByRole("button", { name: "Done" })).not.toBeNull();
    // The samples are there to look at while it runs.
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

  it("says a refusal the checklist can't see in the server's own words", async () => {
    const user = userEvent.setup();
    const odd: ShortGap = {
      need: "text",
      fix: "key",
      message: "Nothing can write the article yet.",
    };
    renderRouted(
      <WelcomeRoute step="make" onStep={() => undefined} />,
      testDeps({
        "GET /api/onboarding": jsonAnswer(ready),
        "POST /api/onboarding/short": refusal([odd]),
      }),
    );
    await user.type(await screen.findByLabelText("Topic"), "Tides");
    await user.click(screen.getByRole("button", { name: "Make a 60-second short" }));
    expect(await screen.findByText("Nothing can write the article yet.")).not.toBeNull();
  });
});

describe("a detour and back", () => {
  it("opens at the step in the address with the topic and style typed before", async () => {
    window.sessionStorage.setItem("slopify.welcome.topic", "Tides");
    window.sessionStorage.setItem("slopify.welcome.pack", "history");
    renderRouted(
      <WelcomeRoute step="make" onStep={() => undefined} />,
      testDeps({ "GET /api/onboarding": jsonAnswer(ready) }),
    );
    expect(((await screen.findByLabelText("Topic")) as HTMLInputElement).value).toBe("Tides");
    expect(await screen.findByText(/^History style:/)).not.toBeNull();
  });

  it("moves through the address, so Settings can send the person back to a step", async () => {
    const user = userEvent.setup();
    const steps: string[] = [];
    renderRouted(
      <WelcomeRoute step="found" onStep={(step) => steps.push(step)} />,
      testDeps({ "GET /api/onboarding": jsonAnswer(ready) }),
    );
    await user.click(await screen.findByRole("button", { name: "Next: Pick a style" }));
    expect(steps).toEqual(["style"]);
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
