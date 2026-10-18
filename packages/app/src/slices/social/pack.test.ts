import { afterEach, describe, expect, it } from "vitest";
import { defaultChannelId } from "../channels/model.js";
import { setRelease } from "../studio/releases.js";
import { recordVideo } from "../studio/videos.js";
import { writeChannelSocial } from "./channel.js";
import { defaultChoices } from "./defaults.js";
import type { PostPack } from "./model.js";
import { packFor, postPacks } from "./pack.js";
import { writeChoice, writeProgress, writeReddit, writeTextEdit } from "./repo.js";
import { type PackFixture, packFixture } from "./social.fake.js";
import { noProgress } from "./state.js";

const now = new Date("2026-10-18T10:00:00.000Z");
const later = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();
const description = [
  "A lighthouse stands where the sea covers the rock twice a day.",
  "",
  "It took ten years to build. Its keepers lived inside for months.",
  "",
  "Chapters:",
  "0:00 The rock",
  "2:10 The tower",
  "5:00 The keepers",
  "",
  "#lighthouse #sea",
].join("\n");

let fixture: PackFixture | undefined;
afterEach(() => {
  fixture?.close();
  fixture = undefined;
});

function project(social: Parameters<typeof packFixture>[0] = {}): PackFixture {
  fixture = packFixture({ youtubeDescription: true, ...social });
  fixture.output("youtube_description", "description.txt", description);
  fixture.output("youtube_tags", "tags.txt", "lighthouse, sea engineering, keepers");
  fixture.output("video", "video.mp4", "mp4", {}, 600_000);
  fixture.output("image", "images/image-001.png", "png", { index: 1, prompt: "A tower. At dusk." });
  fixture.output("image", "images/image-002.png", "png", { index: 2 });
  return fixture;
}

const only = (one: PackFixture): PostPack => {
  const result = postPacks(one, "p1", now);
  if (!result.ok || result.packs.packs[0] === undefined) throw new Error("no pack");
  return result.packs.packs[0];
};

describe("postPacks", () => {
  it("has no posts for a project that posts nowhere", () => {
    const one = project();
    expect(postPacks(one, "p1", now)).toEqual({ ok: true, packs: { projectId: "p1", packs: [] } });
  });

  it("refuses an unknown project", () => {
    const one = project();
    expect(postPacks(one, "nope", now)).toEqual({ ok: false, reason: "unknown-project" });
  });

  it("makes X's default post: the summary, the video, two hashtags and the AI label", () => {
    const pack = only(project({ social: { x: defaultChoices.x } }));
    expect(pack.platform).toBe("x");
    expect(pack.text).toBe(
      "A lighthouse stands where the sea covers the rock twice a day.\n\n#lighthouse #seaEngineering",
    );
    expect(pack.media.map((one) => one.kind)).toEqual(["video"]);
    expect(pack.aiLabel).toBe(true);
    expect(pack.count).toEqual({ used: pack.text.length, max: 280, unit: "weighted" });
    expect(pack.xTier).toBe("free");
    expect(pack.composeUrl).toBe("https://x.com/compose/post");
    expect(pack.status).toEqual({ state: "none", url: null, message: null, at: null, by: null });
    expect(pack.warnings.map((one) => one.code)).toEqual(["video-too-long", "no-release"]);
  });

  it("lists the sites in a fixed order and leaves out one the project turned off", () => {
    const one = project({ social: { bluesky: defaultChoices.bluesky, x: defaultChoices.x } });
    writeChoice(one.db, { projectId: "p1", platform: "x" }, { off: true }, now);
    writeChoice(one.db, { projectId: "p1", platform: "reddit" }, defaultChoices.reddit, now);
    const result = postPacks(one, "p1", now);
    expect(result.ok && result.packs.packs.map((pack) => [pack.platform, pack.chosenHere])).toEqual(
      [
        ["reddit", true],
        ["bluesky", false],
      ],
    );
  });

  it("writes the description without its chapters and cuts it for Bluesky", () => {
    const pack = only(
      project({
        social: { bluesky: { ...defaultChoices.bluesky, text: "description", hashtags: 0 } },
      }),
    );
    expect(pack.text).not.toContain("0:00");
    expect(pack.count.unit).toBe("graphemes");
    expect(pack.warnings.map((one) => one.code)).not.toContain("text-cut");
    const long = only(
      project({
        social: {
          bluesky: {
            ...defaultChoices.bluesky,
            text: "custom",
            custom: `${"Words go on. ".repeat(40)}{{Slopify_Title}}`,
          },
        },
      }),
    );
    expect(long.count.used).toBeLessThanOrEqual(300);
    expect(long.warnings.find((one) => one.code === "text-cut")?.sentence).toMatch(
      /cut to fit Bluesky's 300 characters/,
    );
  });

  it("fills a custom text's keywords and the person's fields", () => {
    const pack = only(
      project({
        values: { Host: "Ana" },
        social: {
          linkedin: {
            ...defaultChoices.linkedin,
            text: "custom",
            custom: "New: {{Slopify_Title}} with {{Host}}.\n{{Slopify_Channel}}",
            hashtags: 0,
          },
        },
      }),
    );
    expect(pack.text).toBe("New: Episode one with Ana.");
  });

  it("uses the keyword digest's summary when the run wrote one", () => {
    const one = project({ social: { x: { ...defaultChoices.x, hashtags: 0, media: {} } } });
    one.db.exec(
      "INSERT INTO project_revisions (id,project_id,config,content,fingerprints,created_at) VALUES ('r1','p1','{}','{}','{}','t')",
    );
    one.db.exec("INSERT INTO project_heads (project_id,revision_id) VALUES ('p1','r1')");
    one.db
      .prepare(
        "INSERT INTO revision_pieces (id,project_id,revision_id,piece_key,stage_kind,asset_id,fingerprint,descriptor,publication_id,selected,created_at) VALUES ('k1','p1','r1','article:digest','article',NULL,'f',?,NULL,1,'t')",
      )
      .run(
        JSON.stringify({
          id: "s1",
          stageId: "st",
          kind: "chunk",
          idx: 0,
          state: "done",
          payload: JSON.stringify({ digest: { Slopify_Summary: "How a tower stood on a rock." } }),
        }),
      );
    expect(only(one).text).toBe("How a tower stood on a rock.");
  });

  it("uses the post prompt's text, and says what's missing before it is written", () => {
    const choice = { ...defaultChoices.x, text: "prompt" as const, prompt: "X post", hashtags: 0 };
    const waiting = only(project({ social: { x: choice } }));
    expect(waiting.text).toBe("");
    expect(waiting.warnings.find((one) => one.code === "text-missing")?.sentence).toMatch(
      /isn't written yet\. It is written by the post prompt/,
    );
    fixture?.output("social_post", "social/post-01.txt", "Written for X.\n", { platform: "x" });
    if (fixture === undefined) throw new Error("no fixture");
    expect(only(fixture).text).toBe("Written for X.");
  });

  it("keeps the person's hand edit, and warns when it runs over", () => {
    const one = project({ social: { x: { ...defaultChoices.x, media: {} } } });
    writeTextEdit(one.db, { projectId: "p1", platform: "x" }, { text: "Mine.", base: "x" }, now);
    const pack = only(one);
    expect(pack).toMatchObject({ text: "Mine.", edited: true, count: { used: 5 } });
    expect(pack.generated).toContain("A lighthouse");
    writeTextEdit(
      one.db,
      { projectId: "p1", platform: "x" },
      { text: "a".repeat(281), base: "x" },
      now,
    );
    expect(only(one).warnings.find((w) => w.code === "text-too-long")?.sentence).toMatch(
      /The text is 281 characters; X takes 280\./,
    );
  });

  it("adds the YouTube link once the video is on YouTube, and says so before", () => {
    const choice = { ...defaultChoices.linkedin, link: true, hashtags: 0, media: {} };
    const one = project({ social: { linkedin: choice } });
    expect(only(one).warnings.map((w) => w.code)).toContain("link-missing");
    recordVideo(one.db, "p1", null, "abcdefghijk", now.toISOString());
    expect(only(one).text).toMatch(/\n\nhttps:\/\/youtu\.be\/abcdefghijk$/);
  });

  it("schedules X at the long video's release and TikTok at its short's", () => {
    const one = project({
      social: { x: { ...defaultChoices.x, media: {} }, tiktok: defaultChoices.tiktok },
    });
    one.output(
      "shorts",
      "shorts.json",
      JSON.stringify({ shorts: [{ number: 1, title: "S", description: "D", hashtags: ["#fox"] }] }),
    );
    one.output("short_video", "shorts/short-01.mp4", "mp4", { short: 1 }, 70_000);
    setRelease(one.db, "p1", 0, later(5), null, now);
    setRelease(one.db, "p1", 1, later(30), null, now);
    expect(packFor(one, "p1", "x", now)?.schedule).toEqual({ mode: "native", at: later(5) });
    const tiktok = packFor(one, "p1", "tiktok", now);
    expect(tiktok?.schedule).toEqual({ mode: "native", at: later(30) });
    expect(tiktok?.media.map((m) => m.kind)).toEqual(["short"]);
    expect(tiktok?.hashtags).toContain("#fox");
  });

  it("reads the channel's X subscription for its warnings", () => {
    const one = project({ social: { x: defaultChoices.x } });
    writeChannelSocial(one.db, defaultChannelId, { xTier: "premium" });
    const pack = only(one);
    expect(pack.xTier).toBe("premium");
    expect(pack.count.max).toBe(25_000);
    expect(pack.warnings.map((w) => w.code)).not.toContain("video-too-long");
  });

  it("makes Reddit's link post with its own fields and the submit page filled in", () => {
    const one = project({ social: { reddit: defaultChoices.reddit } });
    const fresh = only(one);
    expect(fresh.reddit).toEqual({ subreddit: "", title: "Episode one", flair: "", kind: "link" });
    expect(fresh.warnings.map((w) => w.code)).toContain("subreddit-missing");
    expect(fresh.aiLabel).toBe(false);
    writeReddit(
      one.db,
      { projectId: "p1", platform: "reddit" },
      { subreddit: "lighthouses", title: "A tower", flair: "", kind: "link" },
      now,
    );
    recordVideo(one.db, "p1", null, "abcdefghijk", now.toISOString());
    const pack = only(one);
    const url = new URL(pack.composeUrl);
    expect(url.pathname).toBe("/r/lighthouses/submit");
    expect(url.searchParams.get("url")).toBe("https://youtu.be/abcdefghijk");
    expect(pack.warnings.map((w) => w.code)).not.toContain("subreddit-missing");
  });

  it("shows where the post stands", () => {
    const one = project({ social: { x: defaultChoices.x } });
    writeProgress(
      one.db,
      { projectId: "p1", platform: "x" },
      {
        ...noProgress,
        state: "posted",
        postedAt: "t",
        url: "https://x.com/a/status/1",
        by: "person",
      },
      now,
    );
    expect(only(one).status).toEqual({
      state: "posted",
      url: "https://x.com/a/status/1",
      message: null,
      at: "t",
      by: "person",
    });
  });
});
