import { cpSync } from "node:fs";

// Bundled font and license remain beside the emitted font catalog module.
cpSync(new URL("../src/assets/", import.meta.url), new URL("../dist/assets/", import.meta.url), {
  recursive: true,
});
