import type { AudioPreview } from "@app/kernel/audio-preview.js";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { LiveAudio } from "./live-audio.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const first: AudioPreview = {
  id: "7c38c00b-6272-4197-80d6-e419337a8ab3",
  label: "Body part 1 of 2",
  state: "streaming",
  bytes: 4000,
};

it("offers separate native players without autoplay or extra generation calls", async () => {
  const get = vi.fn(
    jsonAnswer({
      previews: [first, { ...first, id: "d419a8dc-2b45-4334-8a06-a66d9c236987", label: "Intro" }],
    }),
  );
  const deps = testDeps({ "GET /api/projects/p1/audio-preview": get });
  const { container } = renderApp(<LiveAudio projectId="p1" />, deps);
  const body = await screen.findByLabelText("Live Body part 1 of 2 narration");
  expect(screen.getByLabelText("Live Intro narration")).not.toBeNull();
  expect(body.getAttribute("preload")).toBe("none");
  expect(body.hasAttribute("autoplay")).toBe(false);
  expect(body.getAttribute("src")).toContain(`/api/projects/p1/audio-preview/${first.id}`);
  expect(container.querySelectorAll("audio")).toHaveLength(2);
  expect(get.mock.calls.every(([request]) => request.method === "GET")).toBe(true);
});

it("polls for incoming bytes, preserves the active player, and stops a replaced retry", async () => {
  let current = { ...first, bytes: 0 };
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const get = vi.fn(() => jsonAnswer({ previews: [current] })(new Request("http://slopify.test")));
  const { unmount } = renderApp(
    <LiveAudio projectId="p1" />,
    testDeps({ "GET /api/projects/p1/audio-preview": get }),
  );
  await screen.findByText("Waiting for audio…");
  current = { ...first };
  const player = await screen.findByLabelText(
    "Live Body part 1 of 2 narration",
    {},
    { timeout: 2500 },
  );
  current = { ...first, bytes: 8000 };
  const reads = get.mock.calls.length;
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(reads), { timeout: 2500 });
  expect(screen.getByLabelText("Live Body part 1 of 2 narration")).toBe(player);
  expect(pause).not.toHaveBeenCalled();
  current = { ...first, id: "d419a8dc-2b45-4334-8a06-a66d9c236987" };
  await waitFor(
    () => expect(screen.getByLabelText("Live Body part 1 of 2 narration")).not.toBe(player),
    { timeout: 2500 },
  );
  expect(pause).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledTimes(1);
  unmount();
  expect(pause).toHaveBeenCalledTimes(2);
});

it("removes interrupted audio and handles browser buffering errors without generation actions", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  renderApp(
    <LiveAudio projectId="p1" />,
    testDeps({ "GET /api/projects/p1/audio-preview": jsonAnswer({ previews: [first] }) }),
  );
  const player = await screen.findByLabelText("Live Body part 1 of 2 narration");
  act(() => {
    fireEvent.error(player);
  });
  expect(screen.queryByLabelText("Live Body part 1 of 2 narration")).toBeNull();
  expect(screen.getByText(/finished narration will be available/)).not.toBeNull();
});

it("keeps a failed preview lookup separate from final narration availability", async () => {
  renderApp(
    <LiveAudio projectId="p1" />,
    testDeps({ "GET /api/projects/p1/audio-preview": problemAnswer("unavailable", 503) }),
  );
  expect(await screen.findByText(/Live preview is temporarily unavailable/)).not.toBeNull();
});
