import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Command,
  CommandPaletteProvider,
  CommandRegistry,
  fuzzyScore,
  matchCommands,
  useCommand,
} from "./command-palette.js";

afterEach(() => {
  cleanup();
});

const command = (id: string, title: string, extra: Partial<Command> = {}): Command => ({
  id,
  title,
  group: "Go to",
  run: () => {},
  ...extra,
});

describe("fuzzy matching", () => {
  it("matches letters in order, not necessarily together", () => {
    expect(fuzzyScore("opst", "Open settings")).not.toBeNull();
    expect(fuzzyScore("tso", "Open settings")).toBeNull();
    expect(fuzzyScore("", "Anything")).toBe(0);
  });

  it("ranks a prefix above a scattered match, and a title above a keyword", () => {
    const list = [
      command("a", "Rename the project", { keywords: ["settings"] }),
      command("b", "Open settings"),
      command("c", "Reset the timings"),
    ];
    expect(matchCommands(list, "set").map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(matchCommands(list, "zzz")).toEqual([]);
  });

  it("lists commands about the current screen first when nothing is typed", () => {
    const list = [command("a", "Open settings"), command("b", "Approve", { context: "Tiamat" })];
    expect(matchCommands(list, "").map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("the registry", () => {
  it("adds and removes a command, and ignores a stale unregister", () => {
    const registry = new CommandRegistry();
    const first = registry.register(command("x", "One"));
    const second = registry.register(command("x", "Two"));
    first();
    expect(registry.list().map((c) => c.title)).toEqual(["Two"]);
    second();
    expect(registry.list()).toEqual([]);
  });
});

function Screen({ onApprove }: { readonly onApprove: () => void }) {
  useCommand({
    id: "project.approve",
    title: "Approve and render",
    group: "This project",
    context: "Tiamat",
    run: onApprove,
  });
  useCommand({
    id: "nav.settings",
    title: "Open settings",
    group: "Go to",
    keywords: ["keys"],
    run: () => {},
  });
  useCommand({ id: "nav.library", title: "Open library", group: "Go to", run: () => {} });
  return <p>Screen</p>;
}

describe("the command palette", () => {
  it("opens on Ctrl+K, filters as you type, and runs the highlighted command on Enter", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <CommandPaletteProvider>
        <Screen onApprove={onApprove} />
      </CommandPaletteProvider>,
    );
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Command palette" });
    const input = within(dialog).getByRole("combobox", { name: "Search or run a command" });
    await waitFor(() => expect(document.activeElement).toBe(input));
    // Nothing typed: the screen's own command comes first and is highlighted.
    const options = within(dialog).getAllByRole("option");
    expect(options[0]?.textContent).toContain("Approve and render");
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]?.id);

    await user.type(input, "keys");
    expect(
      within(dialog)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Open settings"]);
    await user.clear(input);
    await user.type(input, "open");
    expect(within(dialog).getAllByRole("option")).toHaveLength(2);
    await user.clear(input);
    await user.keyboard("{ArrowDown}{ArrowUp}{ArrowUp}");
    // Up from the first wraps to the last.
    const last = within(dialog).getAllByRole("option").at(-1);
    expect(last?.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Home}{Enter}");
    expect(onApprove).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says when nothing matches and closes on Esc", async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteProvider>
        <Screen onApprove={() => {}} />
      </CommandPaletteProvider>,
    );
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("combobox"), "qqq");
    expect(within(dialog).getByText(/Nothing matches "qqq"/)).not.toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("drops a screen's commands when the screen unmounts", async () => {
    const user = userEvent.setup();
    function Toggle() {
      const [shown, setShown] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setShown(false)}>
            Leave
          </button>
          {shown ? <Screen onApprove={() => {}} /> : null}
        </>
      );
    }
    render(
      <CommandPaletteProvider>
        <Toggle />
      </CommandPaletteProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Leave" }));
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryAllByRole("option")).toHaveLength(0);
    expect(within(dialog).getByText("No commands here yet.")).not.toBeNull();
  });

  it("clicks run a command too", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <CommandPaletteProvider>
        <Screen onApprove={onApprove} />
      </CommandPaletteProvider>,
    );
    await user.keyboard("{Control>}k{/Control}");
    await user.click(await screen.findByRole("option", { name: /Approve and render/ }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
