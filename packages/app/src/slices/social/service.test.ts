import { afterEach, describe, expect, it } from "vitest";
import { defaultChannelId } from "../channels/model.js";
import { writeChannelSocial } from "./channel.js";
import { defaultChoices } from "./defaults.js";
import { readPost, writeProgress } from "./repo.js";
import { fillPost, linksToFind, nextPost, reportPost } from "./service.js";
import { type PackFixture, packFixture } from "./social.fake.js";
import { noProgress } from "./state.js";

const now = new Date("2026-10-18T10:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
let fixture: PackFixture | undefined;
afterEach(() => {
  fixture?.close();
  fixture = undefined;
});
function project(): PackFixture {
  fixture = packFixture({ youtubeDescription: true, social: { x: defaultChoices.x } });
  fixture.output("youtube_description", "description.txt", "A tower on a rock.");
  return fixture;
}

describe("linksToFind", () => {
  it("looks a filled post up on the channel's profile ten minutes after it was filled", () => {
    const one = project();
    writeChannelSocial(one.db, defaultChannelId, { accounts: { x: "@towers" } });
    writeProgress(
      one.db,
      { projectId: "p1", platform: "x" },
      { ...noProgress, state: "filled", filledAt: minutesAgo(11) },
      now,
    );
    expect(linksToFind(one, now)).toEqual([
      {
        projectId: "p1",
        platform: "x",
        profileUrl: "https://x.com/towers",
        start: "A tower on a rock.",
      },
    ]);
  });
});

describe("nextPost", () => {
  it("drops a waiting post whose site the project no longer posts to, and takes the next", () => {
    const one = project();
    writeProgress(
      one.db,
      { projectId: "p1", platform: "bluesky" },
      { ...noProgress, state: "waiting", waitingAt: minutesAgo(5) },
      now,
    );
    expect(nextPost(one, "bluesky", now)).toBeUndefined();
    expect(readPost(one.db, { projectId: "p1", platform: "bluesky" }).state).toBe("none");
  });
});

describe("fillPost and reportPost", () => {
  it("refuses a site the project doesn't post to, naming where to turn it on", () => {
    const one = project();
    const refused = fillPost(one, "p1", "reddit", now);
    expect(refused).toMatchObject({ ok: false, status: 404 });
    expect(refused.ok ? "" : refused.sentence).toMatch(
      /doesn't post to Reddit\. A project's sites come from its template: turn Reddit on under Post to in Template Studio → Upload pack/,
    );
  });

  it("refuses a report about a project that is gone", () => {
    const one = project();
    expect(
      reportPost(one, { projectId: "nope", platform: "x", state: "filled" }, now),
    ).toMatchObject({ ok: false, status: 404 });
  });
});
