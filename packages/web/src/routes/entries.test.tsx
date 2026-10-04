import type { Entry } from "@app/slices/library/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { EntryCategory } from "@/api";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { EntriesRoute } from "./entries.js";

afterEach(cleanup);

const coldOpen: Entry = {
  id: "e1",
  category: "intro",
  mode: "text",
  name: "Cold open",
  body: "Today on the channel: {{topic}}.",
  slots: ["topic"],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const written: Entry = {
  id: "e2",
  category: "outro",
  mode: "llm",
  name: "Written sign-off",
  body: "Write a sign-off for an article about {{topic}}.",
  slots: ["topic"],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function deps(entries: readonly Entry[], extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({ "GET /api/entries": jsonAnswer({ entries }), ...extra });
}

// The tab lives in the URL, so router.tsx owns the move; this stands in for it.
function Screen({ start = "intro" as EntryCategory }) {
  const [category, setCategory] = useState<EntryCategory>(start);
  return <EntriesRoute category={category} onCategory={setCategory} />;
}

// A row is found by its title, which is the button that shows it in the detail column.
async function findRow(name: string): Promise<HTMLElement> {
  const title = await screen.findByRole("button", { name });
  const row = title.closest("li");
  if (row === null) throw new Error(`${name} is not in a list row`);
  return row;
}

describe("the intros and outros list", () => {
  it("offers both categories and shows only the one that is on", async () => {
    const user = userEvent.setup();
    renderRouted(<Screen />, deps([coldOpen, written]));

    expect(await findRow("Cold open")).not.toBeNull();
    expect(screen.queryByText("Written sign-off")).toBeNull();

    const categories = screen.getByRole("group", { name: "Entry category" });
    await user.click(within(categories).getByRole("button", { name: "Outros" }));
    expect(await findRow("Written sign-off")).not.toBeNull();
    expect(screen.queryByText("Cold open")).toBeNull();
  });

  it("says each row's mode and keyword count on its meta line", async () => {
    renderRouted(<Screen />, deps([coldOpen]));

    const row = await findRow("Cold open");
    expect(row.querySelector(".sl-row__meta")?.textContent).toMatch(
      /^Text · 1 keyword · updated /u,
    );
  });

  it("shows the first row's text and keywords beside the list, and another row's once it is picked", async () => {
    const user = userEvent.setup();
    const second: Entry = {
      ...coldOpen,
      id: "e3",
      name: "Warm open",
      body: "Hello {{channel}}.",
      slots: ["channel"],
    };
    renderRouted(<Screen />, deps([coldOpen, second]));

    const first = await findRow("Cold open");
    expect(first.getAttribute("aria-current")).toBe("true");
    const detail = screen.getByRole("region", { name: "Cold open details" });
    expect(within(detail).getByText("Today on the channel: {{topic}}.")).not.toBeNull();
    expect(within(detail).getByText("{{topic}}")).not.toBeNull();
    expect(within(detail).getByRole("link", { name: "Edit intro" }).getAttribute("href")).toBe(
      "/entries/e1",
    );

    await user.click(screen.getByRole("button", { name: "Warm open" }));
    const next = await screen.findByRole("region", { name: "Warm open details" });
    expect(within(next).getByText("{{channel}}")).not.toBeNull();
    expect((await findRow("Warm open")).getAttribute("aria-current")).toBe("true");
    expect(first.getAttribute("aria-current")).toBeNull();
  });

  it("narrows the list to the rows whose name or text matches the search", async () => {
    const user = userEvent.setup();
    const second: Entry = { ...coldOpen, id: "e3", name: "Warm open", body: "Hello friends." };
    renderRouted(<Screen />, deps([coldOpen, second]));

    await findRow("Cold open");
    await user.type(screen.getByRole("searchbox", { name: "Search intros and outros" }), "friends");
    expect(screen.queryByRole("button", { name: "Cold open" })).toBeNull();
    expect(await findRow("Warm open")).not.toBeNull();
  });

  it("teaches what an intro is when the category is empty", async () => {
    renderRouted(<Screen />, deps([written]));

    expect(await screen.findByRole("heading", { name: "No intros yet" })).not.toBeNull();
    expect(
      screen.getByText("An intro is narrated before the body in the run's voice."),
    ).not.toBeNull();
  });

  it("teaches what an outro is with the same row, saying where it lands", async () => {
    renderRouted(<Screen start="outro" />, deps([coldOpen]));

    expect(await screen.findByRole("heading", { name: "No outros yet" })).not.toBeNull();
    expect(
      screen.getByText("An outro is narrated after the body in the run's voice."),
    ).not.toBeNull();
  });

  it("points New intro or outro and Edit at the editor, carrying the tab that is on", async () => {
    renderRouted(<Screen />, deps([coldOpen]));

    await findRow("Cold open");
    expect(screen.getByRole("link", { name: "New intro or outro" }).getAttribute("href")).toBe(
      "/entries/new?category=intro",
    );
    expect(screen.getByRole("link", { name: "Edit Cold open" }).getAttribute("href")).toBe(
      "/entries/e1",
    );
  });

  it("shows every row action on the row, Duplicate as a copy opened for editing, and Delete behind a confirmation", async () => {
    const user = userEvent.setup();
    let deleted: string | undefined;
    renderRouted(
      <Screen />,
      deps([coldOpen], {
        "DELETE /api/entries/e1": (request) => {
          deleted = new URL(request.url).pathname;
          return emptyAnswer()(request);
        },
      }),
    );

    await findRow("Cold open");
    const actions = screen.getByRole("group", { name: "Actions for Cold open" });
    // What the row is for stays on it; the occasional actions sit behind More.
    expect(
      [...actions.querySelectorAll("a, button")].map((one) => one.getAttribute("aria-label")),
    ).toEqual(["Edit Cold open", "Use Cold open in Play", "More actions for Cold open"]);
    await user.click(within(actions).getByRole("button", { name: "More actions for Cold open" }));
    expect(
      (await screen.findByRole("menuitem", { name: "Duplicate Cold open" })).getAttribute("href"),
    ).toBe("/entries/new?category=intro&from=e1");

    await user.click(screen.getByRole("menuitem", { name: "Delete Cold open" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText('Delete "Cold open"?')).not.toBeNull();
    // Nothing a past project made is touched by this.
    expect(
      within(dialog).getByText(
        "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.",
      ),
    ).not.toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Delete intro" }));
    await waitFor(() => {
      expect(deleted).toBe("/api/entries/e1");
    });
  });

  it("says what went wrong when the list cannot be read", async () => {
    renderRouted(
      <Screen />,
      deps([], { "GET /api/entries": problemAnswer("The disk is full.", 500) }),
    );

    expect(await screen.findByText("The disk is full.")).not.toBeNull();
    expect(screen.getByText("The intros and outros couldn't be loaded.")).not.toBeNull();
  });
});
