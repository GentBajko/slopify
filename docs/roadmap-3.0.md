# Roadmap to 3.0

3.0 is not a pile of new features. It is Slopify running a channel on its own, with the person
only approving. The measure for every item below: **how many manual steps does one published
video need?** Today it is dozens. The target is: approve the topic list, glance at a finished
video, press Publish in YouTube Studio.

Order: 2.5.0 ships first (reference image, Codex model choice, notifications, backups), then the
items below roughly in this order.

## 1. Automatic reviews

A reviewer model checks each stage before the run moves on, and sends the work back with its
reasons when it fails. The CLI providers (Claude Code, Codex) are the default reviewers: they are
vision-capable and cost nothing per call on a subscription.

- **Article**: follows the prompt's rules (length, structure, tone), no invented lore, no
  repeated sections.
- **Images**: no malformed hands, no stray text or letters, matches the brief, and matches the
  reference image (same character, palette, style).
- **Narration**: nothing missing or garbled compared with the article (word timing already
  finds omissions; the reviewer decides what matters).
- **Thumbnail and Shorts**: readable at phone size, the subject is clear.

Rules:
- A retry limit per item (default 2); after that the item is kept and flagged, never looped.
- Every verdict is saved with its reason and shown beside the item, so a person can overrule it.
- Built on the existing checkpoints: a review is a checkpoint that a model answers.
- Off, "flag only" or "flag and redo", per stage, in the template.

## 2. Schedules that find their own topics

When a schedule's queue runs empty, it can ask an LLM for the next topics instead of stopping.

- A **series brief** on the schedule: what the channel covers, the style, what "view-worthy"
  means ("D&D lore, documentary, famous villains and places first").
- Never repeats: the prompt includes every title Slopify has made or queued for that schedule,
  and results are checked against them (including near-duplicates).
- Two modes: queue them directly, or hold them for approval (a notification says "5 new topics
  are waiting for you").
- Topics can be refilled early, e.g. keep at least 10 queued.

## 3. YouTube Studio prep in one click

No Data API upload (unverified apps are locked to private). Instead, fill in Studio in the
person's own browser.

- A small browser extension. **Prepare upload** on a finished video opens Studio's upload page;
  after the person drops the video in, the extension fills the title, description with chapters,
  tags, thumbnail, audience ("not made for kids"), and playlist from Slopify.
- The person presses Publish. Slopify never publishes.
- Shorts get the same, one per short.
- Studio changes its page from time to time, so the filler is kept small, tested against a
  saved copy of the page, and fails loudly ("Couldn't find the Tags field — fill it by hand;
  the text is copied") instead of half-filling.
- An **upload pack** fallback without the extension: files plus every text, each with a Copy
  button, in the order Studio asks for them.

## 4. Smoothness

Everything that made a run harder than it should be. Each is small; together they are the point
of 3.0.

**Play**
- One path from topic to queue: pick a template, type the topic, Start. Everything else is
  folded away unless it needs attention.
- The review is always current (2.5.0 fixed the grey button); Start explains itself when it
  can't start.
- Keywords behave the same everywhere: in the title, prompts, templates and schedules, with one
  list of what each keyword feeds.
- Saving a template never stores one-off values (the topic you typed), only the settings.
- Everything that can be set in Edit project can be set in Play, and the other way round.

**While a run is going**
- A home screen: what is running and its step, what is coming up (schedules), what needs you,
  and what is ready to upload.
- Honest progress and time left for every stage, including CLI image jobs that take minutes.
- Notifications for finished, failed and waiting (2.5.0), and for reviews that need a decision.

**When something goes wrong**
- Every failure says what failed, why, and the one button that fixes it, on the step itself.
- Retries that don't need a person: rate limits, timeouts and a CLI that dropped are retried
  on their own with backoff, and only reported when they keep failing.
- A failed step never blocks unrelated steps (a thumbnail failure doesn't stop the video).

**Setup**
- First run: a guided setup that ends with a real short test video, not a settings page.
- Health check on the providers page: each CLI signed in, each key valid, the model reachable.
- Updating Slopify waits for running work by itself and says when it will update.

## 5. Being picked up by others

For career and donations, not growth at any cost.

- The site's walkthrough video is current, recorded by a script so it stays current.
- A polished first ten minutes (the guided setup above).
- A donation link on the site, the README and in Settings → About.
- A short "how I run my channel with it" page.

## Not in 3.0

- YouTube Data API upload (see above).
- Word timing for other languages (see [multilingual-timing.md](multilingual-timing.md)).
- A timeline editor for moving images by hand; worth its own release later.
