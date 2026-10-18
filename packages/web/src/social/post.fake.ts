import type { PostPack, SocialPacksResponse } from "@app/slices/social/model.js";

// Posts as `GET /api/social/packs/:projectId` answers them, for the page's tests.

export const xPack: PostPack = {
  projectId: "p1",
  projectTitle: "The Fox",
  platform: "x",
  item: 0,
  choice: { text: "summary", media: { video: "long" }, hashtags: 2, link: false },
  chosenHere: false,
  text: "A fox ran. #fox #cliff",
  generated: "A fox ran. #fox #cliff",
  edited: false,
  count: { used: 22, max: 280, unit: "weighted" },
  hashtags: ["#fox", "#cliff"],
  link: null,
  media: [
    {
      kind: "video",
      file: "video",
      url: "/api/social/media/p1/video",
      filename: "the-fox.mp4",
      contentType: "video/mp4",
      bytes: 10,
      shape: "original",
    },
  ],
  aiLabel: true,
  schedule: { mode: "native", at: "2026-10-20T18:00:00.000Z" },
  xTier: "free",
  composeUrl: "https://x.com/compose/post",
  warnings: [
    {
      code: "video-too-long",
      sentence: "The video is 12 min; X Free takes 2 min 20 s. Pick a short instead.",
    },
  ],
  status: { state: "none", url: null, message: null, at: null, by: null },
};

export const packs = (
  list: readonly PostPack[],
  sites: SocialPacksResponse["extension"]["sites"] = ["x"],
): SocialPacksResponse => ({
  projectId: "p1",
  packs: list,
  extension: { paired: true, sites, seenAt: "2026-10-18" },
});

export const redditPack: PostPack = {
  ...xPack,
  platform: "reddit",
  xTier: undefined,
  aiLabel: false,
  media: [],
  warnings: [],
  composeUrl: "https://www.reddit.com/submit?title=The+Fox",
  reddit: { subreddit: "", title: "The Fox", flair: "", kind: "link" },
};
