import type { FirstRunView } from "@app/slices/onboarding/model.js";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { SetupChecklist } from "./welcome.js";

afterEach(cleanup);

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
            message: "Nothing can read the article aloud yet.",
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
