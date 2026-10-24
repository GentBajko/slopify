import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommandPaletteProvider, CommandRegistry } from "@/components/kit/command-palette";
import { renderRouted, testDeps } from "@/test-app";
import { LibraryLayout } from "./library.js";

afterEach(cleanup);

describe("the layout around Prompts, Templates, PDF themes and Pronunciation", () => {
  it("is no page of its own: no Library title and no tab bar over the page", async () => {
    const registry = new CommandRegistry();
    renderRouted(
      <CommandPaletteProvider registry={registry}>
        <LibraryLayout />
      </CommandPaletteProvider>,
      testDeps({}),
    );

    await waitFor(() => expect(registry.list().length).toBeGreaterThan(0));
    expect(screen.queryByRole("heading", { name: "Library" })).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByText("Library")).toBeNull();
  });

  it("registers the frequent actions in the command palette, under the pages they open", async () => {
    const registry = new CommandRegistry();
    renderRouted(
      <CommandPaletteProvider registry={registry}>
        <LibraryLayout />
      </CommandPaletteProvider>,
      testDeps({}),
    );

    await waitFor(() => expect(registry.list().length).toBeGreaterThan(0));
    const titles = (group: string) =>
      registry
        .list()
        .filter((command) => command.group === group)
        .map((command) => command.title);
    expect(titles("Prompts")).toEqual([
      "New prompt",
      "New intro",
      "Open prompts",
      "Open intros and outros",
    ]);
    expect(titles("PDF themes")).toEqual(["New PDF theme", "Open PDF themes"]);
    expect(titles("Templates")).toEqual(["Open templates"]);
    expect(titles("Library")).toEqual([]);
  });
});
