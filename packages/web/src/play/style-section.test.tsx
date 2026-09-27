import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { defaultChannelId } from "@/channels/api";
import { jsonAnswer } from "@/test-app";
import { mountSupplied } from "./draft-upload-test-fixture";
import { mountPlay, openRow, openSection } from "./play-test-fixture";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.localStorage?.clear();
});

// The preview renders a moment after the last change. Its timers are faked once Play has
// loaded, so a test moves past the pause at once instead of waiting it out; while they are,
// controls are changed with fireEvent, which needs no timer of its own.
function pausedTimers(): { readonly settle: () => Promise<void> } {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  return {
    settle: async () => {
      await act(() => vi.advanceTimersByTimeAsync(1000));
      vi.useRealTimers();
    },
  };
}

// What the rail's style preview asked the server to render.
function previewBodies(requests: readonly Request[]): Promise<readonly Record<string, unknown>[]> {
  return Promise.all(
    requests
      .filter((request) => request.method === "POST" && request.url.endsWith("/api/style-preview"))
      .map(async (request) => (await request.clone().json()) as Record<string, unknown>),
  );
}

it.each([
  { format: "9:16", position: "top" },
  { format: "16:9", position: "center" },
] as const)(
  "renders the style preview with the $format frame and $position captions",
  async ({ format, position }) => {
    const { requests } = await mountPlay();
    await openRow("Video and style");
    const { settle } = pausedTimers();
    fireEvent.change(screen.getByLabelText("Subtitles", { selector: "select" }), {
      target: { value: "burn-in" },
    });
    fireEvent.click(screen.getByRole("radio", { name: position }));
    fireEvent.click(screen.getByRole("radio", { name: format }));
    const rail = screen.getByRole("complementary", { name: "Review and start" });
    expect(within(rail).getByRole("heading", { name: "Style preview" })).not.toBeNull();
    await settle();
    const last = (await previewBodies(requests)).at(-1);
    expect(last?.format).toBe(format);
    expect(last?.subtitles).toMatchObject({ mode: "burn-in", position });
    // Nothing paid is asked for: the preview renders locally from silence and sample stills.
    expect(requests.some((r) => /alignment|providers\/.+\/speak|projects$/.test(r.url))).toBe(
      false,
    );
  },
);

it("renders again on request, forcing a fresh render of the same settings", async () => {
  const { requests } = await mountPlay({
    "POST /api/style-preview": jsonAnswer({
      hash: "e".repeat(64),
      url: `/api/style-preview/${"e".repeat(64)}.mp4?v=2`,
      cached: false,
      seconds: 6,
    }),
  });
  const rail = screen.getByRole("complementary", { name: "Review and start" });
  await waitFor(async () => expect((await previewBodies(requests)).length).toBeGreaterThan(0), {
    timeout: 3000,
  });
  await userEvent.click(await within(rail).findByRole("button", { name: "Render again" }));
  await waitFor(async () => expect((await previewBodies(requests)).at(-1)?.force).toBe(true));
});

it("draws the preview on the channel cast's picture when there is one", async () => {
  const channel = {
    id: defaultChannelId,
    name: "Lore",
    isDefault: true,
    brand: {},
    seriesBrief: "",
    aiDisclosure: "auto",
    version: 1,
    createdAt: "a",
    updatedAt: "a",
  };
  const { requests } = await mountPlay({
    "GET /api/channels": jsonAnswer({ channels: [{ ...channel, templates: 0, cast: 1 }] }),
    [`GET /api/channels/${defaultChannelId}`]: jsonAnswer({
      channel,
      cast: [
        {
          id: "7a0c1f3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b",
          channelId: defaultChannelId,
          kind: "creature",
          name: "Tiamat",
          aliases: [],
          description: "",
          version: 1,
          images: [
            {
              id: "8b1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
              source: "upload",
              prompt: null,
              state: "ready",
              error: null,
              sha256: "a".repeat(64),
              createdAt: "a",
            },
          ],
          createdAt: "a",
          updatedAt: "a",
        },
      ],
    }),
  });
  await waitFor(
    async () =>
      expect((await previewBodies(requests)).at(-1)?.image).toEqual({
        kind: "picture",
        sha256: "a".repeat(64),
      }),
    { timeout: 3000 },
  );
  const rail = screen.getByRole("complementary", { name: "Review and start" });
  expect(within(rail).getByText(/Drawn on Tiamat's picture/)).not.toBeNull();
});

it("keeps the sample and a raw invalid size, and says what to fix", async () => {
  await mountPlay();
  await openRow("Video and style");
  await userEvent.selectOptions(
    screen.getByLabelText("Subtitles", { selector: "select" }),
    "burn-in",
  );
  await userEvent.clear(screen.getByLabelText("Preview text"));
  await userEvent.type(screen.getByLabelText("Preview text"), "Only a sample");
  await userEvent.clear(screen.getByLabelText("Subtitle font size"));
  expect((screen.getByLabelText("Subtitle font size") as HTMLInputElement).value).toBe("");
  await openSection("Review");
  expect(screen.getByRole("list", { name: "Setup errors" }).textContent).toMatch(/font size/i);
  expect((screen.getByLabelText("Preview text") as HTMLInputElement).value).toBe("Only a sample");
});

it("draws no style preview while the run makes no video", async () => {
  await mountSupplied();
  expect(screen.queryByRole("heading", { name: "Style preview" })).toBeNull();
});
