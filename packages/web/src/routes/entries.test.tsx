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

describe("the intros and outros list", () => {
  it("offers both categories and shows only the one that is on", async () => {
    const user = userEvent.setup();
    renderRouted(<Screen />, deps([coldOpen, written]));

    expect(await screen.findByText("Cold open")).not.toBeNull();
    expect(screen.queryByText("Written sign-off")).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Outro" }));
    expect(await screen.findByText("Written sign-off")).not.toBeNull();
    expect(screen.queryByText("Cold open")).toBeNull();
  });

  it("marks each row with its mode and its detected slots", async () => {
    renderRouted(<Screen />, deps([coldOpen]));

    await screen.findByText("Cold open");
    expect(screen.getByText("Text").getAttribute("data-entry-mode")).toBe("text");
    expect(screen.getByText("topic").getAttribute("data-slot-chip")).toBe("topic");
  });

  it("teaches what an intro is when the category is empty", async () => {
    renderRouted(<Screen />, deps([written]));

    expect(
      await screen.findByText(
        "No intros yet. An intro is narrated before the body in the run's voice.",
      ),
    ).not.toBeNull();
  });

  it("teaches what an outro is with the same row, saying where it lands", async () => {
    renderRouted(<Screen start="outro" />, deps([coldOpen]));

    expect(
      await screen.findByText(
        "No outros yet. An outro is narrated after the body in the run's voice.",
      ),
    ).not.toBeNull();
  });

  it("points New entry and Edit at the editor, carrying the tab that is on", async () => {
    renderRouted(<Screen />, deps([coldOpen]));

    await screen.findByText("Cold open");
    expect(screen.getByRole("link", { name: "New entry" }).getAttribute("href")).toBe(
      "/entries/new?category=intro",
    );
    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe("/entries/e1");
  });

  it("offers Duplicate as a copy opened for editing, and Delete behind a confirmation", async () => {
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

    await screen.findByText("Cold open");
    await user.click(screen.getByRole("button", { name: "More for Cold open" }));

    expect(screen.getByRole("menuitem", { name: "Duplicate" }).getAttribute("href")).toBe(
      "/entries/new?category=intro&from=e1",
    );

    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText('Delete "Cold open"?')).not.toBeNull();
    // Nothing a past project made is touched by this.
    expect(within(dialog).getByText("Projects that used it keep their text.")).not.toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
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
  });
});
