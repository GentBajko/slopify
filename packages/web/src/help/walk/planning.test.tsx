import type { CastMember, Channel, ChannelSummary } from "@app/slices/channels/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChannelPicker, CurrentChannelProvider } from "@/channels/current";
import { selfExplanatory, unexplainedControls } from "@/help/coverage";
import { freshDraftDocument } from "@/play/draft-state";
import { CalendarRoute } from "@/routes/calendar";
import { ChannelRoute, type ChannelTab } from "@/routes/channel";
import { ChannelsRoute } from "@/routes/channels";
import { SchedulesRoute } from "@/routes/schedules";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { ChannelLinksSettings } from "@/youtube/channel-links";

afterEach(cleanup);

// Schedules, the calendar and channels: every control a person meets there has an info button
// beside it. The walk opens each form, mode, tab, editor and dialog the way a person would.
const planningAllow: readonly (string | RegExp)[] = [];

function expectExplained(): void {
  expect(unexplainedControls(document.body, [...selfExplanatory, ...planningAllow])).toEqual([]);
}

const templateId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const channelId = "00000000-0000-4000-8000-000000000001";
const topicId = "55555555-5555-4555-8555-555555555555";

const inDays = (days: number, hour: number): string => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return new Date(date.valueOf() + days * 24 * 60 * 60_000).toISOString();
};

const held = {
  held: 1,
  generatingSince: null,
  generatedAt: null,
  failedAt: null,
  error: null,
};
const schedule = (id: string, name: string, items: readonly string[]) => ({
  id,
  name,
  templateId,
  templateVersion: 1,
  cadence: { kind: "daily", time: "09:00" },
  timezone: "UTC",
  missedPolicy: "skip",
  overlapPolicy: "skip",
  spendLimitCents: null,
  items: items.map((title) => ({ title, values: {} })),
  topicKeyword: "Topic",
  values: {},
  brief: null,
  topicGeneration: { mode: "hold", keepAtLeast: 3, llm: null },
  topics: held,
  status: "active",
  version: 4,
  nextRunAt: inDays(1, 9),
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
  deletedAt: null,
});
const schedules = [
  schedule(scheduleId, "Lore", ["Tiamat", "Vecna"]),
  schedule(otherId, "Other", ["Orcus"]),
];
const run = (day: number, index: number | null, topic: string | null, id = scheduleId) => ({
  at: inDays(day, 9),
  scheduleId: id,
  scheduleName: id === scheduleId ? "Lore" : "Other",
  scheduleVersion: 4,
  paused: false,
  templateId,
  templateVersion: 1,
  templateName: "Stories",
  index,
  topic,
  topicSource: topic === null ? "generated" : "queued",
});
const document_ = {
  ...freshDraftDocument,
  form: {
    ...freshDraftDocument.form,
    title: "D&D Lore: {{Topic}}",
    values: { Topic: "Szass Tam", "Min. Word Count": "15000", "Max. Word Count": "18000" },
  },
};

const planningRoutes: Readonly<Record<string, Answer>> = {
  "GET /api/schedules": jsonAnswer({ schedules }),
  "GET /api/project-templates": jsonAnswer({
    templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: "a", channelId }],
  }),
  [`GET /api/project-templates/${templateId}`]: jsonAnswer({
    template: { id: templateId, name: "Stories", version: 1, updatedAt: "a", document: document_ },
  }),
  [`GET /api/schedules/${scheduleId}`]: jsonAnswer({ schedule: schedules[0], runs: [] }),
  [`GET /api/schedules/${scheduleId}/topics/held`]: jsonAnswer({
    topics: [{ id: topicId, title: "Owlbears", rank: 0, createdAt: "a" }],
  }),
  [`GET /api/schedules/${otherId}/topics/held`]: jsonAnswer({ topics: [] }),
  "GET /api/calendar": jsonAnswer({
    from: inDays(0, 0),
    to: inDays(28, 0),
    runs: [
      run(1, 0, "Tiamat"),
      run(2, 1, "Vecna"),
      run(3, null, null),
      run(2, 0, "Orcus", otherId),
    ],
    projects: [],
    queued: [],
  }),
  "GET /api/providers": jsonAnswer({ providers: [] }),
};

const channel: Channel = {
  id: channelId,
  name: "My channel",
  isDefault: true,
  brand: { endScreenText: "Subscribe" },
  seriesBrief: "",
  aiDisclosure: "auto",
  version: 3,
  createdAt: "a",
  updatedAt: "a",
};
const tiamat: CastMember = {
  id: "7a0c1f3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b",
  channelId,
  kind: "creature",
  name: "Tiamat",
  aliases: ["the Dragon Queen"],
  description: "",
  version: 1,
  images: [
    {
      id: "8b1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
      source: "upload",
      prompt: null,
      state: "ready",
      error: null,
      sha256: "a".repeat(64),
      createdAt: "a",
    },
  ],
  createdAt: "a",
  updatedAt: "a",
};
const summary: ChannelSummary = { ...channel, templates: 1, cast: 1 };
const memory = {
  id: "m1",
  channelId,
  projectId: "p1",
  title: "Tiamat Awakens",
  summary: "She woke under the mountain.",
  cast: ["Tiamat"],
  source: "generated",
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
};

const channelRoutes: Readonly<Record<string, Answer>> = {
  ...planningRoutes,
  "GET /api/channels": jsonAnswer({ channels: [summary] }),
  [`GET /api/channels/${channelId}`]: jsonAnswer({ channel, cast: [tiamat] }),
  "GET /api/fonts": jsonAnswer({ fonts: [] }),
  "GET /api/entries": jsonAnswer({ entries: [] }),
  "GET /api/document-themes": jsonAnswer({ builtIns: [], themes: [] }),
  "GET /api/settings/voices": jsonAnswer({ voices: [] }),
  [`GET /api/channels/${channelId}/episodes`]: jsonAnswer({ enabled: true, memories: [memory] }),
  [`GET /api/channels/${channelId}/videos`]: jsonAnswer({ videos: [] }),
  [`POST /api/channels/${channelId}/videos/preview`]: jsonAnswer({
    titles: ["D&D Lore: Vecna", "New World Guide"],
    filter: "d&d",
  }),
  "GET /api/settings/channel-links": jsonAnswer({ links: [{ name: "Patreon", url: "https://a" }] }),
};

function ChannelPage({ start }: { readonly start: ChannelTab }) {
  const [tab, setTab] = useState<ChannelTab>(start);
  return <ChannelRoute channelId={channelId} tab={tab} onTab={setTab} />;
}

describe("the planning screens explain every control", () => {
  it("walks Schedules: the list, the detail and the form with every option open", async () => {
    const user = userEvent.setup();
    renderRouted(<SchedulesRoute />, testDeps(planningRoutes));
    const waiting = await screen.findByRole("list", { name: "Topics waiting" });
    await user.click(within(waiting).getByRole("button", { name: "Edit" }));
    await screen.findByLabelText("Edit Owlbears");
    expectExplained();

    await user.click(screen.getByRole("button", { name: "New schedule" }));
    await screen.findByRole("option", { name: "Stories · v1" });
    await user.selectOptions(screen.getByLabelText("Template"), templateId);
    await screen.findByLabelText("Each topic fills");
    expectExplained();
    await user.selectOptions(screen.getByLabelText("Cadence"), "weekly");
    expectExplained();
    await user.selectOptions(screen.getByLabelText("Cadence"), "once");
    expectExplained();
    await user.selectOptions(screen.getByLabelText("New topics"), "hold");
    await user.click(screen.getByRole("checkbox", { name: /Use the template's LLM/ }));
    await screen.findByLabelText("Provider");
    expectExplained();
    await user.click(screen.getByRole("button", { name: "Table" }));
    await user.click(screen.getByRole("button", { name: "Add topic" }));
    await user.selectOptions(screen.getByLabelText("Set a keyword per topic"), "Min. Word Count");
    await screen.findByLabelText("Topic 1 Min. Word Count");
    expectExplained();
    await user.click(screen.getByRole("button", { name: "YAML / JSON" }));
    await screen.findByLabelText("Topics as YAML or JSON");
    expectExplained();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Edit Lore" }));
    await screen.findByRole("region", { name: "Edit schedule" });
    expectExplained();
  });

  it("walks the Calendar: weeks, the list, suggestions and Add to calendar", async () => {
    const user = userEvent.setup();
    renderRouted(<CalendarRoute />, testDeps(planningRoutes));
    await screen.findByRole("article", { name: /^Tiamat,/ });
    expectExplained();
    await user.click(screen.getByRole("button", { name: "List" }));
    await screen.findByLabelText("Move Tiamat to another schedule");
    expectExplained();
    await user.click(screen.getByRole("button", { name: "Add to calendar" }));
    await screen.findByLabelText("Topics, one per line");
    expectExplained();
  });

  it("walks Channels: the list and the New channel dialog", async () => {
    const user = userEvent.setup();
    renderRouted(<ChannelsRoute />, testDeps(channelRoutes));
    await screen.findByText("My channel");
    expectExplained();
    await user.click(screen.getByRole("button", { name: "New channel" }));
    await screen.findByLabelText("Channel name");
    expectExplained();
  });

  it("walks a channel with every tab, editor and dialog open", async () => {
    const user = userEvent.setup();
    renderRouted(<ChannelPage start="brand" />, testDeps(channelRoutes));
    await screen.findByRole("combobox", { name: "YouTube AI disclosure" });
    expectExplained();

    await user.click(screen.getByRole("tab", { name: /Cast/ }));
    const grid = await screen.findByRole("region", { name: "Cast" });
    await user.click(within(grid).getByRole("button", { name: "Edit Tiamat" }));
    await screen.findByLabelText("Picture to make");
    expectExplained();
    await user.click(screen.getAllByRole("button", { name: "Add to cast" })[0] as HTMLElement);
    await screen.findByRole("region", { name: "Add to cast" });
    expectExplained();

    await user.click(screen.getByRole("tab", { name: "Templates" }));
    await screen.findByLabelText("Channel of Stories");
    expectExplained();

    await user.click(screen.getByRole("tab", { name: "Schedules" }));
    await screen.findByRole("list", { name: "Channel schedules" });
    expectExplained();

    await user.click(screen.getByRole("tab", { name: "Episodes" }));
    await user.click(
      await screen.findByRole("button", { name: "Open the summary of Tiamat Awakens" }),
    );
    await screen.findByLabelText("Summary");
    expectExplained();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("tab", { name: "Existing videos" }));
    const csv = new File(["Video title\nD&D Lore: Vecna\n"], "studio.csv", { type: "text/csv" });
    await user.upload(await screen.findByLabelText("YouTube Studio CSV file"), csv);
    await screen.findByLabelText("D&D Lore: Vecna");
    expectExplained();
  });

  it("walks the channel picker and the named links", async () => {
    renderRouted(
      <CurrentChannelProvider>
        <ChannelPicker />
        <ChannelLinksSettings />
      </CurrentChannelProvider>,
      testDeps(channelRoutes),
    );
    await screen.findByRole("option", { name: "My channel" });
    await screen.findByLabelText("Name of link 1");
    await waitFor(expectExplained);
  });
});
