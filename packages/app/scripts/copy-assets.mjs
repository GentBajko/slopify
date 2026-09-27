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
