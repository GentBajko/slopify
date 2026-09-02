import { cpSync } from "node:fs";

// .sql files are not compiled output, so tsc leaves them behind; migrate.ts resolves
// them relative to its own module URL and needs them beside the emitted JavaScript.
cpSync(
  new URL("../src/kernel/db/migrations/", import.meta.url),
  new URL("../dist/kernel/db/migrations/", import.meta.url),
  { recursive: true },
);
