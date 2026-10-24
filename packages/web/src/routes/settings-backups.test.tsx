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

describe("Settings → Backup & storage → Daily backup", () => {
  it("saves the automatic switch at once, like every other switch, keeping a typed draft", async () => {
    const user = userEvent.setup();
    const sent: { enabled: boolean; keep: number }[] = [];
    let current = view;
    renderApp(
      <BackupSettings />,
      testDeps({
        "GET /api/backups": (request) => jsonAnswer(current)(request),
        "PUT /api/backups": async (request) => {
          const body = (await request.json()) as { enabled: boolean; keep: number };
          sent.push(body);
          current = { ...view, config: { ...view.config, enabled: body.enabled, keep: body.keep } };
          return jsonAnswer(current)(request);
        },
      }),
    );
    const auto = await screen.findByRole("switch", { name: "Back up automatically" });
    await waitFor(() => {
      expect(auto.hasAttribute("disabled")).toBe(false);
    });
    // A number typed and not saved yet stays a draft while the switch saves on its own.
    const keep = screen.getByLabelText("Keep last");
    await user.clear(keep);
    await user.type(keep, "7");
    expect(screen.getByText(/Unsaved changes/)).not.toBeNull();

    await user.click(auto);
    await waitFor(() => {
      expect(sent).toEqual([expect.objectContaining({ enabled: false, keep: 5 })]);
    });
    // Off: when, how many and where are not asked.
    await waitFor(() => {
      expect(screen.queryByLabelText("Keep last")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    await user.click(auto);
    await waitFor(() => {
      expect(sent.at(-1)).toMatchObject({ enabled: true, keep: 5 });
    });
    const again = await screen.findByLabelText("Keep last");
    expect((again as HTMLInputElement).value).toBe("7");
    await user.type(again, "{Enter}");
    await waitFor(() => {
      expect(sent.at(-1)).toMatchObject({ enabled: true, keep: 7 });
    });
  });
});
