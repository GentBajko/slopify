import type { FirstRunView } from "@app/slices/onboarding/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FreshProviderDefaults } from "@/play/draft-state";
import { jsonAnswer, renderApp, renderRouted, testDeps } from "@/test-app";
import { SetupChecklist, useFreshProviderDefaults } from "./welcome.js";

afterEach(cleanup);

function Defaults({ seen }: { readonly seen: FreshProviderDefaults[] }) {
  useFreshProviderDefaults((defaults) => seen.push(defaults));
  return null;
}

describe("the first launch's provider defaults", () => {
  it("hands Create the tools the first launch found, and shows nothing", async () => {
    const seen: FreshProviderDefaults[] = [];
    const { container } = renderApp(
      <Defaults seen={seen} />,
      testDeps({
        "GET /api/providers/first-run": jsonAnswer({
          firstRun: true,
          detected: [],
          defaults: { llm: { provider: "claude-code", model: "sonnet" } },
          message: "You can make a video now, no API keys needed.",
          detail: null,
        }),
      }),
    );
    await waitFor(() =>
      expect(seen).toEqual([{ llm: { provider: "claude-code", model: "sonnet" } }]),
    );
    expect(container.textContent).toBe("");
  });
});

describe("the setup checklist on its own", () => {
  it("opens each fix at its service, with no way back to name when it is not on the welcome", async () => {
    const view: FirstRunView = {
      show: false,
      settle: false,
      needs: {
        text: { by: "OpenRouter", how: "key" },
        voice: { by: null, how: null },
        images: { by: "Codex CLI", how: "sign-in" },
        gaps: [
          {
            need: "voice",
            fix: "key",
            message: "Nothing can read the script aloud yet.",
          },
        ],
      },
      sampleProjectId: null,
      samples: { library: null, audiobook: null, podcast: null },
      packs: [],
    };
    renderRouted(<SetupChecklist />, testDeps({ "GET /api/onboarding": jsonAnswer(view) }));
    expect(await screen.findByText("OpenRouter writes it with your key.")).not.toBeNull();
    expect(screen.getByText("Codex makes the images with your sign-in.")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Add a voice key" }).getAttribute("href")).toBe(
      "/settings?section=providers&family=tts&provider=openai-tts",
    );
  });
});
