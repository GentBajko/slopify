import { act } from "@testing-library/react";
import { vi } from "vitest";

// jsdom has no media playback: the element gets a small fake that keeps its state and fires
// the events a browser would, so the player is driven through the element as in a browser.
export function stubMedia(video: HTMLMediaElement, duration = 120) {
  let paused = true;
  let time = 0;
  let muted = false;
  let volume = 1;
  let rate = 1;
  let loaded = 0;
  const fire = (type: string) => video.dispatchEvent(new Event(type));
  const play = vi.fn(() => {
    paused = false;
    fire("play");
    return Promise.resolve();
  });
  const pause = vi.fn(() => {
    paused = true;
    fire("pause");
  });
  Object.defineProperties(video, {
    paused: { get: () => paused, configurable: true },
    ended: { get: () => false, configurable: true },
    duration: { get: () => duration, configurable: true },
    currentTime: {
      get: () => time,
      set: (next: number) => {
        time = next;
        fire("timeupdate");
      },
      configurable: true,
    },
    muted: {
      get: () => muted,
      set: (next: boolean) => {
        muted = next;
        fire("volumechange");
      },
      configurable: true,
    },
    volume: {
      get: () => volume,
      set: (next: number) => {
        volume = next;
        fire("volumechange");
      },
      configurable: true,
    },
    playbackRate: {
      get: () => rate,
      set: (next: number) => {
        rate = next;
        fire("ratechange");
      },
      configurable: true,
    },
    buffered: {
      get: () => ({ length: loaded > 0 ? 1 : 0, start: () => 0, end: () => loaded }),
      configurable: true,
    },
    play: { value: play, configurable: true },
    pause: { value: pause, configurable: true },
  });
  act(() => fire("durationchange"));
  // How far the element has loaded, as a browser's progress event says.
  const buffer = (end: number) => {
    loaded = end;
    act(() => fire("progress"));
  };
  return { play, pause, buffer, time: () => time };
}
