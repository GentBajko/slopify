import { cpSync, rmSync } from "node:fs";

// A folder that is only a copy is emptied first, so a page renamed or deleted at the source
// leaves no stale copy behind in dist for the server to list beside the new one.
const mirror = (from, to) => {
  const target = new URL(to, import.meta.url);
  rmSync(target, { recursive: true, force: true });
  cpSync(new URL(from, import.meta.url), target, { recursive: true });
};

// Bundled font and license remain beside the emitted font catalog module.
cpSync(new URL("../src/assets/", import.meta.url), new URL("../dist/assets/", import.meta.url), {
  recursive: true,
});

// The compose file the Docker install renders its installation from (npx @gentbajko/slopify --docker).
cpSync(
  new URL("../../../compose.yaml", import.meta.url),
  new URL("../dist/compose.yaml", import.meta.url),
);

// The patch notes Settings → Patch notes lists and GET /api/patch-notes serves.
mirror("../../../docs/patch-notes/", "../dist/patch-notes/");

// The tutorials Help → Tutorials shows and GET /api/tutorials serves: the GitHub wiki's pages.
mirror("../../../docs/wiki/", "../dist/tutorials/");
