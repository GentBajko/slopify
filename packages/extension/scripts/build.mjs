// Builds the extension for Chrome/Chromium and Firefox: bundles each script into one classic
// file (content scripts can't be modules), copies the page and the manifest, and zips each
// build for loading or sharing. No code is fetched at run time: everything is in the zip.
//
//   npm run build -w packages/extension
//   → packages/extension/dist/chrome/    (Load unpacked in chrome://extensions)
//   → packages/extension/dist/firefox/   (Load Temporary Add-on in about:debugging)
//   → packages/extension/dist/slopify-studio-chrome.zip, slopify-studio-firefox.zip

import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { zipSync } from "fflate";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const manifest = JSON.parse(readFileSync(join(root, "static", "manifest.json"), "utf8"));

const targets = {
  chrome: manifest,
  // Firefox's Manifest V3 runs the background as an event page, and needs an id to keep
  // storage across restarts.
  firefox: {
    ...manifest,
    background: { scripts: ["background.js"] },
    browser_specific_settings: {
      gecko: { id: "studio@slopify.local", strict_min_version: "128.0" },
    },
  },
};

rmSync(dist, { recursive: true, force: true });
for (const [name, target] of Object.entries(targets)) {
  const out = join(dist, name);
  mkdirSync(out, { recursive: true });
  await build({
    entryPoints: [
      "background",
      "comment",
      "content",
      "early",
      "options",
      "popup",
      "video-frame",
    ].map((entry) => join(root, "src", `${entry}.ts`)),
    outdir: out,
    bundle: true,
    format: "iife",
    target: name === "chrome" ? "chrome120" : "firefox128",
    legalComments: "none",
    logLevel: "warning",
  });
  cpSync(join(root, "static", "options.html"), join(out, "options.html"));
  cpSync(join(root, "static", "popup.html"), join(out, "popup.html"));
  // The hidden page that hands the video file to Studio's upload dialog (`video-frame.ts`).
  cpSync(join(root, "static", "video-frame.html"), join(out, "video-frame.html"));
  // The app's own mark, from packages/web/public/app-icon.svg, for the toolbar and the
  // extensions page.
  cpSync(join(root, "static", "icons"), join(out, "icons"), { recursive: true });
  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(target, null, 2)}\n`);
  const files = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(out, path).split("\\").join("/")] = readFileSync(path);
    }
  };
  walk(out);
  writeFileSync(join(dist, `slopify-studio-${name}.zip`), zipSync(files, { level: 9 }));
  console.log(`Built dist/${name}/ and dist/slopify-studio-${name}.zip`);
}
