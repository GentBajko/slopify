import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { ReleaseTimes } from "./release-times";

afterEach(cleanup);

const releases = {
  leadHours: 24,
  items: [
    {
      short: 0,
      title: "One",
      at: "2026-10-10T18:00:00.000Z",
      uploadBy: "2026-10-09T18:00:00.000Z",
      onYoutube: false,
    },
  ],
  free: [{ row: "line-1", longAt: "2026-10-12T18:00:00.000Z" }],
};
const calendar = {
  entries: [{ at: "2026-10-11T18:00:00.000Z", project: { id: "p2", title: "Two | Series" } }],
};

function setup() {
  const calls: string[] = [];
  const deps = testDeps({
    "GET /api/studio/releases/p1": jsonAnswer(releases),
    "GET /api/studio/releases": jsonAnswer(calendar),
    "PUT /api/studio/releases/p1": async (request) => {
      calls.push(`put ${await request.text()}`);
      return jsonAnswer({ releases: [] })(request);
    },
    "POST /api/studio/releases/p1/swap": async (request) => {
      calls.push(`swap ${await request.text()}`);
      return jsonAnswer({})(request);
    },
  });
  renderRouted(<ReleaseTimes projectId="p1" />, deps);
  return calls;
}

describe("ReleaseTimes", () => {
  it("takes a free plan time only after Take this time, not on picking it", async () => {
    const calls = setup();
    const free = await screen.findByLabelText("Take a free time of the posting plan");
    await userEvent.selectOptions(free, "2026-10-12T18:00:00.000Z");
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Take this time" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toContain('"line":"line-1"');
  });

  it("swaps only after Swap and offers Undo, which swaps back", async () => {
    const calls = setup();
    const other = await screen.findByLabelText("Swap release times with another video");
    await waitFor(() => expect(screen.getAllByRole("option", { name: /^Two ·/ })).toHaveLength(1));
    await userEvent.selectOptions(other, "p2");
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Swap" }));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls).toEqual(['swap {"with":"p2"}', 'swap {"with":"p2"}']));
  });
});
