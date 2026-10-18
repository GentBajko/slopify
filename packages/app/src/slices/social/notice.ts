import type { NoticeText } from "../notifications/rules.js";
import { type PostPack, platformLabels } from "./model.js";

// The button the person presses on each site to post.
const postButton: Readonly<Record<PostPack["platform"], string>> = {
  x: "Post",
  linkedin: "Post",
  instagram: "Share",
  tiktok: "Post",
  reddit: "Post",
  bluesky: "Publish",
};

// The Notification URL's message when the extension filled a post at its release time on a site
// without a scheduler: the person presses the button, Slopify never does.
export function postReadyNotice(pack: Pick<PostPack, "platform" | "projectTitle">): NoticeText {
  const site = platformLabels[pack.platform];
  return {
    headline: `Ready to post on ${site}: ${pack.projectTitle}`,
    detail: `The Slopify Studio extension filled the post in your browser. Open the ${site} tab and press ${postButton[pack.platform]}; Slopify never posts by itself.`,
  };
}
