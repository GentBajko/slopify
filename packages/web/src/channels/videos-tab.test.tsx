import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "@/components/kit/button";
import { List, ListRow } from "@/components/kit/list-row";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { rowsAtOnce } from "./bounded-list.js";
import { tickRange } from "./videos-csv-preview.js";
import { VideosTab } from "./videos-tab.js";

afterEach(cleanup);

const id = "00000000-0000-4000-8000-000000000001";
const many = Array.from({ length: 2000 }, (_, n) => ({
  id: `v${String(n)}`,
  title: `Video ${String(n + 1)}${n % 10 === 0 ? " Hypatia" : ""}`,
  createdAt: "a",
}));

describe("Existing videos tab with a large import", () => {
  it("draws the first rows of 2,000 titles, shows more on request and searches them all", async () => {
    const user = userEvent.setup();
    const started = performance.now();
    renderRouted(
      <VideosTab channelId={id} />,
      testDeps({ [`GET /api/channels/${id}/videos`]: jsonAnswer({ videos: many }) }),
    );
    const list = await screen.findByRole("list", { name: "Existing videos" });
    const bounded = performance.now() - started;
    expect(within(list).getAllByRole("listitem")).toHaveLength(rowsAtOnce);
    expect(screen.getByText("1,800 not shown")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show 200 more" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(rowsAtOnce * 2);
    await user.type(screen.getByRole("searchbox", { name: "Search existing videos" }), "hypatia");
    expect(screen.getByText("200 of 2,000 titles match")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Show/u })).toBeNull();

    // The same 2,000 rows drawn at once, for comparison.
    const all = performance.now();
    render(
      <List label="Every row">
        {many.map((video) => (
          <ListRow
            key={video.id}
            lead={<input type="checkbox" aria-label={video.title} />}
            title={video.title}
            actions={<Button size="small">Remove</Button>}
          />
        ))}
      </List>,
    );
    const unbounded = performance.now() - all;
    console.info(
      `2,000 existing videos: first paint with ${String(rowsAtOnce)} rows ${bounded.toFixed(0)} ms (including the load); all 2,000 rows ${unbounded.toFixed(0)} ms`,
    );
  });

  it("brings a removed title back with Undo", async () => {
    const user = userEvent.setup();
    const added: unknown[] = [];
    renderRouted(
      <VideosTab channelId={id} />,
      testDeps({
        [`GET /api/channels/${id}/videos`]: jsonAnswer({
          videos: [{ id: "v1", title: "Hypatia", createdAt: "a" }],
        }),
        [`DELETE /api/channels/${id}/videos/v1`]: () => new Response(null, { status: 204 }),
        [`POST /api/channels/${id}/videos`]: async (request) => {
          added.push(await request.json());
          return jsonAnswer({ added: 1, skipped: 0 }, 201)(request);
        },
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Remove Hypatia" }));
    expect(await screen.findByText("Removed “Hypatia”.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(added).toEqual([{ format: "lines", text: "Hypatia" }]));
  });
});

it("ticks a range between the last title pressed and this one", () => {
  const none = [false, false, false, false, false];
  expect(tickRange(none, 1, 3, true)).toEqual([false, true, true, true, false]);
  expect(tickRange(none, undefined, 2, true)).toEqual([false, false, true, false, false]);
  expect(tickRange([true, true, true], 2, 0, false)).toEqual([false, false, false]);
});
