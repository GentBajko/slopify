import { useRouterState } from "@tanstack/react-router";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPaletteProvider } from "@/components/kit/command-palette";
import { SettingsRoute } from "@/routes/settings";
import { type Answer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import type { PatchNotesView } from "./api.js";
import { PatchNotesCommand } from "./popup.js";
import { noteDate } from "./settings-panel.js";

afterEach(cleanup);

const list: PatchNotesView = {
  version: "3.0.0",
  current: "3.0.0",
  due: null,
  notes: [
    { id: "3.0.0", title: "Slopify 3.0.0", version: "3.0.0", date: "2026-09-27" },
    { id: "2.0-to-3.0", title: "Slopify 2.0 to 3.0", range: "2.0.1 to 3.0.0", date: "2026-09-27" },
    { id: "1.0-to-2.0", title: "Slopify 1.0 to 2.0", range: "1.0.1 to 2.0.0", date: "2026-09-25" },
  ],
};

function routes(extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/patch-notes": jsonAnswer(list),
    "GET /api/patch-notes/3.0.0": () =>
      new Response("# Slopify 3.0.0\n\n## Everything that changed\n\n- See below.\n", {
        headers: { "content-type": "text/markdown" },
      }),
    "GET /api/patch-notes/2.0-to-3.0": () =>
      new Response("# Slopify 2.0 to 3.0\n\n## Highlights\n\n- Shorts.\n\n## Fixes\n\n- Fewer.\n", {
        headers: { "content-type": "text/markdown" },
      }),
    ...extra,
  });
}

describe("Settings → Patch notes", () => {
  it("opens the newest notes at the top and folds every older version", async () => {
    const onNote = vi.fn();
    renderRouted(<SettingsRoute section="patch-notes" onNote={onNote} />, routes());
    const rail = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(within(rail).getByRole("button", { name: "Patch notes" })).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "Everything that changed" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Latest version" })).not.toBeNull();
    expect(screen.getByText(/The version you are running\./)).not.toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search the patch notes" })).not.toBeNull();

    const earlier = screen.getByText("Earlier versions (2)").closest("details");
    expect(earlier?.open).toBe(false);
    await userEvent.click(screen.getByText("Earlier versions (2)"));
    expect(earlier?.open).toBe(true);
    const rows = within(screen.getByRole("list", { name: "Earlier versions" })).getAllByRole(
      "listitem",
    );
    expect(rows.map((row) => row.querySelector(".sl-row__title")?.textContent)).toEqual([
      "Slopify 2.0 to 3.0",
      "Slopify 1.0 to 2.0",
    ]);
    expect(rows[0]?.textContent).toContain("Versions 2.0.1 to 3.0.0, released 27 September 2026.");

    await userEvent.click(screen.getByRole("button", { name: "Read Slopify 2.0 to 3.0" }));
    expect(onNote).toHaveBeenCalledWith("2.0-to-3.0");
  });

  it("opens an earlier version on its own in the reading view, with contents and search", async () => {
    const onNote = vi.fn();
    renderRouted(
      <SettingsRoute section="patch-notes" note="2.0-to-3.0" onNote={onNote} />,
      routes(),
    );
    expect(await screen.findByRole("heading", { name: "Highlights" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Everything that changed" })).toBeNull();
    const contents = screen.getByRole("navigation", { name: "Patch notes contents" });
    expect(
      within(contents)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Highlights", "Fixes"]);
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search the patch notes" }),
      "shorts",
    );
    expect(await screen.findByText("1 match")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Back to the latest patch notes" }));
    expect(onNote).toHaveBeenCalledWith(undefined);
  });

  it("says so when a note named in the address is not in this version", async () => {
    renderRouted(<SettingsRoute section="patch-notes" note="9.9.9" />, routes());
    expect((await screen.findByRole("status")).textContent).toContain(
      'There are no patch notes called "9.9.9"',
    );
    expect(await screen.findByRole("heading", { name: "Everything that changed" })).not.toBeNull();
  });

  it("explains a list that did not load", async () => {
    renderRouted(
      <SettingsRoute section="patch-notes" />,
      routes({ "GET /api/patch-notes": problemAnswer("The notes are missing.", 500) }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "The notes are missing. Press Try again",
    );
  });

  it("opens this version's notes from About", async () => {
    const onNote = vi.fn();
    renderRouted(<SettingsRoute section="about" onNote={onNote} />, routes());
    await userEvent.click(
      await screen.findByRole("button", { name: "What's new in this version" }),
    );
    await waitFor(() => {
      expect(onNote).toHaveBeenCalledWith("3.0.0");
    });
  });

  it("writes dates the way the notes do", () => {
    expect(noteDate("2026-09-27")).toBe("27 September 2026");
    expect(noteDate("not a date")).toBe("not a date");
  });
});

function Location() {
  const href = useRouterState({ select: (state) => state.location.href });
  return <output aria-label="Location">{href}</output>;
}

describe("Ctrl+K → Show patch notes", () => {
  it("opens Settings → Patch notes", async () => {
    const user = userEvent.setup();
    renderRouted(
      <CommandPaletteProvider>
        <PatchNotesCommand />
        <Location />
      </CommandPaletteProvider>,
      routes(),
    );
    await screen.findByLabelText("Location");
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Command palette" });
    await user.type(within(dialog).getByRole("combobox"), "patch notes");
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByLabelText("Location").textContent).toBe("/settings?section=patch-notes");
    });
  });
});
