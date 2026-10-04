import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { EpisodesTab } from "./episodes-tab.js";
import type { EpisodeMemory } from "./memory-api.js";
import { VideosTab } from "./videos-tab.js";

afterEach(cleanup);

const id = "00000000-0000-4000-8000-000000000001";
const memory: EpisodeMemory = {
  id: "m1",
  channelId: id,
  projectId: "p1",
  title: "Cleopatra Awakens",
  summary: "She woke under the mountain.",
  cast: ["Cleopatra"],
  source: "generated",
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
};

function recording(answer: Answer, seen: unknown[]): Answer {
  return async (request) => {
    seen.push(await request.clone().json());
    return answer(request);
  };
}

describe("Episodes tab", () => {
  it("shows the setting and the memories, turns memory off and saves an edited summary", async () => {
    const user = userEvent.setup();
    const toggled: unknown[] = [];
    const edited: unknown[] = [];
    renderRouted(
      <EpisodesTab channelId={id} />,
      testDeps({
        [`GET /api/channels/${id}/episodes`]: jsonAnswer({ enabled: true, memories: [memory] }),
        [`PUT /api/channels/${id}/episodes/setting`]: recording(
          jsonAnswer({ enabled: false, memories: [memory] }),
          toggled,
        ),
        [`PUT /api/channels/${id}/episodes/m1`]: recording(
          jsonAnswer({ ...memory, summary: "She slept.", source: "edited" }),
          edited,
        ),
      }),
    );
    expect(await screen.findByText("Cleopatra Awakens")).not.toBeNull();
    const toggle = screen.getByRole("switch", { name: "Episode memory" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);
    await waitFor(() => expect(toggled).toEqual([{ enabled: false }]));
    await user.click(screen.getByRole("button", { name: "Open the summary of Cleopatra Awakens" }));
    const box = await screen.findByLabelText("Summary");
    await user.clear(box);
    await user.type(box, "She slept.");
    await user.click(screen.getByRole("button", { name: "Save summary" }));
    await waitFor(() => expect(edited).toEqual([{ summary: "She slept." }]));
  });
});

describe("Existing videos tab", () => {
  it("adds pasted titles and reports what was skipped", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    renderRouted(
      <VideosTab channelId={id} />,
      testDeps({
        [`GET /api/channels/${id}/videos`]: jsonAnswer({
          videos: [{ id: "v1", title: "Hypatia", createdAt: "a" }],
        }),
        [`POST /api/channels/${id}/videos`]: recording(
          jsonAnswer({ added: 1, skipped: 1 }, 201),
          sent,
        ),
      }),
    );
    expect(await screen.findByText("Hypatia")).not.toBeNull();
    await user.type(screen.getByLabelText("Paste titles"), "Cleopatra{enter}hypatia");
    await user.click(screen.getByRole("button", { name: "Add titles" }));
    await waitFor(() => expect(sent).toEqual([{ format: "lines", text: "Cleopatra\nhypatia" }]));
    expect(await screen.findByText("Added 1 title; skipped 1 already listed.")).not.toBeNull();
  });

  it("previews a CSV, applies the remembered filter, and saves only the ticked titles", async () => {
    const user = userEvent.setup();
    const previewed: unknown[] = [];
    const sent: unknown[] = [];
    renderRouted(
      <VideosTab channelId={id} />,
      testDeps({
        [`GET /api/channels/${id}/videos`]: jsonAnswer({ videos: [] }),
        [`POST /api/channels/${id}/videos/preview`]: recording(
          jsonAnswer({
            titles: [
              "History: Hypatia",
              "New World Guide",
              "The Finals Tips",
              "history: Cleopatra",
            ],
            filter: "history",
          }),
          previewed,
        ),
        [`POST /api/channels/${id}/videos`]: recording(
          jsonAnswer({ added: 2, skipped: 0 }, 201),
          sent,
        ),
      }),
    );
    await screen.findByText("No existing videos listed");
    const csv = new File(["Video title\nHistory: Hypatia\n"], "studio.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("YouTube Studio CSV file"), csv);
    await waitFor(() =>
      expect(previewed).toEqual([{ format: "csv", text: "Video title\nHistory: Hypatia\n" }]),
    );
    const tick = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name });
    expect((await screen.findByLabelText<HTMLInputElement>("History: Hypatia")).checked).toBe(true);
    expect(tick("New World Guide").checked).toBe(false);
    expect(tick("history: Cleopatra").checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Tick all" }));
    expect(tick("The Finals Tips").checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Untick all" }));
    expect(tick("History: Hypatia").checked).toBe(false);
    const filter = screen.getByLabelText("Keep only titles containing…");
    await user.clear(filter);
    await user.type(filter, "HYPATIA");
    expect(tick("History: Hypatia").checked).toBe(true);
    expect(tick("history: Cleopatra").checked).toBe(false);
    await user.click(tick("New World Guide"));
    await user.click(screen.getByRole("button", { name: "Add 2 ticked titles" }));
    await waitFor(() =>
      expect(sent).toEqual([
        { format: "lines", text: "History: Hypatia\nNew World Guide", filter: "HYPATIA" },
      ]),
    );
    expect(await screen.findByText("Added 2 titles.")).not.toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("Episodes tab search", () => {
  it("finds episodes by title, cast or summary words", async () => {
    const user = userEvent.setup();
    const other: EpisodeMemory = {
      ...memory,
      id: "m2",
      projectId: "p2",
      title: "The Library Burns",
      summary: "Scrolls on fire.",
      cast: ["Hypatia"],
    };
    renderRouted(
      <EpisodesTab channelId={id} />,
      testDeps({
        [`GET /api/channels/${id}/episodes`]: jsonAnswer({
          enabled: true,
          memories: [memory, other],
        }),
      }),
    );
    expect(await screen.findByText("Cleopatra Awakens")).not.toBeNull();
    const search = screen.getByRole("searchbox", { name: "Search episode summaries" });
    await user.type(search, "hypatia fire");
    expect(screen.queryByText("Cleopatra Awakens")).toBeNull();
    expect(screen.getByText("The Library Burns")).not.toBeNull();
    expect(screen.getByText("1 of 2 match")).not.toBeNull();
    await user.clear(search);
    await user.type(search, "dragons");
    expect(screen.getByText("No episode matches")).not.toBeNull();
  });
});
