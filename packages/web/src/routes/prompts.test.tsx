import type { Prompt } from "@app/slices/library/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { PromptKind } from "@/api";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { PromptsRoute } from "./prompts.js";

afterEach(cleanup);

const dossier: Prompt = {
  id: "p1",
  kind: "article",
  name: "Documentary dossier",
  body: "Compose a {{minWords}} word dossier on {{topic}}.",
  slots: ["minWords", "topic"],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const oil: Prompt = {
  id: "p2",
  kind: "image",
  name: "Oil painting scenes",
  body: "An oil painting of {{topic}} in the {{era}}.",
  slots: ["topic", "era"],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const card: Prompt = {
  id: "p3",
  kind: "thumbnail",
  name: "Bold title card",
  body: "A bold title card for {{topic}}.",
  slots: ["topic"],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function deps(prompts: readonly Prompt[], extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({ "GET /api/prompts": jsonAnswer({ prompts }), ...extra });
}

// The tab lives in the URL, so router.tsx owns the move; this stands in for it.
function Screen({ start = "article" as PromptKind }) {
  const [kind, setKind] = useState<PromptKind>(start);
  return <PromptsRoute kind={kind} onKind={setKind} />;
}

describe("the prompts list", () => {
  it("offers the three kinds and shows only the one that is on", async () => {
    const user = userEvent.setup();
    renderRouted(<Screen />, deps([dossier, oil, card]));

    expect(await screen.findByText("Documentary dossier")).not.toBeNull();
    expect(screen.queryByText("Oil painting scenes")).toBeNull();
    expect(screen.queryByText("Bold title card")).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Image" }));
    expect(await screen.findByText("Oil painting scenes")).not.toBeNull();
    expect(screen.queryByText("Documentary dossier")).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Thumbnail" }));
    expect(await screen.findByText("Bold title card")).not.toBeNull();
    expect(screen.queryByText("Oil painting scenes")).toBeNull();
  });

  it("offers YouTube Description as its own kind", async () => {
    const user = userEvent.setup();
    const hook: Prompt = {
      id: "p4",
      kind: "description",
      name: "Hooky chapters",
      body: "Hook {{topic}} fans.",
      slots: ["topic"],
      updatedAt: "2026-09-01T10:00:00.000Z",
    };
    renderRouted(<Screen />, deps([dossier, hook]));
    expect(await screen.findByText("Documentary dossier")).not.toBeNull();
    expect(screen.queryByText("Hooky chapters")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "YouTube Description" }));
    expect(await screen.findByText("Hooky chapters")).not.toBeNull();
    expect(screen.queryByText("Documentary dossier")).toBeNull();
  });

  it("shows every detected slot of a row as a chip", async () => {
    renderRouted(<Screen />, deps([dossier]));

    await screen.findByText("Documentary dossier");
    expect(screen.getByText("minWords").getAttribute("data-slot-chip")).toBe("minWords");
    expect(screen.getByText("topic").getAttribute("data-slot-chip")).toBe("topic");
  });

  it("teaches what a prompt is when the kind is empty, with the one action in the toolbar", async () => {
    renderRouted(<Screen start="image" />, deps([dossier]));

    expect(
      await screen.findByText(
        "No image prompts yet. A prompt is text with {{keywords}}; each keyword becomes a field on Play.",
      ),
    ).not.toBeNull();
    expect(screen.getAllByRole("link", { name: "New prompt" })).toHaveLength(1);
  });

  it("points New prompt and the row itself at the editor, carrying the tab that is on", async () => {
    renderRouted(<Screen />, deps([dossier]));

    await screen.findByText("Documentary dossier");
    expect(screen.getByRole("link", { name: "New prompt" }).getAttribute("href")).toBe(
      "/prompts/new?kind=article",
    );
    expect(screen.getByRole("link", { name: "Documentary dossier" }).getAttribute("href")).toBe(
      "/prompts/p1",
    );
  });

  it("shows every row action, Duplicate as a copy opened for editing, and Delete behind a confirmation", async () => {
    const user = userEvent.setup();
    let deleted: string | undefined;
    renderRouted(
      <Screen />,
      deps([dossier], {
        "DELETE /api/prompts/p1": (request) => {
          deleted = new URL(request.url).pathname;
          return emptyAnswer()(request);
        },
      }),
    );

    await screen.findByText("Documentary dossier");
    const actions = screen.getByRole("group", { name: "Actions for Documentary dossier" });
    expect([...actions.querySelectorAll("a, button")].map((one) => one.textContent)).toEqual([
      "Edit",
      "Duplicate",
      "Use in Play",
      "History",
      "Delete",
    ]);
    expect(
      within(actions).getByRole("link", { name: "Edit Documentary dossier" }).getAttribute("href"),
    ).toBe("/prompts/p1");
    expect(
      within(actions)
        .getByRole("link", { name: "Duplicate Documentary dossier" })
        .getAttribute("href"),
    ).toBe("/prompts/new?kind=article&from=p1");

    await user.click(within(actions).getByRole("button", { name: "Delete Documentary dossier" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText('Delete "Documentary dossier"?')).not.toBeNull();
    // Nothing a past project made is touched by this.
    expect(
      within(dialog).getByText(
        "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.",
      ),
    ).not.toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deleted).toBe("/api/prompts/p1");
    });
  });

  it("hands the prompt to Play from Use in Play, and says why it can't while a run starts", async () => {
    const user = userEvent.setup();
    const used: string[] = [];
    const { unmount } = renderRouted(
      <PromptsRoute kind="article" onKind={() => {}} onUseInPlay={(one) => used.push(one.name)} />,
      deps([dossier]),
    );
    await user.click(
      await screen.findByRole("button", { name: "Use Documentary dossier in Play" }),
    );
    expect(used).toEqual(["Documentary dossier"]);
    unmount();

    renderRouted(
      <PromptsRoute
        kind="article"
        onKind={() => {}}
        onUseInPlay={(one) => used.push(one.name)}
        playBlocked="Play is starting a run from its draft."
      />,
      deps([dossier]),
    );
    const blocked = await screen.findByRole("button", { name: "Use Documentary dossier in Play" });
    expect(blocked.hasAttribute("disabled")).toBe(true);
    expect(blocked.getAttribute("title")).toBe("Play is starting a run from its draft.");
  });

  it("opens History with a word diff, restores a version and lists what uses the prompt", async () => {
    const user = userEvent.setup();
    let restored: string | undefined;
    const version = (n: number, body: string, restoredFrom: number | null = null) => ({
      version: n,
      kind: "article",
      mode: null,
      name: "Documentary dossier",
      body,
      author: "you",
      restoredFrom,
      createdAt: "2026-09-01T10:00:00.000Z",
    });
    renderRouted(
      <Screen />,
      deps([dossier], {
        "GET /api/prompts/p1/history": jsonAnswer({
          versions: [version(2, "Compose a long dossier."), version(1, "Compose a short dossier.")],
        }),
        "GET /api/prompts/p1/used-by": jsonAnswer({
          templates: [{ id: "t1", name: "Weekly essay" }],
          schedules: [{ id: "s1", name: "Mondays", status: "paused" }],
          projects: [{ id: "x1", title: "Cats", revisions: 2, totalRevisions: 3, current: true }],
        }),
        "POST /api/prompts/p1/history/1/restore": (request) => {
          restored = new URL(request.url).pathname;
          return jsonAnswer(dossier)(request);
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: "History of Documentary dossier" }));
    const drawer = await screen.findByRole("dialog", { name: "History of Documentary dossier" });
    expect(await within(drawer).findByText("short")).not.toBeNull();
    expect(within(drawer).getByText("short").tagName).toBe("DEL");
    expect(within(drawer).getByText("long").tagName).toBe("INS");
    expect(within(drawer).getByText("1 word added, 1 removed.")).not.toBeNull();
    expect(
      await within(drawer).findByRole("heading", {
        name: "Used by 1 template, 1 schedule, 1 project",
      }),
    ).not.toBeNull();
    expect(within(drawer).getByRole("link", { name: "Cats" }).getAttribute("href")).toBe(
      "/projects/x1",
    );
    expect(within(drawer).getByText(/2 of 3 revisions, including the current one/u)).not.toBeNull();

    await user.click(within(drawer).getByRole("button", { name: "Restore version 1" }));
    await waitFor(() => {
      expect(restored).toBe("/api/prompts/p1/history/1/restore");
    });
    expect(await within(drawer).findByText("Restored version 1 as a new version.")).not.toBeNull();
  });

  it("says what went wrong when the list cannot be read", async () => {
    renderRouted(
      <Screen />,
      deps([], { "GET /api/prompts": problemAnswer("The disk is full.", 500) }),
    );

    expect(await screen.findByText("The disk is full.")).not.toBeNull();
  });
});
