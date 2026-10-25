import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { speechIssue } from "./problems";
import { SpeechInstall } from "./speech-install";

afterEach(cleanup);

const nobody = { by: null, how: null };
const view = (install: { readonly text: string; readonly commands: readonly string[] } | null) => ({
  show: false,
  settle: false,
  needs: {
    text: nobody,
    voice: nobody,
    images: nobody,
    gaps: [
      {
        need: "voice",
        fix: "key",
        message: "Nothing can read the script aloud yet.",
        ...(install === null ? {} : { install }),
      },
    ],
  },
  sampleProjectId: null,
  samples: { library: null, audiobook: null, podcast: null },
  packs: [],
});

const espeak = {
  text: "Install espeak-ng with one of these:",
  commands: ["sudo apt install espeak-ng", "sudo dnf install espeak-ng"],
};

it("says what is wrong with the computer's voice in a sentence, without the commands", () => {
  expect(
    speechIssue(
      "No speech program was found on this computer, so the system voice can't narrate. Install espeak-ng (for example sudo apt install espeak-ng), or add an OpenAI key.",
    ),
  ).toBe("No speech program was found on this computer, so the system voice can't narrate");
  expect(speechIssue(undefined)).toBe("No speech program was found on this computer");
});

it("lists the install commands apart, and looks again when asked", async () => {
  let checked = 0;
  renderRouted(
    <SpeechInstall />,
    testDeps({
      "GET /api/onboarding": jsonAnswer(view(espeak)),
      "POST /api/onboarding/check": (request) => {
        checked += 1;
        return jsonAnswer(view(espeak))(request);
      },
    }),
  );
  await userEvent.click(await screen.findByText("Install a speech program"));
  expect(screen.getByText(/sudo apt install espeak-ng/).textContent).toBe(
    "sudo apt install espeak-ng\nsudo dnf install espeak-ng",
  );
  await userEvent.click(screen.getByRole("button", { name: "Check again" }));
  await waitFor(() => expect(checked).toBe(1));
});

it("draws nothing where this computer installs no speech program that way", async () => {
  const { container } = renderRouted(
    <SpeechInstall />,
    testDeps({ "GET /api/onboarding": jsonAnswer(view(null)) }),
  );
  await waitFor(() => expect(container.textContent).toBe(""));
});
