import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Rebuilds the bundled sample project (src/assets/sample/sample-project.tar) with Slopify's
// own pipeline, run from the TypeScript sources in place. Maintainer-only: needs ffmpeg and
// ImageMagick's `magick` on PATH; the app only ever imports the finished archive. See
// src/sample-build/generate.ts.
//
//   node packages/app/scripts/build-sample.mjs [--short] [out.tar]

const app = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const out =
  args.find((arg) => arg.endsWith(".tar")) ?? join(app, "src/assets/sample/sample-project.tar");
execFileSync(
  process.execPath,
  [
    "--import",
    new URL("./ts-resolve.mjs", import.meta.url).href,
    join(app, "src/sample-build/generate.ts"),
    ...args.filter((arg) => arg === "--short"),
    out,
  ],
  { stdio: "inherit", cwd: app, env: { ...process.env, SLOPIFY_APP_DIR: app } },
);
