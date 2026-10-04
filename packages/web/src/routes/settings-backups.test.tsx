import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { BackupSettings } from "./settings-backups.js";

afterEach(() => {
  cleanup();
});

const view = {
  config: { enabled: true, time: "03:00", timeZone: "UTC", keep: 5, folder: null },
  folder: "/data/projects/Backups",
  defaultFolder: "/data/projects/Backups",
  hostFolder: "/home/u/Slopify/Projects/Backups",
  container: true,
  running: false,
  nextRunAt: "2026-09-28T03:00:00.000Z",
  overdue: false,
  status: {
    lastAttemptAt: null,
    lastResult: null,
    lastTrigger: null,
    lastSlot: null,
    detail: null,
    lastSuccessAt: null,
    lastSuccessFile: null,
    lastSuccessBytes: null,
    lastDurationMs: null,
  },
  files: [],
};

describe("Settings → Backups save boundary", () => {
  it("marks the automatic switch as unsaved until Save, and Discard turns it back", async () => {
    const user = userEvent.setup();
    let sent: unknown;
    renderApp(
      <BackupSettings />,
      testDeps({
        "GET /api/backups": jsonAnswer(view),
        "PUT /api/backups": async (request) => {
          sent = await request.json();
          return jsonAnswer({ ...view, config: { ...view.config, keep: 7 } })(request);
        },
      }),
    );
    const auto = await screen.findByRole("switch", { name: "Back up automatically" });
    await waitFor(() => {
      expect(auto.hasAttribute("disabled")).toBe(false);
    });
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
    await user.click(auto);
    expect(screen.getByText(/Unsaved changes/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(auto.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText(/Unsaved changes/)).toBeNull();

    const keep = screen.getByLabelText("Keep last");
    await user.clear(keep);
    await user.type(keep, "7{Enter}");
    await waitFor(() => {
      expect(sent).toMatchObject({ enabled: true, keep: 7 });
    });
  });
});
