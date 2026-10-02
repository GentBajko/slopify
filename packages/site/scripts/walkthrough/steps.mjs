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
// Never press anything that starts a run or calls a provider (Start run, Write again,
// Render again, Test key, a CLI sign-in): the recording must cost nothing.

import { packTemplateName, queuedTopics } from "./seed-app.mjs";

const quick = { timeout: 4_000 };

// The bundled Library of Alexandria sample: a finished project made with real providers.
const library = ({ samples }) => `/projects/${samples.library}`;

// Opens a row of Play's setup ("Change video and style") unless it is open already.
async function expand(page, press, row) {
  const change = page.getByRole("button", { name: new RegExp(`^change ${row}$`, "i") });
  if ((await change.count()) > 0) await press(new RegExp(`^change ${row}$`, "i"));
}

// Shows a project section from its top: the previous section may have left the page
// scrolled down.
async function section(page, press, name) {
  await press(name);
  await page.evaluate(() => {
    for (const node of document.querySelectorAll("*")) if (node.scrollTop > 0) node.scrollTop = 0;
  });
}

// It opens on the finished sample (which is also the poster), walks what a project holds,
// then shows how one is set up, reused, scheduled and published.
export const steps = [
  {
    id: "project",
    caption: "The finished project: a narrated video with moving images, captions and a look.",
    hold: 4_000,
    async run(ctx) {
      const { page, go, start, maybe } = ctx;
      await go(library(ctx));
      await page
        .getByRole("heading", { name: /Library of Alexandria/i })
        .first()
        .waitFor(quick);
      // Ten seconds in: past the fade-in, on a captioned line.
      await maybe(() =>
        page
          .locator("video")
          .first()
          .evaluate((video) => {
            video.muted = true;
            video.currentTime = 10;
            return video.play();
          }),
      );
      start();
    },
  },
  {
    id: "shorts",
    caption: "Shorts: vertical clips picked from the video, each with its own title and hashtags.",
    hold: 2_500,
    async run({ page, start, glide }) {
      const short = page
        .getByText(/The library that copied every ship's books/)
        .filter({ visible: true })
        .first();
      await short.waitFor(quick);
      start();
      await glide(short, "center");
    },
  },
  {
    id: "description",
    caption: "The YouTube description with chapter timestamps, hashtags and tags, ready to copy.",
    hold: 2_500,
    async run({ page, start, glide }) {
      const chapters = page
        .getByText(/0:25 Collecting Everything/)
        .filter({ visible: true })
        .first();
      await chapters.waitFor(quick);
      start();
      await glide(chapters, "center");
    },
  },
  {
    id: "article",
    caption: "The article in a reading view, with contents and search.",
    hold: 2_200,
    async run({ page, start, press }) {
      await section(page, press, /^article$/i);
      await page
        .getByText(/A library at the edge of the sea/i)
        .first()
        .waitFor(quick);
      start();
    },
  },
  {
    id: "narration",
    caption: "Narration in your own voice, every piece levelled to one loudness.",
    hold: 2_200,
    async run({ page, start, press }) {
      await section(page, press, /^narration$/i);
      await page
        .getByText(/^Levelled \d+ pieces/)
        .first()
        .waitFor(quick);
      start();
    },
  },
  {
    id: "images",
    caption: "The images and the thumbnail, from your own prompts. Redo any one of them.",
    hold: 2_200,
    async run({ page, start, press }) {
      await section(page, press, /^images$/i);
      await page
        .getByRole("heading", { name: /^thumbnail$/i })
        .or(page.getByText(/^thumbnail$/i))
        .first()
        .waitFor(quick);
      start();
    },
  },
  {
    id: "pdf",
    caption: "A PDF of the article, with a cover, contents and a theme of your own.",
    hold: 1_800,
    async run({ page, start, press }) {
      await section(page, press, /^pdf$/i);
      await page
        .getByText(/^download pdf$/i)
        .filter({ visible: true })
        .first()
        .waitFor(quick);
      start();
    },
  },
  {
    id: "cost",
    caption: "Run cost: what the run cost per stage and model.",
    hold: 2_200,
    async run({ page, start, press }) {
      await section(page, press, /^cost$/i);
      await page
        .getByRole("heading", { name: /run cost/i })
        .first()
        .waitFor(quick);
      start();
    },
  },
  {
    id: "control",
    caption: "Checkpoints to approve work before it moves on, and a history of every version.",
    hold: 1_800,
    async run({ page, start, press }) {
      await section(page, press, /^checkpoints$/i);
      await page
        .getByText(/^Before Images$/i)
        .first()
        .waitFor(quick);
      start();
      await page.waitForTimeout(1_600);
      await press(/^history$/i);
    },
  },
  {
    id: "voices",
    caption:
      "Several voices: a podcast, audiobook, radio drama or interview, with a voice per speaker.",
    hold: 2_500,
    async run({ page, go, start, press, samples }) {
      await go(`/projects/${samples.podcast}`);
      await section(page, press, /^article$/i);
      await page
        .getByText(/^Nell: /)
        .first()
        .waitFor(quick);
      start();
    },
  },
  {
    id: "play",
    caption: "Play: pick a template, type the topic, see the look before you start.",
    hold: 2_000,
    async run({ page, go, start, maybe, choose }) {
      await go("/play");
      const title = page.getByLabel(/^title$/i).first();
      await title.waitFor(quick);
      start();
      await maybe(() =>
        choose(page.getByRole("combobox", { name: /^template$/i }).first(), packTemplateName),
      );
      await page.waitForTimeout(900);
      await maybe(() => title.pressSequentially(queuedTopics[0], { delay: 55 }));
      // The template's {{topic}} keyword is a field in the Title and keywords row.
      await maybe(() =>
        page
          .getByLabel(/^topic$/i)
          .first()
          .pressSequentially(queuedTopics[0], { delay: 45 }),
      );
      // A CLI that is already signed in writes the text; picking it calls nothing.
      await maybe(() =>
        choose(page.getByRole("combobox", { name: /^llm$/i }).first(), "Claude Code CLI"),
      );
      await page.waitForTimeout(700);
    },
  },
  {
    id: "style",
    caption:
      "Cuts that follow the narration, transitions, a colour grade, grain and chapter cards.",
    hold: 2_200,
    async run({ page, start, glide, press }) {
      await expand(page, press, "video and style");
      const heading = page.getByText(/^video and style$/i).first();
      await heading.waitFor(quick);
      start();
      await glide(heading, "start");
    },
  },
  {
    id: "reviews",
    caption: "Automatic reviews: a reviewer model checks each stage and sends work back.",
    hold: 2_200,
    async run({ page, start, glide, press }) {
      await expand(page, press, "reviews");
      const checkpoints = page.getByText(/^review checkpoints$/i).first();
      await checkpoints.waitFor(quick);
      await glide(checkpoints, "start");
      start();
      await page.waitForTimeout(400);
    },
  },
  {
    id: "library",
    caption: "The Library: prompts written once with {{keywords}}, templates and starter packs.",
    hold: 2_200,
    async run({ page, go, start }) {
      await go("/prompts");
      await page
        .getByText(/History · Documentary/)
        .first()
        .waitFor(quick);
      start();
    },
  },
  {
    id: "channel",
    caption: "Channels: a brand kit, a series brief, templates and a cast for each channel.",
    hold: 2_200,
    async run({ page, go, start }) {
      await go("/channels");
      await page
        .getByText(/series brief/i)
        .first()
        .waitFor(quick);
      start();
    },
  },
  {
    id: "calendar",
    caption: "The calendar: a schedule works through its queued topics, one run each.",
    hold: 2_800,
    async run({ page, go, start, maybe }) {
      await go("/calendar");
      await page
        .getByRole("heading", { name: /calendar/i })
        .first()
        .waitFor(quick);
      await maybe(() =>
        page
          .getByText(new RegExp(queuedTopics[0]))
          .first()
          .waitFor(quick),
      );
      start();
    },
  },
  {
    id: "upload",
    caption: "Prepare upload: every file and text in the order YouTube Studio asks for them.",
    hold: 3_000,
    async run(ctx) {
      const { page, go, start } = ctx;
      await go(library(ctx));
      const prepare = page
        .getByRole("button", { name: /^prepare upload$/i })
        .filter({ visible: true })
        .first();
      await prepare.waitFor(quick);
      start();
      await prepare.click();
    },
  },
  {
    id: "palette",
    caption: "Ctrl+K for everything: regenerate, copy, prepare upload, start a video.",
    hold: 2_200,
    async run({ page, start }) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      start();
      await page.keyboard.press("Control+k");
      await page.getByPlaceholder(/search or run/i).first().waitFor(quick);
    },
  },
];
