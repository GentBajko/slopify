import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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
      at: "2036-10-10T18:00:00.000Z",
      uploadBy: "2036-10-09T18:00:00.000Z",
      onYoutube: false,
    },
    { short: 1, title: "One, short", at: null, uploadBy: null, onYoutube: false },
  ],
  free: [{ row: "line-1", longAt: "2036-10-12T18:00:00.000Z" }],
};
const calendar = {
  entries: [{ at: "2036-10-11T18:00:00.000Z", project: { id: "p2", title: "Two | Series" } }],
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
  it("says what a release is and where each one stands, in the same names as the links", async () => {
    setup();
    expect(await screen.findByText(/The day each one goes public on YouTube/u)).not.toBeNull();
    expect(screen.getByText(/you set it in YouTube Studio's Visibility step/u)).not.toBeNull();
    expect(screen.getByLabelText("Video release date")).not.toBeNull();
    expect(screen.getByLabelText("Short 1 release date")).not.toBeNull();
    expect(screen.getByText(/^Goes public .* · upload by /u)).not.toBeNull();
    expect(screen.getByText("No date yet")).not.toBeNull();
    // Only a row with a date can be cleared.
    expect(screen.getAllByRole("button", { name: "Clear the date" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Calendar → Releases" }).getAttribute("href")).toBe(
      "/calendar?tab=releases",
    );
  });

  it("saves a date when its box is left, in the schedule's zone, and Undo puts the old one back", async () => {
    const zone =
      Intl.DateTimeFormat().resolvedOptions().timeZone === "Pacific/Kiritimati"
        ? "Pacific/Pago_Pago"
        : "Pacific/Kiritimati";
    const calls = setup({ ...releases, timeZone: zone });
    const input = (await screen.findByLabelText("Video release date")) as HTMLInputElement;
    // 18:00 UTC is 08:00 the next day on Kiritimati (UTC+14), 07:00 the same day in Pago Pago.
    expect(input.value).toBe(
      zone === "Pacific/Kiritimati" ? "2036-10-11T08:00" : "2036-10-10T07:00",
    );
    expect(screen.getByText(`${zone.split("/")[1]?.replaceAll("_", " ") ?? ""} time`)).toBeTruthy();
    fireEvent.change(input, {
      target: { value: zone === "Pacific/Kiritimati" ? "2036-10-11T09:00" : "2036-10-10T08:00" },
    });
    // Typing alone saves nothing; leaving the box does.
    expect(calls).toEqual([]);
    fireEvent.blur(input);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toContain('"at":"2036-10-10T19:00:00.000Z"');
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(await screen.findByText(/^Saved: the video goes public /u)).not.toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toContain('"at":"2036-10-10T18:00:00.000Z"');
  });

  it("leaves a half-typed date as it was instead of clearing it", async () => {
    const calls = setup();
    const input = (await screen.findByLabelText("Video release date")) as HTMLInputElement;
    // A browser reports a date-time box it can't read yet as empty.
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Clear the date" }));
    await waitFor(() => expect(calls).toEqual(['put {"short":0,"at":null}']));
  });

  // A day typed or picked without a time: the browser reports the box as empty (badInput). The
  // line under it asks for the time rather than saying "No date yet" while the box shows a day.
  it("asks for the time when a box is left with a day but no time", async () => {
    const calls = setup();
    const input = (await screen.findByLabelText("Short 1 release date")) as HTMLInputElement;
    Object.defineProperty(input, "validity", {
      configurable: true,
      get: () => ({ badInput: true }),
    });
    fireEvent.blur(input);
    expect(calls).toEqual([]);
    expect(screen.getByText("Add a time too: the date is saved once it has one.")).not.toBeNull();
    expect(screen.queryByText("No date yet")).toBeNull();
    // With the time added, the whole date saves and the line says so.
    Object.defineProperty(input, "validity", {
      configurable: true,
      get: () => ({ badInput: false }),
    });
    fireEvent.change(input, { target: { value: "2036-11-05T09:00" } });
    expect(screen.queryByText(/^Add a time too/u)).toBeNull();
    fireEvent.blur(input);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toContain('"short":1');
  });

  it("takes a free plan time only after Take this time, not on picking it", async () => {
    const calls = setup();
    await userEvent.click(await screen.findByText("Posting plan"));
    const free = screen.getByLabelText("Free time in the posting plan");
    await userEvent.selectOptions(free, "2036-10-12T18:00:00.000Z");
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Take this time" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toContain('"line":"line-1"');
  });

  it("swaps only after Swap and offers Undo, which swaps back", async () => {
    const calls = setup();
    await userEvent.click(await screen.findByText("Posting plan"));
    const other = screen.getByLabelText("Swap release dates with another video");
    await waitFor(() => expect(screen.getAllByRole("option", { name: /^Two ·/ })).toHaveLength(1));
    await userEvent.selectOptions(other, "p2");
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Swap" }));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls).toEqual(['swap {"with":"p2"}', 'swap {"with":"p2"}']));
  });

  it("says when an upload is late, and when it is uploaded", async () => {
    setup({
      ...releases,
      items: [
        {
          short: 0,
          title: "One",
          at: "2026-01-02T18:00:00.000Z",
          uploadBy: "2026-01-01T18:00:00.000Z",
          onYoutube: false,
        },
        {
          short: 1,
          title: "One, short",
          at: "2026-01-03T18:00:00.000Z",
          uploadBy: "2026-01-02T18:00:00.000Z",
          onYoutube: true,
        },
      ],
    });
    expect(await screen.findByText("Late")).not.toBeNull();
    expect(screen.getByText(/Upload it now, or pick a later date\./u)).not.toBeNull();
    expect(screen.getByText("Uploaded")).not.toBeNull();
  });
});
