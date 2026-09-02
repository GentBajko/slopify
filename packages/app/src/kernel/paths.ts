import { chmodSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Paths {
  readonly dataDir: string;
  readonly db: string;
  readonly projects: string;
  readonly staging: string;
  readonly logs: string;
  readonly lock: string;
}

export interface EnsureDirsOptions {
  readonly mode: number;
}

export function layout(dataDir: string): Paths {
  const root = resolve(dataDir);
  return {
    dataDir: root,
    db: join(root, "slopify.db"),
    projects: join(root, "projects"),
    staging: join(root, "staging"),
    logs: join(root, "logs"),
    lock: join(root, ".lock"),
  };
}

export function ensureDirs(paths: Paths, options: EnsureDirsOptions): void {
  for (const dir of [paths.dataDir, paths.projects, paths.staging, paths.logs]) {
    mkdirSync(dir, { recursive: true, mode: options.mode });
    // mkdir's mode is masked by the umask and ignored for a directory that already
    // exists; provider keys sit in this tree, so the mode has to be forced.
    chmodSync(dir, options.mode);
  }
}
