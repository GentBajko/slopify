// Seeds a data directory with one finished demo project, made entirely on this machine:
// solid-colour title cards for the images, a sine tone for the narration, and ffmpeg for
// the video and the shorts. No provider is called, so a recording costs nothing and shows
// the same project every time.
//
// The project is written the way a pre-revision Slopify wrote it (projects, stages and
// outputs rows plus the files beside them). The app adopts such a project into its revision
// history the first time the project is read, which is a supported upgrade path, so the seed
// does not have to track the revision tables as they change.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";

const appDist = new URL("../../../app/dist/", import.meta.url);
const fontData = readFileSync(
  fileURLToPath(new URL("../../../app/src/assets/fonts/Barlow-Bold.ttf", import.meta.url)),
).toString("base64");

export const demoProjectId = "demo-lighthouse";
export const demoTitle = "The Keeper of the Drowned Light";

// Six chapters, one card each. The words are the narration the captions show; the tone
// under them stands in for a voice.
const chapters = [
  ["The Lighthouse", "#23303b", "On a coast that no map agrees on, a lighthouse still burns."],
  [
    "The First Keeper",
    "#3b2a23",
    "Its first keeper kept a log of every ship the light turned away.",
  ],
  [
    "The Storm Year",
    "#233b2c",
    "In the storm year the log stops for forty days, then begins again.",
  ],
  ["The Second Hand", "#35233b", "The new entries are written in a hand that no one recognised."],
  [
    "The Drowned Bell",
    "#3b3823",
    "Fishermen say a bell rings under the water when the lamp is lit.",
  ],
  ["What Remains", "#1f2a3d", "The light still turns. No keeper has been seen there in a century."],
];
const secondsPerChapter = 10;
const totalSeconds = chapters.length * secondsPerChapter;
const at = "2026-09-20T21:00:00.000Z";

function ff(args) {
  execFileSync(ffmpegStatic, ["-v", "error", "-y", ...args], { stdio: "pipe" });
}

// Title cards are drawn by the recording's own browser rather than by ffmpeg: the bundled
// ffmpeg has no text filter, and a page screenshot uses the same Barlow as the app.
async function card(page, path, { width, height, colour, title, kicker }) {
  await page.setViewportSize({ width, height });
  const size = Math.round(width / 16);
  await page.setContent(`<!doctype html><style>
    @font-face { font-family: Card; src: url("data:font/ttf;base64,${fontData}"); }
    html, body { margin: 0; width: 100%; height: 100%; }
    body { display: grid; place-content: center; gap: ${Math.round(size / 3)}px; text-align: center;
      background: radial-gradient(circle at 50% 40%, ${colour}, #0d0d0f 140%); font-family: Card, sans-serif; }
    p { margin: 0; color: #a6d45c; font-size: ${Math.round(size / 2.6)}px; letter-spacing: 0.12em; }
    h1 { margin: 0; color: #ece9e2; font-size: ${size}px; line-height: 1.05; max-width: 16ch; }
  </style><p></p><h1></h1>`);
  await page.locator("p").evaluate((node, text) => {
    node.textContent = text;
  }, kicker);
  await page.locator("h1").evaluate((node, text) => {
    node.textContent = text;
  }, title);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path });
}

function tone(path, seconds, frequency = 196) {
  // A low, slow tremolo so the waveform looks like speech in the player, not a flat line.
  ff([
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:duration=${seconds}:sample_rate=48000`,
    "-af",
    "tremolo=f=3:d=0.7,volume=0.4",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    path,
  ]);
}

function timestamp(seconds, separator) {
  const whole = Math.floor(seconds);
  const hh = String(Math.floor(whole / 3600)).padStart(2, "0");
  const mm = String(Math.floor((whole % 3600) / 60)).padStart(2, "0");
  const ss = String(whole % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}${separator}000`;
}

// A one-page PDF written by hand: enough for the Document download to open.
function tinyPdf(title) {
  const text = `BT /F1 28 Tf 72 720 Td (${title.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}

// `browser` is a Playwright browser; the cards are drawn in a page of their own.
export async function seedDemo(dataDir, browser) {
  const page = await browser.newPage();
  const { openDb } = await import(new URL("kernel/db/index.js", appDist).href);
  const { migrate } = await import(new URL("kernel/db/migrate.js", appDist).href);
  const { ensureDirs, layout } = await import(new URL("kernel/paths.js", appDist).href);

  const paths = layout(dataDir);
  ensureDirs(paths, { mode: 0o700 });
  const dir = join(paths.projects, demoProjectId);
  mkdirSync(join(dir, "images"), { recursive: true });
  mkdirSync(join(dir, "shorts"), { recursive: true });

  const outputs = [];
  const add = (stage, role, path, extra = {}) =>
    outputs.push({ stage, role, path, duration: extra.duration ?? null, meta: extra.meta ?? {} });

  // Article and narration text.
  const article = [
    `# ${demoTitle}`,
    "",
    ...chapters.flatMap(([heading, , line]) => [`## ${heading}`, "", line, ""]),
  ].join("\n");
  writeFileSync(join(dir, "article.md"), article);
  writeFileSync(join(dir, "article.txt"), chapters.map(([, , line]) => line).join("\n\n"));
  add("article", "article_md", "article.md");
  add("article", "article_txt", "article.txt");

  // Images: one 16:9 card per chapter, and a thumbnail.
  for (const [index, [heading, colour]] of chapters.entries()) {
    const name = `images/image-${String(index + 1).padStart(3, "0")}.png`;
    await card(page, join(dir, name), {
      width: 1920,
      height: 1080,
      colour,
      title: heading,
      kicker: `CHAPTER ${index + 1}`,
    });
    add("images", "image", name, {
      meta: {
        index: index + 1,
        promptName: "Lore scene",
        prompt: `A quiet painting of ${heading.toLowerCase()}`,
      },
    });
  }
  await card(page, join(dir, "thumbnail.png"), {
    width: 1280,
    height: 720,
    colour: "#121214",
    title: "THE DROWNED LIGHT",
    kicker: "SLEEP LORE",
  });
  add("thumbnail", "thumbnail", "thumbnail.png");

  // Narration: a tone the length of the video.
  tone(join(dir, "audio-body.wav"), totalSeconds);
  ff([
    "-i",
    join(dir, "audio-body.wav"),
    "-c:a",
    "pcm_s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    join(dir, "audio.wav"),
  ]);
  add("audio", "audio_body", "audio-body.wav", { duration: totalSeconds * 1000 });
  add("video", "audio_export", "audio.wav", { duration: totalSeconds * 1000 });

  // Captions, one cue per chapter line.
  const cues = chapters.map(([, , line], index) => ({
    start: index * secondsPerChapter,
    end: (index + 1) * secondsPerChapter,
    line,
  }));
  writeFileSync(
    join(dir, "subtitles.vtt"),
    `WEBVTT\n\n${cues.map((cue) => `${timestamp(cue.start, ".")} --> ${timestamp(cue.end, ".")}\n${cue.line}`).join("\n\n")}\n`,
  );
  writeFileSync(
    join(dir, "subtitles.srt"),
    `${cues.map((cue, index) => `${index + 1}\n${timestamp(cue.start, ",")} --> ${timestamp(cue.end, ",")}\n${cue.line}`).join("\n\n")}\n`,
  );
  add("video", "subtitles_vtt", "subtitles.vtt");
  add("video", "subtitles_srt", "subtitles.srt");

  // The video: each card held for its chapter with a slow zoom, the tone underneath.
  const inputs = chapters.flatMap((_, index) => [
    "-loop",
    "1",
    "-t",
    String(secondsPerChapter),
    "-i",
    join(dir, `images/image-${String(index + 1).padStart(3, "0")}.png`),
  ]);
  const frames = secondsPerChapter * 30;
  const zooms = chapters
    .map(
      (_, index) =>
        `[${index}:v]scale=2400:-1,zoompan=z='min(zoom+0.0006,1.12)':d=${frames}:s=1920x1080:fps=30[v${index}]`,
    )
    .join(";");
  const concat = `${chapters.map((_, index) => `[v${index}]`).join("")}concat=n=${chapters.length}:v=1:a=0[v]`;
  ff([
    ...inputs,
    "-i",
    join(dir, "audio.wav"),
    "-filter_complex",
    `${zooms};${concat}`,
    "-map",
    "[v]",
    "-map",
    `${chapters.length}:a`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    join(dir, "video.mp4"),
  ]);
  add("video", "video", "video.mp4", { duration: totalSeconds * 1000 });

  // YouTube description and tags.
  const description = [
    "A slow walk through the lore of a lighthouse no map agrees on. Made for falling asleep to.",
    "",
    ...chapters.map(
      ([heading], index) => `${timestamp(index * secondsPerChapter, "").slice(3, 8)} ${heading}`,
    ),
    "",
    "#lore #sleepstories #lighthouse",
  ].join("\n");
  writeFileSync(join(dir, "description.txt"), description);
  writeFileSync(join(dir, "tags.txt"), "lore, sleep stories, lighthouse, ghost stories, ambient");
  add("video", "youtube_description", "description.txt");
  add("video", "youtube_tags", "tags.txt");

  // One vertical short cut from the video, with its own card. One, because a project adopted
  // from the pre-revision layout keeps a single short_video slot; a second clip would show
  // as "Not made yet".
  const shorts = [
    {
      number: 1,
      first: 3,
      last: 4,
      start: 20,
      end: 40,
      title: "The log that stopped for forty days",
    },
  ];
  for (const short of shorts) {
    const image = `shorts/image-${String(short.number).padStart(3, "0")}.png`;
    await card(page, join(dir, image), {
      width: 1080,
      height: 1920,
      colour: chapters[short.first - 1][1],
      title: chapters[short.first - 1][0],
      kicker: `SHORT ${short.number}`,
    });
    add("video", "short_image", image, { meta: { short: short.number, index: 1 } });
    const clip = `shorts/short-${String(short.number).padStart(2, "0")}.mp4`;
    ff([
      "-loop",
      "1",
      "-t",
      String(short.end - short.start),
      "-i",
      join(dir, image),
      "-ss",
      String(short.start),
      "-t",
      String(short.end - short.start),
      "-i",
      join(dir, "audio.wav"),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      join(dir, clip),
    ]);
    add("video", "short_video", clip, {
      duration: (short.end - short.start) * 1000,
      meta: { short: short.number, sentences: [short.first, short.last] },
    });
  }
  writeFileSync(
    join(dir, "shorts.json"),
    JSON.stringify({
      durationSeconds: totalSeconds,
      shorts: shorts.map((short) => ({
        ...short,
        description: `${short.title}. From the full lore video.`,
        hashtags: ["#lore", "#shorts"],
        why: "A complete moment with its own hook.",
        text: chapters
          .slice(short.first - 1, short.last)
          .map(([, , line]) => line)
          .join(" "),
      })),
    }),
  );
  add("video", "shorts", "shorts.json");

  // The PDF.
  writeFileSync(join(dir, "document.pdf"), tinyPdf(demoTitle));
  add("document", "document_pdf", "document.pdf");

  const config = {
    title: demoTitle,
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "provide",
      images: "provide",
      thumbnail: "provide",
      video: "generate",
      document: "generate",
    },
    imagePrompts: [],
    values: { Topic: "The Drowned Light" },
    provided: { article },
    silenceGapSeconds: 2,
    imageSeconds: secondsPerChapter,
    zoomPercent: 12,
    motionStyle: "zoom",
    edgeSilenceSeconds: 0,
    youtubeDescription: true,
    shorts: { enabled: true, count: 1, minSeconds: 15, maxSeconds: 60, titleOnScreen: true },
    rendered: {},
  };

  await page.close();

  const db = openDb(paths.db);
  try {
    migrate(db, { now: () => new Date(at) });
    db.prepare(
      "INSERT INTO projects(id,title,format,config,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    ).run(demoProjectId, demoTitle, "16:9", JSON.stringify(config), at, at);
    for (const [kind, source] of Object.entries(config.sources)) {
      const state = source === "off" ? "skipped" : source === "provide" ? "provided" : "done";
      db.prepare(
        "INSERT INTO stages(id,project_id,kind,source,state,started_at,finished_at) VALUES (?,?,?,?,?,?,?)",
      ).run(`demo-${kind}`, demoProjectId, kind, source, state, at, at);
    }
    outputs.forEach((output, index) => {
      db.prepare(
        "INSERT INTO outputs(id,project_id,stage_kind,role,path,original_filename,bytes,duration_ms,meta,created_at) VALUES (?,?,?,?,?,NULL,?,?,?,?)",
      ).run(
        `demo-output-${String(index + 1).padStart(2, "0")}`,
        demoProjectId,
        output.stage,
        output.role,
        output.path,
        statSync(join(dir, output.path)).size,
        output.duration,
        JSON.stringify(output.meta),
        at,
      );
    });
  } finally {
    db.close();
  }
  return { projectId: demoProjectId, title: demoTitle };
}
