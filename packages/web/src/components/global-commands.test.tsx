import type { ProjectListing } from "@app/slices/admission/model.js";
import { cleanup, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CommandPaletteProvider,
  CommandRegistry,
  matchCommands,
  useCommandPalette,
} from "@/components/kit/command-palette";
import { intents, useIntent } from "@/lib/intents";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { GlobalCommands } from "./global-commands.js";

afterEach(cleanup);

function listing(id: string, title: string, images: "generate" | "off"): ProjectListing {
  return {
    id,
    title,
    status: "done",
    progress: 1,
    format: "16:9",
    channelId: "00000000-0000-4000-8000-000000000001",
    uploadedAt: null,
    config: {
      title,
      format: "16:9",
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images,
        thumbnail: "off",
        video: "generate",
      },
      articlePrompt: "Documentary dossier",
      imagePrompts: [],
      values: {},
      provided: {},
      silenceGapSeconds: 3,
      imageSeconds: 15,
      zoomPercent: 22.5,
      motionStyle: "zoom",
      edgeSilenceSeconds: 0,
      rendered: {},
    },
    createdAt: "2026-09-02T19:14:00.000Z",
    updatedAt: "2026-09-02T19:14:00.000Z",
  } as ProjectListing;
}

function Listener({ onImage }: { readonly onImage: (count: number | undefined) => void }) {
  useIntent(intents.regenerateImage("p1"), onImage);
  return null;
}

async function mount(onImage: (count: number | undefined) => void = () => {}) {
  const registry = new CommandRegistry();
  renderRouted(
    <CommandPaletteProvider registry={registry}>
      <GlobalCommands />
      <Listener onImage={onImage} />
    </CommandPaletteProvider>,
    testDeps({
      "GET /api/projects": jsonAnswer({
        projects: [
          listing("p1", "History: Cleopatra", "generate"),
          listing("p2", "Knot Tricks", "generate"),
          listing("p3", "Audio Only", "off"),
        ],
      }),
    }),
  );
  await waitFor(() =>
    expect(registry.list().some((command) => command.id === "index.open.p3")).toBe(true),
  );
  return registry;
}

describe("the palette from anywhere", () => {
  it("finds a project's image by name and number, and hands the number to the project", async () => {
    const onImage = vi.fn();
    const registry = await mount(onImage);
    const found = matchCommands(registry.list(), "cleopatra regenerate image 3");
    expect(found[0]?.title).toBe("Regenerate image 3 in History: Cleopatra");
    // Only the project named: the other project's image command needs its own name.
    expect(found.map((command) => command.title)).not.toContain(
      "Regenerate image 3 in Knot Tricks",
    );
    // Word order does not matter.
    expect(matchCommands(registry.list(), "image 3 cleopatra regenerate")[0]?.title).toBe(
      "Regenerate image 3 in History: Cleopatra",
    );
    await found[0]?.run();
    expect(onImage).toHaveBeenCalledWith(3);
  });

  it("opens any project by name, and offers images only where the run makes them", async () => {
    const registry = await mount();
    expect(matchCommands(registry.list(), "knot")[0]?.title).toBe("Open Knot Tricks");
    const ids = registry.list().map((command) => command.id);
    expect(ids).toContain("index.image.p1");
    expect(ids).not.toContain("index.image.p3");
  });

  it("offers New schedule and Add to calendar when searched, and keeps an empty palette short", async () => {
    const registry = await mount();
    expect(matchCommands(registry.list(), "schedule").map((command) => command.title)).toContain(
      "New schedule",
    );
    expect(matchCommands(registry.list(), "add to cal")[0]?.title).toBe("Add to calendar");
    expect(matchCommands(registry.list(), "").map((command) => command.id)).toEqual([
      "help.shortcuts",
    ]);
  });
});

function OpenPalette() {
  const palette = useCommandPalette();
  useEffect(() => palette.setOpen(true), [palette]);
  return null;
}

describe("the Library and plans by name", () => {
  it("are read once the palette opens, and found by name", async () => {
    const registry = new CommandRegistry();
    renderRouted(
      <CommandPaletteProvider registry={registry}>
        <OpenPalette />
        <GlobalCommands />
      </CommandPaletteProvider>,
      testDeps({
        "GET /api/projects": jsonAnswer({ projects: [] }),
        "GET /api/prompts": jsonAnswer({
          prompts: [
            {
              id: "pr1",
              kind: "article",
              name: "Documentary dossier",
              body: "",
              slots: [],
              updatedAt: "x",
            },
          ],
        }),
        "GET /api/entries": jsonAnswer({
          entries: [
            {
              id: "e1",
              category: "outro",
              mode: "verbatim",
              name: "Goodnight",
              body: "",
              slots: [],
              updatedAt: "x",
            },
          ],
        }),
        "GET /api/document-themes": jsonAnswer({ builtIns: [], themes: [] }),
        "GET /api/schedules": jsonAnswer({ schedules: [] }),
        "GET /api/templates": jsonAnswer({ templates: [] }),
        "GET /api/project-templates": jsonAnswer({
          templates: [
            {
              id: "00000000-0000-4000-8000-0000000000a1",
              name: "Weekly explainer",
              version: 1,
              updatedAt: "x",
            },
          ],
        }),
        "GET /api/channels": jsonAnswer({
          channels: [{ id: "c2", name: "Night Myths", isDefault: false }],
        }),
      }),
    );
    await waitFor(() =>
      expect(registry.list().map((command) => command.id)).toEqual(
        expect.arrayContaining(["prompt.edit.pr1", "entry.edit.e1", "channel.open.c2"]),
      ),
    );
    expect(matchCommands(registry.list(), "dossier")[0]?.title).toBe(
      "Edit prompt Documentary dossier",
    );
    expect(matchCommands(registry.list(), "goodnight")[0]?.title).toBe("Edit outro Goodnight");
    expect(matchCommands(registry.list(), "night myths")[0]?.title).toBe(
      "Open channel Night Myths",
    );
    // A template opens itself on Templates (`?item=`), not just the list.
    await waitFor(() =>
      expect(matchCommands(registry.list(), "weekly explainer")[0]?.title).toBe(
        "Open template Weekly explainer",
      ),
    );
    // Searched only: an empty palette stays short.
    expect(matchCommands(registry.list(), "").map((command) => command.id)).toEqual([
      "help.shortcuts",
    ]);
  });
});
