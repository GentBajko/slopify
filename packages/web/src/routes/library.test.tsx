import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  CommandPaletteProvider,
  CommandRegistry,
  matchCommands,
} from "@/components/kit/command-palette";
import { renderRouted, testDeps } from "@/test-app";
import { LibraryLayout } from "./library.js";

afterEach(cleanup);

describe("the layout around Prompts, Templates, PDF looks and Pronunciation", () => {
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
    expect(titles("Prompts")).toEqual(["New prompt", "New intro"]);
    // A new PDF look and the pages that left Library are the shell's, found from anywhere.
    expect(titles("PDF looks")).toEqual([]);
    // Open Prompts and Open Templates are the rail's commands; no second copy here.
    expect(titles("Templates")).toEqual([]);
    expect(titles("Library")).toEqual([]);
    // The empty palette lists what to make; the lists are found by name.
    expect(
      matchCommands(registry.list(), "")
        .filter((command) => command.id.startsWith("library."))
        .map((command) => command.title),
    ).toEqual(["New prompt", "New intro"]);
  });
});
