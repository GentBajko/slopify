import { readFileSync, statSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { bodyWordTimings } from "../../slices/rebuild/narration-words.js";
import { findRevisionDownload } from "../../slices/revisions/downloads.js";
import type { RevisionDeps } from "../../slices/revisions/model.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";
import { getRevisionView } from "../../slices/revisions/view.js";
import { type DownloadDeps, findDownload } from "../../slices/storage/downloads.js";
import { fileGroups, projectFiles } from "../../slices/storage/project-files.js";
import { refusal, text } from "./call-route.js";

// ceiling: model APIs refuse images over about 5 MB; a larger picture comes as path and URL.
const imageBytesMax = 5 * 1024 * 1024;
const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);
const fileUrl =
  /^\/files\/([0-9A-Za-z_-]{1,64})\/(?:revisions\/([0-9A-Za-z_-]{1,64})\/([0-9A-Za-z_-]{1,64})|([a-z0-9-]{1,64}))$/;

const missing = {
  "unknown-project": "This project doesn't exist. Call list_projects to pick one.",
  "unknown-asset":
    "This project has no file at that address. Call list_project_files and pass a file's url as it is.",
  "missing-file":
    "This file is recorded but no longer on disk. Make it again with preview_rebuild and start_rebuild for its step, then call list_project_files.",
} as const;

export function listProjectFiles(deps: DownloadDeps, projectId: string): CallToolResult {
  const files = projectFiles(deps, projectId);
  if (files === undefined) return refusal(missing["unknown-project"]);
  return text(
    JSON.stringify({
      groups: fileGroups.map((group) => ({
        group,
        files: files.filter((file) => file.group === group),
      })),
    }),
  );
}

export async function projectFile(
  deps: RevisionDeps,
  projectId: string,
  url: string,
): Promise<CallToolResult> {
  const match = fileUrl.exec(url);
  if (match === null || match[1] !== projectId) return refusal(missing["unknown-asset"]);
  const asset = match[4];
  const found =
    asset !== undefined
      ? findDownload(deps, projectId, asset)
      : findRevisionDownload(deps, projectId, match[2] ?? "", match[3] ?? "");
  if (!found.ok) return refusal(missing[found.reason]);
  const { download } = found;
  const where = { path: download.path, url };
  if (download.contentType.startsWith("image/") && download.bytes <= imageBytesMax)
    return {
      content: [
        {
          type: "image",
          data: readFileSync(download.path).toString("base64"),
          mimeType: download.contentType,
        },
        { type: "text", text: JSON.stringify(where) },
      ],
    };
  if (download.text !== undefined) return text(new TextDecoder().decode(download.text));
  if (download.contentType.startsWith("text/") || download.contentType.includes("json"))
    return text(readFileSync(download.path, "utf8"));
  const wordTimings =
    asset === "audio-body" || asset === "audio-export"
      ? await narrationTimings(deps, projectId, asset)
      : undefined;
  return text(
    JSON.stringify({
      ...where,
      contentType: download.contentType,
      bytes: download.bytes,
      ...(wordTimings === undefined ? {} : { wordTimings }),
    }),
  );
}

// The word timing describes the current narration, so it comes with that audio only: not an
// intro, an outro or another format, and not an older version from History. The audio export
// plays on the clock the words were timed on; the body file alone has its own.
async function narrationTimings(
  deps: RevisionDeps,
  projectId: string,
  asset: "audio-body" | "audio-export",
): Promise<string | undefined> {
  const timing = findDownload(deps, projectId, "subtitle-words");
  if (!timing.ok) return undefined;
  const head = currentRevisionId(deps.db, projectId);
  const view = head === undefined ? undefined : getRevisionView(deps, projectId, head);
  if (view === undefined) return undefined;
  const words = readFileSync(timing.download.path, "utf8");
  if (asset === "audio-export") return words;
  const { measureAudio } = deps;
  const body = await bodyWordTimings(
    {
      paths: deps.paths,
      measure: (path) =>
        measureAudio === undefined
          ? Promise.reject(new Error("this server has no way to measure audio"))
          : measureAudio(path),
    },
    view,
    words,
  );
  if (body.ok && body.unclipped !== undefined)
    deps.log.write("warn", "mcp.word-timing", {
      projectId,
      detail: `get_project_file gave the narration's word timing without cutting the last words at its end, as its length couldn't be measured: ${body.unclipped}`,
    });
  if (body.ok) return body.value;
  deps.log.write("error", "mcp.word-timing", {
    projectId,
    detail: `The narration's word timing was left out of get_project_file: ${body.reason}`,
  });
  return undefined;
}

// An audio file's length, measured once while the file stays the same: a narration's full
// decode takes seconds, and an agent may ask for its timing over and over, or several at once.
// A measurement that failed (a decode timed out under load) is forgotten, so the next ask
// measures again.
// ceiling: one entry per narration file measured since boot, a few dozen bytes each.
export function measuredOnce(
  measure: (path: string) => Promise<number>,
): (path: string) => Promise<number> {
  const lengths = new Map<string, { readonly stamp: string; readonly length: Promise<number> }>();
  return async (path) => {
    const { mtimeMs, size } = statSync(path);
    const stamp = `${String(mtimeMs)}:${String(size)}`;
    const known = lengths.get(path);
    if (known?.stamp === stamp) return known.length;
    const length = measure(path);
    const entry = { stamp, length };
    lengths.set(path, entry);
    length.catch(() => {
      if (lengths.get(path) === entry) lengths.delete(path);
    });
    return length;
  };
}

export function registerFileTools(server: McpServer, deps: RevisionDeps): void {
  server.registerTool(
    "list_project_files",
    {
      title: "List project files",
      description:
        "A project's files grouped as its folder is: Upload (what is published: video, thumbnails, subtitles, description, PDF, shorts), Working (what it was made from) and History (older versions). Each has its place in the folder, its role, its local path now (Slopify can move it when it arranges the folder) and its /files url, the address to keep.",
      inputSchema: { id },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ id: projectId }) => listProjectFiles(deps, projectId),
  );
  server.registerTool(
    "get_project_file",
    {
      title: "Read a project file",
      description:
        "One project file by the url list_project_files gives: a picture as an image, text inline, audio and video as their local path and url, with the word timing for the current narration (audio-body, audio-export), timed on that file's own clock.",
      inputSchema: { id, url: z.string().min(1).max(300) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ id: projectId, url }) => projectFile(deps, projectId, url),
  );
}
