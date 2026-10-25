import type { Entry } from "@app/slices/library/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  return testDeps({
    "GET /api/entries": jsonAnswer({ entries }),
    "GET /api/prompts": jsonAnswer({ prompts: [] }),
    ...extra,
  });
}

// The list lives in the URL (router.tsx reads it); a test names it.
function Screen({ start = "intro" as EntryCategory }) {
  return <EntriesRoute category={start} />;
}

// A row is found by its title, which is the button that shows it in the detail column.
async function findRow(name: string): Promise<HTMLElement> {
  const title = await screen.findByRole("button", { name });
  const row = title.closest("li");
  if (row === null) throw new Error(`${name} is not in a list row`);
  return row;
}

describe("the intros and outros list", () => {
  it("sits at the foot of the Prompts kinds as Intros and Outros, showing the one picked", async () => {
    renderRouted(<Screen start="outro" />, deps([coldOpen, written]));

    expect(await findRow("Written sign-off")).not.toBeNull();
    expect(screen.queryByText("Cold open")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Prompts" })).not.toBeNull();
    const kinds = screen.getByRole("navigation", { name: "Kinds of prompt" });
    const outros = within(kinds).getByRole("link", { name: /^Outros/u });
    expect(outros.getAttribute("aria-current")).toBe("page");
    await waitFor(() => expect(outros.textContent).toBe("Outros, 1"));
    expect(
      within(kinds)
        .getByRole("link", { name: /^Intros/u })
        .getAttribute("href"),
    ).toBe("/entries?category=intro");
    expect(
      screen.getByText(
        "Spoken after the video ends, like “Thanks for watching. See you next week.”",
      ),
    ).not.toBeNull();
  });

  it("says on each row what it asks for and how its words start", async () => {
    renderRouted(<Screen />, deps([coldOpen]));

    const row = await findRow("Cold open");
    expect(row.querySelector(".sl-row__meta")?.textContent).toBe(
      "Asks for: topic ·Today on the channel: {{topic}}.",
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
    expect(detail.querySelector("[data-slot=prompt-text]")?.textContent).toBe(
      "Today on the channel: {{topic}}.",
    );
    expect(within(detail).getByText("Intro · Say these exact words")).not.toBeNull();
    expect(
      within(within(detail).getByRole("list", { name: "Keywords" })).getByText("topic"),
    ).not.toBeNull();
    expect(within(detail).getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(
      "/entries/e1",
    );

    await user.click(screen.getByRole("button", { name: "Warm open" }));
    const next = await screen.findByRole("region", { name: "Warm open details" });
    expect(
      within(within(next).getByRole("list", { name: "Keywords" })).getByText("channel"),
    ).not.toBeNull();
    expect((await findRow("Warm open")).getAttribute("aria-current")).toBe("true");
    expect(first.getAttribute("aria-current")).toBeNull();
  });

  it("searches intros and outros both, by name and words, and says each hit's kind", async () => {
    const user = userEvent.setup();
    const second: Entry = { ...coldOpen, id: "e3", name: "Warm open", body: "Hello friends." };
    renderRouted(<Screen />, deps([coldOpen, second, written]));

    await findRow("Cold open");
    const search = screen.getByRole("searchbox", { name: "Search intros and outros" });
    await user.type(search, "friends");
    expect(screen.queryByRole("button", { name: "Cold open" })).toBeNull();
    expect(await findRow("Warm open")).not.toBeNull();

    await user.clear(search);
    await user.type(search, "sign-off");
    const hit = await findRow("Written sign-off");
    expect(hit.querySelector(".sl-row__meta")?.textContent).toMatch(/^Outro · /u);
  });

  it("teaches what an intro is when there is none, with the button that makes the first", async () => {
    renderRouted(<Screen />, deps([written]));

    expect(await screen.findByRole("heading", { name: "No intros yet" })).not.toBeNull();
    expect(
      screen.getAllByText("Spoken before the video starts, like “Welcome back to the channel.”"),
    ).not.toHaveLength(0);
    const news = screen.getAllByRole("link", { name: "New intro" });
    expect(news).toHaveLength(1);
    expect(news[0]?.getAttribute("href")).toBe("/entries/new?category=intro");
  });

  it("teaches what an outro is the same way", async () => {
    renderRouted(<Screen start="outro" />, deps([coldOpen]));

    expect(await screen.findByRole("heading", { name: "No outros yet" })).not.toBeNull();
    expect(screen.getAllByRole("link", { name: "New outro" })).toHaveLength(1);
  });

  it("points New intro and Edit at the editor, carrying the list on show", async () => {
    renderRouted(<Screen />, deps([coldOpen]));

    await findRow("Cold open");
    expect(screen.getByRole("link", { name: "New intro" }).getAttribute("href")).toBe(
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
    ).toEqual(["Edit Cold open", "Make a video with Cold open", "More actions for Cold open"]);
    await user.click(within(actions).getByRole("button", { name: "More actions for Cold open" }));
    expect(
      (await screen.findByRole("menuitem", { name: "Duplicate Cold open" })).getAttribute("href"),
    ).toBe("/entries/new?category=intro&from=e1");

    await user.click(screen.getByRole("menuitem", { name: "Delete Cold open" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText('Delete "Cold open"?')).not.toBeNull();
    // Nothing a past project made is touched by this.
    expect(dialog.textContent).toContain(
      "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.",
    );
    expect(within(dialog).getByRole("link", { name: "Settings → Trash" })).not.toBeNull();

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
