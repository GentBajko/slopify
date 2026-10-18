# Posting to Social Sites

Slopify can get a project's post ready for **X, LinkedIn, Instagram, TikTok, Reddit and Bluesky**, beside its YouTube upload. Slopify prepares each site's post (its words, hashtags, link, pictures or video in the site's shape, and when it goes out). It never posts for you: there is no sign-in and no site API. The optional [Studio extension](Studio-Extension) fills each site's own post form in your browser, sets the site's scheduler where it has one, and turns the site's AI label on. You check the post and press **Post** yourself.

**Where to find it:** a finished project → **Prepare upload** → **Where** (shown once the project posts to at least one site). A template's sites are set in **Library → Templates → Open studio → Upload pack**, or on Play under **Outputs**. Each channel's **Brand** tab holds its account names and X subscription.

## Turn posting on

1. Open the template in **Template Studio** and go to **Upload pack**.
2. Under **Post to**, turn on each site. Each one starts with the defaults below.
3. Change the **text** and the **video** or **pictures** of each site there; hashtags, the thumbnail and the YouTube link are under **Fine-tune**.
4. Press **Save**. A site whose words come from a post prompt is a paid step, so Save shows its price like any other (the **Posts** line).

A project or template with no site turned on works exactly as before: Prepare upload shows YouTube alone.

### What each site gets by default

| Site | Words | Media |
|---|---|---|
| X | The summary, two hashtags | The video |
| LinkedIn | The summary, three hashtags | The video |
| Instagram | The summary as the caption, five hashtags | Up to 10 pictures as a carousel, cut to 4:5 |
| TikTok | The summary, five hashtags | Short 1 |
| Bluesky | The summary, two hashtags | Up to 4 pictures |
| Reddit | A link post with the project's title | The YouTube link |

## The post in Prepare upload

Choose a site under **Where**. Its panel shows, top to bottom:

- **Where it stands**: not filled yet, waiting for the extension, filled (press Post on the site), scheduled, posted, or why the fill stopped.
- **Things to check**: what doesn't fit the site, each with its fix (text too long, too many pictures, a video too long for X Free, no subreddit, a release time the site can't schedule). A warning never stops you from filling the post.
- **The post** as the site will show it: its words in an editable box, counted live the way the site counts them, and its media in the shape it is sent in. Your changes save when you leave the box and stay this project's own; **Reset to the written text** drops them.
- **When it goes out** (see below).
- **Settings**: the text source, video, pictures, designs, hashtags, thumbnail and YouTube link for this project. A change here is this project's own; **Use the template's settings** goes back.

## Where the words come from

| Text | What it posts | Cost |
|---|---|---|
| Summary | The keyword digest's summary when the run wrote one, otherwise the YouTube description's first paragraph (the default) | Free |
| YouTube description | The description without its chapters and hashtags | Free |
| Title | The video's title | Free |
| Written by a post prompt | A post written from the article by a Library prompt of kind Post (or the built-in one) | One text-model call per site; it shows in the estimate as **Posts** |
| My own text | Your text, with `{{Slopify_Title}}`, `{{Slopify_Summary}}` and the other [keywords Slopify fills](Keywords-Slopify-Fills) | Free |
| No text | Nothing | Free |

A post prompt is a paid step, so it is picked in the template's Upload pack (or Play), where Save shows its cost. Prepare upload can switch a site between the free sources.

Hashtags come from the video's YouTube tags, then the shorts' hashtags, up to each site's most. The YouTube link is added, when asked, once the video is on YouTube. Text longer than the site takes is cut at the last whole sentence that fits, and the post says so.

## Pictures and video

A post can carry the long video, one of the shorts, the thumbnail, any number of the project's pictures, and designs from **Library → Designs** kept in the project (its **Keep in project**), in any mix. Instagram's pictures are cut to 4:5 the first time they are needed; a design goes in its own format closest to the site's shape (portrait on Instagram, a story on TikTok, square elsewhere), drawn when the post needs it; shorts are already vertical; the long video is never re-encoded. Sites that don't mix a video with pictures (LinkedIn, TikTok, Reddit, Bluesky) get a warning rather than a refusal.

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

## When it goes out

The post follows the YouTube item it carries: a short's own release time when it carries a short, else the long video's.

- **X, LinkedIn and TikTok** have their own scheduler. The extension sets it to the release time; you press **Schedule**. Outside the site's window (TikTok takes about 15 minutes to 10 days ahead, LinkedIn about 3 months), or after the release time, it leaves the post to go out now, and the post says why.
- **Instagram, Bluesky and Reddit** have none. Pressing **Fill** before the release time makes the post wait: about 2 minutes before the release time, the extension opens the site in a background tab, fills the post and shows a notification (and calls your [Notification URL](Notifications), when one is set); you press **Post**. If the browser was closed, it fills when it opens again, up to 12 hours late.
- With no release time, or one already past, the post goes out when you press **Post**.

## Fill in a site

**Fill in X** (and each other site) is the drawer's main button while that site is chosen. It opens the site's post form and hands the post to the extension. It stays disabled, with the reason beside it, until:

- the Slopify Studio extension is installed and paired (**Settings → YouTube Studio and posting**);
- the extension is new enough to post; and
- the site is allowed in the extension's options (**Allow posting on X**, and so on).

The extension only fills a tab that Slopify opened: the one **Fill in X** opens, or the background tab it opens at release time. A site's page you open yourself is never filled or touched. The extension never presses Post, Share, Publish or the final Schedule.

## AI labels

Instagram's **Add AI label**, TikTok's **AI-generated content** and X's content disclosure are always turned on for a post that carries Slopify's pictures or video. LinkedIn, Bluesky and Reddit have none.

## After it is posted

When the site shows the published post, the extension reads its link and the panel shows **Posted** with **Open the post**. When it can't, it looks the post up on your profile (the account names below). When you posted it yourself, or the link was missed, paste it under **Posted it yourself? Paste its link**; only the site's own post links are taken. **Remove link** lets the post be filled again.

## Reddit

A Reddit post has its own **Subreddit** (without `r/`), **Title**, **Flair** and **Post type** (Link, Text or Media). Reddit refuses a post without a subreddit, so the post warns until one is set. Reddit's post form hasn't been checked in a real browser yet (**Needs a live check**): the title, subreddit and text go in through Reddit's own submit address, but check the media and flair before you press Post.

## Your accounts and X subscription

In **Channels** → your channel → **Brand** → **Posting**:

- **X subscription** (Free, Premium or Premium+) only changes which warnings a post gets, such as the 280-character and 2 min 20 s limits of X Free.
- **Account names** let the extension find a published post's link on your profile page. They are never used to sign in.

## Post prompts

Write your own in **Library → Prompts**, kind **Post** (**Use Built-in Starter** fills in Slopify's own wording). Slopify gives it the site's length limit and asks again when the answer is over it, then adds the hashtags and link itself. Pick it for a site in Template Studio's Upload pack by choosing **Written by a post prompt** as its text.

## Agents

Agents read and prepare posts (`get_post_packs`, `set_post_choice`, `edit_post_text`, `reset_post_text`, `set_reddit_post`, `set_post_link`) and report a post waiting for your Post. They can't press Fill and can't post. See [Agents (MCP)](Agents-MCP).

## Related pages

- [Publishing to YouTube](Publishing-to-YouTube)
- [Studio extension](Studio-Extension)
- [Template studio](Template-Studio)
- [Channels](Channels)
- [Prompts](Prompts)
