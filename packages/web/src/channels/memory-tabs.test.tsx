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
  title: "Tiamat Awakens",
  summary: "She woke under the mountain.",
  cast: ["Tiamat"],
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
    expect(await screen.findByText("Tiamat Awakens")).not.toBeNull();
    const toggle = screen.getByRole("switch", { name: "Episode memory" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);
    await waitFor(() => expect(toggled).toEqual([{ enabled: false }]));
    await user.click(screen.getByRole("button", { name: "Open the summary of Tiamat Awakens" }));
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
          videos: [{ id: "v1", title: "Vecna", createdAt: "a" }],
        }),
        [`POST /api/channels/${id}/videos`]: recording(
          jsonAnswer({ added: 1, skipped: 1 }, 201),
          sent,
        ),
      }),
    );
    expect(await screen.findByText("Vecna")).not.toBeNull();
    await user.type(screen.getByLabelText("Paste titles"), "Tiamat{enter}vecna");
    await user.click(screen.getByRole("button", { name: "Add titles" }));
    await waitFor(() => expect(sent).toEqual([{ format: "lines", text: "Tiamat\nvecna" }]));
    expect(await screen.findByText("Added 1 title; skipped 1 already listed.")).not.toBeNull();
  });
});
