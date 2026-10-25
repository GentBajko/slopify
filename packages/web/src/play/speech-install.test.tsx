import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { speechFix, speechIssue } from "./problems";
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

const linux =
  "No speech program was found on this computer, so the system voice can't narrate. Install espeak-ng (for example sudo apt install espeak-ng), or add an OpenAI key.";

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
  expect(speechFix(linux)).toBe(
    "Install espeak-ng (for example sudo apt install espeak-ng), or add an OpenAI key.",
  );
  expect(speechFix("No speech program was found on this computer.")).toBeUndefined();
});

it("lists the install commands apart, and looks again when asked", async () => {
  let checked = 0;
  renderRouted(
    <SpeechInstall issue={linux} />,
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
  // The listed commands stand in for the server's sentence, never both.
  expect(screen.queryByText(/or add an OpenAI key/)).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Check again" }));
  await waitFor(() => expect(checked).toBe(1));
});

it("says the server's way out where the checklist lists no commands", async () => {
  // macOS: no commands to list, and the sentence after the first says what to do.
  renderRouted(
    <SpeechInstall issue="macOS's speech command (say) didn't answer, so the system voice can't narrate. Check that /usr/bin/say runs in Terminal, or add an OpenAI key." />,
    testDeps({ "GET /api/onboarding": jsonAnswer(view(null)) }),
  );
  await userEvent.click(await screen.findByText("Install a speech program"));
  expect(
    screen.getByText("Check that /usr/bin/say runs in Terminal, or add an OpenAI key."),
  ).not.toBeNull();
  expect(screen.queryByText(/didn't answer/)).toBeNull();
});

it("draws nothing when neither the checklist nor the sentence has more to say", async () => {
  let asked = 0;
  const { container } = renderRouted(
    <SpeechInstall issue="No speech program was found on this computer." />,
    testDeps({
      "GET /api/onboarding": (request) => {
        asked += 1;
        return jsonAnswer(view(null))(request);
      },
    }),
  );
  await waitFor(() => expect(asked).toBe(1));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(container.textContent).toBe("");
});
