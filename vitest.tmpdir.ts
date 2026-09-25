import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Test fixtures create their data dirs under os.tmpdir() and never remove them, which filled a
// tmpfs /tmp over repeated runs. Pointing TMPDIR at one directory per run, which the workers
// inherit, lets teardown remove everything the run created in one place.
export default function setup(): () => void {
  const previous = process.env.TMPDIR;
  const directory = mkdtempSync(join(tmpdir(), "slopify-vitest-"));
  process.env.TMPDIR = directory;
  return (): void => {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  };
}
