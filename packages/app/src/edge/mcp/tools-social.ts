import { choiceBody, linkBody, redditBody, textBody } from "../../slices/social/schema.js";
import type { RouteTool } from "./route-tool.js";

// A project's posts to X, LinkedIn, Instagram, TikTok, Reddit and Bluesky, as Prepare upload
// shows them. Agents prepare them; Fill in <site> and posting are the person's.
export const socialTools: readonly RouteTool[] = [
  {
    name: "get_post_packs",
    route: "GET /api/social/packs/:projectId",
    title: "Read the posts for other sites",
    description:
      "Copy for YouTube Studio's posts: for each site the project posts to, the text as it goes in (with its count and limit), hashtags, link, media, AI label, when it goes out, warnings and where the post stands. The agent's work ends here: filling a site's form and posting are the person's.",
  },
  {
    name: "set_post_choice",
    route: "PUT /api/social/packs/:projectId/:platform/choice",
    title: "Change what a post carries",
    description:
      "The project's own settings for one site (platform: x, linkedin, instagram, tiktok, reddit or bluesky): its text source, media, hashtags and link; {off: true} to not post there; null to go back to the template's. A post prompt (text \"prompt\") is a paid step picked only in the template (Template Studio → Upload pack) or on Play, where Save shows its cost. Body: {choice}.",
    body: choiceBody,
  },
  {
    name: "edit_post_text",
    route: "PUT /api/social/packs/:projectId/:platform/text",
    title: "Edit a post's text",
    description:
      "Hand-edits one site's post text. Body: {text: the new text, base: the text you edited from (get_post_packs' generated)}.",
    body: textBody,
  },
  {
    name: "reset_post_text",
    route: "DELETE /api/social/packs/:projectId/:platform/text",
    title: "Drop a post's hand edit",
    description: "Drops the hand edit of one site's post; the written text comes back.",
    confirm: "This drops your hand edit of this post for good; the text Slopify wrote comes back.",
  },
  {
    name: "set_reddit_post",
    route: "PUT /api/social/packs/:projectId/:platform/reddit",
    title: "Set the Reddit post's fields",
    description:
      "The Reddit post's subreddit (without r/), title, flair and kind (link, text or media); platform must be reddit. Body: {reddit: {subreddit, title, flair, kind}}.",
    body: redditBody,
  },
  {
    name: "set_post_link",
    route: "PUT /api/social/packs/:projectId/:platform/link",
    title: "Record a post's link",
    description:
      "Marks one site's post as posted with its link (a post the person made by hand, or one the extension missed); null removes the link so the post can be filled again. Body: {url: the post's address | null}.",
    body: linkBody,
  },
];
