import type { FirstRunView } from "@app/slices/onboarding/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import type { Usage } from "@app/slices/telemetry/usage.js";
import type { TrashItem } from "@app/slices/trash/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { AutostartView } from "@/autostart/api";
import { selfExplanatory, unexplainedControls } from "@/help/coverage";
import { HomeRoute } from "@/routes/home";
import { body, stage } from "@/routes/project-fixtures";
import { SettingsRoute, type SettingsSection, settingsSections } from "@/routes/settings";
import { WelcomeRoute } from "@/routes/welcome";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";

afterEach(cleanup);

// Every labelled control on Settings, Home and the first-run screen has an info button beside
// it. Nothing on these screens is allowed without one.
const areaAllow: readonly (string | RegExp)[] = [];

function expectExplained(): void {
  expect(unexplainedControls(document.body, [...selfExplanatory, ...areaAllow])).toEqual([]);
}

const providers: readonly ProviderStatus[] = [
  {
    id: "openrouter",
    family: "llm",
    displayName: "OpenRouter",
    readiness: { kind: "keyed", hasKey: true },
  },
  {
    id: "codex",
    family: "llm",
    displayName: "Codex CLI",
    readiness: { kind: "cli", installed: true },
    cliPath: { configured: null, command: "codex" },
  },
  {
    id: "claude-code",
    family: "llm",
    displayName: "Claude Code CLI",
    readiness: { kind: "cli", installed: true },
    cliPath: { configured: null, command: "/host/bin/claude", managedOnHost: true },
  },
  {
    id: "elevenlabs",
    family: "tts",
    displayName: "ElevenLabs",
    readiness: { kind: "keyed", hasKey: false },
  },
  {
    id: "fal",
    family: "image",
    displayName: "fal.ai",
    readiness: { kind: "keyed", hasKey: false },
  },
];

const autostart: AutostartView = {
  kind: "native",
  available: true,
  enabled: false,
  summary: "Slopify starts only when you start it.",
  where: "/home/ann/.config/autostart/slopify.desktop",
  howTo: null,
  checkedAt: null,
  offer: true,
};

const backups = {
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

const trashed: TrashItem = {
  kind: "project",
  id: "p1",
  name: "Cleopatra",
  detail: null,
  deletedAt: "2026-09-27T10:00:00.000Z",
  purgeAt: "2026-10-27T10:00:00.000Z",
  daysLeft: 30,
};

const usage: Usage = {
  machineId: "7f3c2a19-4b0e-4d61-9c7a-2e58d0f19a1e",
  appVersion: "0.4.2",
  counters: { videosMade: 0, audioSeconds: 0, imagesMade: 0, tokensUsed: 0, projects: 0 },
  byStage: [],
};

function settingsDeps(extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/providers": jsonAnswer({ providers }),
    "GET /api/settings/voices": jsonAnswer({ voices: [] }),
    "GET /api/settings": jsonAnswer({ silenceGapSeconds: 3, appearance: "system" }),
    "GET /api/settings/autostart": jsonAnswer(autostart),
    "GET /api/settings/notifications": jsonAnswer({ url: "https://ntfy.sh/slopify-runs" }),
    "GET /api/settings/channel-links": jsonAnswer({
      links: [{ name: "Patreon", url: "https://patreon.com/slopify" }],
    }),
    "GET /api/studio/settings": jsonAnswer({
      playlists: [{ name: "Lore", byDefault: true }],
      channelPlaylists: {},
      pairing: { token: "a".repeat(64), origin: null },
    }),
    "GET /api/providers/catalogue": jsonAnswer({
      path: "/data/catalogue.json",
      updatedAt: "2026-09-01",
      warning: null,
    }),
    "GET /api/providers/catalogue/retired": jsonAnswer({ usages: [] }),
    "GET /api/storage": jsonAnswer({
      data: 1024,
      projects: 512,
      staging: 128,
      trash: { projects: 0, bytes: 0 },
      byProject: [
        {
          id: "p2",
          title: "Hypatia",
          bytes: 512,
          outputsBytes: 256,
          workingBytes: 256,
          removableBytes: 256,
          removableFiles: 3,
          finished: true,
        },
      ],
    }),
    "GET /api/onboarding/sample": jsonAnswer({
      projectId: "sample-1",
      samples: { library: "sample-1", audiobook: null, podcast: null },
    }),
    "GET /api/storage/files": jsonAnswer({
      docker: false,
      folder: "/home/you/.slopify/projects",
      projects: "/home/you/.slopify/projects",
      backups: "/home/you/.slopify/projects/Backups",
      exports: null,
      inDataDir: true,
      documentsRoot: "/home/you/Documents/Slopify",
      inDocuments: false,
      move: null,
      dockerCommand: null,
    }),
    "GET /api/backups": jsonAnswer(backups),
    "GET /api/trash": jsonAnswer({ items: [trashed] }),
    "GET /api/usage": jsonAnswer(usage),
    "GET /api/patch-notes": jsonAnswer({
      version: "3.0.0",
      current: "3.0.0",
      due: null,
      notes: [{ id: "3.0.0", title: "Slopify 3.0.0", version: "3.0.0", date: "2026-09-27" }],
    }),
    "GET /api/patch-notes/3.0.0": () =>
      new Response("# Slopify 3.0.0\n\n## Highlights\n\n- Faster videos.\n", {
        headers: { "content-type": "text/markdown" },
      }),
    ...extra,
  });
}

// What each section shows once its data is in, so the walk checks the loaded screen.
const loaded: Readonly<Record<SettingsSection, () => Promise<unknown>>> = {
  general: () => screen.findByRole("switch", { name: /log in/ }),
  providers: () => screen.findByLabelText("ElevenLabs API key"),
  voices: () => screen.findByRole("heading", { level: 1, name: "Voices" }),
  models: () => screen.findByText("/data/catalogue.json"),
  playback: () => screen.findByLabelText("Silence between segments"),
  notifications: () => screen.findByDisplayValue("https://ntfy.sh/slopify-runs"),
  "channel-links": () => screen.findByRole("link", { name: "Open the default channel's links" }),
  studio: () => screen.findByDisplayValue("Lore"),
  storage: () => screen.findByText("Hypatia"),
  backups: () => screen.findByLabelText("Keep last"),
  trash: () => screen.findByText("Cleopatra"),
  usage: () => screen.findByRole("heading", { level: 1, name: "Usage" }),
  "patch-notes": () => screen.findByRole("heading", { name: "Highlights" }),
  about: () => screen.findByRole("list", { name: "Links" }),
};

describe("Settings", () => {
  it.each(settingsSections.map((section) => section.id))(
    "explains every control in %s",
    async (section) => {
      renderRouted(<SettingsRoute section={section} />, settingsDeps());
      await loaded[section]();
      await waitFor(expectExplained);
    },
  );

  it("explains every provider's setup: a saved key, a missing key, a CLI and a host CLI", async () => {
    const user = userEvent.setup();
    renderRouted(<SettingsRoute section="providers" />, settingsDeps());
    const text = await screen.findByRole("list", { name: "Text providers" });
    expectExplained();

    await user.click(within(text).getByRole("button", { name: "OpenRouter" }));
    expect(screen.getByLabelText("OpenRouter API key")).not.toBeNull();
    expect(screen.getByRole("button", { name: "About OpenRouter" })).not.toBeNull();
    expectExplained();

    await user.click(within(text).getByRole("button", { name: "Codex CLI" }));
    await user.click(screen.getByRole("button", { name: "Change path" }));
    expect(screen.getByRole("textbox", { name: "Codex CLI Executable path" })).not.toBeNull();
    expectExplained();

    await user.click(within(text).getByRole("button", { name: "Claude Code CLI" }));
    expect(screen.getByRole("button", { name: "About Managed on host" })).not.toBeNull();
    expectExplained();
  });
});

const channel = "00000000-0000-4000-8000-000000000001";

describe("Home", () => {
  it("explains the channel picker and every widget", async () => {
    const running = body({ status: "running", stages: [stage("images", "running")], outputs: [] });
    renderRouted(
      <HomeRoute />,
      testDeps({
        "GET /api/projects": jsonAnswer({
          projects: [
            { ...running.project, id: "p-run", channelId: channel, uploadedAt: null },
            {
              ...running.project,
              id: "p-done",
              title: "Ashurbanipal",
              status: "done",
              channelId: channel,
              uploadedAt: null,
            },
          ],
        }),
        "GET /api/projects/p-run": jsonAnswer({
          ...running,
          project: { ...running.project, id: "p-run" },
        }),
        "GET /api/schedules": jsonAnswer({ schedules: [] }),
        "GET /api/calendar": jsonAnswer({ from: "x", to: "y", runs: [], projects: [], queued: [] }),
        "GET /api/project-templates": jsonAnswer({ templates: [] }),
        "GET /api/home/week": jsonAnswer({
          since: "x",
          videos: 3,
          calls: 40,
          cost: 9.4,
          unpriced: 0,
          apiEquivalent: 31,
          plans: [],
        }),
        "GET /api/onboarding": jsonAnswer({
          show: false,
          sampleProjectId: null,
          samples: { library: null, audiobook: null, podcast: null },
          clis: [],
          packs: [],
        }),
      }),
    );
    await screen.findByRole("region", { name: "Needs you" });
    expect(screen.getByLabelText("Channel")).not.toBeNull();
    // Coming up shows once there are schedules; there are none here.
    for (const name of ["Needs you", "Running now", "This week"])
      expect(screen.getByRole("button", { name: `About ${name}` })).not.toBeNull();
    expectExplained();
  });
});

const firstRun: FirstRunView = {
  show: true,
  settle: false,
  voice: { keyed: null, system: { available: true, engine: "eSpeak NG", issue: null } },
  sampleProjectId: "sample-1",
  samples: { library: "sample-1", audiobook: null, podcast: null },
  clis: [
    {
      id: "codex",
      name: "Codex CLI",
      installed: true,
      ready: true,
      version: "0.160.0",
      issue: null,
      draws: true,
    },
  ],
  packs: [
    {
      id: "history",
      name: "History",
      summary: "Narrative history.",
      installed: false,
      templateId: null,
    },
  ],
};

describe("Your files", () => {
  it("explains where your files are and the folder to move them to", async () => {
    const user = userEvent.setup();
    renderRouted(<SettingsRoute section="storage" />, settingsDeps());
    await user.click(await screen.findByRole("button", { name: "Choose another folder" }));
    expect(screen.getByLabelText("New folder")).not.toBeNull();
    expect(screen.getByRole("button", { name: "About Your files" })).not.toBeNull();
    expectExplained();
  });
});

describe("Welcome", () => {
  it("explains the short's topic and style, the packs and starting at login", async () => {
    renderRouted(
      <WelcomeRoute />,
      testDeps({
        "GET /api/onboarding": jsonAnswer(firstRun),
        "GET /api/settings/autostart": jsonAnswer(autostart),
      }),
    );
    // Every step's panel is in the page, the ones not picked hidden.
    await screen.findByRole("button", { name: "Use History", hidden: true });
    await screen.findByRole("button", { name: "Start when I log in", hidden: true });
    expect(screen.getByLabelText("Topic")).not.toBeNull();
    expectExplained();
  });
});
