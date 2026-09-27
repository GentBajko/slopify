import { cpSync } from "node:fs";

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
cpSync(
  new URL("../../../docs/patch-notes/", import.meta.url),
  new URL("../dist/patch-notes/", import.meta.url),
  { recursive: true },
);

// The tutorials Help → Tutorials shows and GET /api/tutorials serves: the GitHub wiki's pages.
cpSync(
  new URL("../../../docs/wiki/", import.meta.url),
  new URL("../dist/tutorials/", import.meta.url),
  {
    recursive: true,
  },
);
