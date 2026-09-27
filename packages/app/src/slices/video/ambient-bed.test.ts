import { describe, expect, it } from "vitest";
import { ambientBedFields } from "../admission/rules.js";
import { brandedForm } from "../channels/runs.js";
import { brandKitSchema } from "../channels/schema.js";
import { toAdmissionDraft } from "../play-drafts/convert.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { DraftAttachment } from "../play-drafts/model.js";
import type { StagedFile } from "../storage/model.js";
import { ambientBedProblems, ambientTailExtension } from "./ambient-bed.js";
import { joinArgs } from "./ffmpeg.js";
import { type PlanInput, planRender, withTail } from "./plan.js";

const rain = { source: "rain", levelDb: -18, fadeInSeconds: 3, tailSeconds: 6 } as const;
const narrated = { sources: { video: "generate", audio: "generate" } } as const;

function plan(over: Partial<PlanInput> = {}) {
  return planRender({
    format: "16:9",
    gapSeconds: 0,
    edgeSeconds: 2,
    imageSeconds: 5,
    zoomPercent: 0,
    motionStyle: "still",
    body: { path: "/p/body.mp3", seconds: 10 },
    images: ["/p/1.png"],
    output: "/p/video.mp4",
    ...over,
  });
}

describe("ambient bed settings", () => {
  it("take the documented ranges and say what to enter", () => {
    expect(ambientBedProblems(rain)).toEqual([]);
    expect(
      ambientBedProblems({ source: "upload", levelDb: -40, fadeInSeconds: 0, tailSeconds: 30 }),
    ).toEqual([]);
    const refused = ambientBedProblems({
      source: "rain",
      levelDb: -3,
      fadeInSeconds: 0.3,
      tailSeconds: Number.NaN,
    });
    expect(refused.map((problem) => problem.field)).toEqual(["level", "fadeIn", "tail"]);
    expect(refused[0]?.message).toMatch(/between -40 and -6 dB/);
  });

  it("lengthen the video only by the tail beyond the silence already there", () => {
    expect(ambientTailExtension({ ...narrated, ambientBed: rain }, 2)).toBe(4);
    expect(ambientTailExtension({ ...narrated, ambientBed: rain }, 8)).toBe(0);
    expect(ambientTailExtension(narrated, 2)).toBe(0);
    expect(
      ambientTailExtension({ sources: { video: "off", audio: "generate" }, ambientBed: rain }, 2),
    ).toBe(0);
  });
});

describe("the plan with a bed", () => {
  it("is the plan it always was without one", () => {
    expect(plan({ bed: undefined })).toEqual(plan());
    expect(plan().editList.bed).toBeUndefined();
  });

  it("runs the trailing silence to the tail and fades the bed out from the narration's end", () => {
    const source = { kind: "noise", preset: "rain" } as const;
    const bedded = plan({ bed: { source, levelDb: -18, fadeInSeconds: 3, tailSeconds: 6 } });
    // 2 s lead-in, 10 s of narration, then 6 s in place of the 2 s edge.
    expect(bedded.totalSeconds).toBe(18);
    expect(bedded.editList.audio.at(-1)).toEqual({ kind: "edge", path: null, seconds: 6 });
    expect(bedded.editList.bed).toEqual({
      source,
      levelDb: -18,
      fadeInSeconds: 3,
      fadeOutAt: 12,
      fadeOutSeconds: 6,
    });
    // A tail inside the silence keeps the length.
    const short = plan({ bed: { source, levelDb: -18, fadeInSeconds: 3, tailSeconds: 1 } });
    expect(short.totalSeconds).toBe(14);
    // A silent video has no narration to lie under.
    const silent = plan({
      body: undefined,
      bed: { source, levelDb: -18, fadeInSeconds: 3, tailSeconds: 6 },
    });
    expect(silent.editList.bed).toBeUndefined();
  });

  it("adds a tail after a video with no trailing silence", () => {
    const audio = [{ kind: "body" as const, path: "/b.mp3", seconds: 3 }];
    expect(withTail(audio, 4)).toEqual([...audio, { kind: "edge", path: null, seconds: 4 }]);
    expect(withTail(audio, 0)).toBe(audio);
  });

  it("joins exactly as before without a bed, and ducks the bed under the narration with one", () => {
    const plain = plan().editList;
    expect(joinArgs(plain, "/o.mp4", "/l.ffconcat")).toEqual(
      joinArgs({ ...plain, bed: undefined }, "/o.mp4", "/l.ffconcat"),
    );
    expect(joinArgs(plain, "/o.mp4", "/l.ffconcat").join(" ")).not.toMatch(/anoisesrc|sidechain/);
    const bedded = plan({
      bed: {
        source: { kind: "file", path: "/p/bed.mp3" },
        levelDb: -20,
        fadeInSeconds: 0,
        tailSeconds: 6,
      },
    }).editList;
    const args = joinArgs(bedded, "/o.mp4", "/l.ffconcat");
    expect(args.join(" ")).toContain("-stream_loop -1 -i /p/bed.mp3");
    const graph = args[args.indexOf("-filter_complex") + 1] ?? "";
    expect(graph).toContain("volume=-20dB");
    expect(graph).not.toContain("afade=t=in");
    expect(graph).toContain("afade=t=out:st=12.000000:d=6.000");
    expect(graph).toContain("[bed][key]sidechaincompress=");
    expect(graph).toContain("[voice][ducked]amix=inputs=2:duration=first");
  });
});

describe("Play and the channel", () => {
  const h = draftFixture();
  const document = h.document;
  const db = h.deps.db;

  const convert = (form: typeof document.form, attachments: readonly DraftAttachment[] = []) =>
    toAdmissionDraft({
      document: { ...document, form },
      attachments,
      entries: [],
      silenceGapSeconds: 1,
    });

  it("keep a built-in bed in the channel's brand kit, in range", () => {
    expect(brandKitSchema.parse({ ambientBed: rain })).toEqual({ ambientBed: rain });
    const loud = brandKitSchema.safeParse({ ambientBed: { ...rain, levelDb: 0 } });
    expect(loud.success ? "" : loud.error.issues[0]?.message).toMatch(
      /Brand kit → Ambient sound on the channel page/,
    );
    // A channel has nowhere to keep a file of its own.
    expect(brandKitSchema.safeParse({ ambientBed: { ...rain, source: "upload" } }).success).toBe(
      false,
    );
  });

  it("fill an unset bed from the channel, but not one set to None", () => {
    const kit = { ambientBed: { ...rain, source: "wind" as const } };
    expect(brandedForm(db, document.form, kit, []).ambientBed).toEqual({
      source: "wind",
      level: "-18",
      fadeIn: "3",
      tail: "6",
    });
    const none = {
      ...document.form,
      ambientBed: { source: "none" as const, level: "", fadeIn: "", tail: "" },
    };
    expect(brandedForm(db, none, kit, []).ambientBed?.source).toBe("none");
    expect(
      brandedForm(db, { ...document.form, useBrandKit: false }, kit, []).ambientBed,
    ).toBeUndefined();
  });

  it("turn a typed bed into the run's settings, and refuse a bad number where the control is", () => {
    const form = {
      ...document.form,
      ambientBed: { source: "rain" as const, level: "-18", fadeIn: "3", tail: "6" },
    };
    const converted = convert(form);
    expect(converted.ok ? converted.draft.ambientBed : converted.fields).toEqual(rain);
    const bad = convert({ ...form, ambientBed: { ...form.ambientBed, level: "loud" } });
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(bad.fields).toContainEqual({
        field: "ambientBed.level",
        message: expect.stringMatching(/Outputs → Export → Ambient sound/),
      });
    // With the video off there is nothing to lie under, so nothing is asked for.
    const wav = convert({
      ...form,
      sources: { ...form.sources, video: "off" },
      ambientBed: { ...form.ambientBed, level: "loud" },
    });
    expect(wav.ok && wav.draft.ambientBed).toBe(undefined);
  });

  it("carry the uploaded file's staged id, and refuse a missing one", () => {
    const form = {
      ...document.form,
      ambientBed: { source: "upload" as const, level: "-18", fadeIn: "3", tail: "6" },
      provided: { ...document.form.provided, ambientBed: { attachmentId: "a1", name: "bed.mp3" } },
    };
    const attachment: DraftAttachment = {
      id: "a1",
      kind: "audio",
      name: "bed.mp3",
      state: "ready",
      stagedFileId: "s1",
      bytes: 10,
      error: null,
    } as DraftAttachment;
    const converted = convert(form, [attachment]);
    expect(converted.ok && converted.draft.provided.ambientBed).toBe("s1");
    const missing = convert(form, []);
    expect(missing.ok ? [] : missing.fields.map((field) => field.field)).toContain(
      "ambientBed.file",
    );
  });

  it("admit an uploaded bed only with its staged audio file", () => {
    const draft = {
      sources: { ...document.form.sources, document: undefined },
      ambientBed: { ...rain, source: "upload" as const },
      provided: { ambientBed: "s1" },
    };
    const staged = (state: StagedFile["state"]): StagedFile =>
      ({ id: "s1", stageKind: "audio", state }) as StagedFile;
    expect(ambientBedFields(draft, [staged("staged")])).toEqual([]);
    expect(ambientBedFields(draft, [staged("copying")])[0]?.message).toMatch(/still uploading/);
    expect(ambientBedFields(draft, [])[0]?.field).toBe("ambientBed.file");
    h.close();
  });
});
