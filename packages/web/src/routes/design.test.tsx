import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommandPaletteProvider } from "@/components/kit/command-palette";
import { DesignRoute } from "./design.js";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("the design gallery", () => {
  it("renders every specimen", () => {
    render(
      <CommandPaletteProvider>
        <DesignRoute />
      </CommandPaletteProvider>,
    );
    for (const name of [
      "Buttons",
      "Fields",
      "Tabs",
      "Media",
      "Workspace",
      "Callouts",
      "List and detail",
      "Overlays",
      "Reading view",
    ]) {
      expect(screen.getByRole("heading", { name, level: 2 })).not.toBeNull();
    }
  });
});
