import type { HelpEntry } from "../entry.js";

// Posting to X, LinkedIn, Instagram, TikTok, Reddit and Bluesky: Copy for YouTube Studio's post
// panel, the post settings on Play and in Template Studio, and the channel's accounts.

const posting = (anchor: string) => ({ page: "Posting-to-Social-Sites", anchor });

export const socialHelp = {
  "social.platforms": {
    title: "Post to",
    body: "The sites this template's projects post to besides YouTube. Each site you turn on gets a post with the owner's defaults: the summary with the video on X and LinkedIn, a 4:5 picture carousel on Instagram, the first short on TikTok, up to four pictures on Bluesky, a link post on Reddit. Nothing is ever posted for you: you press Post.",
    tutorial: posting("turn-posting-on"),
  },
  "social.text": {
    title: "Post text",
    body: "Where the post's words come from: the article's summary, the YouTube description without its chapters, the title, a post prompt (a paid AI call, one per site), your own text, or none. Free sources cost nothing. Text longer than the site takes is cut at the last whole sentence that fits.",
    tutorial: posting("where-the-words-come-from"),
  },
  "social.prompt": {
    title: "Post prompt",
    body: "The post prompt that writes this site's post from the article. Built-in uses Slopify's own wording. It is one AI call per site, so a template's sample and the run's estimate include its price. Write your own under Prompts → Post.",
    tutorial: posting("post-prompts"),
  },
  "social.custom": {
    title: "Your text",
    body: "The post's words, typed once for every project the template makes. Keywords Slopify fills, such as {{Slopify_Summary}}, and your template's own fields are filled for each project; a keyword with no value leaves its line out. Free.",
    tutorial: posting("where-the-words-come-from"),
  },
  "social.video": {
    title: "Post video",
    body: "Which video the post carries: none, the long video, or one of its shorts (already vertical). TikTok and Instagram Reels want a short. The release time the post goes out at follows it: a short's own time, else the long video's. Videos are never re-encoded.",
    tutorial: posting("pictures-and-video"),
  },
  "social.pictures": {
    title: "Post pictures",
    body: "How many of the project's pictures go with the post, in their order. Instagram gets them cut to 4:5; other sites take them as made. A site that takes fewer, or doesn't mix pictures with a video, gets a warning instead of a refusal.",
    tutorial: posting("pictures-and-video"),
  },
  "social.designs": {
    title: "Post designs",
    body: "Designs from Library → Designs made for this project, sent with the post as pictures. Each goes in the design's own format closest to the site's shape: portrait on Instagram, a story on TikTok, square elsewhere; Slopify draws it in that format when the post needs it. Up to 10 per post.",
    tutorial: posting("pictures-and-video"),
  },
  "social.thumbnail": {
    title: "Post thumbnail",
    body: "Adds the video's thumbnail to the post's pictures, before the project's own pictures. Off by default.",
    tutorial: posting("pictures-and-video"),
  },
  "social.hashtags": {
    title: "Hashtags",
    body: "How many hashtags go at the end of the post, taken from the video's YouTube tags and the shorts' hashtags. Each site has its own most: Bluesky 3, LinkedIn 5, X and TikTok 10, Instagram 30, Reddit none.",
    tutorial: posting("where-the-words-come-from"),
  },
  "social.link": {
    title: "YouTube link",
    body: "Adds the video's YouTube link at the end of the post. It is known once the video is on YouTube (Fill in YouTube Studio, or its link pasted). X counts any link as 23 characters.",
    tutorial: posting("where-the-words-come-from"),
  },
  "social.post-text": {
    title: "Post text",
    body: "The words as they go into the site's form, hashtags and link included, counted the way the site counts them (X weighs links and emoji, Bluesky counts graphemes). Your changes save when you leave the box and stay this project's own; Reset to the written text drops them.",
    tutorial: posting("the-post-in-prepare-upload"),
  },
  "social.release": {
    title: "When it goes out",
    body: "X, LinkedIn and TikTok have their own scheduler: the extension sets it to the video's release time and you press Schedule. Instagram, Bluesky and Reddit have none: about 2 minutes before the release time the extension opens the site in a background tab, fills the post and tells you to press Post.",
    tutorial: posting("when-it-goes-out"),
  },
  "social.paste-link": {
    title: "Paste link",
    body: "When you posted it yourself, or the extension missed it, paste the post's link here. It marks the post as posted, so Fill isn't offered again until you remove the link. Only the site's own post links are taken.",
    tutorial: posting("after-it-is-posted"),
  },
  "social.reddit.live-check": {
    title: "Reddit needs a live check",
    body: "Reddit's post form hasn't been checked in a real browser yet, so the extension's part of it may miss a field. The title, subreddit and text go in through Reddit's own submit address, which works; check the media and flair before you press Post.",
    tutorial: posting("reddit"),
  },
  "social.reddit.subreddit": {
    title: "Subreddit",
    body: "The community the post goes to, like r/history. Reddit refuses a post without one, so the post warns until it is set. Read the subreddit's rules on self-promotion first.",
    tutorial: posting("reddit"),
  },
  "social.reddit.flair": {
    title: "Flair",
    body: "The tag some subreddits ask every post to carry, typed the way the subreddit names it. Leave it blank when the subreddit has none.",
    tutorial: posting("reddit"),
  },
  "social.reddit.title": {
    title: "Reddit title",
    body: "The post's title, up to 300 characters. It starts as the video's title; change it to suit the subreddit.",
    tutorial: posting("reddit"),
  },
  "social.reddit.kind": {
    title: "Reddit post type",
    body: "Link posts the YouTube link with the title, Text posts the post's words, Media uploads the pictures or video. Link is the default.",
    tutorial: posting("reddit"),
  },
  "planning.channel.x-tier": {
    title: "X subscription",
    body: "The X plan of this channel's account. Free posts take 280 characters and 2 min 20 s of video; Premium and Premium+ take far longer ones. It only changes which warnings a post gets, never what is filled.",
    tutorial: posting("your-accounts-and-x-subscription"),
  },
  "planning.channel.accounts": {
    title: "Account names",
    body: "This channel's account on each site, typed the way the site shows it. The extension opens that profile to find a published post's link. It is never used to sign in, and a blank one only means the link is pasted by hand.",
    tutorial: posting("your-accounts-and-x-subscription"),
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
