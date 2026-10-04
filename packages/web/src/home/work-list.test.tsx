import type { ProjectListing } from "@app/slices/admission/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import { type Answer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { WorkList } from "./work-list.js";

afterEach(cleanup);

function ready(id: string, title: string): ProjectListing {
  return {
    id,
    title,
    status: "done",
    progress: 1,
    format: "16:9",
    channelId: "00000000-0000-4000-8000-000000000001",
    uploadedAt: null,
    config: {
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "generate",
        thumbnail: "off",
        video: "generate",
      },
    },
    createdAt: "2026-09-02T19:14:00.000Z",
    updatedAt: "2026-09-02T19:14:00.000Z",
  };
}

function render(list: readonly ProjectListing[], routes: Record<string, Answer>) {
  return renderRouted(
    <ToastProvider>
      <WorkList decisions={[]} failed={[]} ready={list} />
    </ToastProvider>,
    testDeps(routes),
  );
}

function bar(): HTMLElement {
  const found = document.querySelector<HTMLElement>("[data-slot='selection-bar']");
  if (found === null) throw new Error("no selection bar");
  return found;
}

describe("Ready to upload on Home", () => {
  it("marks the ticked videos uploaded together, and Undo puts them back", async () => {
    const user = userEvent.setup();
    const calls: { id: string; uploaded: unknown }[] = [];
    const answer = (id: string) => async (request: Request) => {
      calls.push({ id, uploaded: ((await request.json()) as { uploaded: unknown }).uploaded });
      return jsonAnswer({ uploadedAt: "2026-09-04T10:00:00.000Z" })(request);
    };
    render([ready("p1", "Rope Tricks"), ready("p2", "Knots"), ready("p3", "Sailing")], {
      "PUT /api/projects/p1/uploaded": answer("p1"),
      "PUT /api/projects/p2/uploaded": answer("p2"),
      "PUT /api/projects/p3/uploaded": answer("p3"),
    });
    const go = within(await waitFor(bar)).getByRole("button", { name: "Mark selected uploaded" });
    expect(go.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "Select row: Rope Tricks" }));
    await user.click(screen.getByRole("checkbox", { name: "Select row: Sailing" }));
    expect(within(bar()).getByText("2 of 3 videos ready to upload selected")).not.toBeNull();
    await user.click(go);
    await waitFor(() =>
      expect(calls).toEqual([
        { id: "p1", uploaded: true },
        { id: "p3", uploaded: true },
      ]),
    );
    expect(
      await screen.findByText(/Marked 2 videos uploaded\. They are off Needs you/),
    ).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(calls.slice(2)).toEqual([
        { id: "p1", uploaded: false },
        { id: "p3", uploaded: false },
      ]),
    );
  });

  it("names a video that wasn't marked and how to try again", async () => {
    const user = userEvent.setup();
    render([ready("p1", "Rope Tricks"), ready("p2", "Knots")], {
      "PUT /api/projects/p1/uploaded": jsonAnswer({ uploadedAt: "2026-09-04T10:00:00.000Z" }),
      "PUT /api/projects/p2/uploaded": problemAnswer("The project is gone.", 404),
    });
    await user.click(within(await waitFor(bar)).getByRole("checkbox", { name: "Select all" }));
    await user.click(within(bar()).getByRole("button", { name: "Mark selected uploaded" }));
    expect(
      await screen.findByText(
        /1 video wasn't marked uploaded: "Knots": .*Press the button again\./,
      ),
    ).not.toBeNull();
  });

  it("offers no selection for a single video", async () => {
    render([ready("p1", "Rope Tricks")], {});
    await screen.findByRole("link", { name: "Rope Tricks" });
    expect(document.querySelector("[data-slot='selection-bar']")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
