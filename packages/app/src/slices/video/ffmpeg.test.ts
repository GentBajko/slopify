import { describe, expect, it } from "vitest";
import { progressMsOf, renderArgs, resolveFfmpeg } from "./ffmpeg.js";
import type { PlanInput } from "./plan.js";
import { planRender } from "./plan.js";

function plan(over: Partial<PlanInput> = {}): ReturnType<typeof planRender> {
  return planRender({
    format: "16:9",
    gapSeconds: 3,
    body: { path: "/p/audio-body.mp3", seconds: 10 },
    images: ["/p/images/001.png", "/p/images/002.png", "/p/images/003.png"],
    output: "/p/video.mp4",
    ...over,
  });
}

function graphOf(args: readonly string[]): string {
  const at = args.indexOf("-filter_complex");
  return args[at + 1] ?? "";
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

describe("renderArgs", () => {
  it("passes every image and every audio segment as its own input", () => {
    const args = renderArgs(
      plan({
        intro: { path: "/p/audio-intro.mp3", seconds: 2 },
        outro: { path: "/p/audio-outro.mp3", seconds: 4 },
      }),
    );

    expect(args.filter((_arg, at) => args[at - 1] === "-i")).toEqual([
      "/p/images/001.png",
      "/p/images/002.png",
      "/p/images/003.png",
      "/p/audio-intro.mp3",
      "anullsrc=r=44100:cl=stereo",
      "/p/audio-body.mp3",
      "anullsrc=r=44100:cl=stereo",
      "/p/audio-outro.mp3",
    ]);
  });

  it("gives each silence gap its own length", () => {
    const args = renderArgs(
      plan({ gapSeconds: 2.5, intro: { path: "/p/audio-intro.mp3", seconds: 2 } }),
    );
    expect(args.slice(args.indexOf("lavfi"), args.indexOf("lavfi") + 4)).toEqual([
      "lavfi",
      "-t",
      "2.500",
      "-i",
    ]);
  });

  it("writes an mp4 with the codecs and the faststart flag logic/11 asks for", () => {
    const args = renderArgs(plan());
    expect(args.slice(-13)).toEqual([
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "/p/video.mp4",
    ]);
  });

  it("asks ffmpeg for machine-readable progress on stdout", () => {
    expect(renderArgs(plan())).toEqual(expect.arrayContaining(["-progress", "pipe:1", "-nostats"]));
  });

  it("never builds a shell string, so a filename with a space stays one argument", () => {
    const args = renderArgs(plan({ output: "/p/my video; rm -rf ~.mp4" }));
    expect(args.at(-1)).toBe("/p/my video; rm -rf ~.mp4");
  });

  it("builds the whole filtergraph for the skeleton fixture", () => {
    expect(graphOf(renderArgs(plan({ images: ["/p/images/001.png", "/p/images/002.png"] })))).toBe(
      "[0:v]trim=end_frame=1,setpts=PTS-STARTPTS," +
        "scale=7680:4320:force_original_aspect_ratio=increase,crop=7680:4320," +
        "zoompan=z='1+0.15*on/149':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':" +
        "s=1920x1080:fps=30,setsar=1[v0];" +
        "[1:v]trim=end_frame=1,setpts=PTS-STARTPTS," +
        "scale=7680:4320:force_original_aspect_ratio=increase,crop=7680:4320," +
        "zoompan=z='1.15-0.15*on/149':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':" +
        "s=1920x1080:fps=30,setsar=1[v1];" +
        "[v0][v1]concat=n=2:v=1:a=0[v];" +
        "[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0];" +
        "[a0]concat=n=1:v=0:a=1[a]",
    );
  });

  it("pre-scales to four times the frame in either orientation", () => {
    expect(graphOf(renderArgs(plan({ format: "9:16" })))).toContain(
      "scale=4320:7680:force_original_aspect_ratio=increase,crop=4320:7680",
    );
    expect(graphOf(renderArgs(plan({ format: "9:16" })))).toContain("s=1080x1920");
  });

  it("holds the zoom still on a one-frame slot rather than dividing by zero", () => {
    const graph = graphOf(
      renderArgs(
        plan({
          body: { path: "/p/audio-body.mp3", seconds: 0.1 },
          images: ["/a.png", "/b.png", "/c.png"],
        }),
      ),
    );
    expect(graph).toContain("zoompan=z='1':d=1:");
    expect(graph).toContain("zoompan=z='1.15':d=1:");
  });

  it("numbers the audio inputs after the images", () => {
    const graph = graphOf(renderArgs(plan({ outro: { path: "/p/o.mp3", seconds: 4 } })));
    expect(graph).toContain("[3:a]aformat");
    expect(graph).toContain("[4:a]aformat");
    expect(graph).toContain("[5:a]aformat");
    expect(graph).toContain("[a0][a1][a2]concat=n=3:v=0:a=1[a]");
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
