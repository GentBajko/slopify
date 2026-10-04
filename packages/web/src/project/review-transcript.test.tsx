import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { stubMedia } from "@/components/kit/media-stub";
import { renderApp, testDeps } from "@/test-app";
import { speakerNames, Transcript, type TranscriptLine } from "./review-transcript.js";

afterEach(cleanup);

function setup(onFix?: (line: TranscriptLine) => void) {
  const media = createRef<HTMLAudioElement>();
  const speaker = speakerNames([
    { id: "host", name: "Ada" },
    { id: "guest", name: "Ben" },
  ]);
  const lines: TranscriptLine[] = [
    {
      key: "a",
      text: "Hello there.",
      start: 0.5,
      end: 1.4,
      shownAt: 2.5,
      media,
      speaker: speaker("host"),
    },
    {
      key: "b",
      text: "Welcome back.",
      start: 3,
      end: 4,
      shownAt: 5,
      media,
      speaker: speaker("guest"),
    },
  ];
  renderApp(
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: a test player. */}
      <audio ref={media} />
      <Transcript lines={lines} label="Conversation" onFix={onFix} />
    </>,
    testDeps({}),
  );
  const element = media.current;
  if (element === null) throw new Error("Expected the audio element.");
  stubMedia(element);
  return element;
}

it("plays from a line when its words or its time are pressed", async () => {
  const user = userEvent.setup();
  const audio = setup();
  await user.click(screen.getByRole("button", { name: /Welcome back\./ }));
  expect(audio.currentTime).toBe(3);
  expect(audio.play).toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Play from 0:02" }));
  expect(audio.currentTime).toBe(0.5);
});

it("marks the line being spoken and names each speaker", () => {
  const audio = setup();
  expect(screen.getByText("Ada:")).toBeTruthy();
  expect(screen.getByText("Ben:")).toBeTruthy();
  act(() => {
    audio.currentTime = 3.2;
  });
  const current = document.querySelector('[aria-current="true"]');
  expect(current?.textContent).toContain("Welcome back.");
});

it("offers the passage's fix beside each line", async () => {
  const user = userEvent.setup();
  const fix = vi.fn();
  setup(fix);
  await user.click(
    screen.getAllByRole("button", { name: /Correct or remake this passage/ })[1] as HTMLElement,
  );
  expect(fix).toHaveBeenCalledWith(expect.objectContaining({ key: "b" }));
});
