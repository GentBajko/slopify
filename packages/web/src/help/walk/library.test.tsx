import type { SavedDocumentTheme } from "@app/slices/document/model.js";
import { builtInTheme } from "@app/slices/document/theme.js";
import type { Entry, EntryCategory, Prompt, PromptKind } from "@app/slices/library/model.js";
import { promptKinds } from "@app/slices/library/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPaletteProvider } from "@/components/kit/command-palette";
import { themeGroups } from "@/lib/document-theme-fields";
import { kindLabel } from "@/lib/prompt-kinds";
import { DocumentThemeEditorRoute } from "@/routes/document-theme-editor";
import { DocumentThemesRoute } from "@/routes/document-themes";
import { EntriesRoute } from "@/routes/entries";
import { EntryEditorRoute } from "@/routes/entry-editor";
import { LibraryLayout } from "@/routes/library";
import { NarrationAliasesRoute } from "@/routes/narration-aliases";
import { PromptEditorRoute } from "@/routes/prompt-editor";
import { PromptsRoute } from "@/routes/prompts";
import { TemplatesRoute } from "@/routes/templates";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { selfExplanatory, unexplainedControls } from "../coverage.js";

afterEach(cleanup);

// What the Library may show without an info button beside it.
const libraryAllow: readonly (string | RegExp)[] = [];

function expectExplained(): void {
  expect(unexplainedControls(document.body, [...selfExplanatory, ...libraryAllow])).toEqual([]);
}

const stamp = "2026-09-01T10:00:00.000Z";

// One saved prompt of every kind, so every kind's list and editor has a row to show.
const prompts: readonly Prompt[] = promptKinds.map((kind, index) => ({
  id: `p${String(index)}`,
  kind,
  name: `${kindLabel(kind)} one`,
  body: `Write about {{topic}} for ${kind}.`,
  slots: ["topic"],
  updatedAt: stamp,
}));

const entries: readonly Entry[] = [
  {
    id: "e1",
    category: "intro",
    mode: "text",
    name: "Cold open",
    body: "Today: {{topic}}.",
    slots: ["topic"],
    updatedAt: stamp,
  },
  {
    id: "e2",
    category: "outro",
    mode: "llm",
    name: "Sign-off",
    body: "Write a sign-off about {{topic}}.",
    slots: ["topic"],
    updatedAt: stamp,
  },
];

const version = (item: { readonly name: string }, number: number, body: string) => ({
  version: number,
  kind: "article",
  mode: null,
  name: item.name,
  body,
  author: "you",
  restoredFrom: null,
  createdAt: stamp,
});

const usedBy = jsonAnswer({ templates: [], schedules: [], projects: [] });

function libraryRoutes(): Record<string, Answer> {
  const routes: Record<string, Answer> = {
    "GET /api/prompts": jsonAnswer({ prompts }),
    "GET /api/entries": jsonAnswer({ entries }),
  };
  for (const prompt of prompts) {
    routes[`GET /api/prompts/${prompt.id}/history`] = jsonAnswer({
      versions: [version(prompt, 2, "Two."), version(prompt, 1, "One.")],
    });
    routes[`GET /api/prompts/${prompt.id}/used-by`] = usedBy;
  }
  for (const entry of entries) {
    routes[`GET /api/entries/${entry.id}/history`] = jsonAnswer({
      versions: [version(entry, 2, "Two."), version(entry, 1, "One.")],
    });
    routes[`GET /api/entries/${entry.id}/used-by`] = usedBy;
  }
  return routes;
}

function PromptsScreen() {
  const [kind, setKind] = useState<PromptKind>("article");
  return <PromptsRoute kind={kind} onKind={setKind} />;
}

function EntriesScreen() {
  const [category, setCategory] = useState<EntryCategory>("intro");
  return <EntriesRoute category={category} onCategory={setCategory} />;
}

describe("every Library control has an info button", () => {
  it("on the Library tabs", async () => {
    renderRouted(
      <CommandPaletteProvider>
        <LibraryLayout />
      </CommandPaletteProvider>,
      testDeps({}),
    );
    await screen.findByRole("heading", { level: 1, name: "Library" });
    expectExplained();
  });

  it("on the prompt list of every kind, its detail and its History drawer", async () => {
    const user = userEvent.setup();
    renderRouted(<PromptsScreen />, testDeps(libraryRoutes()));
    for (const prompt of prompts) {
      await user.selectOptions(await screen.findByLabelText("Prompt kind"), prompt.kind);
      await screen.findByRole("region", { name: `${prompt.name} details` });
      expectExplained();
    }
    const last = prompts.at(-1) as Prompt;
    await user.click(screen.getByRole("button", { name: `History of ${last.name}` }));
    const drawer = await screen.findByRole("dialog", { name: `History of ${last.name}` });
    await within(drawer).findByRole("button", { name: "Restore version 1" });
    expectExplained();
  });

  it("in the prompt editor, new and saved, for every kind", async () => {
    for (const prompt of prompts) {
      renderRouted(
        <PromptEditorRoute
          promptId={undefined}
          kind={prompt.kind}
          from={undefined}
          onLeave={vi.fn()}
        />,
        testDeps(libraryRoutes()),
      );
      await screen.findByLabelText("Name");
      expectExplained();
      cleanup();

      renderRouted(
        <PromptEditorRoute
          promptId={prompt.id}
          kind={prompt.kind}
          from={undefined}
          onLeave={vi.fn()}
        />,
        testDeps(libraryRoutes()),
      );
      expect(await screen.findByDisplayValue(prompt.name)).not.toBeNull();
      if (prompt.kind === "image")
        expect(
          screen.getByRole("switch", { name: "Draws photorealistic pictures" }),
        ).not.toBeNull();
      expectExplained();
      cleanup();
    }
  });

  it("on the intros and outros list, and in the entry editor of each category", async () => {
    const user = userEvent.setup();
    renderRouted(<EntriesScreen />, testDeps(libraryRoutes()));
    await screen.findByRole("region", { name: "Cold open details" });
    expectExplained();
    await user.click(screen.getByRole("button", { name: "Outros" }));
    await screen.findByRole("region", { name: "Sign-off details" });
    await user.click(screen.getByRole("button", { name: "History of Sign-off" }));
    await screen.findByRole("dialog", { name: "History of Sign-off" });
    expectExplained();
    cleanup();

    for (const entry of entries) {
      renderRouted(
        <EntryEditorRoute
          entryId={entry.id}
          category={entry.category}
          from={undefined}
          onLeave={vi.fn()}
        />,
        testDeps(libraryRoutes()),
      );
      await screen.findByDisplayValue(entry.name);
      expectExplained();
      cleanup();
    }
    renderRouted(
      <EntryEditorRoute entryId={undefined} category="intro" from={undefined} onLeave={vi.fn()} />,
      testDeps(libraryRoutes()),
    );
    await screen.findByLabelText("Name");
    expectExplained();
  });

  it("in the narration aliases list", async () => {
    const user = userEvent.setup();
    renderRouted(
      <NarrationAliasesRoute />,
      testDeps({
        "GET /api/pronunciations/aliases": jsonAnswer({
          aliases: [{ written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false }],
        }),
      }),
    );
    await screen.findByRole("list", { name: "Narration aliases" });
    await user.click(screen.getByRole("button", { name: "Add alias" }));
    expectExplained();
  });

  const plain = builtInTheme("plain");
  const mine: SavedDocumentTheme = {
    id: "d1",
    name: "Night reading",
    // The closing page and its link on, so every one of its settings is on screen.
    values: {
      ...plain,
      endPage: { ...plain.endPage, enabled: true, link: { text: "Visit", url: null } },
    },
    updatedAt: stamp,
  };
  const themes = () =>
    testDeps({
      "GET /api/document-themes": jsonAnswer({
        builtIns: [{ name: "plain", label: "Plain", values: plain }],
        themes: [mine],
      }),
    });

  it("on the document themes list", async () => {
    renderRouted(<DocumentThemesRoute />, themes());
    await screen.findByRole("region", { name: "Night reading details" });
    expectExplained();
  });

  it("on every setting of the document theme editor, fonts included", async () => {
    renderRouted(
      <DocumentThemeEditorRoute themeId="d1" from={undefined} onLeave={vi.fn()} />,
      themes(),
    );
    await screen.findByDisplayValue("Night reading");
    // Every group's settings, whether or not its section starts open.
    const buttons = document.querySelectorAll("[data-help-id]").length;
    const settings = themeGroups.flatMap((group) => group.fields).length;
    expect(buttons).toBeGreaterThanOrEqual(settings + 2);
    expect(screen.getByLabelText("Link address")).not.toBeNull();
    expect(screen.getByLabelText("Body font")).not.toBeNull();
    expectExplained();
  });

  it("on the templates list and in the Save a setup drawer", async () => {
    const user = userEvent.setup();
    renderRouted(
      <TemplatesRoute onApplied={vi.fn()} />,
      testDeps({
        "GET /api/project-templates": jsonAnswer({
          templates: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Weekly documentary",
              version: 1,
              createdAt: stamp,
              updatedAt: stamp,
            },
          ],
        }),
        "GET /api/channels": jsonAnswer({ channels: [] }),
        "GET /api/drafts": jsonAnswer({ drafts: [] }),
      }),
    );
    await screen.findByRole("list", { name: "Project templates" });
    expectExplained();
    await user.click(screen.getByRole("button", { name: "Save a setup" }));
    await screen.findByLabelText("Saved Play draft");
    expectExplained();
  });
});
