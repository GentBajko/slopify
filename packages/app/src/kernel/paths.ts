import { chmodSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Paths {
  readonly dataDir: string;
  readonly db: string;
  // The user-visible files (slices/storage/files-location.ts): project folders, the default
  // folder for scheduled backups, and the folder for files Slopify saves for the user (null
  // when the install keeps its files the pre-3.0 way, inside the data dir). A native install
  // can move them while it runs, so read them from here each time instead of keeping a copy.
  readonly projects: string;
  readonly backups: string;
  readonly exports: string | null;
  readonly staging: string;
  readonly logs: string;
  readonly lock: string;
}

// Where the user-visible files go. Without one, everything stays inside the data dir: the
// layout every install had before 3.0 and the one tests use.
export interface FilesLayout {
  readonly projects: string;
  readonly backups: string;
  readonly exports: string | null;
}

export interface EnsureDirsOptions {
  readonly mode: number;
}

export function layout(dataDir: string, files?: FilesLayout): Paths {
  const root = resolve(dataDir);
  const projects = join(root, "projects");
  return {
    dataDir: root,
    db: join(root, "slopify.db"),
    projects: files?.projects ?? projects,
    backups: files?.backups ?? join(projects, "Backups"),
    exports: files === undefined ? null : files.exports,
    staging: join(root, "staging"),
    logs: join(root, "logs"),
    lock: join(root, ".lock"),
  };
}

// Points a running install's Paths at moved files. The one object every slice was handed is
// changed in place, so the next file each one reads or writes is in the new place.
export function repoint(paths: Paths, files: FilesLayout): void {
  Object.assign(paths as { -readonly [K in keyof Paths]: Paths[K] }, {
    projects: files.projects,
    backups: files.backups,
    exports: files.exports,
  });
}

export function ensureDirs(paths: Paths, options: EnsureDirsOptions): void {
  ensureDataDirs(paths, options);
  ensureOwnerOnly([paths.projects], options);
}

// The data dir's own folders, before it is known where the user-visible files go.
export function ensureDataDirs(paths: Paths, options: EnsureDirsOptions): void {
  ensureOwnerOnly([paths.dataDir, paths.staging, paths.logs], options);
}

function ensureOwnerOnly(dirs: readonly string[], options: EnsureDirsOptions): void {
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true, mode: options.mode });
    // mkdir's mode is masked by the umask and ignored for a directory that already
    // exists; provider keys sit in this tree, so the mode has to be forced.
    chmodSync(dir, options.mode);
  }
}

// The subtitle-timing model's cache. The app readies it at start and every captioned render
// reads it, so both name it through here. Other languages use the multilingual model, kept
// in a folder of its own and downloaded on first use, never at start.
export function subtitleModelDir(dataDir: string, language = "en"): string {
  return join(
    dataDir,
    "models",
    language === "en" ? "english-subtitles" : "multilingual-subtitles",
  );
}
