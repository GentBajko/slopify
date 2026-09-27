import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { codexImage } from "../adapters/image/codex.js";
import { nodeRunCli } from "../adapters/llm/run-cli.js";
import type { Format } from "../kernel/pipeline.js";
import { sampleImagePrompts, sampleThumbnailSubject, styled } from "./content.js";

// Paints the sample's pictures into a pictures folder for build-sample.mjs --assets, with the
// app's own Codex CLI image adapter (so it spends the maintainer's ChatGPT plan, never an API
// key): the four scenes wide, the thumbnail, and the four scenes tall for the shorts. A file
// that is already there is kept, so a failed run picks up where it stopped. Needs `codex`
// signed in and ImageMagick's `magick`, which re-encodes each picture as a JPEG.
//
//   node --import ./scripts/ts-resolve.mjs src/sample-build/paint.ts <folder>

const folder = process.argv.at(-1);
if (folder === undefined || folder.endsWith(".ts")) throw new Error("Usage: paint.ts <folder>");
mkdirSync(folder, { recursive: true });

const jobs: { file: string; prompt: string; aspect: Format }[] = [
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

const port = codexImage({ run: nodeRunCli });
for (const job of jobs) {
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
  execFileSync("magick", [
    raw,
    "-resize",
    job.aspect === "16:9" ? "1920x1080^" : "1080x1920^",
    "-gravity",
    "center",
    "-extent",
    job.aspect === "16:9" ? "1920x1080" : "1080x1920",
    "-quality",
    "86",
    path,
  ]);
  execFileSync("rm", [raw]);
}
