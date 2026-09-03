import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = new URL("../../web/dist/", import.meta.url);
const target = new URL("../dist/web/", import.meta.url);

// createApp falls back to a placeholder page when this directory is missing, so a build
// that skipped the copy would pack and publish an app with no UI and say nothing.
if (!existsSync(source)) {
  throw new Error(
    `packages/web is not built: ${fileURLToPath(source)} does not exist. Run \`npm run build\` at the repository root, which builds packages/web first.`,
  );
}

// Vite names every asset by content hash, so copying over a previous build would leave
// the assets of every earlier build behind to be published alongside the current one.
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
