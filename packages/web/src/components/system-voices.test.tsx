import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { SystemVoicePicker } from "./system-voices.js";

afterEach(cleanup);

describe("the system voice's picker with no speech program", () => {
  it("says none was found, lists the install commands apart and points at Check again", async () => {
    renderRouted(
      <SystemVoicePicker value="" onPick={() => {}} />,
      testDeps({
        "GET /api/providers/system-voice/voices": jsonAnswer({
          engines: [],
          issue:
            "No speech program was found on this computer, so the system voice can't narrate. Install espeak-ng (for example sudo apt install espeak-ng).",
          install: {
            text: "Install espeak-ng with one of these:",
            commands: ["sudo apt install espeak-ng", "sudo pacman -S espeak-ng"],
          },
        }),
      }),
    );
    expect(
      await screen.findByText("No speech program was found on this computer, so it can't narrate."),
    ).not.toBeNull();
    expect(screen.getByText("Install espeak-ng with one of these:")).not.toBeNull();
    expect(screen.queryByText(/for example sudo apt/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Check again on Keys & services" }).getAttribute("href"),
    ).toBe("/settings?section=providers&provider=system-voice");
  });

  it("keeps the server's own sentence where the computer brings its own speech", async () => {
    renderRouted(
      <SystemVoicePicker value="" onPick={() => {}} />,
      testDeps({
        "GET /api/providers/system-voice/voices": jsonAnswer({
          engines: [],
          issue: "macOS's speech command (say) didn't answer, so the system voice can't narrate.",
          install: null,
        }),
      }),
    );
    expect(await screen.findByText(/macOS's speech command \(say\) didn't answer/)).not.toBeNull();
  });
});
