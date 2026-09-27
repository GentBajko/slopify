import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { codexImage } from "../adapters/image/codex.js";
import { nodeRunCli } from "../adapters/llm/run-cli.js";
import type { Format } from "../kernel/pipeline.js";
import { sampleImagePrompts, sampleThumbnailSubject, styled } from "./content.js";
import { demoOf, demoPrompt, portraitPrompt } from "./demos.js";

// Paints the sample's pictures into a pictures folder for build-sample.mjs --assets, with the
// app's own Codex CLI image adapter (so it spends the maintainer's ChatGPT plan, never an API
// key): the four scenes wide, the thumbnail, and the four scenes tall for the shorts. A file
// that is already there is kept, so a failed run picks up where it stopped. Needs `codex`
// signed in and ImageMagick's `magick`, which re-encodes each picture as a JPEG.
//
//   node --import ./scripts/ts-resolve.mjs src/sample-build/paint.ts [--demo <id>] <folder>
//
// With --demo a demo's pictures instead (`demos.ts`): its four scenes wide, the one scene its
// short shows tall, and a square portrait of each podcast host (painted tall, then cropped).

const folder = process.argv.at(-1);
if (folder === undefined || folder.endsWith(".ts"))
  throw new Error("Usage: paint.ts [--demo <id>] <folder>");
mkdirSync(folder, { recursive: true });
const flag = process.argv.indexOf("--demo");
const demo = flag === -1 ? undefined : demoOf(process.argv[flag + 1] ?? "");

interface Job {
  readonly file: string;
  readonly prompt: string;
  readonly aspect: Format;
  readonly square?: boolean;
}

const sampleJobs: readonly Job[] = [
  ...sampleImagePrompts("painted").flatMap((prompt) => [
    { file: `${prompt.scene}.jpg`, prompt: prompt.body, aspect: "16:9" as const },
    {
      file: `${prompt.scene}-vertical.jpg`,
      prompt: styled("painted", prompt.body.slice(prompt.body.indexOf(": ") + 2), true),
      aspect: "9:16" as const,
    },
  ]),
  { file: "thumbnail.jpg", prompt: styled("painted", sampleThumbnailSubject), aspect: "16:9" },
];

const demoJobs: readonly Job[] =
  demo === undefined
    ? []
    : [
        ...demo.scenes.map((scene) => ({
          file: `${scene.scene}.jpg`,
          prompt: demoPrompt(demo, scene.subject),
          aspect: "16:9" as const,
        })),
        ...demo.scenes
          .filter((scene) => scene.scene === demo.vertical)
          .map((scene) => ({
            file: `${scene.scene}-vertical.jpg`,
            prompt: demoPrompt(demo, scene.subject, true),
            aspect: "9:16" as const,
          })),
        ...demo.speakers.flatMap((speaker) =>
          speaker.portrait === undefined
            ? []
            : [
                {
                  file: `portrait-${speaker.id}.jpg`,
                  prompt: portraitPrompt(speaker.portrait),
                  aspect: "9:16" as const,
                  square: true,
                },
              ],
        ),
      ];

const port = codexImage({ run: nodeRunCli });
for (const job of demo === undefined ? sampleJobs : demoJobs) {
  const path = join(folder, job.file);
  if (existsSync(path)) continue;
  console.log(`Painting ${job.file}…`);
  const image = await port.generate({
    model: "codex-imagegen",
    thinking: "medium",
    prompt: job.prompt,
    aspect: job.aspect,
    signal: AbortSignal.timeout(20 * 60_000),
  });
  const raw = `${path}.${image.mime === "image/png" ? "png" : "jpg"}`;
  writeFileSync(raw, image.bytes);
  const frame = job.square === true ? "720x720" : job.aspect === "16:9" ? "1920x1080" : "1080x1920";
  execFileSync("magick", [
    raw,
    "-resize",
    `${frame}^`,
    "-gravity",
    "center",
    "-extent",
    frame,
    "-quality",
    "86",
    path,
  ]);
  execFileSync("rm", [raw]);
}
