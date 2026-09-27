import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Rebuilds the bundled sample project (src/assets/sample/sample-project.tar) with Slopify's
// own pipeline, run from the TypeScript sources in place. Maintainer-only: needs ffmpeg and
// ImageMagick's `magick` on PATH; the app only ever imports the finished archive. See
// src/sample-build/generate.ts.
//
//   node packages/app/scripts/build-sample.mjs [--short] [--assets <folder>] [out.tar]
//
// --assets reads a pre-made narration.mp3 and pictures from the folder (how the bundled
// archive is made; generate.ts lists the files). Without it the narration is an ambient track
// and the pictures are drawn procedurally, which needs no provider (CI).

const tsResolve = new URL("./ts-resolve.mjs", import.meta.url).href;
const app = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const out =
  args.find((arg) => arg.endsWith(".tar")) ?? join(app, "src/assets/sample/sample-project.tar");
const flag = args.indexOf("--assets");
const assets = flag === -1 ? undefined : args[flag + 1];
if (flag !== -1 && (assets === undefined || assets.endsWith(".tar")))
  throw new Error("--assets needs the folder that holds narration.mp3 and the pictures.");
execFileSync(
  process.execPath,
  [
    join(app, "src/sample-build/generate.ts"),
    ...args.filter((arg) => arg === "--short"),
    ...(assets === undefined ? [] : ["--assets", resolve(assets)]),
    resolve(out),
  ],
  {
    stdio: "inherit",
    cwd: app,
    // Through NODE_OPTIONS rather than argv so the processes the pipeline forks (the local
    // subtitle aligner's worker) run the TypeScript sources too.
    env: {
      ...process.env,
      SLOPIFY_APP_DIR: app,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${tsResolve}`].filter(Boolean).join(" "),
    },
  },
);
