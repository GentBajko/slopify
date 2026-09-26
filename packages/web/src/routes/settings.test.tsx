import { QueryClient } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceSkin } from "@/components/theme";
import type { Answer } from "@/test-app";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import {
  gapProblem,
  portableImportQueryKeys,
  portableMaxUploadBytes,
  refreshPortableImportQueries,
  SettingsRoute,
  type SettingsSection,
} from "./settings.js";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

const settings = { silenceGapSeconds: 3, appearance: "system" as const };

function deps(extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/providers": jsonAnswer({ providers: [] }),
    "GET /api/settings/voices": jsonAnswer({ voices: [] }),
    "GET /api/settings": jsonAnswer(settings),
    "GET /api/storage": jsonAnswer({ data: 1024, projects: 512, staging: 128, byProject: [] }),
    ...extra,
  });
}

describe("the silence gap field", () => {
  it("takes a whole number of seconds inside the bound a run allows", () => {
    expect(gapProblem("0")).toBeUndefined();
    expect(gapProblem("3")).toBeUndefined();
    expect(gapProblem("30")).toBeUndefined();
  });

  it("refuses empty, negative, fractional and out of range values with one sentence", () => {
    const named = "The silence gap is a whole number of seconds between 0 and 30.";
    expect(gapProblem("")).toBe(named);
    expect(gapProblem("   ")).toBe(named);
    expect(gapProblem("-1")).toBe(named);
    expect(gapProblem("1.5")).toBe(named);
    expect(gapProblem("31")).toBe(named);
    expect(gapProblem("three")).toBe(named);
  });
});

describe("the settings screen", () => {
  it("shows one section at a time, picked from the section list", async () => {
    const user = userEvent.setup();
    const picked: string[] = [];
    function Harness() {
      const [section, setSection] = useState<SettingsSection>("providers");
      return (
        <SettingsRoute
          section={section}
          onSection={(next) => {
            picked.push(next);
            setSection(next);
          }}
        />
      );
    }
    renderApp(<Harness />, deps());
    expect(await screen.findByRole("heading", { name: "Settings" })).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "Text" })).not.toBeNull();
    expect(screen.queryByLabelText("Silence between segments")).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "Providers",
      "Voices",
      "Models",
      "Playback & appearance",
      "Backup & storage",
      "Usage",
    ]);
    expect(
      within(nav).getByRole("button", { name: "Providers" }).getAttribute("aria-current"),
    ).toBe("page");
    await user.click(within(nav).getByRole("button", { name: "Voices" }));
    expect(picked).toEqual(["voices"]);
    await user.click(within(nav).getByRole("button", { name: "Playback & appearance" }));
    expect(await screen.findByLabelText("Silence between segments")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Text" })).toBeNull();
  });

  it("holds Save while the gap is not a number a run would take", async () => {
    const user = userEvent.setup();
    renderApp(<SettingsRoute section="playback" />, deps());

    const field = await screen.findByLabelText("Silence between segments");
    await user.clear(field);
    expect(
      screen.getByText("The silence gap is a whole number of seconds between 0 and 30."),
    ).not.toBeNull();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  });

  it("saves the gap and confirms it inline", async () => {
    const user = userEvent.setup();
    let sent: unknown;
    renderApp(
      <SettingsRoute section="playback" />,
      deps({
        "PUT /api/settings": async (request) => {
          sent = await request.json();
          return jsonAnswer({ silenceGapSeconds: 5, appearance: "system" })(request);
        },
      }),
    );

    const field = await screen.findByLabelText("Silence between segments");
    await user.clear(field);
    await user.type(field, "5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).not.toBeNull();
    expect(sent).toEqual({ silenceGapSeconds: 5, appearance: "system" });
  });

  it("names the problem when the settings cannot be read", async () => {
    renderApp(
      <SettingsRoute section="playback" />,
      deps({ "GET /api/settings": problemAnswer("The database is locked.", 500) }),
    );
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
  });

  it("shows disk usage while keeping backups and cleanup beside it", async () => {
    renderApp(
      <SettingsRoute section="storage" />,
      deps({
        "GET /api/storage": jsonAnswer({
          data: 1024 * 1024,
          projects: 512 * 1024,
          staging: 128,
          byProject: [{ id: "p1", title: "A finished run", bytes: 42 }],
        }),
      }),
    );
    expect(await screen.findByText(/1 MB stored/)).not.toBeNull();
    expect(screen.getByText("A finished run")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Clean orphan files" })).not.toBeNull();
  });

  it("refreshes every resource a portable backup can restore", async () => {
    const client = new QueryClient();
    const concreteKeys = portableImportQueryKeys.map((queryKey) =>
      queryKey[0] === "provider-models" ? (["provider-models", "codex"] as const) : queryKey,
    );
    for (const [index, queryKey] of concreteKeys.entries()) {
      client.setQueryData(queryKey, { before: index });
      expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);
    }

    await refreshPortableImportQueries(client);

    for (const queryKey of concreteKeys) {
      expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
    }
  });

  it("sends an accepted backup as a file without buffering it in the page", async () => {
    const user = userEvent.setup();
    let received = "";
    renderApp(
      <SettingsRoute section="storage" />,
      deps({
        "PUT /api/storage/import": async (request) => {
          received = await request.text();
          return jsonAnswer({ templates: 0, fonts: 0, stagedFiles: 0 })(request);
        },
      }),
    );

    const file = new File(["portable zip"], "slopify.zip", { type: "application/zip" });
    await user.upload(await screen.findByLabelText("Import a backup"), file);

    expect(await screen.findByText(/Imported 0 template/)).not.toBeNull();
    expect(received).toBe("portable zip");
  });

  it("rejects an oversized backup before sending or reading it", async () => {
    const user = userEvent.setup();
    let requests = 0;
    renderApp(
      <SettingsRoute section="storage" />,
      deps({
        "PUT /api/storage/import": (request) => {
          requests += 1;
          return jsonAnswer({ templates: 0, fonts: 0, stagedFiles: 0 })(request);
        },
      }),
    );
    const file = new File(["zip"], "too-large.zip", { type: "application/zip" });
    Object.defineProperty(file, "size", { value: portableMaxUploadBytes + 1 });

    await user.upload(await screen.findByLabelText("Import a backup"), file);

    expect(
      await screen.findByText(
        "This file is empty or larger than 100 MB. Choose a .zip made with Export backup, or a .tar made with Export everything.",
      ),
    ).not.toBeNull();
    expect(requests).toBe(0);
  });
});

describe("export everything and import a backup", () => {
  const summary = {
    backup: { id: "b1", createdAt: "2026-09-20T10:00:00.000Z", appVersion: "2.3.0" },
    projects: {
      imported: [{ id: "p2", title: "New run" }],
      skipped: [{ id: "p1", title: "Old run", reason: "It is already in this install." }],
    },
    prompts: { added: 2, renamed: 1, skipped: 0 },
    entries: { added: 0, renamed: 0, skipped: 0 },
    documentThemes: { added: 1, renamed: 0, skipped: 0 },
    templates: { added: 1, renamed: 0, skipped: 0 },
    schedules: { added: 1, renamed: 0, skipped: 0, paused: 1 },
    voices: { added: 0, renamed: 0, skipped: 0 },
    drafts: { added: 0, renamed: 0, skipped: 0 },
    settings: { added: 1, kept: 1 },
    fonts: 0,
    usage: { events: 12, alreadyImported: false },
    files: { count: 4, bytes: 3 * 1024 * 1024 },
  };

  it("says keys are never included", async () => {
    renderApp(<SettingsRoute section="storage" />, deps());
    expect(await screen.findByText(/Provider keys are never included in a backup/)).not.toBeNull();
  });

  it("names the projects it waits for instead of downloading an error", async () => {
    const user = userEvent.setup();
    const busy =
      'Slopify can\'t export while projects are being made ("Rope"): their files are still being written. Wait for them to finish, or pause them on their project page, then press Export everything again.';
    renderApp(
      <SettingsRoute section="storage" />,
      deps({
        "GET /api/storage/export/summary": jsonAnswer({ ready: false, detail: busy, busy: [] }),
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Export everything" }));
    expect((await screen.findByRole("alert")).textContent).toBe(busy);
    expect(screen.queryByText(/Downloading/)).toBeNull();
  });

  it("shows the size of the download it starts", async () => {
    const user = userEvent.setup();
    const clicked: string[] = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(this.href);
    };
    try {
      renderApp(
        <SettingsRoute section="storage" />,
        deps({
          "GET /api/storage/export/summary": jsonAnswer({
            ready: true,
            projects: 2,
            files: 9,
            bytes: 5 * 1024 ** 3,
          }),
        }),
      );
      await user.click(await screen.findByRole("button", { name: "Export everything" }));
      expect(await screen.findByText(/Downloading 5 GB \(2 projects\)/)).not.toBeNull();
      expect(clicked).toEqual(["http://slopify.test/api/storage/export"]);
    } finally {
      HTMLAnchorElement.prototype.click = click;
    }
  });

  it("sends a full backup as a tar and lists what came in and what was skipped", async () => {
    const user = userEvent.setup();
    let type = "";
    renderApp(
      <SettingsRoute section="storage" />,
      deps({
        "PUT /api/storage/import": (request) => {
          type = request.headers.get("content-type") ?? "";
          return jsonAnswer(summary)(request);
        },
      }),
    );
    const file = new File(["tar"], "slopify-backup-2026-09-20.tar");
    await user.upload(await screen.findByLabelText("Import a backup"), file);

    const list = await screen.findByRole("list", { name: "Import result" });
    expect(type).toBe("application/x-tar");
    const lines = within(list)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(lines).toContain("Projects: 1 added (3 MB of files).");
    expect(lines).toContain(
      "Prompts: 2 added, 1 added as “(imported)” because the name was taken.",
    );
    expect(lines).toContain(
      "1 schedule(s) arrived paused so two installs never run them both; resume them on the Schedules screen.",
    );
    expect(lines).toContain("Usage: 12 recorded event(s) added to the totals.");
    expect(lines).toContain("Skipped “Old run”: It is already in this install.");
  });

  it("shows the server's reason when a backup is refused", async () => {
    const user = userEvent.setup();
    const newer =
      "This backup was made by a newer Slopify (9.0.0). Update Slopify first (npx @gentbajko/slopify@latest, or pull the latest Docker image), then import it again.";
    renderApp(
      <SettingsRoute section="storage" />,
      deps({ "PUT /api/storage/import": problemAnswer(newer, 422) }),
    );
    await user.upload(
      await screen.findByLabelText("Import a backup"),
      new File(["tar"], "backup.tar"),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(newer);
  });
});

describe("the appearance switch", () => {
  it("leaves the theme to prefers-color-scheme until one is picked", async () => {
    renderApp(
      <>
        <AppearanceSkin />
        <SettingsRoute section="playback" />
      </>,
      deps(),
    );
    expect(await screen.findByRole("radio", { name: "System" })).not.toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  // Toggling the theme is immediate. The page repaints from the
  // cache the moment the switch moves, not when the server answers.
  it("paints the new theme before the save has answered", async () => {
    const user = userEvent.setup();
    renderApp(
      <>
        <AppearanceSkin />
        <SettingsRoute section="playback" />
      </>,
      deps({ "PUT /api/settings": () => new Promise<Response>(() => {}) }),
    );

    await user.click(await screen.findByRole("radio", { name: "Light" }));
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  it("persists the override and keeps it after the answer", async () => {
    const user = userEvent.setup();
    let sent: unknown;
    renderApp(
      <>
        <AppearanceSkin />
        <SettingsRoute section="playback" />
      </>,
      deps({
        "PUT /api/settings": async (request) => {
          sent = await request.json();
          return jsonAnswer({ silenceGapSeconds: 3, appearance: "dark" })(request);
        },
      }),
    );

    await user.click(await screen.findByRole("radio", { name: "Dark" }));
    await waitFor(() => {
      expect(sent).toEqual({ silenceGapSeconds: 3, appearance: "dark" });
    });
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  it("hands the theme back when the save is refused", async () => {
    const user = userEvent.setup();
    renderApp(
      <>
        <AppearanceSkin />
        <SettingsRoute section="playback" />
      </>,
      deps({ "PUT /api/settings": problemAnswer("The database is locked.", 500) }),
    );

    await user.click(await screen.findByRole("radio", { name: "Light" }));
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
    await waitFor(() => {
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });
  });
});
