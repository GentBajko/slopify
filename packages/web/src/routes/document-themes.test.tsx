import type { SavedDocumentTheme } from "@app/slices/document/model.js";
import { builtInTheme } from "@app/slices/document/theme.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { DocumentThemesRoute } from "./document-themes.js";

afterEach(cleanup);

const plain = builtInTheme("plain");

const mine: SavedDocumentTheme = {
  id: "d1",
  name: "Night reading",
  values: { ...plain, colors: { ...plain.colors, heading: "#112233" } },
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function deps(themes: readonly SavedDocumentTheme[], extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/document-themes": jsonAnswer({
      builtIns: [{ name: "plain", label: "Plain", values: plain }],
      themes,
    }),
    ...extra,
  });
}

describe("the document themes list", () => {
  it("shows every action of a saved theme on its row, not in a menu", async () => {
    renderRouted(<DocumentThemesRoute />, deps([mine]));

    const actions = await screen.findByRole("group", { name: "Actions for Night reading" });
    expect(
      [...actions.querySelectorAll("a, button")].map((one) => one.getAttribute("aria-label")),
    ).toEqual(["Edit Night reading", "Duplicate Night reading", "Delete Night reading"]);
    expect(screen.queryByRole("button", { name: /More for/u })).toBeNull();
    expect(screen.getByRole("link", { name: "Copy Plain" })).not.toBeNull();
  });

  it("shows the first of your themes beside the list, and a built-in once it is picked", async () => {
    const user = userEvent.setup();
    renderRouted(<DocumentThemesRoute />, deps([mine]));

    const detail = await screen.findByRole("region", { name: "Night reading details" });
    expect(within(detail).getByText("#112233")).not.toBeNull();
    expect(within(detail).getByRole("link", { name: "Edit theme" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Plain" }));
    const builtIn = await screen.findByRole("region", { name: "Plain details" });
    expect(
      within(builtIn).getByText("Built-in themes can't be changed. Copy one to make it yours."),
    ).not.toBeNull();
    expect(within(builtIn).getByRole("link", { name: "Copy theme" })).not.toBeNull();
  });

  it("deletes a saved theme behind a confirmation", async () => {
    const user = userEvent.setup();
    let deleted = false;
    renderRouted(
      <DocumentThemesRoute />,
      deps([mine], {
        "DELETE /api/document-themes/d1": (request) => {
          deleted = true;
          return emptyAnswer()(request);
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Delete Night reading" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Projects that used it keep their own copy of its settings."),
    ).not.toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Delete theme" }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it("says there are none of yours yet, and still lists the built-ins", async () => {
    renderRouted(<DocumentThemesRoute />, deps([]));

    expect(
      await screen.findByText("No themes of your own yet. Copy a built-in below to start one."),
    ).not.toBeNull();
    expect(await screen.findByRole("region", { name: "Plain details" })).not.toBeNull();
  });
});
