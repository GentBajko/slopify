import { expect, it } from "vitest";
import {
  defaultShorts,
  fullVideoLine,
  musicVolumeOf,
  shortImageCount,
  shortsImageUpperBound,
  shortsSettingsProblems,
  shortsSpeedOf,
  shortUploadText,
} from "./model.js";

it("gives a clip one image per stretch of imageSeconds, the last running to the end", () => {
  expect(shortImageCount(60, 15)).toBe(4);
  expect(shortImageCount(61, 15)).toBe(5);
  expect(shortImageCount(14, 15)).toBe(1);
  // A few milliseconds past a whole number of images is timing noise, not another image.
  expect(shortImageCount(60.0004, 15)).toBe(4);
  expect(shortImageCount(Number.NaN, 15)).toBe(1);
});

it("charges the most the step can ask for: every clip at the longest length", () => {
  expect(shortsImageUpperBound({ count: 3, maxSeconds: 120 }, 15)).toBe(24);
  expect(shortsImageUpperBound({ count: 10, maxSeconds: 180 }, 7)).toBe(260);
});

it("says what is wrong with each number in plain words", () => {
  expect(shortsSettingsProblems({ count: 3, minSeconds: 60, maxSeconds: 120 })).toEqual([]);
  expect(shortsSettingsProblems({ count: 0, minSeconds: 10, maxSeconds: 200.5 })).toEqual([
    { field: "count", message: "Enter a whole number of shorts between 1 and 10." },
    { field: "minSeconds", message: "Enter a whole number of seconds between 15 and 180." },
    { field: "maxSeconds", message: "Enter a whole number of seconds between 15 and 180." },
  ]);
  const message =
    "The longest a short may be must be at least the shortest. Raise the maximum or lower the minimum.";
  expect(shortsSettingsProblems({ count: 3, minSeconds: 90, maxSeconds: 60 })).toEqual([
    { field: "minSeconds", message },
    { field: "maxSeconds", message },
  ]);
});

it("checks the speed, the music volume and the full video link in plain words", () => {
  const base = { count: 3, minSeconds: 60, maxSeconds: 120 };
  expect(
    shortsSettingsProblems({
      ...base,
      speed: 1.15,
      musicVolume: 15,
      fullVideoLink: "https://youtu.be/abc123",
    }),
  ).toEqual([]);
  // 0.05 steps survive the rounding a typed or stored number goes through.
  expect(shortsSettingsProblems({ ...base, speed: 1 + 0.05 * 3 })).toEqual([]);
  expect(shortsSettingsProblems({ ...base, fullVideoLink: "  " })).toEqual([]);
  expect(
    shortsSettingsProblems({
      ...base,
      speed: 1.12,
      musicVolume: 101,
      fullVideoLink: "youtu.be/abc",
    }).map((problem) => problem.field),
  ).toEqual(["speed", "musicVolume", "fullVideoLink"]);
  expect(shortsSettingsProblems({ ...base, speed: 1.3 })[0]?.message).toBe(
    "Choose a speed between 1.00× and 1.25×, in steps of 0.05.",
  );
  expect(shortsSettingsProblems({ ...base, fullVideoLink: "javascript:alert(1)" })[0]).toEqual({
    field: "fullVideoLink",
    message:
      "The full video link must be a whole web address starting with https:// or http://, like https://youtu.be/abc123. Paste it again, or leave the box empty.",
  });
});

it("reads absent settings as the behaviour before they existed", () => {
  expect(shortsSpeedOf({})).toBe(1);
  expect(shortsSpeedOf({ speed: 1.2 })).toBe(1.2);
  expect(shortsSpeedOf({ speed: 3 })).toBe(1);
  expect(musicVolumeOf({})).toBe(15);
  expect(musicVolumeOf({ musicVolume: 0 })).toBe(0);
  // New settings start with the title on screen.
  expect(defaultShorts.titleOnScreen).toBe(true);
});

it("ends every short's description with a line pointing to the full video", () => {
  const clip = { title: "Harbors", description: "Why they glow.", hashtags: ["#Sea", "#Night"] };
  expect(shortUploadText(clip, "https://youtu.be/abc")).toBe(
    "Harbors\n\nWhy they glow.\nWatch the full video: https://youtu.be/abc\n\n#Sea #Night",
  );
  expect(fullVideoLine(undefined)).toBe("Watch the full video: [PASTE THE FULL VIDEO LINK HERE]");
  expect(fullVideoLine(" ")).toBe("Watch the full video: [PASTE THE FULL VIDEO LINK HERE]");
});
