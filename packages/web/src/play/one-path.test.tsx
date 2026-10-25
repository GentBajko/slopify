import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommandPaletteProvider, CommandRegistry } from "@/components/kit/command-palette";
import { PlayForm } from "@/routes/play";
import { renderRouted, testDeps } from "@/test-app";
import { PlayDraftProvider } from "./draft-context";
import { freshDraftDocument } from "./draft-state";
import { makeKey, mountPlay, openRow, playRoutes, topicLabel } from "./play-test-fixture";
import { reviewHarness, reviewStorage } from "./review-test-harness";
import { oneOffNotes } from "./save-template-dialog";
import { rowOf, rowsOfSection } from "./setup-rows";

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// A setup whose title names its topic, with a settings-like keyword beside it.
const lore: PlayDraftDocument = {
  ...freshDraftDocument,
  form: {
    ...freshDraftDocument.form,
    title: "Lore: {{topic}}",
    articlePrompt: "Dossier",
    values: { topic: "Cleopatra", minWords: "1500" },
  },
};

it("asks for the topic the title names and shows the title it makes", async () => {
  await mountPlay();
  fireEvent.change(screen.getByLabelText(topicLabel), { target: { value: "Lore: {{topic}}" } });
  // The one field at the top now asks for the topic, in the same words.
  await waitFor(() =>
    expect(screen.getByLabelText(topicLabel).getAttribute("data-play-field")).toBe("values.topic"),
  );
  await userEvent.type(screen.getByLabelText(topicLabel), "Cleopatra");
  expect(screen.getByText(/Title will be:/).textContent).toBe("Title will be: Lore: Cleopatra");
  // The title itself moves into the Title and keywords row, where it can still be changed.
  expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
  await openRow("Title and keywords");
  expect((screen.getByLabelText("Title pattern") as HTMLInputElement).value).toBe(
    "Lore: {{topic}}",
  );
});

it("queues more videos from the same setup as topic chips", async () => {
  const h = reviewHarness();
  await h.prepare(lore);
  await userEvent.click(screen.getByRole("button", { name: "Another topic" }));
  await userEvent.type(screen.getByLabelText("topic of another video"), "Nefertiti{Enter}");
  await userEvent.type(screen.getByLabelText("topic of another video"), "Sargon{Enter}");
  const more = within(screen.getByRole("region", { name: "More videos from the same setup" }));
  expect(more.getByRole("button", { name: "Change the keywords of Nefertiti" })).not.toBeNull();
  expect(h.session().document.variants.map((one) => one.values.topic)).toEqual([
    "Nefertiti",
    "Sargon",
  ]);
  // Every other keyword comes from the first video's setup.
  expect(h.session().document.variants[0]?.values.minWords).toBe("1500");
  expect(screen.getByRole("button", { name: "Queue 3 videos" })).not.toBeNull();
  await userEvent.click(more.getByRole("button", { name: "Remove Nefertiti" }));
  expect(h.session().document.variants.map((one) => one.values.topic)).toEqual(["Sargon"]);
  expect(screen.getByRole("button", { name: "Queue 2 videos" })).not.toBeNull();
  await userEvent.click(more.getByRole("button", { name: "Change the keywords of Sargon" }));
  const panel = await screen.findByRole("dialog", { name: "Video 2: Sargon" });
  expect((within(panel).getByLabelText("minWords") as HTMLInputElement).value).toBe("1500");
});

it("says right under the Make button what to do next, and goes there", async () => {
  await mountPlay();
  const start = within(screen.getByRole("region", { name: "Start" }));
  const key = start.getByRole("button", { name: makeKey });
  expect((key as HTMLButtonElement).disabled).toBe(true);
  const reason = start.getByRole("button", { name: "Type what the video is about first" });
  expect(key.getAttribute("aria-describedby")).toBe(reason.parentElement?.id);
  await userEvent.click(reason);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(topicLabel)));
  await userEvent.type(screen.getByLabelText(topicLabel), "Rope Tricks");
  await userEvent.click(start.getByRole("button", { name: "Pick an article prompt first" }));
  // The prompts are cards: the focus lands on the card that stands for the field.
  await waitFor(() =>
    expect(document.activeElement?.getAttribute("data-play-field")).toBe("articlePrompt"),
  );
});

it("names what a template leaves out: the topic, and the other videos", () => {
  expect(oneOffNotes("Lore: {{Topic}}", { Topic: "" }, 0)).toEqual([
    "Topic is left empty in the template.",
  ]);
  expect(oneOffNotes("Lore: {{Topic}}", { Topic: "Cleopatra", minWords: "1500" }, 2)).toEqual([
    'Topic is left empty in the template (this video\'s Topic, "Cleopatra", is not saved).',
    "The 2 other videos queued here are not saved.",
  ]);
  expect(oneOffNotes("A fixed title", { minWords: "1500" }, 0)).toEqual([]);
});

it("saves a template from Play with the topic empty and the settings kept", async () => {
  const h = reviewHarness();
  await h.prepare({
    ...lore,
    variants: [
      { id: crypto.randomUUID(), title: "Lore: {{topic}}", values: { topic: "Nefertiti" } },
    ],
  });
  await userEvent.click(screen.getByRole("button", { name: "Save as template" }));
  const dialog = await screen.findByRole("dialog", { name: "Save as template" });
  expect(within(dialog).getByText(/topic is left empty in the template/)).not.toBeNull();
  expect(within(dialog).getByText("The other video queued here is not saved.")).not.toBeNull();
  await userEvent.type(within(dialog).getByLabelText("Template name"), "History");
  await userEvent.click(within(dialog).getByRole("button", { name: "Save template" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Save as template" })).toBeNull(),
  );
  const posted = h.requests.find(
    (request) => request.method === "POST" && request.url.endsWith("/api/project-templates"),
  );
  const body = (await posted?.clone().json()) as {
    name: string;
    document: PlayDraftDocument;
  };
  expect(body.name).toBe("History");
  expect(body.document.form.values).toEqual({ topic: "", minWords: "1500" });
  expect(body.document.form.title).toBe("Lore: {{topic}}");
  expect(body.document.variants).toEqual([]);
  // The draft on screen keeps its topic and its other video.
  expect(h.session().document.form.values.topic).toBe("Cleopatra");
  expect(h.session().document.variants).toHaveLength(1);
});

it("maps each refused field to the row that holds it", () => {
  expect(rowOf("articlePrompt")).toBe("article");
  expect(rowOf("audio.voice")).toBe("narration");
  expect(rowOf("imagePrompts.0.number")).toBe("images");
  expect(rowOf("subtitles.fontSize")).toBe("video");
  expect(rowOf("silenceGapSeconds")).toBe("video");
  expect(rowOf("shorts.count")).toBe("outputs");
  expect(rowOf("checkpoints.audio")).toBe("reviews");
  expect(rowOf("channelId")).toBe("channel");
  expect(rowOf("values.topic")).toBe("title");
  expect(rowsOfSection("outputs")).toEqual(["narration", "images", "video", "outputs"]);
});

it("offers every Play action in the command palette", async () => {
  const registry = new CommandRegistry();
  renderRouted(
    <CommandPaletteProvider registry={registry}>
      <PlayDraftProvider>
        <PlayForm onCreated={vi.fn()} />
      </PlayDraftProvider>
    </CommandPaletteProvider>,
    testDeps(playRoutes()),
  );
  await screen.findByRole("radio", { name: /^Dossier/ });
  const titles = registry.list().map((command) => command.title);
  for (const title of [
    "Make the video",
    "Add another topic",
    "Save as template",
    "See everything this run will do",
    "Pick what to start from",
    "Change article",
    "Change narration",
    "Change images",
    "Change video and style",
    "Change extras",
    "Change pauses and checks",
  ])
    expect(titles).toContain(title);
  // Nothing to set for keywords or the channel here, so neither is a row to change.
  expect(titles).not.toContain("Change keywords");
  expect(titles).not.toContain("Change channel");
  const run = (title: string) =>
    act(async () => {
      await registry
        .list()
        .find((command) => command.title === title)
        ?.run();
    });
  await run("Change extras");
  expect(screen.getByRole("region", { name: "Extras" })).not.toBeNull();
  await run("Add another topic");
  expect(screen.getByLabelText("Title of another video")).not.toBeNull();
  await run("Save as template");
  expect(await screen.findByRole("dialog", { name: "Save as template" })).not.toBeNull();
});

it("names each stage once: the row says it, the editor under it starts at its switch", async () => {
  await mountPlay();
  for (const [row, stage, choices] of [
    [
      "Article",
      "Article",
      ["Write it for me", "Use my text as written", "Adapt my text", "No text"],
    ],
    ["Narration", "Narration", ["Off", "AI voice (paid per character)", "My own audio file"]],
    ["Images", "Images", ["None", "Made by AI (paid)", "My own images"]],
    ["Video and style", "Video", ["Off (sound only)", "Make the video"]],
  ] as const) {
    await openRow(row);
    const editor = screen.getByRole("region", { name: row });
    expect(within(editor).queryByRole("heading", { name: stage })).toBeNull();
    // The switch is named for its stage, in words, and says what each choice makes.
    const strip = within(editor).getByRole("radiogroup", { name: stage });
    expect(
      within(strip)
        .getAllByRole("radio")
        .map((one) => one.textContent),
    ).toEqual([...choices]);
  }
  // A part of a row that is not the row itself keeps its own heading.
  await openRow("Article");
  expect(
    within(screen.getByRole("region", { name: "Article" })).getByRole("heading", {
      name: "Research",
    }),
  ).not.toBeNull();
});
