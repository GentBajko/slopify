import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Paths } from "../../kernel/paths.js";
import { defaultBackupsDir } from "../storage/layout.js";

export interface FolderLocation {
  readonly container: boolean;
  readonly hostProjects: string | null;
}

export function effectiveFolder(paths: Pick<Paths, "projects">, folder: string | null): string {
  return folder === null ? defaultBackupsDir(paths) : resolve(folder);
}

function within(root: string, path: string): boolean {
  const inside = relative(root, path);
  return (
    inside === "" || (!inside.startsWith(`..${sep}`) && inside !== ".." && !isAbsolute(inside))
  );
}

// Why a chosen folder cannot hold backups, as the sentence the Folder field shows; undefined
// when it can. Staging and logs are swept by Slopify itself, and the projects folder belongs to
// storage reconciliation except for its Backups folder.
export function folderProblem(
  paths: Pick<Paths, "projects" | "staging" | "logs" | "dataDir">,
  folder: string | null,
): string | undefined {
  if (folder === null) return undefined;
  if (!isAbsolute(folder))
    return "Enter the folder's full path, starting from the top of the disk (for example /home/you/Slopify backups), or leave Folder empty to use the default.";
  const path = resolve(folder);
  if (within(paths.projects, path) && !within(defaultBackupsDir(paths), path))
    return "This folder is inside Slopify's projects folder, which Slopify cleans up on its own. Pick a folder outside it, or leave Folder empty to use the default Backups folder.";
  for (const own of [paths.staging, paths.logs, join(paths.dataDir, "models")])
    if (within(own, path))
      return "This folder is one Slopify uses for its own temporary files. Pick another folder, or leave Folder empty to use the default.";
  return undefined;
}

// Where the folder is on the user's computer. In Docker only the projects folder is shared
// with the host, so a folder elsewhere lives in the container's private volume.
export function hostFolder(
  paths: Pick<Paths, "projects">,
  location: FolderLocation,
  folder: string,
): string | null {
  if (!location.container) return folder;
  if (location.hostProjects === null || !within(paths.projects, folder)) return null;
  const inside = relative(paths.projects, folder);
  return inside === "" ? location.hostProjects : join(location.hostProjects, inside);
}
