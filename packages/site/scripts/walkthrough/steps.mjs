// Every step of the site's walkthrough, in the order the recording plays them. This is the
// one list to edit when a screen changes.
//
// A step:
// - `id`: a short name for the log.
// - `caption`: the cue shown for the step in play-run.vtt; it is also what the page's
//   description is written from, so it says what is on screen in the product's words.
// - `optional`: true for a screen that may not exist yet. An optional step whose screen is
//   missing is left out of the cut instead of failing the recording, and --publish then
//   refuses the cut: the published captions (play-run.vtt) always have one cue per step here,
//   which walkthrough.test.js checks.
// - `hold`: milliseconds kept on screen after `run` finishes.
// - `run(ctx)`: drives the page. Call `ctx.start()` once the screen is ready: footage before
//   it (page loads, spinners) is cut away. Throwing fails the step.
//
// Selectors go by role, label and visible text rather than classes or test ids, so the
// redesign can move things around without breaking the recording. `ctx.maybe` runs an
// action that is nice to show but not essential; if it fails the step carries on.
// `ctx.samples` holds the bundled samples' project ids (library, audiobook, podcast).
// `ctx.choose(field, label)` picks an option from a native or a custom select,
// `ctx.press(name)` clicks the tab or button with that name, and `ctx.glide(locator)`
// scrolls it into view smoothly.
//
// Never press anything that starts a run or calls a provider (Start, Review and start,
// Test key, a CLI sign-in): the recording must cost nothing.

const quick = { timeout: 4_000 };

// Opens a row of Play's setup ("Change narration") unless it is open already: a row that
// needs setup starts open, and waiting on a button that isn't there would film the wait.
async function expand(page, press, row) {
  const change = page.getByRole("button", { name: new RegExp(`^change ${row}$`, "i") });
  if ((await change.count()) > 0) await press(new RegExp(`^change ${row}$`, "i"));
}

// It opens on the finished project (which is also the poster), then shows how it was made.
export const steps = [
  {
    id: "project",
    caption: "The finished project: the video with captions, ready to download.",
    hold: 2_500,
    async run({ page, go, start }) {
      await go("/projects/demo-lighthouse");
      await page
        .getByRole("heading", { name: /Keeper of the Drowned Light/i })
        .first()
        .waitFor(quick);
      start();
    },
  },
  {
    id: "description",
    caption:
      "The YouTube description with chapter timestamps, and the tags, each with a Copy button.",
    hold: 2_500,
    async run({ page, start, glide, press }) {
      // The project shows one section at a time; the description is in YouTube.
      await press(/^youtube$/i);
      const chapters = page
        .getByText(/00:10 The First Keeper/)
        .filter({ visible: true })
        .first();
      await chapters.waitFor(quick);
      start();
      await glide(chapters, "center");
    },
  },
  {
    id: "shorts",
    caption: "Shorts: vertical clips picked from the video, each with its own title and hashtags.",
    hold: 3_000,
    async run({ page, start, glide, press }) {
      await press(/^shorts$/i);
      const short = page
        .getByText(/The log that stopped for forty days/)
        .filter({ visible: true })
        .first();
      await short.waitFor(quick);
      start();
      await glide(short, "center");
    },
  },
  {
    id: "play",
    caption: "Play: type the topic, pick the saved prompts, check what the run will make.",
    hold: 2_000,
    async run({ page, go, start, maybe, glide, choose, press }) {
      await go("/play");
      const title = page.getByLabel(/^title$/i).first();
      await title.waitFor(quick);
      start();
      await maybe(() => title.pressSequentially("The Sunken Archive", { delay: 60 }));
      await maybe(() =>
        choose(
          page.getByRole("combobox", { name: /^article prompt$/i }).first(),
          "Sleep lore article",
        ),
      );
      await page.waitForTimeout(600);
      // The prompt's {{Topic}} keyword appears as a field once the prompt is picked, in the
      // Title and keywords row.
      await maybe(() => expand(page, press, "title and keywords"));
      await maybe(() =>
        page
          .getByLabel(/^topic$/i)
          .first()
          .pressSequentially("The Sunken Archive", { delay: 50 }),
      );
      await page.waitForTimeout(800);
      await maybe(() => expand(page, press, "images"));
      await page.waitForTimeout(800);
      await maybe(() =>
        page
          .getByRole("checkbox", { name: /lore scene/i })
          .first()
          .check(quick),
      );
      await page.waitForTimeout(600);
      await maybe(() => expand(page, press, "video and style"));
      await maybe(() =>
        glide(page.getByRole("heading", { name: /^video and style$/i }).first(), "start"),
      );
    },
  },
  {
    id: "voices",
    caption:
      "Several voices: an audiobook, podcast, radio drama or interview, with a voice per speaker.",
    hold: 2_500,
    async run({ page, go, start, maybe, choose, press, glide }) {
      await go("/play");
      await page
        .getByLabel(/^title$/i)
        .first()
        .waitFor(quick);
      await expand(page, press, "narration");
      const speakers = page.getByText(/^Speakers ·/).first();
      await speakers.waitFor(quick);
      start();
      await glide(speakers, "center");
      await speakers.click(quick);
      await page.waitForTimeout(600);
      await maybe(() =>
        choose(page.getByRole("combobox", { name: /^format$/i }).first(), "Podcast"),
      );
      await page.waitForTimeout(800);
    },
  },
  {
    id: "cost",
    caption: "Run cost: what the run cost per stage and model, CLI calls included.",
    hold: 3_000,
    async run({ page, go, start, glide, press }) {
      await go("/projects/demo-lighthouse");
      await press(/^cost$/i);
      const cost = page.getByRole("heading", { name: /run cost/i }).first();
      await cost.waitFor(quick);
      start();
      await glide(cost);
    },
  },
  {
    id: "upload",
    caption: "Prepare upload: the files and every text, in the order YouTube Studio asks for them.",
    hold: 3_000,
    async run({ page, go, start, press, maybe }) {
      await go("/projects/demo-lighthouse");
      // Offered as the next action once the video is made, and in the YouTube section.
      const prepare = page
        .getByRole("button", { name: /^prepare upload$/i })
        .filter({ visible: true })
        .first();
      if (!(await prepare.isVisible())) await maybe(() => press(/^youtube$/i));
      await prepare.waitFor(quick);
      start();
      await prepare.click();
      await page.waitForTimeout(1_500);
    },
  },
  {
    id: "calendar",
    caption: "The calendar: the coming weeks of uploads, each run with its queued topic.",
    hold: 3_000,
    async run({ page, go, start, maybe }) {
      await go("/calendar");
      await page
        .getByRole("heading", { name: /calendar/i })
        .first()
        .waitFor(quick);
      // The seeded schedule's first topic, once the runs are drawn.
      await maybe(() =>
        page
          .getByText(/The Sunken Archive/)
          .first()
          .waitFor(quick),
      );
      start();
    },
  },
];
