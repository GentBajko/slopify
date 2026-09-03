import { describe, expect, it } from "vitest";
import { concatArgs, concatListText } from "./concat.js";

// The argument builder and the demuxer script, with no ffmpeg: the real binary runs in the
// integration suite and the builder is unit-tested here.

describe("concatListText", () => {
  it("names every chunk once, in the order it was given", () => {
    expect(concatListText(["/p/001.mp3", "/p/002.mp3", "/p/003.mp3"])).toBe(
      "file '/p/001.mp3'\nfile '/p/002.mp3'\nfile '/p/003.mp3'\n",
    );
  });

  // A data directory under `/home/o'brien` is a path, not two arguments.
  it("escapes the one character that could end the quoting", () => {
    expect(concatListText(["/home/o'brien/a.mp3"])).toBe("file '/home/o'\\''brien/a.mp3'\n");
  });

  it("writes an empty script for no files rather than a stray newline", () => {
    expect(concatListText([])).toBe("\n");
  });
});

describe("concatArgs", () => {
  it("reads the script, keeps only the audio, and re-encodes to one mp3", () => {
    expect(concatArgs("/p/list.txt", "/p/audio-body.mp3")).toEqual([
      "-hide_banner",
      "-nostdin",
      "-loglevel",
      "error",
      "-nostats",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "/p/list.txt",
      "-map",
      "0:a:0",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      "/p/audio-body.mp3",
    ]);
  });

  // Provider default sample rate. Nothing here resamples, so a provider that answers at 24 kHz
  // is not silently pushed to 44.1.
  it("never names a sample rate", () => {
    expect(concatArgs("/p/list.txt", "/p/out.mp3")).not.toContain("-ar");
  });

  // Every value is its own array element: a title or a folder name can never become a
  // second argument, because nothing here is ever a shell string.
  it("passes each value as its own argument", () => {
    const args = concatArgs("/p/a list.txt", "/p/audio body.mp3");

    expect(args).toContain("/p/a list.txt");
    expect(args).toContain("/p/audio body.mp3");
  });
});
