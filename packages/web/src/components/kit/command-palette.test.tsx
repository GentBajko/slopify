import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ariaKeyShortcuts,
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

  it("matches several words across the title, the context and the keywords, in any order", () => {
    const list = [
      command("i13", "Regenerate image 13", { context: "History: Cleopatra" }),
      command("i3", "Regenerate image 3", { context: "History: Cleopatra" }),
      command("other", "Regenerate image 3", { context: "Knot Tricks" }),
      command("set", "Open settings", { keywords: ["keys"] }),
    ];
    expect(matchCommands(list, "cleopatra regenerate image 3").map((c) => c.id)[0]).toBe("i3");
    expect(matchCommands(list, "3 image cleopatra regen").map((c) => c.id)[0]).toBe("i3");
    expect(matchCommands(list, "cleopatra regenerate image 3").map((c) => c.id)).not.toContain(
      "other",
    );
    expect(matchCommands(list, "open keys").map((c) => c.id)).toEqual(["set"]);
  });

  it("hands a typed number to a numbered command and names the result", () => {
    const run = vi.fn();
    const list = [
      command("img", "Regenerate an image", {
        context: "Cleopatra",
        numbered: (count) => `Regenerate image ${String(count)}`,
        run,
      }),
    ];
    const [found] = matchCommands(list, "regenerate image 7");
    expect(found?.title).toBe("Regenerate image 7");
    void found?.run();
    expect(run).toHaveBeenCalledWith(7);
    expect(matchCommands(list, "regenerate image")[0]?.title).toBe("Regenerate an image");
  });

  it("keeps a search-only command out of an empty palette", () => {
    const list = [command("a", "Open Cleopatra", { searchOnly: true }), command("b", "Open home")];
    expect(matchCommands(list, "").map((c) => c.id)).toEqual(["b"]);
    expect(matchCommands(list, "cleopatra").map((c) => c.id)).toEqual(["a"]);
  });

  it("lists commands about the current screen first when nothing is typed", () => {
    const list = [command("a", "Open settings"), command("b", "Approve", { context: "Cleopatra" })];
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
    context: "Cleopatra",
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
        .map((o) => o.textContent)[0],
    ).toBe("Open settings");
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
    // Only the palette's own command is left.
    expect(
      within(dialog)
        .queryAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Show keyboard shortcuts?"]);
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

function Keyed({
  onSave,
  onNew,
  onHome,
}: {
  readonly onSave: () => void;
  readonly onNew: () => void;
  readonly onHome: () => void;
}) {
  useCommand({ id: "save", title: "Save", group: "Editor", shortcut: ["Ctrl", "S"], run: onSave });
  useCommand({ id: "new", title: "New project", group: "Create", shortcut: ["C"], run: onNew });
  useCommand({ id: "home", title: "Open home", group: "Go to", shortcut: ["G", "H"], run: onHome });
  return <input aria-label="Name" />;
}

describe("keyboard shortcuts", () => {
  const mount = () => {
    const handlers = { onSave: vi.fn(), onNew: vi.fn(), onHome: vi.fn() };
    render(
      <CommandPaletteProvider>
        <Keyed {...handlers} />
      </CommandPaletteProvider>,
    );
    return handlers;
  };

  it("runs a command when its keys are pressed", async () => {
    const user = userEvent.setup();
    const { onSave, onNew, onHome } = mount();
    await user.keyboard("c");
    expect(onNew).toHaveBeenCalledTimes(1);
    await user.keyboard("gh");
    expect(onHome).toHaveBeenCalledTimes(1);
    // "h" alone is not the sequence.
    await user.keyboard("h");
    expect(onHome).toHaveBeenCalledTimes(1);
    await user.keyboard("{Control>}s{/Control}");
    expect(onSave).toHaveBeenCalledTimes(1);
    await user.keyboard("{Meta>}s{/Meta}");
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("leaves plain keys to a field being typed in, but not Ctrl ones", async () => {
    const user = userEvent.setup();
    const { onSave, onNew, onHome } = mount();
    await user.click(screen.getByLabelText("Name"));
    await user.keyboard("cgh");
    expect(onNew).not.toHaveBeenCalled();
    expect(onHome).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("cgh");
    await user.keyboard("{Control>}s{/Control}");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the palette is open", async () => {
    const user = userEvent.setup();
    const { onNew } = mount();
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "Command palette" });
    await user.keyboard("c");
    expect(onNew).not.toHaveBeenCalled();
  });

  it("lists every shortcut on ? and from the palette", async () => {
    const user = userEvent.setup();
    const { onNew } = mount();
    await user.keyboard("?");
    const sheet = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    for (const title of ["Search or run a command", "Save", "New project", "Open home"])
      expect(within(sheet).getByText(title)).not.toBeNull();
    // A modal owns the keyboard: "c" does not start a video behind it.
    await user.keyboard("c");
    expect(onNew).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.keyboard("{Control>}k{/Control}");
    await user.type(await screen.findByRole("combobox"), "keyboard shortcuts{Enter}");
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeNull();
  });

  it("spells a shortcut for aria-keyshortcuts", () => {
    expect(ariaKeyShortcuts(["Ctrl", "Enter"])).toBe("Control+Enter Meta+Enter");
    expect(ariaKeyShortcuts(["Shift", "N"])).toBe("Shift+N");
    expect(ariaKeyShortcuts(["/"])).toBe("/");
    expect(ariaKeyShortcuts(["G", "H"])).toBeUndefined();
  });
});
