import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { wordTimingsFor } from "../../slices/rebuild/narration-words.js";
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

type FileDeps = RevisionDeps;

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
  deps: FileDeps,
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
// intro, an outro or another format, and not an older version from History.
async function narrationTimings(
  deps: FileDeps,
  projectId: string,
  asset: "audio-body" | "audio-export",
): Promise<string | undefined> {
  const timing = findDownload(deps, projectId, "subtitle-words");
  if (!timing.ok) return undefined;
  const head = currentRevisionId(deps.db, projectId);
  const view = head === undefined ? undefined : getRevisionView(deps, projectId, head);
  if (view === undefined) return undefined;
  const { measureAudio } = deps;
  return wordTimingsFor(
    {
      paths: deps.paths,
      log: deps.log,
      measure: (path) =>
        measureAudio === undefined
          ? Promise.reject(new Error("this server has no way to measure audio"))
          : measureAudio(path),
    },
    view,
    asset,
    readFileSync(timing.download.path, "utf8"),
  );
}

export function registerFileTools(server: McpServer, deps: FileDeps): void {
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
    async ({ id: projectId, url }) => projectFile(deps, projectId, url),
  );
}
