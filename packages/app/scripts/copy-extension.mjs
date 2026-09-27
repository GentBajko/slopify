import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The Slopify Studio extension ships inside the app: Settings → YouTube Studio and Prepare
// upload offer its zips for download (GET /api/studio/extension/<browser>.zip).
const source = new URL("../../extension/dist/", import.meta.url);
const target = new URL("../dist/extension/", import.meta.url);
const zips = ["slopify-studio-chrome.zip", "slopify-studio-firefox.zip"];

// Without them the app would offer a Download that answers "not included" and say nothing at
// build time.
const missing = zips.filter((zip) => !existsSync(new URL(zip, source)));
if (missing.length > 0) {
  throw new Error(
    `packages/extension is not built: ${missing.join(", ")} missing in ${fileURLToPath(source)}. Run \`npm run build\` at the repository root, which builds packages/extension before the app.`,
  );
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const zip of zips) copyFileSync(new URL(zip, source), new URL(zip, target));
