import { lstat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { Context } from "hono";
import type { AppDeps } from "./app.js";
import { folderReplySchema } from "./folder-location-schema.js";
import { problem, titleOf } from "./problem.js";

type FolderDeps = Pick<AppDeps, "openFolder" | "folderLocation" | "log"> & {
  readonly paths: Pick<AppDeps["paths"], "projects">;
};

export async function replyForFolder(
  c: Context,
  deps: FolderDeps,
  projectId: string,
  file: string,
): Promise<Response> {
  c.header("Cache-Control", "no-store");
  if (deps.folderLocation?.container) {
    const host = deps.folderLocation.hostProjects;
    if (!host)
      return problem(c, {
        status: 503,
        title: titleOf(503),
        detail:
          "Slopify cannot show where this file is on your computer because its Docker project folder was not set up. You can still use the download buttons, or run the Slopify Docker launcher again to set up the folder.",
      });
    try {
      const r = relative(deps.paths.projects, file);
      if (!r || r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r))
        throw new Error("Outside projects");
      let path = deps.paths.projects;
      const root = await lstat(path);
      if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Invalid project root");
      const parts = r.split(sep);
      for (const [i, part] of parts.entries()) {
        path = join(path, part);
        const s = await lstat(path);
        if (s.isSymbolicLink() || (i === parts.length - 1 ? !s.isFile() : !s.isDirectory()))
          throw new Error("Unavailable output");
      }
      return c.json(
        folderReplySchema.parse({
          opened: false,
          location: "docker-host",
          path: join(host, dirname(r)),
        }),
      );
    } catch {
      deps.log.write("warn", "project.locate-folder", {
        projectId,
        detail: "The verified output folder is no longer available.",
      });
      return problem(c, {
        status: 404,
        title: titleOf(404),
        detail:
          "This output's folder was deleted or moved. Use Re-run section on the project page to make the file again.",
      });
    }
  }
  try {
    if (!deps.openFolder) throw new Error("No folder opener configured");
    await deps.openFolder(dirname(file));
    return c.json(folderReplySchema.parse({ opened: true }));
  } catch {
    deps.log.write("warn", "project.open-folder", {
      projectId,
      detail: "The file manager could not be opened for a saved file.",
    });
    return problem(c, {
      status: 503,
      title: titleOf(503),
      detail:
        "Slopify could not open a file manager window on the computer it runs on. Make sure you are signed in to that computer's desktop, or use the download buttons instead.",
    });
  }
}
