import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { defaultVoicesSettings } from "@app/slices/voices/model.js";
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { defaultChannelId } from "@/channels/api";
import { selfExplanatory, unexplainedControls } from "@/help/coverage";
import { generatedRun, mountPlay, openRow, openSection } from "@/play/play-test-fixture";
import { freshShorts } from "@/play/shorts";
import { jsonAnswer } from "@/test-app";

afterEach(cleanup);

// Every labelled control on Play has an info button beside it: every setup row's editor with
// each source switched to what shows the most controls, the Review panel, another video's
// keywords, the drafts list and Save as template. Nothing on Play is allowed without one.
const areaAllow: readonly (string | RegExp)[] = [];

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

const routes = {
  "GET /api/channels": jsonAnswer({ channels: [{ ...channel, templates: 0, cast: 0 }] }),
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

const rows = ["Title and keywords", "Article", "Narration", "Images", "Video and style", "Outputs"];

async function openEverything(): Promise<void> {
  for (const row of [...rows, "Channel"]) await openRow(row);
  for (const summary of document.querySelectorAll("details:not([open]) > summary"))
    await userEvent.click(summary as HTMLElement);
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
  await openEverything();
  await screen.findByRole("radio", { name: "Whole" });
  // The walk reached the far rows: the speakers, the shorts and the PDF theme.
  for (const name of ["Speaker name", "How many shorts", "Theme", "Establishing prompt"])
    expect(screen.getAllByLabelText(name).length).toBeGreaterThan(0);
  expectExplained();
  // The character count, then every stage that can be Off set to Off.
  await userEvent.click(screen.getByRole("radio", { name: /Every .* characters/ }));
  expectExplained();
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
  await openEverything();
  expectExplained();
});

it("explains the Review panel, another video's keywords, the drafts and Save as template", async () => {
  await mountPlay(routes, generated);
  await openSection("Review");
  await screen.findByRole("group", { name: /Review checkpoints/ });
  expectExplained();
  await openSection("Content");

  await userEvent.click(screen.getByRole("button", { name: "Add topic" }));
  await userEvent.type(screen.getByLabelText("Topic of another video"), "splices{Enter}");
  expectExplained();
  await userEvent.click(screen.getByRole("button", { name: "Change the keywords of splices" }));
  await screen.findByRole("dialog", { name: /Video 2/ });
  expectExplained();
  await userEvent.click(
    within(screen.getByRole("dialog", { name: /Video 2/ })).getByRole("button", { name: "Done" }),
  );

  await userEvent.click(screen.getByRole("button", { name: "Drafts" }));
  expectExplained();
  await userEvent.keyboard("{Escape}");

  await userEvent.click(screen.getByRole("button", { name: "Save as template" }));
  await screen.findByRole("dialog", { name: "Save as template" });
  expectExplained();
});

it("explains the provided sources' controls", async () => {
  await mountPlay(routes, provided);
  await openEverything();
  expectExplained();
});
