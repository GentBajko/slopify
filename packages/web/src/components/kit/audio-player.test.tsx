import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AudioPlayer } from "./audio-player.js";
import { stubMedia } from "./media-stub.js";

afterEach(cleanup);

function mount(props: Partial<Parameters<typeof AudioPlayer>[0]> = {}) {
  const { container } = render(
    <AudioPlayer src="/narration.mp3" label="Hypatia, body narration" {...props} />,
  );
  const audio = screen.getByLabelText("Hypatia, body narration", { selector: "audio" });
  if (!(audio instanceof HTMLAudioElement)) throw new Error("Expected an audio element");
  const strip = screen.getByRole("group", { name: "Hypatia, body narration controls" });
  return { audio, strip, container, media: stubMedia(audio) };
}

const seek = () => screen.getByRole("slider", { name: "Seek" });

it("plays in its own strip, never the browser's controls", async () => {
  const { audio, strip, media } = mount();
  expect(audio.hasAttribute("controls")).toBe(false);
  expect(audio.getAttribute("preload")).toBe("metadata");
  expect(strip.querySelector(".sl-player__time")?.textContent).toBe("0:00 / 2:00");
  const key = within(strip).getByRole("button", { name: "Play" });
  expect(key.className).toContain("sl-audio__key");
  await userEvent.click(key);
  expect(media.play).toHaveBeenCalledTimes(1);
  expect(strip.getAttribute("data-state")).toBe("playing");
  await userEvent.click(within(strip).getByRole("button", { name: "Pause" }));
  expect(media.pause).toHaveBeenCalledTimes(1);
});

it("seeks with the slider's keys, says where it is in words, and shows what has loaded", () => {
  const { media, container } = mount();
  const slider = seek();
  expect(slider.getAttribute("aria-valuetext")).toBe("0:00 of 2:00");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(media.time()).toBe(5);
  expect(slider.getAttribute("aria-valuetext")).toBe("0:05 of 2:00");
  fireEvent.keyDown(slider, { key: "PageUp" });
  expect(media.time()).toBe(15);
  fireEvent.keyDown(slider, { key: "End" });
  expect(media.time()).toBe(120);
  fireEvent.keyDown(slider, { key: "Home" });
  expect(slider.getAttribute("aria-valuenow")).toBe("0");
  media.buffer(60);
  expect(container.querySelector<HTMLElement>(".sl-player__buffered")?.style.width).toBe("50%");
});

it("seeks where the track is clicked and dragged, with the time under the pointer", () => {
  const { media } = mount({ marks: [{ start: 90, title: "Outro" }] });
  const slider = seek();
  vi.spyOn(slider, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 100, y: 0, width: 400, height: 20 }),
  );
  fireEvent.pointerMove(slider, { clientX: 400, pointerId: 1 });
  const tip = slider.querySelector(".sl-player__tip");
  // Hovering past the mark names the segment it falls in.
  expect(tip?.textContent).toBe("Outro1:30");
  fireEvent.pointerDown(slider, { clientX: 200, pointerId: 1 });
  expect(media.time()).toBe(30);
  fireEvent.pointerMove(slider, { clientX: 300, pointerId: 1 });
  expect(media.time()).toBe(60);
  fireEvent.pointerUp(slider, { clientX: 300, pointerId: 1 });
  fireEvent.pointerMove(slider, { clientX: 500, pointerId: 1 });
  expect(media.time()).toBe(60);
  fireEvent.pointerLeave(slider);
  expect(slider.querySelector(".sl-player__tip")).toBeNull();
});

it("marks segments on the track, each titled", () => {
  mount({
    marks: [
      { start: 0, title: "Intro" },
      { start: 12, title: "Body" },
      { start: 108, title: "Outro" },
    ],
  });
  const marks = seek().querySelectorAll(".sl-player__mark");
  expect([...marks].map((mark) => mark.getAttribute("title"))).toEqual(["Body", "Outro"]);
  expect((marks[0] as HTMLElement).style.left).toBe("10%");
});

it("mutes, sets the volume and changes speed from its menu", async () => {
  const { audio } = mount();
  const volume = screen.getByRole("slider", { name: "Volume" });
  fireEvent.keyDown(volume, { key: "ArrowLeft" });
  expect(audio.volume).toBe(0.95);
  expect(volume.getAttribute("aria-valuetext")).toBe("95%");
  await userEvent.click(screen.getByRole("button", { name: "Mute" }));
  expect(audio.muted).toBe(true);
  expect(volume.getAttribute("aria-valuetext")).toBe("Muted");

  await userEvent.click(screen.getByRole("button", { name: "Playback speed, 1×" }));
  const menu = screen.getByRole("menu", { name: "Playback speed" });
  await userEvent.click(within(menu).getByRole("menuitemradio", { name: "1.25×" }));
  expect(audio.playbackRate).toBe(1.25);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByRole("button", { name: "Playback speed, 1.25×" })).not.toBeNull();
});

it("answers the Player's keys anywhere inside it", () => {
  const { audio, media } = mount();
  const slider = seek();
  fireEvent.keyDown(slider, { key: "k" });
  expect(media.play).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(slider, { key: "l" });
  expect(media.time()).toBe(10);
  fireEvent.keyDown(slider, { key: "j" });
  expect(media.time()).toBe(0);
  fireEvent.keyDown(slider, { key: "5" });
  expect(media.time()).toBe(60);
  fireEvent.keyDown(slider, { key: "m" });
  expect(audio.muted).toBe(true);
  // A focused button keeps Space for itself.
  fireEvent.keyDown(screen.getByRole("button", { name: "Unmute" }), { key: " " });
  expect(media.pause).not.toHaveBeenCalled();
});

it("has a compact strip for tight rows, and passes its element and errors on", () => {
  const ref = { current: null as HTMLAudioElement | null };
  const onError = vi.fn();
  const { strip, audio } = mount({ compact: true, preload: "none", ref, onError });
  expect(strip.className).toContain("sl-audio--compact");
  expect(audio.getAttribute("preload")).toBe("none");
  expect(ref.current).toBe(audio);
  fireEvent.error(audio);
  expect(onError).toHaveBeenCalledTimes(1);
});

it("draws the waveform on the track, lime up to where it plays", async () => {
  const { strip, audio } = mount({ waveform: [0.2, 1, 0.5, 0.8] });
  const wave = strip.querySelector("[data-slot='waveform']");
  expect(wave?.querySelectorAll(".sl-player__peak")).toHaveLength(4);
  expect(seek().querySelector(".sl-player__rail")).toBeNull();
  expect(strip.className).toContain("sl-audio--wave");
  // Halfway through two minutes: the first two bars are played.
  act(() => {
    audio.currentTime = 60;
  });
  expect(wave?.querySelectorAll(".sl-player__peak[data-played]")).toHaveLength(2);
  // It is still the seek slider, keys and all.
  seek().focus();
  await userEvent.keyboard("{End}");
  expect(wave?.querySelectorAll(".sl-player__peak[data-played]")).toHaveLength(4);
});

it("keeps the thin rail without a waveform", () => {
  const { strip } = mount({ waveform: [] });
  expect(seek().querySelector(".sl-player__rail")).not.toBeNull();
  expect(strip.querySelector("[data-slot='waveform']")).toBeNull();
});

it("pauses the other player when one starts, and carries speed and volume to the next", async () => {
  const kept = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => kept.set(key, value),
    removeItem: (key: string) => kept.delete(key),
  });
  render(
    <>
      <AudioPlayer src="/one.mp3" label="One" />
      <AudioPlayer src="/two.mp3" label="Two" />
    </>,
  );
  const one = stubMedia(screen.getByLabelText("One", { selector: "audio" }) as HTMLAudioElement);
  const two = stubMedia(screen.getByLabelText("Two", { selector: "audio" }) as HTMLAudioElement);
  const strip = (name: string) => screen.getByRole("group", { name: `${name} controls` });
  await userEvent.click(within(strip("One")).getByRole("button", { name: "Play" }));
  await userEvent.click(within(strip("Two")).getByRole("button", { name: "Play" }));
  expect(one.pause).toHaveBeenCalledTimes(1);
  expect(two.pause).not.toHaveBeenCalled();
  await userEvent.click(within(strip("Two")).getByRole("button", { name: /Mute/ }));
  expect(JSON.parse(window.localStorage.getItem("slopify.playback") ?? "{}")).toMatchObject({
    muted: true,
  });
  cleanup();
  render(<AudioPlayer src="/three.mp3" label="Three" />);
  const three = screen.getByLabelText("Three", { selector: "audio" }) as HTMLAudioElement;
  expect(three.muted).toBe(true);
  vi.unstubAllGlobals();
});
