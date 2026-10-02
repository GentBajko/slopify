import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommandPaletteProvider, CommandRegistry } from "@/components/kit/command-palette";
import { renderRouted, testDeps } from "@/test-app";
import { LibraryLayout } from "./library.js";

afterEach(cleanup);

describe("the Library layout", () => {
  it("titles the page and offers its five tabs; schedules and the calendar live elsewhere", async () => {
    renderRouted(
      <CommandPaletteProvider>
        <LibraryLayout />
      </CommandPaletteProvider>,
      testDeps({}),
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Library" })).not.toBeNull();
    const tabs = screen.getByRole("navigation", { name: "Library sections" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Prompts", "Intros & Outros", "Templates", "Documents", "Aliases", "A/B results"]);
  });

  it("registers the Library's frequent actions in the command palette", async () => {
    const registry = new CommandRegistry();
    renderRouted(
      <CommandPaletteProvider registry={registry}>
        <LibraryLayout />
      </CommandPaletteProvider>,
      testDeps({}),
    );

    await screen.findByRole("heading", { level: 1, name: "Library" });
    const library = registry.list().filter((command) => command.group === "Library");
    expect(library.map((command) => command.title)).toEqual([
      "New prompt",
      "New intro or outro",
      "New document theme",
      "Open prompts",
      "Open intros and outros",
      "Open templates",
      "Open document themes",
    ]);
  });
});
