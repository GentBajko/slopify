# Posting to social sites

A project can post what it made to **X**, **LinkedIn**, **Instagram**, **TikTok**, **Reddit** and **Bluesky** as well as YouTube. Slopify prepares each site's post (its words, hashtags, link, pictures or video in the site's shape, and when it goes out) and the [Studio extension](Studio-Extension) fills the site's own post form in your browser. **You press Post.** Slopify never posts by itself, uses no site's API and never signs in anywhere.

**Where to find it:** a finished project → **Prepare upload**, one post per site the project posts to. The template (and **Edit project → Upload pack**) sets which sites a project posts to and what each gets; the project can change it before posting.

## What each site gets by default

| Site | Words | Media |
|---|---|---|
| X | The summary, two hashtags | The video |
| LinkedIn | The summary, three hashtags | The video |
| Instagram | The summary as the caption, five hashtags | Up to 10 pictures as a carousel, cut to 4:5 |
| TikTok | The summary, five hashtags | Short 1 |
| Bluesky | The summary, two hashtags | Up to 4 pictures |
| Reddit | A link post with the project's title | The YouTube link |

Any mix is allowed per site: words only, a video, a short, the thumbnail, pictures, designs from Library → Designs made for the project, or several together. A mix the site doesn't take gets a warning, never a refusal.

## Where the words come from

| Source | What it is | Cost |
|---|---|---|
| **Summary** | The keyword digest's summary when the run wrote one, otherwise the YouTube description's first paragraph | Free |
| **Description** | The YouTube description without its chapters and hashtags | Free |
| **Title** | The project's title | Free |
| **Your own text** | A short text of your own; `{{Slopify_Title}}`, `{{Slopify_Summary}}` and the other [keywords Slopify fills](Keywords-Slopify-Fills) from facts work in it | Free |
| **Post prompt** | A [Post prompt](Prompts) from Library → Prompts (or the built-in one) writes the post from the article | One text call per site; it shows in the estimate as **Posts** |

A post prompt is a paid step, so it is turned on in Edit project (or the template), where Save shows its cost. Prepare upload can switch a site between the free sources.

Slopify adds the hashtags (from the YouTube tags, then the shorts' hashtags) and, when asked, the YouTube link once the video is on YouTube. Text too long for the site is cut at its last whole sentence that fits, and the post says so. You can edit the words by hand; **Reset** brings back Slopify's text.

## Each site's limits

Slopify counts the way each site does: X counts a link as 23 characters and CJK characters and emoji twice, Bluesky counts characters as you see them, the others count plainly.

| Site | Text | Pictures | Video | Video and pictures together | Seen on the site |
|---|---|---|---|---|---|
| X Free | 280 | 4 | 2 min 20 s | Yes | Not yet |
| X Premium, Premium+ | 25,000 | 4 | 3 h | Yes | Not yet |
| LinkedIn | 3,000 | 20 | 15 min | No | Not yet |
| Instagram | 2,200 | 20 | 15 min | Yes | 2026-10-18 |
| TikTok | 4,000 | 35 | 60 min | No | 2026-10-18 |
| Bluesky | 300 | 4 | 3 min | No | 2026-10-18 |
| Reddit | 40,000 (title 300) | 20 | 15 min | No | Not yet |

Set your X subscription in **Channels → Brand → Posting**; it only changes the warnings.

## When it goes out

A post goes out with the YouTube item it carries: a TikTok or Reel with its short's release time, everything else with the long video's.

- **X, LinkedIn and TikTok** have their own scheduler. The extension sets it to the release time and you press Schedule. Outside the site's window (TikTok takes about 15 minutes to 10 days ahead, LinkedIn about 3 months), or after the release time, it is left to post now and the post says why.
- **Instagram, Bluesky and Reddit** have no scheduler. Pressing Fill before the release time makes the post wait: about two minutes before release the extension fills it in a background tab and tells you to press Post (and your [Notification URL](Notifications), when one is set). If the browser was closed, it fills when it opens again, up to 12 hours late.
- A project with no release time posts when you press Post.

## AI labels

Instagram's **Add AI label**, TikTok's **AI-generated content** and X's content disclosure are always turned on for a post that carries Slopify's pictures or video. LinkedIn, Bluesky and Reddit have none.

## After posting

The extension reads the published post's link from the site and the project shows it as posted. When it can't, it looks the post up on your profile (the account names in **Channels → Brand → Posting**), or you paste the link yourself. Removing the link lets the post be filled again.

## Reddit

Reddit's post has its own **Subreddit** (without `r/`), **Title**, **Flair** and kind (link, text or media). The subreddit is required: without it the post warns and Reddit asks where to post. Reddit's form wasn't seen live yet, so its fill may need checking.

## Agents

Agents read and prepare posts (`get_post_packs`, `set_post_choice`, `edit_post_text`, `reset_post_text`, `set_reddit_post`, `set_post_link`) and report a post waiting for your Post. They can't press Fill and can't post. See [Agents (MCP)](Agents-MCP).

## Related pages

- [Publishing to YouTube](Publishing-to-YouTube)
- [Studio extension](Studio-Extension)
- [Prompts](Prompts)
- [Channels](Channels)
- [Template studio](Template-Studio)
