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

function setup(own: Record<string, unknown> = releases) {
  const calls: string[] = [];
  const deps = testDeps({
    "GET /api/studio/releases/p1": jsonAnswer(own),
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
  it("reads and saves the times in the schedule's zone, naming it when it isn't the browser's", async () => {
    const zone =
      Intl.DateTimeFormat().resolvedOptions().timeZone === "Pacific/Kiritimati"
        ? "Pacific/Pago_Pago"
        : "Pacific/Kiritimati";
    const calls = setup({ ...releases, timeZone: zone });
    const input = (await screen.findByLabelText("Long video: release")) as HTMLInputElement;
    // 18:00 UTC is 08:00 the next day on Kiritimati (UTC+14), 07:00 the same day in Pago Pago.
    expect(input.value).toBe(
      zone === "Pacific/Kiritimati" ? "2026-10-11T08:00" : "2026-10-10T07:00",
    );
    expect(screen.getByText(`${zone.split("/")[1]?.replaceAll("_", " ") ?? ""} time`)).toBeTruthy();
    await userEvent.clear(input);
    await userEvent.type(
      input,
      zone === "Pacific/Kiritimati" ? "2026-10-11T09:00" : "2026-10-10T08:00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toContain('"at":"2026-10-10T19:00:00.000Z"');
  });

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
