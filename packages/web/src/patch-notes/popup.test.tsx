import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Answer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { WhatsNewTour } from "@/whats-new/tour";
import type { PatchNotesView } from "./api.js";
import { PatchNotesPopup } from "./popup.js";

afterEach(cleanup);

const noticeSeen = jsonAnswer({ seen: true, appVersion: "3.1.0" });
const markdown = "# Slopify 3.1.0\n\n## Highlights\n\n- Shorter waits.\n";

function view(due: string | null): PatchNotesView {
  return {
    version: "3.1.0",
    current: "3.1.0",
    due,
    notes: [
      { id: "3.1.0", title: "Slopify 3.1.0", version: "3.1.0", date: "2026-10-10" },
      { id: "3.0.0", title: "Slopify 3.0.0", version: "3.0.0", date: "2026-09-27" },
    ],
  };
}

function markdownAnswer(text: string): Answer {
  return () => new Response(text, { headers: { "content-type": "text/markdown" } });
}

function routes(extra: Readonly<Record<string, Answer>> = {}): Record<string, Answer> {
  return {
    "GET /api/telemetry/notice": noticeSeen,
    "GET /api/whats-new": jsonAnswer({ show: false, major: 3 }),
    "GET /api/patch-notes": jsonAnswer(view("3.1.0")),
    "GET /api/patch-notes/3.1.0": markdownAnswer(markdown),
    "POST /api/patch-notes/seen": jsonAnswer({ seen: true }),
    ...extra,
  };
}

const title = "What's new in 3.1.0";

describe("the patch notes that open after an update", () => {
  it("opens the running version's notes in the reading view, and closing records it once", async () => {
    const seen = vi.fn(jsonAnswer({ seen: true }));
    renderRouted(<PatchNotesPopup />, testDeps(routes({ "POST /api/patch-notes/seen": seen })));

    expect(await screen.findByRole("dialog", { name: title })).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "Highlights" })).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Patch notes contents" })).not.toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search the patch notes" })).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Close notes" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: title })).toBeNull();
    });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("links to every patch note in Settings", async () => {
    renderRouted(<PatchNotesPopup />, testDeps(routes()));
    const link = await screen.findByRole("link", { name: "See all patch notes" });
    expect(link.getAttribute("href")).toBe("/settings?section=patch-notes");
  });

  it("opens nothing when none is due, such as on a fresh install", async () => {
    const asked = vi.fn(jsonAnswer(view(null)));
    renderRouted(<PatchNotesPopup />, testDeps(routes({ "GET /api/patch-notes": asked })));
    await waitFor(() => {
      expect(asked).toHaveBeenCalled();
    });
    expect(screen.queryByRole("dialog", { name: title })).toBeNull();
  });

  it("waits for the first-run notice before asking", async () => {
    const asked = vi.fn(jsonAnswer(view("3.1.0")));
    renderRouted(
      <PatchNotesPopup />,
      testDeps(
        routes({
          "GET /api/telemetry/notice": jsonAnswer({ seen: false, appVersion: "3.1.0" }),
          "GET /api/patch-notes": asked,
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays open and says so when closing it could not be saved", async () => {
    renderRouted(
      <PatchNotesPopup />,
      testDeps(
        routes({ "POST /api/patch-notes/seen": problemAnswer("The database is busy.", 503) }),
      ),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Close notes" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not save that you closed these patch notes",
    );
    expect(screen.getByRole("dialog", { name: title })).not.toBeNull();
  });
});

describe("on a major update", () => {
  const majorRoutes = (extra: Readonly<Record<string, Answer>> = {}) =>
    routes({
      "GET /api/telemetry/notice": jsonAnswer({ seen: true, appVersion: "3.0.0" }),
      "GET /api/whats-new": jsonAnswer({ show: true, major: 3 }),
      "GET /api/patch-notes": jsonAnswer({ ...view("3.0.0"), version: "3.0.0", current: "3.0.0" }),
      ...extra,
    });

  it("shows the What's new tour first and never both at once", async () => {
    const asked = vi.fn(jsonAnswer({ ...view("3.0.0"), version: "3.0.0", current: "3.0.0" }));
    renderRouted(
      <>
        <WhatsNewTour />
        <PatchNotesPopup />
      </>,
      testDeps(majorRoutes({ "GET /api/patch-notes": asked })),
    );
    expect(await screen.findByRole("dialog", { name: "What's new in 3.0" })).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("links the tour's last step to this version's patch notes, and closing it opens nothing more", async () => {
    let tourDue = true;
    const noteSeen = vi.fn(jsonAnswer({ seen: true }));
    renderRouted(
      <>
        <WhatsNewTour />
        <PatchNotesPopup />
      </>,
      testDeps(
        majorRoutes({
          "GET /api/whats-new": () => jsonAnswer({ show: tourDue, major: 3 })(new Request("x:")),
          "POST /api/whats-new/seen": () => {
            tourDue = false;
            return jsonAnswer({ show: false, major: 3 })(new Request("x:"));
          },
          // What the server answers once closing the tour recorded the notes as seen.
          "GET /api/patch-notes": jsonAnswer({ ...view(null), version: "3.0.0", current: "3.0.0" }),
          "POST /api/patch-notes/seen": noteSeen,
        }),
      ),
    );

    await screen.findByRole("dialog", { name: "What's new in 3.0" });
    expect(screen.queryByRole("link", { name: "Read the full patch notes" })).toBeNull();
    while (screen.queryByRole("button", { name: "Finish tour" }) === null)
      await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const link = screen.getByRole("link", { name: "Read the full patch notes" });
    await waitFor(() => {
      expect(link.getAttribute("href")).toBe("/settings?section=patch-notes&note=3.0.0");
    });

    await userEvent.click(screen.getByRole("button", { name: "Finish tour" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "What's new in 3.0" })).toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(noteSeen).not.toHaveBeenCalled();
  });
});
