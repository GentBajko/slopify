import { afterEach, describe, expect, it } from "vitest";
import { defaultChoices } from "./defaults.js";
import {
  postsIn,
  postsOf,
  readPost,
  writeChoice,
  writeProgress,
  writeReddit,
  writeTextEdit,
} from "./repo.js";
import { socialDb } from "./social.fake.js";
import { noProgress } from "./state.js";

const now = new Date("2026-10-18T10:00:00.000Z");
let db = socialDb();
afterEach(() => {
  db.close();
  db = socialDb();
});

describe("social posts repo", () => {
  it("reads a post without a row as nothing chosen, edited or filled", () => {
    expect(readPost(db, { projectId: "p1", platform: "x" })).toEqual({
      ...noProgress,
      projectId: "p1",
      platform: "x",
      item: 0,
      choice: null,
      textEdit: null,
      textBase: null,
      reddit: null,
      updatedAt: null,
    });
  });

  it("keeps the pick, the edit, Reddit's fields and the progress apart", () => {
    const key = { projectId: "p1", platform: "reddit" } as const;
    writeChoice(db, key, defaultChoices.reddit, now);
    writeTextEdit(db, key, { text: "Mine", base: "Theirs" }, now);
    writeReddit(db, key, { subreddit: "videos", title: "T", flair: "", kind: "link" }, now);
    writeProgress(db, key, { ...noProgress, state: "waiting", waitingAt: "w" }, now);
    expect(readPost(db, key)).toMatchObject({
      choice: defaultChoices.reddit,
      textEdit: "Mine",
      textBase: "Theirs",
      reddit: { subreddit: "videos" },
      state: "waiting",
      waitingAt: "w",
      updatedAt: now.toISOString(),
    });
    writeChoice(db, key, null, now);
    writeTextEdit(db, key, null, now);
    expect(readPost(db, key)).toMatchObject({
      choice: null,
      textEdit: null,
      reddit: { subreddit: "videos" },
      state: "waiting",
    });
  });

  it("reads a damaged pick as none rather than failing", () => {
    db.prepare(
      "INSERT INTO social_posts (project_id,platform,choice_json,reddit_json,updated_at) VALUES ('p1','x','{\"text\":\"poem\"}','[]','t')",
    ).run();
    expect(readPost(db, { projectId: "p1", platform: "x" })).toMatchObject({
      choice: null,
      reddit: null,
    });
  });

  it("lists a project's posts and the posts in a state, oldest first", () => {
    writeProgress(
      db,
      { projectId: "p1", platform: "x" },
      { ...noProgress, state: "waiting", waitingAt: "2" },
      now,
    );
    writeProgress(
      db,
      { projectId: "p1", platform: "bluesky" },
      { ...noProgress, state: "waiting", waitingAt: "1" },
      now,
    );
    writeChoice(db, { projectId: "p1", platform: "tiktok" }, { off: true }, now);
    expect(postsOf(db, "p1").map((post) => post.platform)).toEqual(["bluesky", "tiktok", "x"]);
    expect(postsIn(db, ["waiting"]).map((post) => post.platform)).toEqual(["bluesky", "x"]);
    expect(postsIn(db, ["waiting"], "x").map((post) => post.platform)).toEqual(["x"]);
    expect(postsIn(db, ["posted"])).toEqual([]);
  });
});
