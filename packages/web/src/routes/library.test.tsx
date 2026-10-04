import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommandPaletteProvider, CommandRegistry } from "@/components/kit/command-palette";
import { renderRouted, testDeps } from "@/test-app";
import { LibraryLayout } from "./library.js";

afterEach(cleanup);

describe("the Library layout", () => {
  it("titles the page and groups its tabs: setups, building blocks, results", async () => {
    renderRouted(
      <CommandPaletteProvider>
        <LibraryLayout />
      </CommandPaletteProvider>,
      testDeps({}),
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Library" })).not.toBeNull();
    const group = (name: string) =>
      within(screen.getByRole("navigation", { name }))
        .getAllByRole("link")
        .map((link) => link.textContent);
    expect(group("Setups")).toEqual(["Templates"]);
    // PDF themes, not "Documents"; aliases named for what they change.
    expect(group("Building blocks")).toEqual([
      "Prompts",
      "Intros & outros",
      "PDF themes",
      "Narration aliases",
    ]);
    expect(group("Results")).toEqual(["A/B results"]);
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
      "New PDF theme",
      "Open prompts",
      "Open intros and outros",
      "Open templates",
      "Open PDF themes",
    ]);
  });
});
