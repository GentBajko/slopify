import { describe, expect, it } from "vitest";
import type { Log, LogLevel } from "../../kernel/log.js";
import {
  clipArgs,
  concatList,
  joinArgs,
  progressMsOf,
  resolveFfmpeg,
  runFfmpeg,
  slideshowClips,
} from "./ffmpeg.js";
import type { PlanInput } from "./plan.js";
import { planRender } from "./plan.js";

function plan(over: Partial<PlanInput> = {}): ReturnType<typeof planRender> {
  return planRender({
    format: "16:9",
    gapSeconds: 3,
    edgeSeconds: 0,
    imageSeconds: 5,
    zoomPercent: 22.5,
    body: { path: "/p/audio-body.mp3", seconds: 10 },
    images: ["/p/images/001.png", "/p/images/002.png", "/p/images/003.png"],
    output: "/p/video.mp4",
    ...over,
  });
}

describe("resolveFfmpeg", () => {
  it("prefers the environment override", () => {
    expect(resolveFfmpeg({ SLOPIFY_FFMPEG: "/opt/ffmpeg" }, "/bundled/ffmpeg")).toBe("/opt/ffmpeg");
  });

  it("falls back to the bundled binary", () => {
    expect(resolveFfmpeg({}, "/bundled/ffmpeg")).toBe("/bundled/ffmpeg");
    expect(resolveFfmpeg({ SLOPIFY_FFMPEG: "  " }, "/bundled/ffmpeg")).toBe("/bundled/ffmpeg");
  });

  it("says so rather than reaching for whatever ffmpeg is on PATH", () => {
    expect(() => resolveFfmpeg({}, null)).toThrow(/SLOPIFY_FFMPEG/);
  });
});

describe("slideshowClips", () => {
  it("encodes each still, zoom and length once and plays them in slot order", () => {
    // 10 s at 3 s a slot over two images: a in, b out, a in, b out (1 s).
    const { clips, order } = slideshowClips(
      plan({ imageSeconds: 3, images: ["/a.png", "/b.png"] }),
    );
    expect(
      clips.map((clip) => [clip.name, clip.slot.path, clip.slot.zoom, clip.slot.frames]),
    ).toEqual([
      ["c1.mp4", "/a.png", "in", 90],
      ["c2.mp4", "/b.png", "out", 90],
      ["c3.mp4", "/b.png", "out", 30],
    ]);
    expect(order).toEqual(["c1.mp4", "c2.mp4", "c1.mp4", "c3.mp4"]);
  });

  it("gives an image both zooms when an odd count makes it come back the other way", () => {
    const { clips, order } = slideshowClips(
      plan({ body: { path: "/b.mp3", seconds: 36 }, imageSeconds: 3 }),
    );
    // Three images, twelve slots: each image in and out once, so six clips.
    expect(clips).toHaveLength(6);
    expect(order).toHaveLength(12);
  });
});

describe("clipArgs", () => {
  const slot = { path: "/p/images/001.png", index: 1, frames: 150, zoom: "in" as const };

  it("renders one still through the prescaled zoom into one silent clip", () => {
    const args = clipArgs(plan(), slot, "/w/c1.mp4");
    expect(args.filter((_arg, at) => args[at - 1] === "-i")).toEqual(["/p/images/001.png"]);
    expect(args[args.indexOf("-filter_complex") + 1]).toBe(
      "[0:v]trim=end_frame=1,setpts=PTS-STARTPTS," +
        "scale=7680:4320:force_original_aspect_ratio=increase,crop=7680:4320," +
        "zoompan=z='1+0.225*on/149':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':" +
        "s=1920x1080:fps=30,setsar=1[v]",
    );
    expect(args.slice(-8)).toEqual([
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "/w/c1.mp4",
    ]);
  });

  it("zooms the full 100% to 122.5% over a 15-second slot, and a cut slot over its own length", () => {
    const { clips } = slideshowClips(
      plan({ body: { path: "/b.mp3", seconds: 40 }, imageSeconds: 15, images: ["/a.png"] }),
    );
    const zooms = clips.map((clip) =>
      /zoompan=z='([^']+)':d=(\d+):/
        .exec(clipArgs(plan(), clip.slot, "/w/c.mp4").join(" "))
        ?.slice(1),
    );
    // 450 frames: the zoom reaches 1 + 0.225 on the last frame, on = 449.
    expect(zooms).toEqual([
      ["1+0.225*on/449", "450"],
      ["1.225-0.225*on/449", "450"],
      ["1+0.225*on/299", "300"],
    ]);
  });

  it("zooms the project's own range, and not at all at 0%", () => {
    const zoom = (zoomPercent: number, zoom: "in" | "out") =>
      /zoompan=z='([^']+)'/.exec(
        clipArgs(plan({ zoomPercent }), { ...slot, zoom }, "/w/c1.mp4").join(" "),
      )?.[1];
    expect(zoom(22.5, "in")).toBe("1+0.225*on/149");
    expect(zoom(22.5, "out")).toBe("1.225-0.225*on/149");
    expect(zoom(10, "in")).toBe("1+0.1*on/149");
    expect(zoom(10, "out")).toBe("1.1-0.1*on/149");
    expect(zoom(0, "in")).toBe("1");
    expect(zoom(0, "out")).toBe("1");
    // Still cover-scaled and cropped, but to the frame itself: nothing to smooth.
    expect(clipArgs(plan({ zoomPercent: 0 }), slot, "/w/c1.mp4").join(" ")).toContain(
      "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,",
    );
  });

  it("zooms out on an even slot", () => {
    const args = clipArgs(plan(), { ...slot, index: 2, zoom: "out" }, "/w/c2.mp4");
    expect(args.join(" ")).toContain("zoompan=z='1.225-0.225*on/149':d=150:");
  });

  it("pre-scales to four times the frame in either orientation", () => {
    const graph = clipArgs(plan({ format: "9:16" }), slot, "/w/c1.mp4").join(" ");
    expect(graph).toContain("scale=4320:7680:force_original_aspect_ratio=increase,crop=4320:7680");
    expect(graph).toContain("s=1080x1920");
  });

  it("holds the zoom still on a one-frame slot rather than dividing by zero", () => {
    expect(clipArgs(plan(), { ...slot, frames: 1 }, "/w/c1.mp4").join(" ")).toContain(
      "zoompan=z='1':d=1:",
    );
    expect(clipArgs(plan(), { ...slot, frames: 1, zoom: "out" }, "/w/c1.mp4").join(" ")).toContain(
      "zoompan=z='1.225':d=1:",
    );
  });

  it("keeps a clip that will be encoded again closer to the source", () => {
    expect(clipArgs(plan(), slot, "/w/c1.mp4", true)).toEqual(
      expect.arrayContaining(["-crf", "16"]),
    );
    expect(clipArgs(plan(), slot, "/w/c1.mp4")).not.toContain("-crf");
  });

  it("asks ffmpeg for machine-readable progress on stdout", () => {
    expect(clipArgs(plan(), slot, "/w/c1.mp4")).toEqual(
      expect.arrayContaining(["-progress", "pipe:1", "-nostats"]),
    );
  });
});

describe("concatList", () => {
  it("lists every slot's clip in order in the concat demuxer's format", () => {
    expect(concatList(["c1.mp4", "c2.mp4", "c1.mp4"])).toBe(
      "ffconcat version 1.0\nfile c1.mp4\nfile c2.mp4\nfile c1.mp4\n",
    );
  });
});

describe("joinArgs", () => {
  it("reads the clips from the list and every audio segment as its own input", () => {
    const args = joinArgs(
      plan({
        intro: { path: "/p/audio-intro.mp3", seconds: 2 },
        outro: { path: "/p/audio-outro.mp3", seconds: 4 },
      }),
      "/w/slides.ffconcat",
    );
    expect(args.slice(args.indexOf("concat") - 1, args.indexOf("concat") + 3)).toEqual([
      "-f",
      "concat",
      "-i",
      "/w/slides.ffconcat",
    ]);
    expect(args.filter((_arg, at) => args[at - 1] === "-i")).toEqual([
      "/w/slides.ffconcat",
      "/p/audio-intro.mp3",
      "anullsrc=r=44100:cl=stereo",
      "/p/audio-body.mp3",
      "anullsrc=r=44100:cl=stereo",
      "/p/audio-outro.mp3",
    ]);
  });

  it("gives each silence its own length, the edges included", () => {
    const args = joinArgs(
      plan({ gapSeconds: 2.5, edgeSeconds: 2, intro: { path: "/p/i.mp3", seconds: 2 } }),
      "/w/l",
    );
    expect(args.filter((_arg, at) => args[at - 1] === "-t")).toEqual(["2.000", "2.500", "2.000"]);
  });

  it("copies the clips and encodes only the audio when nothing is burned in", () => {
    const args = joinArgs(plan(), "/w/l");
    expect(args[args.indexOf("-filter_complex") + 1]).toBe(
      "[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0];" +
        "[a0]concat=n=1:v=0:a=1[a]",
    );
    expect(args.slice(-11)).toEqual([
      "-map",
      "0:v",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "/p/video.mp4",
    ]);
  });

  it("burns captions in and encodes the video again when asked", () => {
    const args = joinArgs(plan(), "/w/l", true);
    expect(args[args.indexOf("-filter_complex") + 1]).toMatch(
      /^\[0:v\]ass=filename=subtitles\.ass:fontsdir=fonts\[v\];/,
    );
    expect(args).toEqual(expect.arrayContaining(["-map", "[v]", "-c:v", "libx264"]));
    expect(args).not.toContain("copy");
  });

  it("writes a silent video with no filtergraph and no audio stream", () => {
    const args = joinArgs(plan({ body: undefined }), "/w/l");
    expect(args).not.toContain("-filter_complex");
    expect(args).toContain("-an");
  });

  it("numbers the audio inputs after the clip list", () => {
    const graph = joinArgs(plan({ outro: { path: "/p/o.mp3", seconds: 4 } }), "/w/l").join(" ");
    expect(graph).toContain("[1:a]aformat");
    expect(graph).toContain("[3:a]aformat");
    expect(graph).toContain("[a0][a1][a2]concat=n=3:v=0:a=1[a]");
  });

  it("never builds a shell string, so a filename with a space stays one argument", () => {
    const args = joinArgs(plan({ output: "/p/my video; rm -rf ~.mp4" }), "/w/l");
    expect(args.at(-1)).toBe("/p/my video; rm -rf ~.mp4");
  });
});

describe("a long slideshow", () => {
  // Three hours at 15 s a slot with sixty images: 720 slots, well past the length at
  // which one argument per slot would have run into Windows' 32,767-character limit.
  const long = plan({
    body: { path: "C:\\Users\\someone\\AppData\\Slopify\\audio-body.mp3", seconds: 3 * 3600 + 7 },
    imageSeconds: 15,
    images: Array.from(
      { length: 60 },
      (_value, at) => `C:\\Users\\someone\\AppData\\Slopify\\projects\\p\\images\\${at}.png`,
    ),
  });

  it("keeps every command line short however many slots there are", () => {
    const { clips, order } = slideshowClips(long);
    expect(order.length).toBeGreaterThan(720);
    // Sixty images, an even count: each always zooms the same way, plus the cut last slot.
    expect(clips).toHaveLength(61);
    const lengths = [
      ...clips.map((clip) => clipArgs(long, clip.slot, "C:\\w\\c61.mp4").join(" ").length),
      joinArgs(long, "C:\\w\\slides.ffconcat", true).join(" ").length,
    ];
    expect(Math.max(...lengths)).toBeLessThan(2000);
  });

  it("puts the timeline in the list file, one line a slot", () => {
    const { order } = slideshowClips(long);
    expect(
      concatList(order)
        .split("\n")
        .filter((line) => line.startsWith("file ")),
    ).toHaveLength(order.length);
  });
});

describe("progressMsOf", () => {
  it("reads out_time_us and out_time_ms as the microseconds they both are", () => {
    expect(progressMsOf("out_time_us=5933333")).toBe(5933);
    expect(progressMsOf("out_time_ms=5933333")).toBe(5933);
  });

  it("ignores the N/A ffmpeg writes before the first frame is muxed", () => {
    expect(progressMsOf("out_time_us=N/A")).toBeUndefined();
    expect(progressMsOf("out_time_ms=N/A")).toBeUndefined();
  });

  it("ignores every other line of the progress block", () => {
    expect(progressMsOf("frame=180")).toBeUndefined();
    expect(progressMsOf("out_time=00:00:05.933333")).toBeUndefined();
    expect(progressMsOf("progress=end")).toBeUndefined();
    expect(progressMsOf("")).toBeUndefined();
  });
});

// runFfmpeg only needs a program that writes progress lines and exits, so these drive it
// with node itself: deterministic, and no render to wait for.
function recorder(): { log: Log; lines: string[] } {
  const lines: string[] = [];
  return {
    log: {
      write: (level: LogLevel, event: string, fields?: { detail?: string | undefined }): void => {
        lines.push(`${level} ${event} ${fields?.detail ?? ""}`);
      },
    },
    lines,
  };
}

function script(body: string): { bin: string; args: string[] } {
  return { bin: process.execPath, args: ["-e", body] };
}

describe("runFfmpeg", () => {
  it("settles even when the progress callback throws, and says so in the log", async () => {
    const { log, lines } = recorder();
    const seen: number[] = [];

    await runFfmpeg({
      ...script('console.log("out_time_us=1000000\\nout_time_us=2000000")'),
      signal: new AbortController().signal,
      log,
      onProgress: (elapsed): void => {
        seen.push(elapsed);
        throw new Error("the database is not open");
      },
    });

    // Both lines were offered: one failure does not stop the ones after it.
    expect(seen).toEqual([1000, 2000]);
    expect(lines.filter((line) => line.includes("video.progress"))).toHaveLength(2);
    expect(lines[0]).toContain("the database is not open");
  });

  it("reports the last progress line even when it arrived without a newline", async () => {
    const { log } = recorder();
    const seen: number[] = [];

    await runFfmpeg({
      ...script('process.stdout.write("out_time_us=1000000\\nout_time_us=2500000")'),
      signal: new AbortController().signal,
      log,
      onProgress: (elapsed): void => {
        seen.push(elapsed);
      },
    });

    expect(seen).toEqual([1000, 2500]);
  });

  it("carries the last lines of stderr into the failure", async () => {
    const { log } = recorder();

    await expect(
      runFfmpeg({
        ...script('console.error("Error opening input file bad.png."); process.exit(3)'),
        signal: new AbortController().signal,
        log,
        onProgress: (): void => {},
      }),
    ).rejects.toThrow(
      "The audio/video export failed (ffmpeg exited with code 3: Error opening input file bad.png.).",
    );
  });

  it("says the binary could not be started rather than hanging", async () => {
    const { log } = recorder();

    await expect(
      runFfmpeg({
        bin: "/nonexistent/ffmpeg",
        args: [],
        signal: new AbortController().signal,
        log,
        onProgress: (): void => {},
      }),
    ).rejects.toThrow(/could not start ffmpeg/);
  });

  it("refuses before spawning anything when the signal has already fired", async () => {
    const { log } = recorder();
    const controller = new AbortController();
    controller.abort();

    await expect(
      runFfmpeg({
        ...script("console.log('never')"),
        signal: controller.signal,
        log,
        onProgress: (): void => {},
      }),
    ).rejects.toThrow(/canceled before it started/);
  });
});
