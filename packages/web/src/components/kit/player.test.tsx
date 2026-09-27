import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { stubMedia } from "./media-stub.js";
import { Player, playerTime } from "./player.js";

afterEach(cleanup);

function mount(props: Partial<Parameters<typeof Player>[0]> = {}) {
  render(<Player src="/v.mp4" poster="/poster.png" label="Rope Tricks, final video" {...props} />);
  const video = screen.getByLabelText("Rope Tricks, final video", { selector: "video" });
  if (!(video instanceof HTMLVideoElement)) throw new Error("Expected a video element");
  return { video, media: stubMedia(video) };
}

const seek = () => screen.getByRole("slider", { name: "Seek" });

it("writes times the way YouTube does", () => {
  expect(playerTime(7)).toBe("0:07");
  expect(playerTime(760)).toBe("12:40");
  expect(playerTime(7451)).toBe("2:04:11");
  expect(playerTime(Number.NaN)).toBe("0:00");
});

it("shows the poster and a big play key, with its own controls instead of the browser's", async () => {
  const { video, media } = mount();
  expect(video.getAttribute("poster")).toBe("/poster.png");
  expect(video.hasAttribute("controls")).toBe(false);
  const bar = screen.getByRole("group", { name: "Rope Tricks, final video controls" });
  expect(bar.querySelector(".sl-player__time")?.textContent).toBe("0:00 / 2:00");
  await userEvent.click(screen.getByRole("button", { name: "Play Rope Tricks, final video" }));
  expect(media.play).toHaveBeenCalledTimes(1);
  // Started: the big key is gone and the bar's key pauses.
  expect(screen.queryByRole("button", { name: "Play Rope Tricks, final video" })).toBeNull();
  await userEvent.click(within(bar).getByRole("button", { name: "Pause" }));
  expect(media.pause).toHaveBeenCalledTimes(1);
  expect(within(bar).getByRole("button", { name: "Play" })).not.toBeNull();
});

it("seeks with the slider's keys and says where it is in words", () => {
  const { media } = mount();
  const slider = seek();
  expect(slider.getAttribute("aria-valuetext")).toBe("0:00 of 2:00");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(media.time()).toBe(5);
  expect(slider.getAttribute("aria-valuetext")).toBe("0:05 of 2:00");
  fireEvent.keyDown(slider, { key: "End" });
  expect(media.time()).toBe(120);
  fireEvent.keyDown(slider, { key: "ArrowLeft" });
  expect(media.time()).toBe(115);
  fireEvent.keyDown(slider, { key: "Home" });
  expect(slider.getAttribute("aria-valuenow")).toBe("0");
});

it("seeks where the track is clicked", () => {
  const { media } = mount();
  const slider = seek();
  vi.spyOn(slider, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 100, y: 0, width: 400, height: 20 }),
  );
  fireEvent.pointerDown(slider, { clientX: 200, pointerId: 1 });
  expect(media.time()).toBe(30);
  // Dragging keeps seeking until the pointer is let go.
  fireEvent.pointerMove(slider, { clientX: 400, pointerId: 1 });
  expect(media.time()).toBe(90);
  fireEvent.pointerUp(slider, { clientX: 400, pointerId: 1 });
  fireEvent.pointerMove(slider, { clientX: 500, pointerId: 1 });
  expect(media.time()).toBe(90);
});

it("marks the chapters on the track, each titled", () => {
  mount({
    chapters: [
      { start: 0, title: "Intro" },
      { start: 30, title: "The bowline" },
      { start: 90, title: "Why it holds" },
    ],
  });
  const marks = seek().querySelectorAll(".sl-player__mark");
  // The first chapter starts at 0:00 and needs no mark.
  expect([...marks].map((mark) => mark.getAttribute("title"))).toEqual([
    "The bowline",
    "Why it holds",
  ]);
  expect((marks[0] as HTMLElement).style.left).toBe("25%");
});

it("changes speed from its menu, and mutes", async () => {
  const { video } = mount();
  await userEvent.click(screen.getByRole("button", { name: "Playback speed, 1×" }));
  const menu = screen.getByRole("menu", { name: "Playback speed" });
  expect(
    within(menu).getByRole("menuitemradio", { name: "Normal" }).getAttribute("aria-checked"),
  ).toBe("true");
  await userEvent.click(within(menu).getByRole("menuitemradio", { name: "1.5×" }));
  expect(video.playbackRate).toBe(1.5);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByRole("button", { name: "Playback speed, 1.5×" })).not.toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Mute" }));
  expect(video.muted).toBe(true);
  expect(screen.getByRole("button", { name: "Unmute" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("slider", { name: "Volume" }).getAttribute("aria-valuetext")).toBe(
    "Muted",
  );
});

it("sets the volume with its slider's keys", () => {
  const { video } = mount();
  const volume = screen.getByRole("slider", { name: "Volume" });
  fireEvent.keyDown(volume, { key: "ArrowLeft" });
  expect(video.volume).toBe(0.95);
  expect(volume.getAttribute("aria-valuetext")).toBe("95%");
  fireEvent.keyDown(volume, { key: "Home" });
  expect(video.muted).toBe(true);
});

it("offers the captions toggle only when there is a track", async () => {
  mount();
  expect(screen.queryByRole("button", { name: "Captions" })).toBeNull();
  cleanup();
  mount({ captions: { src: "/v.vtt", lang: "en", label: "English" } });
  const toggle = screen.getByRole("button", { name: "Captions" });
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  await userEvent.click(toggle);
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
});

it("goes full screen on the whole player", async () => {
  mount();
  const box = document.querySelector<HTMLElement>("[data-slot='player']");
  if (box === null) throw new Error("Expected the player");
  const requestFullscreen = vi.fn(() => Promise.resolve());
  box.requestFullscreen = requestFullscreen;
  await userEvent.click(screen.getByRole("button", { name: "Full screen" }));
  expect(requestFullscreen).toHaveBeenCalledTimes(1);
});

it("answers YouTube's keys anywhere inside it", () => {
  const { media, video } = mount({ captions: { src: "/v.vtt", lang: "en", label: "English" } });
  const slider = seek();
  fireEvent.keyDown(slider, { key: "k" });
  expect(media.play).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(slider, { key: " " });
  expect(media.pause).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(slider, { key: "l" });
  expect(media.time()).toBe(10);
  fireEvent.keyDown(slider, { key: "j" });
  expect(media.time()).toBe(0);
  fireEvent.keyDown(slider, { key: "5" });
  expect(media.time()).toBe(60);
  fireEvent.keyDown(slider, { key: "m" });
  expect(video.muted).toBe(true);
  fireEvent.keyDown(slider, { key: "c" });
  expect(screen.getByRole("button", { name: "Captions" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  // A focused button keeps Space for itself.
  const mute = screen.getByRole("button", { name: "Unmute" });
  fireEvent.keyDown(mute, { key: " " });
  expect(media.play).toHaveBeenCalledTimes(1);
});
