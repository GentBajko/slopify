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
    await user.upload(await screen.findByLabelText("Import backup"), file);

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

    await user.upload(await screen.findByLabelText("Import backup"), file);

    expect(
      await screen.findByText(
        "This file is empty or larger than 100 MB. Choose a .zip made with Export backup.",
      ),
    ).not.toBeNull();
    expect(requests).toBe(0);
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
