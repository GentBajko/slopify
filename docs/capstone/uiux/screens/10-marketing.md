---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: c63873b4953d
paths_covered:
  - ":(top)packages/site/public/**"
  - ":(top)packages/site/og-card.html"
  - ":(top)packages/site/wrangler.jsonc"
---

# Marketing site

## Mode & job

Persuade surface: two static pages served by Cloudflare from `packages/site/public/` at `slopify.stream`, no server side (`packages/site/wrangler.jsonc:1-11`). `index.html` is the landing page (install, live tally, showcase, features, how-to, options); `channel.html` is a long-form reading page, "How I run a channel with it" (`packages/site/public/channel.html:47`). Both load one stylesheet and one plain ES module with no framework or build step (`packages/site/public/index.html:42-43`, `packages/site/public/main.js:1-2`). The page is independent of the app's `components/kit`; it carries its own token set in `styles.css`.

## Composition

**Shared chrome.** A skip link to `#main` (`packages/site/public/index.html:46`), then a masthead: wordmark (mark + "Slopify", links to `/`) and a "Project and support" nav with GitHub, Patreon, Buy Me a Coffee and "How I run a channel" (`packages/site/public/index.html:49-83`). On `channel.html` the last link carries `aria-current="page"` (`packages/site/public/channel.html:26-43`). The footer (`class="free"`) repeats "Free. Runs on your machine with your own keys." and the donate links (`packages/site/public/index.html:605-640`, `packages/site/public/channel.html:165-178`).

**Landing page, top to bottom** (`packages/site/public/index.html`):

| Block | Content | Source |
|---|---|---|
| Hero pitch | Mark, `h1` "AI Slop, on demand.", lede, aside line | `index.html:86-97` |
| Install options | Tablist NPX / Global / Docker; one panel each with a `<code>` command, a Copy key (copy glyph, check glyph, "Copy" label, visually-hidden object) and a hint line; Docker hint links `#docker` | `index.html:100-211` |
| Tally board | Right column of the hero grid: `dl` of eight counters (videos made, audio hours, images made, PDFs made, descriptions written, shorts made, tokens used, installs), each `&mdash;` in the markup; foot strip with lamp, state word, `role="status"` note | `index.html:214-261` |
| Showcase | `figure` with a 1920×1080 silent `video` (`play-run.mp4`, poster jpg, English captions track), fallback paragraph, caption and long description; a `template data-release="3.0"` extends the description | `index.html:263-306` |
| Support row | "Support the project" + Patreon and Buy Me a Coffee keys | `index.html:308-319` |
| Features | `h2` Features; five `feature-group` lists: Make, Cut, Control, Reuse, Yours | `index.html:321-376` |
| New in 3.0 | Inside `template data-release="3.0"`: note line and seven groups: Checked, Scheduled, Published, Counted, Faster, Heard, Settled in | `index.html:377-437` |
| How to use | `ol.rundown` of six rows, each a done lamp, engraved label and text: Node (Windows/macOS/Linux picks with Copy keys), Run it, Docker (launcher command + `details` "Docker details" with the direct `docker run` command and Copy), Keys, Prompts, Play | `index.html:440-539` |
| All options | `details` whose summary is `h3` "All options": note line and a four-column table (flag, variable, default, does) for `--port`, `--host`, `--data-dir`, `--no-open`, `SLOPIFY_FFMPEG` | `index.html:541-602` |
| Footer | Free line, anonymous-stats note, "Support the project", GitHub/Patreon/Buy Me a Coffee, "How I run a channel with it" | `index.html:605-640` |

**Channel page** (`packages/site/public/channel.html`): `article.reading` with `h1`, lede, an "On this page" TOC of six anchors, then sections One template, A schedule, Checking the work, Uploading, What it costs, Still by hand, closing with a `reading-note` linking the home page and GitHub (`channel.html:46-162`). Three sections carry `template data-release="3.0"` paragraphs (series brief and held suggestions on the Calendar; reviewer model and cast; Prepare upload) (`channel.html:97-105`, `channel.html:113-124`, `channel.html:132-138`). Two HTML comments mark content left unset: the channel's name/URL and a quoted per-video cost (`channel.html:48-49`, `channel.html:141-142`).

**Layout.** `.page` caps at `--content-max` 1680px (`packages/site/public/styles.css:99`, `styles.css:218`). The hero is a `3fr 2fr` grid (`styles.css:391-397`); reading text is capped at `--measure` 68ch (`styles.css:98`, `styles.css:1083-1084`). Features use `repeat(auto-fit, minmax(240px, 1fr))` (`styles.css:856`). Below 900px the hero stacks to one column, the masthead wraps, `h1` drops to 34px and rundown rows become `14px 1fr` (`styles.css:1147-1200`). Below 700px the options table stacks into one card per option, the default cell labelled via `data-label` (`styles.css:987`, `index.html:547-549`).

**Tokens.** Dark by default: `--ground #121214`, `--surface`, `--raised`, `--sunken`, `--line`, `--ink`, accent `#a6d45c` with `--accent-strong`, `--on-accent`, `--accent-tint`; radii 6/10/999px; 4px `--step`; Barlow, Barlow Condensed and a mono stack (`styles.css:62-103`). `prefers-color-scheme: light` swaps to a light ground with accent `#4d7a1c` (`styles.css:106-123`). Fonts are self-hosted woff2 under `assets/fonts/` via six `@font-face` rules (`styles.css:9-56`). The social card image `assets/og.png` is rendered from `packages/site/og-card.html`.

## States

| State | Trigger | Treatment | Source |
|---|---|---|---|
| Tally loading | Markup ships `data-loading` on `.tally` | Each row's `dt`/`dd` become empty `--raised` bars (90×10, 140×22); foot reads "Off" with no lamp | `styles.css:700-721`, `index.html:214`, `index.html:258-260` |
| Tally live | `GET {collector}/aggregates` answers an `aggregates` object | Numbers formatted per counter (grouped integers; audio as hours to one decimal; tokens with K/M/B/T suffixes); lamp `run`, word "Live", note "updates every 5 seconds"; `data-loading` removed on first answer | `main.js:31-58`, `main.js:82-113` |
| Tally off | Fetch fails, times out (5 s), non-OK, or malformed body | Every counter shows "—"; no lamp, word "Off", note "live stats unavailable" | `main.js:14-16`, `main.js:63-86` |
| Polling | Only when `[data-tally]` exists (home page) | Every 5 s; collector is `http://127.0.0.1:8787` on loopback origins, else `https://collector.slopify.stream` | `main.js:7-13`, `main.js:136-143`, `main.js:249-251` |
| Copy success | Clipboard write resolves | Label becomes "Copied", `data-copied` swaps copy glyph for check glyph, status region reads "Copied: <command>"; reverts after 2 s | `main.js:145-172`, `styles.css:653-660` |
| Copy blocked | Clipboard write rejects or no clipboard API | Status region reads "Copying is blocked in this browser. Select the command instead."; button unchanged | `main.js:152-160`, `main.js:254-258` |
| No JavaScript | Module not run | All three install panels visible, tabs are labels; 3.0 templates stay inert | `index.html:98-99`, `main.js:175-177`, `main.js:220-230` |
| Install tab switch | Click, ArrowLeft/Right, Home, End | Selected tab `aria-selected="true"`, roving `tabIndex`, other panels `hidden` | `main.js:178-218` |
| 3.0 content | `nextReleasePublished = true` | Every `template[data-release]` is replaced by its content on both pages | `main.js:223-230`, `main.js:248` |
| Video unsupported | Browser cannot play mp4 | Fallback paragraph points at the description | `index.html:282-285` |

The site has no authenticated, offline or error page state; a failed collector is the only runtime failure it models (`main.js:60-78`).

## Motion

- The showcase video autoplays muted, loops, has no controls (`index.html:269-280`). Under `prefers-reduced-motion: reduce`, `wireShowcase` turns off autoplay and loop, restores native controls and pauses it (`main.js:232-245`).
- A changed counter fades opacity 0.25 → 1 over 150 ms ease-out; skipped under reduced motion (`main.js:123-130`).
- The Live lamp pulses a 1.2 s box-shadow ring; reduced motion stops it (`styles.css:235-257`).
- The skip link's transition is removed under reduced motion (`styles.css:194-197`).

## Copy

Register: short, first-person-free product lines with one wry aside. Key strings, as written:

- Title: "Slopify: turn a prompt into a narrated slideshow video" (`index.html:6`); OG/Twitter title "AI Slop, on demand." (`index.html:21`, `index.html:35`).
- Lede: "A prompt and a few keywords in. A narrated slideshow video out. Your keys, your machine, free." (`index.html:92-95`); aside "Start contributing to the internet’s enshittification today!" (`index.html:96`).
- Install hints: "Runs the latest version. Nothing to install first."; "Then type `slopify` to launch."; Docker "Linux only. Runs in the background, restarts with Docker and saves project files in ~/Slopify/Projects." (`index.html:138`, `index.html:173`, `index.html:208`).
- Showcase caption: "Reusable prompts. Your outputs. A finished project, ready to download." (`index.html:290-292`).
- 3.0 note: "Fewer manual steps per published video: approve the topics, look over the finished video, press Publish in YouTube Studio." (`index.html:380`).
- Docker details state "Keep the localhost binding: Slopify has no login." (`index.html:508-520`).
- Footer: "Anonymous usage stats power the counters above; nothing you write ever leaves your machine." (`index.html:608-611`).
- Channel page lede frames the page as how "a lore channel runs on it, including the parts that are still done by hand"; the Uploading section opens "Slopify never publishes." (`channel.html:50-54`, `channel.html:128`).

Labels are engraved small caps (`class="engraved"`) for tally terms, feature group titles, rundown labels and table headers (`index.html:221-249`, `index.html:325-429`).

## Not in play

No sign-in, account, pricing or checkout; no newsletter or form of any kind. No client framework, router or build step (`main.js:1-2`). No per-install analytics on this page beyond reading the collector's aggregates (`main.js:63-78`). No link into a running app instance; "Run it" names `http://127.0.0.1:6969` as text (`index.html:489`). No YouTube upload claim: both pages state the person presses Publish in YouTube Studio (`index.html:380`, `channel.html:156`). The app's `components/kit` and its tokens are not used here.
