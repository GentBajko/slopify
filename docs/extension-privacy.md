# Slopify Studio extension: privacy policy

Last updated 18 October 2026.

Slopify Studio is a browser extension that connects the Slopify app on your own computer to YouTube Studio and, from version 2.0.0, to the post forms of X, LinkedIn, Instagram, TikTok, Reddit and Bluesky. This page says what it handles and where that goes.

## What it reads

- **From the Slopify app on your computer** (`http://127.0.0.1` or `http://localhost`): your projects' upload details (titles, descriptions, tags, playlists, schedule times, the comment to pin) and their files (videos, thumbnails, captions). It reads them with the pairing token you give it, only to put them into YouTube Studio.
- **From YouTube Studio**, in your own signed-in browser: each new video's link after an upload, the rows of your Content list (titles and video ids), and your videos' Analytics numbers (impressions, click-through rate, views, watch time, average view duration) and A/B test results. It reads them only to hand them to the Slopify app on your computer.
- **From YouTube's public oEmbed address**: whether a video is public yet. No account or personal data is sent.
- **From the Slopify app, for posting**: your projects' posts (their text, pictures and videos, release times) and which sites they go to. It reads them only to put them into the site's post form.
- **From X, LinkedIn, Instagram, TikTok, Reddit and Bluesky**, only on the sites you allowed in the extension's options and only in your own signed-in browser: the post form it fills, the site's sign that a post was published, and, on your own profile page there, the link of a post Slopify made (found by the post's first characters). It reads them only to hand the post's state and link to the Slopify app on your computer. It reads no messages, contacts, followers, feeds or account details.

## What it stores

In the browser's extension storage, on your computer: the Slopify app's local address, the pairing token, and small bookkeeping (which tabs it opened for a task, which posts are due and when it last read the numbers). On a posting site, a post that moves to another page of the same form (TikTok's Photos tab) waits in that tab's session storage until it is filled.

## Where data goes

Only to the Slopify app on your own computer, and into the YouTube Studio pages and post forms you are signed in to. The extension has no server of its own; it sends nothing to its developer or anyone else; it does not sell, share or use data for advertising or analytics; and it uses no remote code.

## Permissions

It asks for X, LinkedIn, Instagram, TikTok, Reddit and Bluesky only when you press "Allow posting on" that site in its options, one site at a time, and can be taken back there or in the browser's settings. For Instagram, Bluesky and Reddit it also asks to show notifications, to tell you a post is filled and ready for you to post.

## What it does on YouTube

It fills fields and adds files in YouTube Studio as you ask, and, only if you turn it on in Slopify, posts and pins your video's comment once the video is public. It never presses Publish, Schedule or Set test.

## What it does on the posting sites

It fills the post form (text, pictures or video, the AI label, the site's own scheduler where it has one) when you press Fill in Slopify, or at a post's release time on a site without a scheduler. It never presses Post, Share, Publish, the final Schedule or Discard: you check the post and press it yourself. It closes a site's prompt to change an account setting (such as TikTok's automatic content checks) with Cancel and never turns such a setting on.

## Contact

Open an issue at https://github.com/GentBajko/slopify/issues.
