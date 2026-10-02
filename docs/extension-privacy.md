# Slopify Studio extension: privacy policy

Last updated 2 October 2026.

Slopify Studio is a browser extension that connects the Slopify app on your own computer to YouTube Studio. This page says what it handles and where that goes.

## What it reads

- **From the Slopify app on your computer** (`http://127.0.0.1` or `http://localhost`): your projects' upload details (titles, descriptions, tags, playlists, schedule times, the comment to pin) and their files (videos, thumbnails, captions). It reads them with the pairing token you give it, only to put them into YouTube Studio.
- **From YouTube Studio**, in your own signed-in browser: each new video's link after an upload, the rows of your Content list (titles and video ids), and your videos' Analytics numbers (impressions, click-through rate, views, watch time, average view duration) and A/B test results. It reads them only to hand them to the Slopify app on your computer.
- **From YouTube's public oEmbed address**: whether a video is public yet. No account or personal data is sent.

## What it stores

In the browser's extension storage, on your computer: the Slopify app's local address, the pairing token, and small bookkeeping (which tabs it opened for a task and when it last read the numbers).

## Where data goes

Only to the Slopify app on your own computer, and into YouTube Studio pages you are signed in to. The extension has no server of its own; it sends nothing to its developer or anyone else; it does not sell, share or use data for advertising or analytics; and it uses no remote code.

## What it does on YouTube

It fills fields and adds files in YouTube Studio as you ask, and, only if you turn it on in Slopify, posts and pins your video's comment once the video is public. It never presses Publish, Schedule or Set test.

## Contact

Open an issue at https://github.com/GentBajko/slopify/issues.
