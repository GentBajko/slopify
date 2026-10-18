# Posting to Social Sites

Slopify can get a project's post ready for **X, LinkedIn, Instagram, TikTok, Reddit and Bluesky**, beside its YouTube upload. It never posts for you: there is no sign-in and no site API. The optional [Studio-Extension](Studio-Extension) fills each site's own post form in your browser, sets the site's scheduler where it has one, and turns the site's AI label on. You check the post and press **Post** yourself.

**Where to find it:** a finished project → **Prepare upload** → **Where** (shown once the project posts to at least one site). A template's sites are set in **Library → Templates → Open studio → Upload pack**, or on Play under **Outputs**. Each channel's **Brand** tab holds its account names and X subscription.

## Turn posting on

1. Open the template in **Template Studio** and go to **Upload pack**.
2. Under **Post to**, turn on each site. Each one starts with sensible settings: the article's summary with the video on X and LinkedIn, a 4:5 picture carousel on Instagram, the first short on TikTok, the summary with up to four pictures on Bluesky, and a link post on Reddit.
3. Change the **text** and the **video** or **pictures** of each site there; hashtags, the thumbnail and the YouTube link are under **Fine-tune**.
4. Press **Save**. A site whose words come from a post prompt is a paid step, so Save shows its price like any other.

A project or template with no site turned on works exactly as before: Prepare upload shows YouTube alone.

## The post in Prepare upload

Choose a site under **Where**. Its panel shows, top to bottom:

- **Where it stands**: not filled yet, waiting for the extension, filled (press Post on the site), scheduled, posted, or why the fill stopped.
- **Things to check**: what doesn't fit the site, each with its fix (text too long, too many pictures, a video too long for X Free, no subreddit, a release time the site can't schedule). A warning never stops you from filling the post.
- **The post** as the site will show it: its words in an editable box, counted live the way the site counts them, and its media in the shape it is sent in. Your changes save when you leave the box and stay this project's own; **Reset to the written text** drops them.
- **When it goes out** (see below).
- **Settings**: the text source, video, pictures, hashtags, thumbnail and YouTube link for this project. A change here is this project's own; **Use the template's settings** goes back.

## Where the words come from

| Text | What it posts | Cost |
|---|---|---|
| Summary | The article's summary (the default) | Free |
| YouTube description | The description without its chapters | Free |
| Title | The video's title | Free |
| Written by a post prompt | A post written from the article by a Library prompt of kind Post | One text-model call per site |
| My own text | Your text, with `{{Slopify_Summary}}` and the other keywords Slopify fills | Free |
| No text | Nothing | Free |

Hashtags come from the video's YouTube tags and the shorts' hashtags, up to each site's most. Text longer than the site takes is cut at the last whole sentence that fits, and the post says so.

## Pictures and video

A post can carry the long video, one of the shorts, the thumbnail and any number of the project's pictures. Instagram's pictures are cut to 4:5 the first time they are needed; shorts are already vertical; the long video is never re-encoded. Sites that don't mix a video with pictures (LinkedIn, TikTok, Reddit, Bluesky) get a warning rather than a refusal.

## When it goes out

The post follows the YouTube item it carries: a short's own release time when it carries a short, else the long video's.

- **X, LinkedIn and TikTok** have their own scheduler. The extension sets it to the release time; you press **Schedule**. Outside the site's window (TikTok takes 15 minutes to 10 days ahead) it leaves the post to go out now, and the post warns.
- **Instagram, Bluesky and Reddit** have none. About 2 minutes before the release time, the extension opens the site in a background tab, fills the post and shows a notification; you press **Post**.
- With no release time, or one already past, the post goes out when you press **Post**.

## Fill in a site

**Fill in X** (and each other site) is the drawer's main button while that site is chosen. It opens the site's post form and hands the post to the extension. It stays disabled, with the reason beside it, until:

- the Slopify Studio extension is installed and paired (**Settings → YouTube Studio and posting**);
- the extension is new enough to post; and
- the site is allowed in the extension's options (**Allow posting on X**, and so on).

The extension never presses Post, Share, Publish or the final Schedule.

## After it is posted

When the site shows the published post, the extension reads its link and the panel shows **Posted** with **Open the post**. When you posted it yourself, or the link was missed, paste it under **Posted it yourself? Paste its link**; only the site's own post links are taken. **Remove link** lets the post be filled again.

## Reddit

A Reddit post has its own **Subreddit**, **Title**, **Flair** and **Post type** (Link, Text or Media). Reddit refuses a post without a subreddit, so the post warns until one is set. Reddit's post form hasn't been checked in a real browser yet (**Needs a live check**): the title, subreddit and text go in through Reddit's own submit address, but check the media and flair before you press Post.

## Your accounts and X subscription

In **Channels** → your channel → **Brand** → **Posting**:

- **X subscription** (Free, Premium or Premium+) only changes which warnings a post gets, such as the 280-character and 2 min 20 s limits of X Free.
- **Account names** let the extension find a published post's link on your profile page. They are never used to sign in.

## Post prompts

Write your own in **Library → Prompts**, kind **Post** (**Use Built-in Starter** fills in Slopify's own wording). Slopify adds the site's length limit, and adds the hashtags and link after the answer. Pick it for a site in Template Studio's Upload pack by choosing **Written by a post prompt** as its text.

## Related pages

- [Publishing-to-YouTube](Publishing-to-YouTube)
- [Studio-Extension](Studio-Extension)
- [Template-Studio](Template-Studio)
- [Channels](Channels)
- [Prompts](Prompts)
