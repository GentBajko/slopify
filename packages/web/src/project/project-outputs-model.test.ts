import type { RunConfig } from "@app/slices/admission/model.js";
import { describe, expect, it } from "vitest";
import { body, output, stage } from "@/routes/project-fixtures";
import { projectOutputs } from "./project-outputs-model.js";
import { makesYoutubeVideo } from "./sections.js";

const base = body({ status: "done", stages: [], outputs: [] }).project.config as RunConfig;
const articleOnly: RunConfig = {
  ...base,
  sources: { ...base.sources, audio: "off", images: "off", thumbnail: "off", video: "off" },
};

describe("projectOutputs", () => {
  it("lists an article project's article with Markdown first and the other formats beside it", () => {
    const md = output("article_md", "article", { createdAt: "2026-10-03T13:40:00.000Z" });
    const txt = output("article_txt", "article");
    const rows = projectOutputs({
      config: articleOnly,
      stages: [stage("research", "skipped"), stage("article", "done"), stage("audio", "skipped")],
      outputs: [md, txt],
    });
    expect(rows.map((row) => row.kind)).toEqual(["article"]);
    const [article] = rows;
    expect(article?.state).toBe("current");
    expect(article?.stateWords).toBe("Current");
    expect(article?.primary?.label).toBe("Markdown (.bin)");
    expect(article?.alternatives.map((one) => one.label)).toEqual(["Plain text (.bin)"]);
    expect(article?.version).toMatch(/^Made \d+ Oct/);
  });

  it("counts a provided article, which only has plain text, as made", () => {
    const txt = output("article_txt", "article");
    const [article] = projectOutputs({
      config: articleOnly,
      stages: [stage("research", "skipped"), stage("article", "provided")],
      outputs: [txt],
    });
    expect(article?.state).toBe("current");
    expect(article?.primary?.label).toBe("Plain text (.bin)");
    expect(article?.alternatives).toEqual([]);
  });

  it("names which article a narration reads, and says when it reads the previous one", () => {
    const md = output("article_md", "article", { createdAt: "2026-10-03T13:40:00.000Z" });
    const wav = output("audio_export", "video", { createdAt: "2026-10-04T09:00:00.000Z" });
    const config: RunConfig = {
      ...articleOnly,
      sources: { ...articleOnly.sources, audio: "generate" },
    };
    const stages = [stage("article", "done"), stage("audio", "done"), stage("video", "done")];
    const current = projectOutputs({ config, stages, outputs: [md, wav] });
    const narration = current.find((row) => row.kind === "narration");
    expect(narration?.primary?.output.id).toBe(wav.id);
    expect(narration?.version).toMatch(/from the text of 3 Oct/);
    const older = projectOutputs({
      config,
      stages,
      outputs: [md, wav],
      states: new Map([[wav.id, "outdated"]]),
    }).find((row) => row.kind === "narration");
    expect(older?.state).toBe("older");
    expect(older?.stateWords).toMatch(/previous/i);
    expect(older?.version).toMatch(/before the current text/);
    expect(older?.next).toMatch(/Update it from Narration, or keep this version/);
  });

  it("offers an audiobook as chaptered M4B first and a podcast as its MP3 episode with a transcript", () => {
    const m4b = output("audio_m4b", "video");
    const mp3 = output("audio_mp3", "video");
    const script = output("script_md", "article");
    const stages = [stage("article", "done"), stage("audio", "done"), stage("video", "done")];
    const voiced = (format: "audiobook" | "podcast"): RunConfig => ({
      ...articleOnly,
      sources: { ...articleOnly.sources, audio: "generate" },
      voices: {
        format,
        source: "attribute",
        speakers: [],
        turnGapSeconds: 0.35,
        nameTags: false,
        nativeDialogue: true,
        audioFiles: true,
      },
    });
    const book = projectOutputs({
      config: voiced("audiobook"),
      stages,
      outputs: [m4b, mp3, script],
    });
    const audiobook = book.find((row) => row.kind === "voices");
    expect(audiobook?.title).toBe("Audiobook");
    expect(audiobook?.primary?.label).toBe("Audiobook with chapters (.bin)");
    expect(audiobook?.primary?.output.id).toBe(m4b.id);
    expect(audiobook?.alternatives.map((one) => one.output.id)).toEqual([mp3.id, script.id]);
    const show = projectOutputs({ config: voiced("podcast"), stages, outputs: [m4b, mp3, script] });
    const podcast = show.find((row) => row.kind === "voices");
    expect(podcast?.title).toBe("Podcast");
    expect(podcast?.primary?.output.id).toBe(mp3.id);
    expect(podcast?.alternatives.map((one) => one.label)).toContain("Transcript by speaker (.bin)");
    expect(book.some((row) => row.kind === "narration")).toBe(false);
  });

  it("downloads images, thumbnails and shorts as sets, and puts subtitles beside the video", () => {
    const images = [1, 2].map((index) => output("image", "images", { meta: { index } }));
    const thumbs = [1, 2].map((index) => output("thumbnail", "thumbnail", { meta: { index } }));
    const shorts = [2, 1].map((short) =>
      output("short_video", "video", { id: `short-${String(short)}`, meta: { short } }),
    );
    const video = output("video", "video");
    const srt = output("subtitles_srt", "video");
    const config: RunConfig = { ...base, thumbnailCount: 3, shorts: undefined };
    const rows = projectOutputs({
      config,
      stages: ["article", "audio", "images", "thumbnail", "video"].map((kind) =>
        stage(kind as "article", "done"),
      ),
      outputs: [...images, ...thumbs, video, srt, ...shorts],
    });
    expect(rows.find((row) => row.kind === "images")?.set?.members.map((one) => one.id)).toEqual([
      ...images.map((one) => one.id),
      ...thumbs.map((one) => one.id),
    ]);
    expect(rows.find((row) => row.kind === "thumbnails")?.set?.set).toBe("thumbnails");
    const shown = rows.find((row) => row.kind === "video");
    expect(shown?.primary?.output.id).toBe(video.id);
    expect(shown?.alternatives.map((one) => one.output.id)).toContain(srt.id);
    expect(rows.find((row) => row.kind === "shorts")?.set?.members.map((one) => one.id)).toEqual([
      "short-1",
      "short-2",
    ]);
  });

  it("says failure and work in progress in words", () => {
    const rows = projectOutputs({
      config: { ...articleOnly, sources: { ...articleOnly.sources, document: "generate" } },
      stages: [stage("article", "running"), stage("document", "failed")],
      outputs: [],
    });
    expect(rows.find((row) => row.kind === "article")?.stateWords).toBe("In progress");
    const pdf = rows.find((row) => row.kind === "pdf");
    expect(pdf?.state).toBe("failed");
    expect(pdf?.stateWords).toBe("Failed before it was made");
    expect(pdf?.next).toBe("See why in PDF, then try again");
  });
});

describe("makesYoutubeVideo", () => {
  it("is true only for a video that writes YouTube text or makes Shorts", () => {
    expect(makesYoutubeVideo(base, [])).toBe(false);
    expect(makesYoutubeVideo({ ...base, youtubeDescription: true }, [])).toBe(true);
    expect(makesYoutubeVideo(base, [output("youtube_description", "video")])).toBe(true);
    expect(makesYoutubeVideo({ ...articleOnly, youtubeDescription: true }, [])).toBe(false);
  });
});
