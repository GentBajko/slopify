#!/usr/bin/env node
// Records the walkthrough video on slopify.stream: starts this checkout's built Slopify on a
// random loopback port against a throwaway data directory holding only what Slopify ships
// with (the bundled samples and a starter pack), walks the steps in walkthrough/steps.mjs at 1920x1080, then cuts the recording
// down to the kept part of each step with ffmpeg and writes play-run.mp4 (faststart), its
// poster and play-run.vtt captions describing each step.
//
//   npm run build                                     # the app and web build it runs
//   node packages/site/scripts/record-walkthrough.mjs [--out <dir>] [--publish] [--keep]
//
// --out      where the three files go (default: a new temp folder, printed at the end)
// --publish  also copy them over packages/site/public/assets/play-run.* (only a cut with
//            every step in it: the published captions must match walkthrough/steps.mjs)
// --keep     keep the temp data directory and the raw recording for a look afterwards
//
// Nothing here calls a paid provider or signs in to a CLI: the app runs with a temp HOME,
// the telemetry collector pointed at a closed local port, and updates off. docs/walkthrough.md
// has the details.

import { execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { chromium } from "playwright";
import { seedApp } from "./walkthrough/seed-app.mjs";
import { steps } from "./walkthrough/steps.mjs";

const width = 1920;
const height = 1080;
const cli = fileURLToPath(new URL("../../app/dist/edge/cli.js", import.meta.url));
const assets = fileURLToPath(new URL("../public/assets/", import.meta.url));

const { values: flags } = parseArgs({
  options: {
    out: { type: "string" },
    publish: { type: "boolean" },
    keep: { type: "boolean" },
  },
});

function log(line) {
  process.stdout.write(`${line}\n`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(origin, app) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null)
      throw new Error(`Slopify exited with code ${app.exitCode} before it was ready.`);
    const ok = await fetch(`${origin}/api/health`).then(
      (response) => response.ok,
      () => false,
    );
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Slopify did not answer ${origin}/api/health within 60 s.`);
}

function ff(args) {
  execFileSync(ffmpegStatic, ["-v", "error", "-y", ...args], { stdio: "inherit" });
}

function vttTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  return `${hh}:${mm}:${ss}.${String(ms % 1000).padStart(3, "0")}`;
}

// The cut list: each kept segment of the raw recording, trimmed, faded in and out over a
// quarter second and joined end to end.
function cut(raw, segments, out) {
  const fade = 0.25;
  const parts = segments.map((segment, index) => {
    const length = segment.end - segment.start;
    return (
      `[0:v]trim=start=${segment.start.toFixed(3)}:end=${segment.end.toFixed(3)},setpts=PTS-STARTPTS,` +
      `fps=30,scale=${width}:${height},fade=t=in:st=0:d=${fade},fade=t=out:st=${(length - fade).toFixed(3)}:d=${fade}[s${index}]`
    );
  });
  const join = `${segments.map((_, index) => `[s${index}]`).join("")}concat=n=${segments.length}:v=1:a=0[v]`;
  ff([
    "-i",
    raw,
    "-filter_complex",
    `${parts.join(";")};${join}`,
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ]);
}

async function main() {
  if (!existsSync(cli)) {
    throw new Error(
      `${cli} is missing. Build the app first: npm run build (at the repository root).`,
    );
  }
  const work = mkdtempSync(join(tmpdir(), "slopify-walkthrough-"));
  const dataDir = join(work, "data");
  const home = join(work, "home");
  const rawDir = join(work, "raw");
  mkdirSync(home);
  const out = flags.out ?? join(work, "out");
  mkdirSync(out, { recursive: true });

  const browser = await chromium.launch();
  let app;
  try {
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    // process.execPath rather than "node": a version manager's shim may read HOME, which is
    // the temp one here.
    app = spawn(
      process.execPath,
      [cli, "--port", String(port), "--host", "127.0.0.1", "--data-dir", dataDir, "--no-open"],
      {
        env: {
          ...process.env,
          HOME: home,
          XDG_DATA_HOME: join(home, ".local/share"),
          XDG_CONFIG_HOME: join(home, ".config"),
          SLOPIFY_COLLECTOR_URL: "http://127.0.0.1:9",
          SLOPIFY_DISABLE_UPDATES: "1",
          SLOPIFY_NO_MODEL_PREFETCH: "1",
        },
        stdio: ["ignore", "ignore", "inherit"],
      },
    );
    await waitForHealth(origin, app);
    log(`Slopify is up at ${origin}`);

    // The samples, the History starter pack, the channel and a schedule.
    const { samples } = await seedApp(origin);
    log("Seeded the samples, the History pack, the channel and a schedule");

    // A warm-up visit outside the recording: the one-time usage-stats notice is answered here
    // instead of on camera.
    const warm = await browser.newPage({ viewport: { width, height }, colorScheme: "dark" });
    await warm.goto(`${origin}/projects/${samples.library}`);
    await warm
      .getByRole("button", { name: /got it/i })
      .click({ timeout: 8_000 })
      .catch(() => {});
    await warm.waitForTimeout(1_000);
    // Play's note about the CLIs it found names this machine's versions; answered here too.
    await warm.goto(`${origin}/play`);
    await warm
      .getByRole("button", { name: /got it/i })
      .click({ timeout: 8_000 })
      .catch(() => {});
    await warm.waitForTimeout(1_000);
    await warm.close();

    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: "dark",
      reducedMotion: "no-preference",
      recordVideo: { dir: rawDir, size: { width, height } },
    });
    const page = await context.newPage();
    const began = Date.now();
    const clock = () => (Date.now() - began) / 1000;
    const segments = [];

    for (const step of steps) {
      let start;
      const ctx = {
        page,
        samples,
        go: async (path) => {
          await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
        },
        start: () => {
          start = clock();
        },
        maybe: async (action) => {
          try {
            await action();
          } catch (error) {
            log(
              `  ${step.id}: skipped an optional action (${String(error.message).split("\n")[0]})`,
            );
          }
        },
        choose: async (field, label) => {
          const native = await field.evaluate((node) => node.tagName === "SELECT");
          if (native) {
            await field.selectOption({ label });
            return;
          }
          await field.click({ timeout: 4_000 });
          await page.getByRole("option", { name: label }).first().click({ timeout: 4_000 });
        },
        press: async (name) => {
          const tab = page.getByRole("tab", { name }).first();
          const target = (await tab.count()) > 0 ? tab : page.getByRole("button", { name }).first();
          await target.click({ timeout: 4_000 });
        },
        glide: async (locator, block = "start") => {
          await locator.evaluate(
            (node, where) => {
              node.scrollIntoView({ behavior: "smooth", block: where });
            },
            block,
            { timeout: 4_000 },
          );
          await page.waitForTimeout(1_200);
        },
      };
      try {
        await step.run(ctx);
        await page.waitForTimeout(step.hold ?? 2_000);
        if (start === undefined) throw new Error("the step never called start()");
        segments.push({ id: step.id, caption: step.caption, start, end: clock() });
        log(`Recorded ${step.id} (${(clock() - start).toFixed(1)} s)`);
      } catch (error) {
        if (!step.optional) throw new Error(`The ${step.id} step failed: ${error.message}`);
        log(
          `Left out ${step.id}: its screen isn't there yet (${String(error.message).split("\n")[0]})`,
        );
      }
    }

    await context.close();
    const raw = join(
      rawDir,
      readdirSync(rawDir).find((name) => name.endsWith(".webm")),
    );

    const video = join(out, "play-run.mp4");
    const poster = join(out, "play-run-poster.jpg");
    const captions = join(out, "play-run.vtt");
    cut(raw, segments, video);

    let at = 0;
    const cues = segments.map((segment) => {
      const length = segment.end - segment.start;
      const cue = `${vttTime(at)} --> ${vttTime(at + length)}\n${segment.caption}`;
      at += length;
      return { cue, from: at - length, length, id: segment.id };
    });
    writeFileSync(captions, `WEBVTT\n\n${cues.map((one) => one.cue).join("\n\n")}\n`);
    // The poster is the finished project, a second into its segment.
    const shown = cues.find((one) => one.id === "project") ?? cues[0];
    ff([
      "-ss",
      String(shown.from + Math.min(1.5, shown.length / 2)),
      "-i",
      video,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      poster,
    ]);

    log(
      `\nWalkthrough: ${at.toFixed(1)} s, ${segments.length} steps (${segments.map((s) => s.id).join(", ")})`,
    );
    log(`Files: ${out}`);
    if (flags.publish) {
      const missing = steps.filter((step) => !segments.some((one) => one.id === step.id));
      if (missing.length > 0)
        throw new Error(
          `Not published: ${missing.map((step) => step.id).join(", ")} did not record, so the captions would not match walkthrough/steps.mjs. The files are in ${out}.`,
        );
      for (const file of [video, poster, captions]) {
        copyFileSync(file, join(assets, file.slice(out.length + 1)));
      }
      log(`Copied over ${assets}play-run.*`);
    }
    if (flags.keep) log(`Kept the data directory and raw recording in ${work}`);
  } finally {
    await browser.close();
    if (app !== undefined && app.exitCode === null) {
      app.kill("SIGTERM");
      await new Promise((resolve) => app.once("exit", resolve));
    }
    if (!flags.keep) {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
      rmSync(rawDir, { recursive: true, force: true });
      if (flags.out !== undefined) rmSync(work, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  process.stderr.write(`The walkthrough was not recorded: ${error.message}\n`);
  process.exit(1);
});
