import { QueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPaletteProvider, CommandRegistry } from "@/components/kit/command-palette";
import { AppearanceSkin } from "@/components/theme";
import type { Answer } from "@/test-app";
import { jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
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
    "GET /api/settings/encoders": jsonAnswer({
      nvidia: {
        available: false,
        reason: "No NVIDIA graphics card encoder was found on this computer.",
      },
    }),
    // Backup & storage shows the daily backups first.
    "GET /api/backups": jsonAnswer({
      config: { enabled: false, time: "03:00", timeZone: "UTC", keep: 5, folder: null },
      folder: "/data/projects/Backups",
      defaultFolder: "/data/projects/Backups",
      hostFolder: null,
      container: false,
      running: false,
      nextRunAt: null,
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
    }),
    "GET /api/storage": jsonAnswer({
      data: 1024,
      projects: 512,
      staging: 128,
      trash: { projects: 0, bytes: 0 },
      byProject: [],
    }),
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

describe("the backups section", () => {
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
      lastAttemptAt: "2026-09-27T03:00:00.000Z",
      lastResult: "failed",
      lastTrigger: "scheduled",
      lastSlot: "2026-09-27T03:00:00.000Z",
      detail: "The backup was not saved: the disk holding /data/projects/Backups ran out of space.",
      lastSuccessAt: "2026-09-26T03:01:00.000Z",
      lastSuccessFile: "/data/projects/Backups/slopify-backup-2026-09-26T030100Z.tar",
      lastSuccessBytes: 2048,
      lastDurationMs: 1000,
    },
    files: [],
  };

  it("shows the last result, where backups land on the host, and refuses a bad keep count", async () => {
    const user = userEvent.setup();
    renderRouted(
      <SettingsRoute section="backups" />,
      deps({ "GET /api/backups": jsonAnswer(view) }),
    );
    expect(await screen.findByText(/ran out of space/)).not.toBeNull();
    // The last result and the next one, in the section's one line.
    expect(screen.getByText(/failed\. Next: /)).not.toBeNull();
    expect(screen.getByText(/\/home\/u\/Slopify\/Projects\/Backups/)).not.toBeNull();
    const keep = screen.getByLabelText("Keep last");
    await user.clear(keep);
    await user.type(keep, "31");
    expect(screen.getByText("Keep between 1 and 30 backups.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("the settings screen", () => {
  it("lists every page once, flat, and shows the one picked under its own name", async () => {
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
    renderRouted(<Harness />, deps());
    // The page is the title, under the Settings crumb.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Keys & services" }),
    ).not.toBeNull();
    expect(screen.getByText("Settings")).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "Voice services" })).not.toBeNull();
    expect(screen.queryByLabelText("Silence between segments")).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Settings pages" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "Keys & services",
      "Voices",
      "Models",
      "Production defaults",
      "Notifications",
      "YouTube Studio and posting",
      "Backup & storage",
      "Trash",
      "General",
      "Remote access",
      "AI agents",
      "About",
      "Usage",
      "What's new",
    ]);
    expect(
      within(nav).getByRole("button", { name: "Keys & services" }).getAttribute("aria-current"),
    ).toBe("true");
    // No second row of tabs: a row is a page.
    expect(screen.queryByRole("tablist")).toBeNull();
    // What the videos have comes first.
    expect(screen.getByRole("list", { name: "What your videos have" })).not.toBeNull();
    await user.click(within(nav).getByRole("button", { name: "Voices" }));
    expect(picked).toEqual(["voices"]);
    expect(screen.getByRole("heading", { level: 1, name: "Voices" })).not.toBeNull();
    await user.click(within(nav).getByRole("button", { name: "Production defaults" }));
    expect(await screen.findByLabelText("Silence between segments")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Voice services" })).toBeNull();
    // The sample budgets moved here from their own tab.
    expect(screen.getByRole("heading", { name: "Template samples" })).not.toBeNull();
    // Appearance is an app preference, under General with how Slopify starts.
    await user.click(within(nav).getByRole("button", { name: "General" }));
    expect(await screen.findByRole("button", { name: "System" })).not.toBeNull();
  });

  it("offers the pages as one select on a phone", async () => {
    const picked: string[] = [];
    renderRouted(
      <SettingsRoute section="trash" onSection={(next) => picked.push(next)} />,
      deps({ "GET /api/trash": jsonAnswer({ items: [] }) }),
    );
    const select = (await screen.findByLabelText("Settings page")) as HTMLSelectElement;
    expect(select.value).toBe("trash");
    await userEvent.selectOptions(select, "about");
    expect(picked).toEqual(["about"]);
  });

  it("links to the channel's page from the list when there is only one channel", async () => {
    const one = { id: "c1", name: "My channel", isDefault: true };
    function Where() {
      return <output aria-label="Where">{useRouterState().location.pathname}</output>;
    }
    renderRouted(
      <>
        <SettingsRoute section="providers" />
        <Where />
      </>,
      deps({ "GET /api/channels": jsonAnswer({ channels: [one] }) }),
    );
    const nav = await screen.findByRole("navigation", { name: "Settings pages" });
    const link = await within(nav).findByRole("link", { name: "Your channel" });
    expect(link.getAttribute("href")).toBe("/channels");
    // It sits after the publishing pages, as a link: the list's pages stay buttons.
    expect(link.previousElementSibling?.textContent).toBe("YouTube Studio and posting");
    // On a phone the page select carries it too, and picking it opens the channel.
    const select = screen.getByLabelText("Settings page") as HTMLSelectElement;
    await userEvent.selectOptions(select, "Your channel");
    await waitFor(() => expect(screen.getByLabelText("Where").textContent).toBe("/channels"));
  });

  it("leaves the channel out of the list once Channels is in the app's own rail", async () => {
    const channels = [
      { id: "c1", name: "My channel", isDefault: true },
      { id: "c2", name: "Sleep", isDefault: false },
    ];
    renderRouted(
      <SettingsRoute section="providers" />,
      deps({ "GET /api/channels": jsonAnswer({ channels }) }),
    );
    // The services are listed once the answers are in, the channels' among them.
    await screen.findByRole("heading", { name: "Voice services" });
    expect(screen.queryByRole("link", { name: "Your channel" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Your channel" })).toBeNull();
  });

  it.each([
    ["backups", "Backup & storage"],
    ["template-studio", "Production defaults"],
    ["channel-links", "YouTube Studio and posting"],
  ] as const)("opens the old page id %s where its content went", async (old, title) => {
    renderRouted(
      <SettingsRoute section={old} />,
      deps({
        "GET /api/studio/settings": jsonAnswer({
          playlists: [],
          channelPlaylists: {},
          pairing: { token: "a".repeat(64), origin: null },
        }),
      }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: title })).not.toBeNull();
  });

  it("keeps Download diagnostics on About, not in every page's header", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [section, setSection] = useState<SettingsSection>("providers");
      return <SettingsRoute section={section} onSection={setSection} />;
    }
    renderRouted(<Harness />, deps());
    await screen.findByRole("heading", { level: 1, name: "Keys & services" });
    expect(screen.queryByRole("link", { name: "Download diagnostics" })).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Settings pages" });
    await user.click(within(nav).getByRole("button", { name: "About" }));
    const link = await screen.findByRole("link", { name: "Download diagnostics" });
    expect(link.getAttribute("href")).toBe("http://slopify.test/api/diagnostics");
    expect(link.getAttribute("download")).toBe("slopify-diagnostics.json");
    expect(screen.getByText("Free. Your keys, your machine.")).not.toBeNull();
  });

  it("checks every service from under the readiness lines and lists the report there", async () => {
    const user = userEvent.setup();
    let checks = 0;
    renderRouted(
      <SettingsRoute section="providers" />,
      deps({
        "POST /api/providers/health": (request) => {
          checks += 1;
          return jsonAnswer({
            checkedAt: "2026-09-27T10:00:00.000Z",
            providers: [
              {
                id: "codex",
                displayName: "Codex CLI",
                family: "llm",
                state: "ok",
                checks: [{ label: "Signed in", state: "ok", detail: "Signed in as you." }],
              },
              {
                id: "openai-tts",
                displayName: "OpenAI",
                family: "tts",
                state: "no-key",
                checks: [
                  {
                    label: "Key",
                    state: "problem",
                    detail: "None is saved, and OpenAI is chosen for gpt-4o-mini-tts.",
                  },
                ],
              },
              {
                id: "openai-image",
                displayName: "OpenAI",
                family: "image",
                state: "unused",
                checks: [],
              },
            ],
          })(request);
        },
      }),
    );
    expect(await screen.findByText("Last checked: not yet.")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Check every service" }));
    // Only what needs something is listed with its checks, in the lists' own state words; a
    // name two kinds share says which.
    const listed = await screen.findByRole("list", { name: "Check by service" });
    expect(within(listed).getByText("OpenAI (voices)")).not.toBeNull();
    expect(within(listed).getByText("No key")).not.toBeNull();
    expect(
      within(listed).getByText("None is saved, and OpenAI is chosen for gpt-4o-mini-tts."),
    ).not.toBeNull();
    expect(screen.getByText("Ready: Codex CLI.")).not.toBeNull();
    expect(screen.queryByText("Signed in as you.")).toBeNull();
    expect(screen.getByText("Not set up and not used anywhere: OpenAI (images).")).not.toBeNull();
    expect(screen.getByText(/^Last checked at /)).not.toBeNull();
    expect(checks).toBe(1);
  });

  it("offers the way back to the welcome while the person came from it", async () => {
    renderRouted(
      <SettingsRoute section="providers" back={{ to: "welcome", step: "make" }} />,
      deps(),
    );
    const back = await screen.findByRole("link", { name: "Back to the welcome" });
    expect(back.getAttribute("href")).toBe("/welcome?step=make");
  });

  it("scrolls to the setup a welcome link opens only once the readiness lines above are drawn", async () => {
    const scrolled = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 1400,
      bottom: 1700,
    } as DOMRect);
    let answer = () => {};
    const voices = new Promise<void>((resolve) => {
      answer = resolve;
    });
    try {
      renderRouted(
        <SettingsRoute
          section="providers"
          family="image"
          provider="openai-image"
          back={{ to: "welcome", step: "make" }}
        />,
        deps({
          "GET /api/providers": jsonAnswer({
            providers: [
              {
                id: "openai-image",
                family: "image",
                displayName: "OpenAI",
                readiness: { kind: "keyed", hasKey: false },
              },
            ],
          }),
          // The readiness lines wait for the voices; they come last.
          "GET /api/settings/voices": async (request) => {
            await voices;
            return jsonAnswer({ voices: [] })(request);
          },
          // The welcome's picks never answer: the lines do not wait for them.
          "GET /api/providers/first-run": () => new Promise(() => {}),
        }),
      );
      expect(await screen.findByLabelText("OpenAI API key")).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole("list", { name: "What your videos have" })).toBeNull();
      // Measured now, the lines still to come above would push the key box back out of view.
      expect(scrolled).not.toHaveBeenCalled();
      answer();
      expect(await screen.findByRole("list", { name: "What your videos have" })).not.toBeNull();
      await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(1));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("offers the way back to Create, and nothing without a return", async () => {
    const { unmount } = renderRouted(
      <SettingsRoute section="providers" back={{ to: "play" }} />,
      deps(),
    );
    expect((await screen.findByRole("link", { name: "Back to Create" })).getAttribute("href")).toBe(
      "/play",
    );
    unmount();
    renderRouted(<SettingsRoute section="providers" />, deps());
    await screen.findByRole("heading", { level: 1, name: "Keys & services" });
    expect(screen.queryByRole("link", { name: /^Back to/ })).toBeNull();
  });

  it("holds Save while the gap is not a number a run would take", async () => {
    const user = userEvent.setup();
    renderRouted(<SettingsRoute section="playback" />, deps());

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
    renderRouted(
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

  it("offers the subtitle timing models, most accurate first, and saves the choice", async () => {
    const user = userEvent.setup();
    let sent: unknown;
    renderRouted(
      <SettingsRoute section="playback" />,
      deps({
        "PUT /api/settings": async (request) => {
          sent = await request.json();
          return jsonAnswer({ ...settings, subtitleModel: "fp16" })(request);
        },
      }),
    );

    // A settings answer from before the setting reads as its default.
    const select = (await screen.findByLabelText("Caption timing model")) as HTMLSelectElement;
    expect(select.value).toBe("fp32");
    expect([...select.options].map((option) => option.text)).toEqual([
      "Most accurate (378 MB, recommended)",
      "Balanced (189 MB)",
      "Smallest (95 MB, less accurate)",
    ]);
    expect(
      screen.getByText(
        "Bigger hears the narration more accurately and, on most computers, is also faster. It downloads once, the first time captions are timed.",
      ),
    ).not.toBeNull();

    await user.selectOptions(select, "fp16");

    await waitFor(() => expect(sent).toEqual({ ...settings, subtitleModel: "fp16" }));
    expect(select.value).toBe("fp16");
  });

  it("shows the render settings at their defaults, without NVIDIA where there is none", async () => {
    renderRouted(<SettingsRoute section="playback" />, deps());

    expect(await screen.findByRole("heading", { name: "Rendering" })).not.toBeNull();
    const encoder = (await screen.findByLabelText("Video encoder")) as HTMLSelectElement;
    expect(encoder.value).toBe("cpu");
    expect([...encoder.options].map((option) => option.text)).toEqual(["Processor (x264)"]);
    expect(
      await screen.findByText(
        "No NVIDIA graphics card encoder was found on this computer. Videos are encoded on the processor.",
      ),
    ).not.toBeNull();
    // Nothing the test printed, so nothing to fold.
    expect(screen.queryByText("Details")).toBeNull();
    const clips = screen.getByLabelText("Clip encoding") as HTMLSelectElement;
    expect(clips.value).toBe("thorough");
    expect([...clips.options].map((option) => option.text)).toEqual(["Thorough", "Fast"]);
    const priority = screen.getByLabelText("Render priority") as HTMLSelectElement;
    expect(priority.value).toBe("background");
    expect([...priority.options].map((option) => option.text)).toEqual([
      "Normal",
      "Background (your other programs come first)",
    ]);
  });

  it("says in plain words why the card is not used, with the test's output folded", async () => {
    const user = userEvent.setup();
    renderRouted(
      <SettingsRoute section="playback" />,
      deps({
        "GET /api/settings/encoders": jsonAnswer({
          nvidia: {
            available: false,
            reason:
              "This computer's NVIDIA graphics card encoder did not pass its test, so it is not used.",
            detail:
              "the ffmpeg at ffmpeg lists NVENC but its test encode failed: Operation not permitted",
          },
        }),
      }),
    );
    expect(
      await screen.findByText(
        "This computer's NVIDIA graphics card encoder did not pass its test, so it is not used. Videos are encoded on the processor.",
      ),
    ).not.toBeNull();
    const details = screen.getByText("Details").closest("details");
    expect(details?.open).toBe(false);
    await user.click(screen.getByText("Details"));
    expect(details?.open).toBe(true);
    expect(within(details as HTMLElement).getByText(/Operation not permitted/)).not.toBeNull();
  });

  it("offers the NVIDIA card where its encoder works, and saves each render choice", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    renderRouted(
      <SettingsRoute section="playback" />,
      deps({
        "GET /api/settings/encoders": jsonAnswer({ nvidia: { available: true } }),
        "PUT /api/settings": async (request) => {
          const body: unknown = await request.json();
          sent.push(body);
          return jsonAnswer(body)(request);
        },
      }),
    );

    const encoder = (await screen.findByLabelText("Video encoder")) as HTMLSelectElement;
    await waitFor(() =>
      expect([...encoder.options].map((option) => option.text)).toEqual([
        "Processor (x264)",
        "NVIDIA graphics card (NVENC)",
      ]),
    );
    await user.selectOptions(encoder, "nvidia");
    await waitFor(() => expect(sent.at(-1)).toEqual({ ...settings, videoEncoder: "nvidia" }));
    await user.selectOptions(screen.getByLabelText("Clip encoding"), "fast");
    await waitFor(() => expect(sent.at(-1)).toMatchObject({ clipEncodeSpeed: "fast" }));
    await user.selectOptions(screen.getByLabelText("Render priority"), "normal");
    await waitFor(() => expect(sent.at(-1)).toMatchObject({ renderPriority: "normal" }));
  });

  it("names the problem when the settings cannot be read", async () => {
    renderRouted(
      <SettingsRoute section="playback" />,
      deps({ "GET /api/settings": problemAnswer("The database is locked.", 500) }),
    );
    expect(await screen.findByText(/The database is locked\./)).not.toBeNull();
  });

  it("shows disk usage while keeping backups and cleanup beside it", async () => {
    renderRouted(
      <SettingsRoute section="storage" />,
      deps({
        "GET /api/storage": jsonAnswer({
          data: 1024 * 1024,
          projects: 512 * 1024,
          staging: 128,
          trash: { projects: 2, bytes: 256 * 1024 },
          byProject: [{ id: "p1", title: "A finished run", bytes: 42 }],
        }),
      }),
    );
    expect(await screen.findByText(/1 MB stored/)).not.toBeNull();
    // Trashed projects' folders are shown apart from the live project files.
    expect(
      screen.getByText(
        /256 KB project files · 128 B staged files · 256 KB in the trash \(2 deleted projects\), freed when removed for good/,
      ),
    ).not.toBeNull();
    expect(screen.getByText("A finished run")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Clear leftover files" })).not.toBeNull();
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
    renderRouted(
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
    renderRouted(
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
    drafts: { added: 2, renamed: 0, skipped: 0 },
    channelVideos: { added: 5, renamed: 0, skipped: 0 },
    designs: { added: 3, renamed: 0, skipped: 1 },
    designTemplates: { added: 0, renamed: 0, skipped: 0 },
    settings: { added: 1, kept: 1 },
    fonts: 0,
    usage: { events: 12, alreadyImported: false },
    files: { count: 4, bytes: 3 * 1024 * 1024 },
  };

  it("says keys are never included, with the page they go back on", async () => {
    renderRouted(<SettingsRoute section="storage" />, deps());
    expect(await screen.findByText(/Keys are never in a backup/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Keys & services" }).getAttribute("href")).toBe(
      "/settings?section=providers",
    );
  });

  it("names the projects it waits for instead of downloading an error", async () => {
    const user = userEvent.setup();
    const busy =
      'Slopify can\'t export while projects are being made ("Rope"): their files are still being written. Wait for them to finish, or pause them on their project page, then press Export everything again.';
    renderRouted(
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
      renderRouted(
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
    renderRouted(
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
      "1 schedule(s) arrived paused so two installs never run them both; resume them in Calendar → Schedules.",
    );
    expect(lines).toContain("Usage: 12 recorded event(s) added to the totals.");
    expect(lines).toContain("Designs: 3 added, 1 already here.");
    // Each kind by the name its own screen gives it.
    expect(lines).toContain("Titles to avoid: 5 added.");
    expect(lines).toContain("Saved drafts: 2 added.");
    expect(lines.some((line) => line?.startsWith("Poster templates"))).toBe(false);
    expect(lines).toContain("Skipped “Old run”: It is already in this install.");
  });

  it("shows the server's reason when a backup is refused", async () => {
    const user = userEvent.setup();
    const newer =
      "This backup was made by a newer Slopify (9.0.0). Update Slopify first (npx @gentbajko/slopify@latest, or pull the latest Docker image), then import it again.";
    renderRouted(
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
    renderRouted(
      <>
        <AppearanceSkin />
        <SettingsRoute section="general" />
      </>,
      deps(),
    );
    expect(
      (await screen.findByRole("button", { name: "System" })).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  // Toggling the theme is immediate. The page repaints from the
  // cache the moment the switch moves, not when the server answers.
  it("paints the new theme before the save has answered", async () => {
    const user = userEvent.setup();
    renderRouted(
      <>
        <AppearanceSkin />
        <SettingsRoute section="general" />
      </>,
      deps({ "PUT /api/settings": () => new Promise<Response>(() => {}) }),
    );

    await user.click(await screen.findByRole("button", { name: "Light" }));
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  it("persists the override and keeps it after the answer", async () => {
    const user = userEvent.setup();
    let sent: unknown;
    renderRouted(
      <>
        <AppearanceSkin />
        <SettingsRoute section="general" />
      </>,
      deps({
        "PUT /api/settings": async (request) => {
          sent = await request.json();
          return jsonAnswer({ silenceGapSeconds: 3, appearance: "dark" })(request);
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Dark" }));
    await waitFor(() => {
      expect(sent).toEqual({ silenceGapSeconds: 3, appearance: "dark" });
    });
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  it("hands the theme back when the save is refused", async () => {
    const user = userEvent.setup();
    renderRouted(
      <>
        <AppearanceSkin />
        <SettingsRoute section="general" />
      </>,
      deps({ "PUT /api/settings": problemAnswer("The database is locked.", 500) }),
    );

    await user.click(await screen.findByRole("button", { name: "Light" }));
    expect(await screen.findByText(/The database is locked\./)).not.toBeNull();
    await waitFor(() => {
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });
  });
});

describe("the settings commands", () => {
  it("offers Check every service, Back up now and Download diagnostics under Settings", async () => {
    const registry = new CommandRegistry();
    const picked: string[] = [];
    let checks = 0;
    let backups = 0;
    renderRouted(
      <CommandPaletteProvider registry={registry}>
        <SettingsRoute section="about" onSection={(next) => picked.push(next)} />
      </CommandPaletteProvider>,
      deps({
        "POST /api/providers/health": (request) => {
          checks += 1;
          return jsonAnswer({ checkedAt: "2026-09-27T10:00:00.000Z", providers: [] })(request);
        },
        "POST /api/backups/run": (request) => {
          backups += 1;
          return jsonAnswer({})(request);
        },
      }),
    );
    // Besides the palette's own Show keyboard shortcuts.
    const own = () => registry.list().filter((command) => command.id !== "help.shortcuts");
    await waitFor(() => {
      expect(own().map((command) => command.title)).toEqual([
        "Check every service",
        "Back up now",
        "Download diagnostics",
      ]);
    });
    expect(new Set(own().map((command) => command.group))).toEqual(new Set(["Settings"]));
    const run = (title: string) =>
      registry
        .list()
        .find((command) => command.title === title)
        ?.run();

    await run("Check every service");
    await waitFor(() => expect(checks).toBe(1));
    await run("Back up now");
    await waitFor(() => expect(backups).toBe(1));
    expect(picked).toEqual(["providers", "storage"]);

    const clicked: string[] = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(`${this.href} ${this.download}`);
    };
    try {
      await run("Download diagnostics");
    } finally {
      HTMLAnchorElement.prototype.click = click;
    }
    expect(clicked).toEqual(["http://slopify.test/api/diagnostics slopify-diagnostics.json"]);
  });

  it("adds Export everything while Backup & storage is showing", async () => {
    const registry = new CommandRegistry();
    renderRouted(
      <CommandPaletteProvider registry={registry}>
        <SettingsRoute section="storage" />
      </CommandPaletteProvider>,
      deps(),
    );
    await waitFor(() => {
      expect(registry.list().map((command) => command.title)).toContain("Export everything");
    });
  });
});
