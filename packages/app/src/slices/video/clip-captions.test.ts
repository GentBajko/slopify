import { describe, expect, it } from "vitest";
import { shortCaptionsAss } from "../shorts/captions.js";
import { serializeAss } from "../subtitles/captions.js";
import { speakerPanelEvents } from "../voices/panel.js";
import { captionedClips, clipCaptions, drawsOwnCaptions, readCaptions } from "./clip-captions.js";
import { slideshowClips } from "./ffmpeg.js";
import { planRender } from "./plan.js";

const head = [
  "[Script Info]",
  "PlayResX: 1920",
  "",
  "[V4+ Styles]",
  "Style: Default,Alegreya,72,&H00FFFFFF",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
].join("\n");
const script = (...events: string[]): string => `${[head, ...events].join("\n")}\n`;
const event = (start: string, end: string, text: string): string =>
  `Dialogue: 0,${start},${end},Default,,0,0,0,,{\\an2\\pos(960,1020)}${text}`;
const fps = 30;

// The events of a clip's script, as [start, end, text].
function shown(ass: string): string[][] {
  return ass
    .split("\n")
    .filter((line) => line.startsWith("Dialogue:"))
    .map((line) => {
      const fields = line.split(",");
      return [
        fields[1] ?? "",
        fields[2] ?? "",
        fields
          .slice(9)
          .join(",")
          .replace(/^\{[^}]*\}/, ""),
      ];
    });
}

describe("clipCaptions", () => {
  it("keeps the script's header and styles as they are", () => {
    const captions = readCaptions(script(event("0:00:01.00", "0:00:02.00", "One")), fps);
    expect(clipCaptions(captions, 0, 90, fps).startsWith(`${head}\n`)).toBe(true);
    expect(clipCaptions(captions, 900, 90, fps)).toBe(`${head}\n`);
  });

  // An event is on the frames at or after its start and before its end. Seconds 1 to 2 are
  // frames 30 to 59; each time is written half a frame early, between two frames, so no
  // rounding in the renderer can put it on the wrong one.
  it("times an event from the clip's own first frame", () => {
    const captions = readCaptions(script(event("0:00:01.00", "0:00:02.00", "One")), fps);
    expect(shown(clipCaptions(captions, 0, 90, fps))).toEqual([
      ["0:00:00.98", "0:00:01.98", "One"],
    ]);
    expect(shown(clipCaptions(captions, 15, 90, fps))).toEqual([
      ["0:00:00.48", "0:00:01.48", "One"],
    ]);
  });

  it("starts an event that began before the clip with it, and ends one that runs past it", () => {
    const captions = readCaptions(script(event("0:00:01.00", "0:00:02.00", "One")), fps);
    // Frames 45 to 74: the event's frames 45 to 59 are the clip's 0 to 14.
    expect(shown(clipCaptions(captions, 45, 30, fps))).toEqual([
      ["0:00:00.00", "0:00:00.48", "One"],
    ]);
    // Frames 20 to 39: the event's frames 30 to 39 are the clip's 10 to 19, its last.
    expect(shown(clipCaptions(captions, 20, 20, fps))).toEqual([
      ["0:00:00.32", "0:00:00.65", "One"],
    ]);
  });

  it("leaves out what the clip never shows", () => {
    const captions = readCaptions(
      script(
        event("0:00:01.00", "0:00:02.00", "One"),
        event("0:00:02.00", "0:00:03.00", "Two"),
        event("0:00:05.00", "0:00:05.00", "Never"),
      ),
      fps,
    );
    // Frames 60 to 89 are all of Two and none of One, which ends as frame 60 begins.
    expect(shown(clipCaptions(captions, 60, 30, fps)).map((one) => one[2])).toEqual(["Two"]);
    expect(shown(clipCaptions(captions, 0, 30, fps))).toEqual([]);
    expect(shown(clipCaptions(captions, 120, 60, fps))).toEqual([]);
  });

  it("keeps a comma in the words, and the events in their order", () => {
    const captions = readCaptions(
      script(
        event("0:00:00.00", "0:00:01.00", "First, then"),
        event("0:00:00.50", "0:00:01.00", "second"),
      ),
      fps,
    );
    expect(shown(clipCaptions(captions, 0, 30, fps)).map((one) => one[2])).toEqual([
      "First, then",
      "second",
    ]);
  });

  it("gives two clips the same script only when they show the same", () => {
    const captions = readCaptions(script(event("0:00:01.00", "0:00:02.00", "One")), fps);
    expect(clipCaptions(captions, 300, 30, fps)).toBe(clipCaptions(captions, 600, 90, fps));
    expect(clipCaptions(captions, 30, 30, fps)).not.toBe(clipCaptions(captions, 300, 30, fps));
  });

  it("refuses a caption whose times it cannot read, in a sentence", () => {
    expect(() => readCaptions(script("Dialogue: 0,soon,later,Default,,0,0,0,,Hm"), fps)).toThrow(
      /Slopify hit an internal error \(a caption's times could not be read\)\. Press Make the video again/,
    );
  });

  // The speaker panel's name band fades in over 200 ms and out over 200 ms. Seconds 1 to 5,
  // frames 30 to 149.
  describe("an event that fades, cut by a clip", () => {
    const faded = readCaptions(
      script(
        "Dialogue: 2,0:00:01.00,0:00:05.00,Default,,0,0,0,,{\\an1\\pos(96,800)\\fad(200,200)}Mara",
      ),
      fps,
    );
    const tags = (start: number, count: number): string =>
      /\\fad[^}]*/.exec(clipCaptions(faded, start, count, fps))?.[0] ?? "";

    // The part is written 20 ms before the event's own start, between two frames, so its
    // fade in runs from 20 to 220 ms and its fade out from 3820 to 4020: the same moments.
    it("fades at the event's own moments in a clip that shows all of it", () => {
      expect(tags(0, 300)).toBe("\\fade(255,0,255,20,220,3820,4020)");
    });

    // The clip's frames 0 to 59 end at second 2, before the fade out comes.
    it("fades in but not out in the clip that leaves it early", () => {
      expect(tags(0, 60)).toBe("\\fade(255,0,255,20,220,3820,4020)");
      expect(shown(clipCaptions(faded, 0, 60, fps))[0]?.slice(0, 2)).toEqual([
        "0:00:00.98",
        "0:00:01.98",
      ]);
    });

    it("neither fades in nor out in a clip in the middle of it", () => {
      // From frame 60, second 2: 1000 ms into the event.
      expect(tags(60, 30)).toBe("\\fade(0,0,255,0,0,2800,3000)");
    });

    it("carries on a fade in it was cut inside", () => {
      // From frame 33: 100 ms into the event, half way through its fade in.
      expect(tags(33, 60)).toBe("\\fade(128,0,255,0,100,3700,3900)");
    });

    it("carries on a fade out it was cut inside", () => {
      // From frame 147: 3900 ms into the event, half way through its fade out.
      expect(tags(147, 60)).toBe("\\fade(128,255,255,0,100,100,100)");
    });
  });

  // The scripts the stages really write.
  it("reads the captions a video and a short are given", () => {
    const video = serializeAss(
      [
        { start: 1, end: 2, text: "One" },
        { start: 2.5, end: 4, text: "Two, three" },
      ],
      { width: 1920, height: 1080, fontName: "Alegreya", fontSize: 72, position: "bottom" },
    );
    expect(shown(clipCaptions(readCaptions(video, fps), 0, 150, fps)).map((one) => one[2])).toEqual(
      ["One", "Two, three"],
    );
    const short = shortCaptionsAss(
      [
        { text: "One", start: 0.2, end: 0.5 },
        { text: "two", start: 0.5, end: 0.9 },
      ],
      { width: 1080, height: 1920, fontName: "Alegreya", title: { text: "A title", seconds: 2 } },
    );
    const events = shown(clipCaptions(readCaptions(short, fps), 0, 60, fps));
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0]?.[2]).toContain("A title");
  });

  // A clip's script is cut from the whole, so anything timed from an event's own start must
  // be carried across the cut. The fade is; nothing else may be written without that.
  it("finds nothing timed from an event's start in what the stages write, but the fade", () => {
    const cues = [
      { start: 1, end: 2, text: "One", speaker: "a" },
      { start: 2.5, end: 4, text: "Two", speaker: "b" },
    ];
    const speakers = [
      { id: "a", name: "Mara", colour: "#ff8800" },
      { id: "b", name: "Iven", colour: "#0088ff", portrait: true },
    ];
    const frame = { width: 1920, height: 1080 };
    const written = [
      serializeAss(cues, {
        ...frame,
        fontName: "Alegreya",
        fontSize: 72,
        speakers: {
          styles: {
            a: { name: "Mara", colour: "#ff8800" },
            b: { name: "Iven", colour: "#0088ff" },
          },
          nameTags: true,
        },
        overlay: speakerPanelEvents(cues, speakers, frame, 5),
      }),
      shortCaptionsAss(
        [
          { text: "One", start: 0.2, end: 0.5 },
          { text: "two", start: 0.5, end: 0.9 },
        ],
        { width: 1080, height: 1920, fontName: "Alegreya", title: { text: "A title", seconds: 2 } },
      ),
    ].join("\n");
    expect(written).toContain("\\fad(200,200)");
    expect(written.replaceAll("\\fad(200,200)", "")).not.toMatch(
      /\\(t\(|move\(|fade?\(|k\d|K\d|kf\d|ko\d)/,
    );
    expect(() => readCaptions(written, fps)).not.toThrow();
  });
});

describe("drawsOwnCaptions", () => {
  const clips = [
    { name: "c1.mp4", frames: 100 },
    { name: "c2.mp4", frames: 100 },
  ];

  it("has the clips draw their own captions when most of the video is stills shown once", () => {
    expect(drawsOwnCaptions(clips, ["c1.mp4", "c2.mp4"])).toBe(true);
    expect(drawsOwnCaptions(clips, ["c1.mp4", "c2.mp4", "c1.mp4"])).toBe(true);
  });

  // The distinct clips are a third of the video at three rounds: from there on, encoding
  // them once and burning the captions over the joined video is the less work.
  it("burns them over the joined clips when the same stills come round and round", () => {
    const rounds = (count: number): string[] =>
      Array.from({ length: count }, () => ["c1.mp4", "c2.mp4"]).flat();
    expect(drawsOwnCaptions(clips, rounds(3))).toBe(true);
    expect(drawsOwnCaptions(clips, rounds(4))).toBe(false);
    expect(drawsOwnCaptions(clips, rounds(40))).toBe(false);
    expect(drawsOwnCaptions(clips, [])).toBe(false);
  });
});

describe("captionedClips", () => {
  // Two stills, the first shown again third: two distinct pictures, three 1-second slots.
  const { clips, order } = slideshowClips(
    planRender({
      format: "16:9",
      gapSeconds: 0,
      edgeSeconds: 0,
      imageSeconds: 1,
      zoomPercent: 22.5,
      motionStyle: "zoom",
      images: ["/p/a.png", "/p/b.png", "/p/a.png"],
      output: "/p/video.mp4",
    }).editList,
  );

  it("starts from a timeline where the first still comes round again", () => {
    expect(order).toEqual(["c1.mp4", "c2.mp4", "c1.mp4"]);
  });

  it("makes a clip again for each thing it says, at its own place in the video", () => {
    const captions = readCaptions(script(event("0:00:00.50", "0:00:02.50", "Long")), fps);
    const made = captionedClips(clips, order, captions, fps);
    expect(made.order).toEqual(["f1.mp4", "f2.mp4", "f3.mp4"]);
    expect(made.clips.map((one) => one.clip.name)).toEqual(["c1.mp4", "c2.mp4", "c1.mp4"]);
    expect(made.clips.map((one) => shown(one.said ?? "").map((line) => line.slice(0, 2)))).toEqual([
      // To the end of a 30-frame clip is half a frame before frame 30, as every time is.
      [["0:00:00.48", "0:00:00.98"]],
      [["0:00:00.00", "0:00:00.98"]],
      [["0:00:00.00", "0:00:00.48"]],
    ]);
  });

  it("makes a clip once when it says the same each time it plays", () => {
    const made = captionedClips(clips, order, readCaptions(script(), fps), fps);
    expect(made.order).toEqual(["f1.mp4", "f2.mp4", "f1.mp4"]);
    expect(made.clips.map((one) => one.clip.name)).toEqual(["c1.mp4", "c2.mp4"]);
  });
});
