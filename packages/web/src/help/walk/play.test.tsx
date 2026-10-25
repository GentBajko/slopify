import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { defaultVoicesSettings } from "@app/slices/voices/model.js";
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { defaultChannelId } from "@/channels/api";
import { selfExplanatory, stageEditors, unexplainedControls } from "@/help/coverage";
import {
  generatedRun,
  mountPlay,
  openRow,
  openSection,
  summaryTitle,
} from "@/play/play-test-fixture";
import { freshShorts } from "@/play/shorts";
import { jsonAnswer } from "@/test-app";

afterEach(cleanup);

// Every labelled control on Create is explained beside it, by a visible help line or an info
// button (help/coverage.ts): every setup row's editor with each source switched to what shows
// the most controls, the summary drawer, another video's keywords, the drafts list and Save as
// template. Only the controls whose label says all there is to say are allowed without one.
// The same check finds jargon in a label, an info button beside a button, a heading or a row
// (or a field's second one), and a second lime button in one area.
const areaAllow: readonly (string | RegExp)[] = [
  ...stageEditors,
  // The field at the top asks its own question: "What's the video about?".
  /^What('s| are) the .* (about|of)\?$/,
  // "Start from History starter" and "For My channel": what the draft starts from and is for.
  "Start from",
  "For channel",
  // The box Another topic opens: "Topic of another video".
  / of another (video|article|audiobook|episode|image set)$/,
];

function expectExplained(): void {
  expect(unexplainedControls(document.body, [...selfExplanatory, ...areaAllow])).toEqual([]);
}

const channel = {
  id: defaultChannelId,
  name: "Lore",
  isDefault: true,
  brand: {},
  seriesBrief: "",
  aiDisclosure: "auto",
  version: 1,
  createdAt: "a",
  updatedAt: "a",
};

// Two channels, so the channel this video is for is asked, and the Channel row is there.
const routes = {
  "GET /api/channels": jsonAnswer({
    channels: [
      { ...channel, templates: 0, cast: 0 },
      { ...channel, id: "c-2", name: "Second", isDefault: false, templates: 0, cast: 0 },
    ],
  }),
  [`GET /api/channels/${defaultChannelId}`]: jsonAnswer({ channel, cast: [] }),
  // A voice listed for German only, so the English run hides it and offers Show all voices.
  "GET /api/settings/voices": jsonAnswer({
    voices: [
      { id: "v1", provider: "elevenlabs", name: "Narrator M", voiceId: "eleven-narrator" },
      {
        id: "v3",
        provider: "elevenlabs",
        name: "Erzähler",
        voiceId: "eleven-de",
        languages: ["de"],
      },
    ],
  }),
};

const rows = [
  "Keywords",
  "Article",
  "Narration",
  "Images",
  "Video and style",
  "Extras",
  "Pauses and checks",
  "Channel",
];

// Controls deep in the far rows: the speakers, the establishing image, the shorts and the PDF
// theme.
const farControls = ["Speaker name", "Establishing prompt", "Shorts per video", "Theme"];

// One row at a time, as Create opens them, each with every fold inside it open. `reached`
// collects the far controls the walk met on the way.
async function walkEveryRow(reached = new Set<string>()): Promise<readonly string[]> {
  const walked: string[] = [];
  for (const row of rows) {
    await openRow(row);
    if (screen.queryByRole("button", { name: `Close ${row.toLowerCase()}` }) === null) continue;
    for (const summary of document.querySelectorAll("details:not([open]) > summary"))
      await userEvent.click(summary as HTMLElement);
    expectExplained();
    for (const name of farControls)
      if (screen.queryAllByLabelText(name).length > 0) reached.add(name);
    walked.push(row);
  }
  return walked;
}

// Everything generated, every optional step on.
const generated: PlayDraftDocument = {
  ...generatedRun,
  form: {
    ...generatedRun.form,
    title: "Rope {{Topic}}",
    sources: {
      ...generatedRun.form.sources,
      research: "generate",
      thumbnail: "prompt_by_llm",
      document: "generate",
    },
    intro: "Cold open",
    chunking: { mode: "words", words: "500", characters: "3000" },
    narrationPrompt: "",
    youtubeDescription: true,
    shorts: { ...freshShorts, enabled: true },
    imageScale: { every: "minutes", value: "2" },
    reference: { source: "prompt", prompt: "Oils", thumbnail: true },
    voices: defaultVoicesSettings("podcast"),
    values: { ...generatedRun.form.values, Topic: "knots" },
  },
};

// Everything provided by the person instead.
const provided: PlayDraftDocument = {
  ...generatedRun,
  form: {
    ...generatedRun.form,
    sources: {
      research: "provide",
      article: "provide",
      audio: "provide",
      images: "provide",
      thumbnail: "provide",
      video: "generate",
      document: "off",
    },
    provided: { ...generatedRun.form.provided, article: "Some words.", research: "Notes." },
    reference: { source: "provide", prompt: "", thumbnail: true },
  },
};

it("explains every control of every setup row with everything generated", async () => {
  const { session } = await mountPlay(routes, generated);
  expectExplained();
  const reached = new Set<string>();
  expect(await walkEveryRow(reached)).toEqual(rows);
  // The walk reached the far rows.
  expect(farControls.filter((name) => !reached.has(name))).toEqual([]);
  // The character count, inside More narration settings.
  await openRow("Narration");
  for (const summary of document.querySelectorAll("details:not([open]) > summary"))
    await userEvent.click(summary as HTMLElement);
  await screen.findByRole("radio", { name: "Nothing (one piece)" });
  await userEvent.click(screen.getByRole("radio", { name: /Every .* characters/ }));
  expectExplained();
  // Then every stage that can be Off set to Off.
  const off = {
    research: "off",
    article: "generate",
    audio: "off",
    images: "off",
    thumbnail: "off",
    video: "off",
    document: "off",
  } as const;
  await act(async () => {
    session().edit({ ...generated, form: { ...generated.form, sources: off } });
  });
  await walkEveryRow();
});

it("explains the summary, another video's keywords, the drafts and Save as template", async () => {
  await mountPlay(routes, generated);
  await openSection("Review");
  await screen.findByRole("dialog", { name: summaryTitle });
  expectExplained();
  await openSection("Content");

  await userEvent.click(screen.getByRole("button", { name: "Another topic" }));
  await userEvent.type(screen.getByLabelText("Topic of another video"), "splices{Enter}");
  expectExplained();
  await userEvent.click(screen.getByRole("button", { name: "Change the keywords of splices" }));
  await screen.findByRole("dialog", { name: /Video 2/ });
  expectExplained();
  await userEvent.click(
    within(screen.getByRole("dialog", { name: /Video 2/ })).getByRole("button", { name: "Done" }),
  );

  await userEvent.click(screen.getByRole("button", { name: /^Draft: / }));
  expectExplained();
  await userEvent.keyboard("{Escape}");

  await userEvent.click(screen.getByRole("button", { name: "Save as template" }));
  await screen.findByRole("dialog", { name: "Save as template" });
  expectExplained();
});

it("explains the provided sources' controls", async () => {
  await mountPlay(routes, provided);
  await walkEveryRow();
});
