import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommandPaletteProvider, CommandRegistry } from "@/components/kit/command-palette";
import { PlayForm } from "@/routes/play";
import { renderRouted, testDeps } from "@/test-app";
import { PlayDraftProvider } from "./draft-context";
import { freshDraftDocument } from "./draft-state";
import { mountPlay, openRow, playRoutes } from "./play-test-fixture";
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
    values: { topic: "Tiamat", minWords: "1500" },
  },
};

it("asks for the topic the title names and shows the title it makes", async () => {
  await mountPlay();
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Lore: {{topic}}" } });
  const topic = await screen.findByRole("textbox", { name: "topic" });
  await userEvent.type(topic, "Tiamat");
  expect(screen.getByText("Lore: Tiamat")).not.toBeNull();
  // The title itself moves into the Title and keywords row, where it can still be changed.
  expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
});

it("queues more videos from the same setup as topic chips", async () => {
  const h = reviewHarness();
  await h.prepare(lore);
  await userEvent.click(screen.getByRole("button", { name: "Add topic" }));
  await userEvent.type(screen.getByLabelText("topic of another video"), "Lolth{Enter}");
  await userEvent.type(screen.getByLabelText("topic of another video"), "Demogorgon{Enter}");
  const more = within(screen.getByRole("region", { name: "More videos from the same setup" }));
  expect(more.getByRole("button", { name: "Change the keywords of Lolth" })).not.toBeNull();
  expect(h.session().document.variants.map((one) => one.values.topic)).toEqual([
    "Lolth",
    "Demogorgon",
  ]);
  // Every other keyword comes from the first video's setup.
  expect(h.session().document.variants[0]?.values.minWords).toBe("1500");
  expect(screen.getByRole("button", { name: "Queue 3 videos" })).not.toBeNull();
  await userEvent.click(more.getByRole("button", { name: "Remove Lolth" }));
  expect(h.session().document.variants.map((one) => one.values.topic)).toEqual(["Demogorgon"]);
  expect(screen.getByRole("button", { name: "Queue 2 videos" })).not.toBeNull();
  await userEvent.click(more.getByRole("button", { name: "Change the keywords of Demogorgon" }));
  const panel = await screen.findByRole("dialog", { name: "Video 2: Demogorgon" });
  expect((within(panel).getByLabelText("minWords") as HTMLInputElement).value).toBe("1500");
});

it("says right under the Play key why it can't start, and goes to the field", async () => {
  await mountPlay();
  const start = within(screen.getByRole("region", { name: "Start" }));
  expect((start.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  const reason = start.getByRole("button", { name: /to play$/ });
  expect(start.getByRole("button", { name: "Start run" }).getAttribute("aria-describedby")).toBe(
    "play-start-reason",
  );
  await userEvent.click(reason);
  await waitFor(() => expect(document.activeElement?.hasAttribute("data-play-field")).toBe(true));
});

it("names what a template leaves out: the topic, and the other videos", () => {
  expect(oneOffNotes("Lore: {{Topic}}", { Topic: "" }, 0)).toEqual([
    "Topic is left empty in the template.",
  ]);
  expect(oneOffNotes("Lore: {{Topic}}", { Topic: "Tiamat", minWords: "1500" }, 2)).toEqual([
    'Topic is left empty in the template (this video\'s Topic, "Tiamat", is not saved).',
    "The 2 other videos queued here are not saved.",
  ]);
  expect(oneOffNotes("A fixed title", { minWords: "1500" }, 0)).toEqual([]);
});

it("saves a template from Play with the topic empty and the settings kept", async () => {
  const h = reviewHarness();
  await h.prepare({
    ...lore,
    variants: [{ id: crypto.randomUUID(), title: "Lore: {{topic}}", values: { topic: "Lolth" } }],
  });
  await userEvent.click(screen.getByRole("button", { name: "Save as template" }));
  const dialog = await screen.findByRole("dialog", { name: "Save as template" });
  expect(within(dialog).getByText(/topic is left empty in the template/)).not.toBeNull();
  expect(within(dialog).getByText("The other video queued here is not saved.")).not.toBeNull();
  await userEvent.type(within(dialog).getByLabelText("Template name"), "D&D Lore");
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
  expect(body.name).toBe("D&D Lore");
  expect(body.document.form.values).toEqual({ topic: "", minWords: "1500" });
  expect(body.document.form.title).toBe("Lore: {{topic}}");
  expect(body.document.variants).toEqual([]);
  // The draft on screen keeps its topic and its other video.
  expect(h.session().document.form.values.topic).toBe("Tiamat");
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
  await screen.findByRole("option", { name: "Dossier" });
  const titles = registry.list().map((command) => command.title);
  for (const title of [
    "Start run",
    "Add a topic for another video",
    "Save as template",
    "Review the whole setup",
    "Pick a template",
    "Change title and keywords",
    "Change article",
    "Change narration",
    "Change images",
    "Change video and style",
    "Change outputs",
    "Change reviews",
    "Change channel",
  ])
    expect(titles).toContain(title);
  const run = (title: string) =>
    act(async () => {
      await registry
        .list()
        .find((command) => command.title === title)
        ?.run();
    });
  await run("Change outputs");
  expect(screen.getByRole("region", { name: "Outputs" })).not.toBeNull();
  await run("Add a topic for another video");
  expect(screen.getByLabelText("Title of another video")).not.toBeNull();
  await run("Save as template");
  expect(await screen.findByRole("dialog", { name: "Save as template" })).not.toBeNull();
});

it("names each stage once: the row says it, the editor under it starts at its source", async () => {
  await mountPlay();
  for (const [row, stage] of [
    ["Article", "Article"],
    ["Narration", "Audio"],
    ["Images", "Images"],
    ["Video and style", "Export"],
  ] as const) {
    await openRow(row);
    const editor = screen.getByRole("region", { name: row });
    expect(within(editor).queryByRole("heading", { name: stage })).toBeNull();
    expect(within(editor).getAllByText("Source").length).toBeGreaterThan(0);
  }
  // A part of a row that is not the row itself keeps its own heading.
  expect(
    within(screen.getByRole("region", { name: "Article" })).getByRole("heading", {
      name: "Research",
    }),
  ).not.toBeNull();
});
