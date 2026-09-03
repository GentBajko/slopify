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

  it("shows every detected slot of a row as a chip", async () => {
    renderRouted(<Screen />, deps([dossier]));

    await screen.findByText("Documentary dossier");
    expect(screen.getByText("minWords").getAttribute("data-slot-chip")).toBe("minWords");
    expect(screen.getByText("topic").getAttribute("data-slot-chip")).toBe("topic");
  });

  it("teaches what a prompt is when the kind is empty, and repeats the one action", async () => {
    renderRouted(<Screen start="image" />, deps([dossier]));

    expect(
      await screen.findByText(
        "No image prompts yet. A prompt is text with {{keywords}}; each keyword becomes a field on Play.",
      ),
    ).not.toBeNull();
    expect(screen.getAllByRole("link", { name: "New prompt" })).toHaveLength(2);
  });

  it("points New prompt and Edit at the editor, carrying the tab that is on", async () => {
    renderRouted(<Screen />, deps([dossier]));

    await screen.findByText("Documentary dossier");
    expect(screen.getByRole("link", { name: "New prompt" }).getAttribute("href")).toBe(
      "/prompts/new?kind=article",
    );
    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe("/prompts/p1");
  });

  it("offers Duplicate as a copy opened for editing, and Delete behind a confirmation", async () => {
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
    await user.click(screen.getByRole("button", { name: "More for Documentary dossier" }));

    expect(screen.getByRole("menuitem", { name: "Duplicate" }).getAttribute("href")).toBe(
      "/prompts/new?kind=article&from=p1",
    );

    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText('Delete "Documentary dossier"?')).not.toBeNull();
    // Nothing a past project made is touched by this.
    expect(within(dialog).getByText("Projects that used it keep their text.")).not.toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deleted).toBe("/api/prompts/p1");
    });
  });

  it("says what went wrong when the list cannot be read", async () => {
    renderRouted(
      <Screen />,
      deps([], { "GET /api/prompts": problemAnswer("The disk is full.", 500) }),
    );

    expect(await screen.findByText("The disk is full.")).not.toBeNull();
  });
});
