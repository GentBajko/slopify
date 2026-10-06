import { expect, it } from "vitest";
import { checkVideos, goneOf, videoState } from "../src/gone.js";

const page = (data: string) =>
  `<script>window.chunkedPrefetchResolvers['id-0'].resolve({"channelId":"UC1"});</script><script>${data}</script>`;
const present = page(
  `window.chunkedPrefetchResolvers['id-1'].resolve({"videoId":"aaaaaaaaaaa","title":"A","privacy":"VIDEO_PRIVACY_PRIVATE","status":"SCHEDULED_PUBLISHING_STATUS_SCHEDULED"});`,
);
const deleted = page(
  `window.chunkedPrefetchResolvers['id-1'].resolve({"videoId":"bbbbbbbbbbb","status":"VIDEO_STATUS_DELETED","responseStatus":{"statusCode":"CREATOR_ENTITY_STATUS_OK"}});`,
);
const missing = page(
  `window.chunkedPrefetchResolvers['id-1'].reject( new Error('CreatorVideoData prefetch failed.'));`,
);

it("reads a video as present, deleted, missing or unknown from its Studio page", () => {
  expect(videoState(present, "aaaaaaaaaaa")).toBe("present");
  expect(videoState(deleted, "bbbbbbbbbbb")).toBe("deleted");
  expect(videoState(missing, "ccccccccccc")).toBe("missing");
  expect(videoState("<html>Sign in</html>", "aaaaaaaaaaa")).toBe("unknown");
});

it("forgets a missing video only when the same check found another of its channel", () => {
  const video = (videoId: string, channelId: string | null = "ch1") => ({
    projectId: "p",
    short: null,
    videoId,
    channelId,
  });
  expect(goneOf([{ video: video("c"), state: "missing" }])).toEqual([]);
  expect(
    goneOf([
      { video: video("a"), state: "present" },
      { video: video("b"), state: "deleted" },
      { video: video("c"), state: "missing" },
      { video: video("d"), state: "unknown" },
      // Another channel's video looks missing while Studio is signed in to this one.
      { video: video("e", "ch2"), state: "missing" },
      { video: video("f", null), state: "missing" },
    ]).map((one) => one.videoId),
  ).toEqual(["b", "c"]);
});

it("checks each video in turn and counts one that fails to read as unread", async () => {
  const pages: Record<string, string> = { aaaaaaaaaaa: present, bbbbbbbbbbb: deleted };
  const { gone, checked } = await checkVideos(
    ["aaaaaaaaaaa", "bbbbbbbbbbb", "ddddddddddd"].map((videoId) => ({
      projectId: "p",
      short: null,
      videoId,
    })),
    async (videoId) => {
      const html = pages[videoId];
      if (html === undefined) throw new Error("offline");
      return videoState(html, videoId);
    },
  );
  expect(gone.map((one) => one.videoId)).toEqual(["bbbbbbbbbbb"]);
  expect(checked.map((one) => one.state)).toEqual(["present", "deleted", "unknown"]);
});
