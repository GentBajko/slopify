import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Rebuilds a bundled sample project with Slopify's own pipeline, run from the TypeScript
// sources in place. Maintainer-only: needs ffmpeg and ImageMagick's `magick` on PATH; the app
// only ever imports the finished archives. See src/sample-build/generate.ts.
//
//   node packages/app/scripts/build-sample.mjs [--short | --demo <id>] [--assets <folder>] [out.tar]
//
// Without --demo it builds "The Library of Alexandria" (src/assets/sample/sample-project.tar);
// --demo audiobook or --demo podcast builds that demo (sample-<id>.tar beside it).
// --assets reads the pre-made narration and pictures from the folder (how the bundled
// archives are made; generate.ts and demo-build.ts list the files). Without it the narration
// is an ambient track or quiet tones and the pictures are drawn procedurally, which needs no
// provider (CI).

const tsResolve = new URL("./ts-resolve.mjs", import.meta.url).href;
const app = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const demoFlag = args.indexOf("--demo");
const demo = demoFlag === -1 ? undefined : args[demoFlag + 1];
if (demoFlag !== -1 && (demo === undefined || demo.startsWith("--") || demo.endsWith(".tar")))
  throw new Error("--demo needs the demo to build: audiobook or podcast.");
const out =
  args.find((arg) => arg.endsWith(".tar")) ??
  join(
    app,
    demo === undefined
      ? "src/assets/sample/sample-project.tar"
      : `src/assets/sample/sample-${demo}.tar`,
  );
const flag = args.indexOf("--assets");
const assets = flag === -1 ? undefined : args[flag + 1];
if (flag !== -1 && (assets === undefined || assets.endsWith(".tar")))
  throw new Error("--assets needs the folder that holds the narration and the pictures.");
execFileSync(
  process.execPath,
  [
    join(app, "src/sample-build/generate.ts"),
    ...args.filter((arg) => arg === "--short"),
    ...(demo === undefined ? [] : ["--demo", demo]),
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
