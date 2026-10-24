import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { stubMedia } from "@/components/kit/media-stub";
import { renderApp, testDeps } from "@/test-app";
import {
  paragraphsOf,
  speakerNames,
  Transcript,
  type TranscriptLine,
} from "./review-transcript.js";

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

it("plays from the line pressed, or from its paragraph's start by its time", async () => {
  const user = userEvent.setup();
  const audio = setup();
  await user.click(screen.getByText("Welcome back."));
  expect(audio.currentTime).toBe(3);
  expect(audio.play).toHaveBeenCalled();
  // Each speaker's turn is a paragraph of its own, opening with its time.
  await user.click(screen.getByRole("button", { name: /^0:02 Ada: Hello there\./ }));
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

it("offers one worded fix, under the line last played or pressed", async () => {
  const user = userEvent.setup();
  const fix = vi.fn();
  setup(fix);
  expect(screen.queryByRole("button", { name: /^Fix this line/ })).toBeNull();
  await user.click(screen.getByText("Welcome back."));
  const buttons = screen.getAllByRole("button", { name: /^Fix this line/ });
  expect(buttons).toHaveLength(1);
  await user.click(buttons[0] as HTMLElement);
  expect(fix).toHaveBeenCalledWith(expect.objectContaining({ key: "b" }));
});

it("runs caption lines into paragraphs at sentence ends, pauses and new speakers", () => {
  const media = createRef<HTMLAudioElement>();
  const line = (key: string, text: string, start: number, speaker?: string) => ({
    key,
    text,
    start,
    end: start + 1,
    shownAt: start,
    media,
    ...(speaker === undefined ? {} : { speaker: { name: speaker, index: 0 } }),
  });
  const paragraphs = paragraphsOf([
    line("a", "One", 0),
    line("b", "two", 1),
    line("c", "three", 2),
    line("d", "four.", 3),
    line("e", "Five", 4),
    line("f", "six.", 5),
    line("g", "After a pause.", 9),
    line("h", "Someone else.", 10, "Ben"),
  ]);
  expect(paragraphs.map((paragraph) => paragraph.map((one) => one.key).join(""))).toEqual([
    "abcd",
    "ef",
    "g",
    "h",
  ]);
});

it("reads a short narration straight down the page, and a long one a page at a time", () => {
  const media = createRef<HTMLAudioElement>();
  const many = (count: number): TranscriptLine[] =>
    Array.from({ length: count }, (_, index) => ({
      key: `l${String(index)}`,
      text: `Line ${String(index)}.`,
      start: index * 2,
      end: index * 2 + 1.9,
      shownAt: index * 2,
      media,
    }));
  const { unmount } = renderApp(
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: a test player. */}
      <audio ref={media} />
      <Transcript lines={many(140)} label="Narration transcript" />
    </>,
    testDeps({}),
  );
  const short = screen.getByRole("list", { name: "Narration transcript" });
  expect(short.querySelectorAll("[data-line]")).toHaveLength(140);
  expect(short.className).not.toContain("overflow-y-auto");
  unmount();
  renderApp(
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: a test player. */}
      <audio ref={media} />
      <Transcript lines={many(500)} label="Narration transcript" />
    </>,
    testDeps({}),
  );
  const list = screen.getByRole("list", { name: "Narration transcript" });
  expect(list.querySelectorAll("[data-line]")).toHaveLength(120);
  expect(screen.getByRole("button", { name: "Later lines (380 more)" })).toBeTruthy();
  const audio = media.current;
  if (audio === null) throw new Error("Expected the audio element.");
  stubMedia(audio);
  act(() => {
    audio.currentTime = 600;
    audio.dispatchEvent(new Event("timeupdate"));
  });
  expect(list.querySelector('[aria-current="true"]')?.textContent).toContain("Line 300.");
  expect(screen.getByRole("button", { name: /^Earlier lines \(280 before/ })).toBeTruthy();
});

it("marks the lines that hold the searched words", () => {
  const media = createRef<HTMLAudioElement>();
  renderApp(
    <Transcript
      lines={["Rope holds.", "Knots slip.", "Rope again."].map((text, index) => ({
        key: String(index),
        text,
        start: index,
        end: index + 1,
        shownAt: index,
        media,
      }))}
      label="Narration transcript"
      query="rope"
    />,
    testDeps({}),
  );
  expect([...document.querySelectorAll("[data-match]")].map((one) => one.textContent)).toEqual([
    "Rope holds.",
    "Rope again.",
  ]);
});
