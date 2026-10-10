import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { causedBy } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import { narrationTimeline, speaksPart } from "../../slices/rebuild/runtime-export-inputs.js";
import { wordsSchema } from "../../slices/rebuild/runtime-subtitles.js";
import { findRevisionDownload } from "../../slices/revisions/downloads.js";
import { currentRevisionId, revisionById } from "../../slices/revisions/repo.js";
import { type DownloadDeps, findDownload } from "../../slices/storage/downloads.js";
import { fileGroups, projectFiles } from "../../slices/storage/project-files.js";
import { outputsOf } from "../../slices/storage/repo.js";
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

type FileDeps = DownloadDeps & { readonly log: Pick<Log, "write"> };

const narrationAssets: ReadonlySet<string> = new Set(["audio-body", "audio-export"]);

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

export function projectFile(deps: FileDeps, projectId: string, url: string): CallToolResult {
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
  // The word timing describes the current narration, so it comes with that audio only: not
  // an intro, an outro or another format, and not an older version from History.
  const timing =
    asset !== undefined && narrationAssets.has(asset)
      ? findDownload(deps, projectId, "subtitle-words")
      : undefined;
  const words = timing?.ok === true ? readFileSync(timing.download.path, "utf8") : undefined;
  const wordTimings =
    words === undefined || asset === "audio-export" ? words : onBodyClock(deps, projectId, words);
  return text(
    JSON.stringify({
      ...where,
      contentType: download.contentType,
      bytes: download.bytes,
      ...(wordTimings === undefined ? {} : { wordTimings }),
    }),
  );
}

// The timing is on the export's clock (`narrationTimeline`), which the audio export plays on.
// The body file alone starts at zero: its words move back by where the body starts, and the
// intro's and outro's are left out. None when a part's length was never recorded.
function onBodyClock(deps: FileDeps, projectId: string, words: string): string | undefined {
  const head = currentRevisionId(deps.db, projectId);
  const revision = head === undefined ? undefined : revisionById(deps.db, projectId, head);
  if (revision === undefined) return undefined;
  let timing: z.infer<typeof wordsSchema>;
  try {
    timing = wordsSchema.parse(JSON.parse(words));
  } catch (error) {
    deps.log.write("error", "mcp.word-timing", { projectId, detail: causedBy(error) });
    return undefined;
  }
  const outputs = outputsOf(deps.db, projectId);
  const part = (role: "audio_body" | "audio_intro" | "audio_outro") => {
    const output = outputs.find((one) => one.role === role);
    return output === undefined || output.durationMs === null
      ? undefined
      : { path: output.path, seconds: output.durationMs / 1000 };
  };
  const [body, intro, outro] = [part("audio_body"), part("audio_intro"), part("audio_outro")];
  const config = revision.config;
  if (
    body === undefined ||
    (speaksPart(config, "intro") && intro === undefined) ||
    (speaksPart(config, "outro") && outro === undefined)
  )
    return undefined;
  const timeline = narrationTimeline(config, { body, intro, outro });
  const before = timeline.findIndex((segment) => segment.kind === "body");
  const start = timeline.slice(0, before).reduce((sum, segment) => sum + segment.seconds, 0);
  const end = start + body.seconds;
  // Times are rounded to the millisecond, so a body word can sit a hair before the body.
  const inBody = (at: number) => at >= start - 0.001 && at < end;
  return JSON.stringify({
    ...timing,
    words: timing.words
      .filter((word) => inBody(word.start))
      .map((word) => ({
        ...word,
        start: Math.max(0, word.start - start),
        end: Math.min(word.end, end) - start,
      })),
    omissions: timing.omissions
      .filter((omission) => inBody(omission.start))
      .map((omission) => ({ ...omission, start: Math.max(0, omission.start - start) })),
  });
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
    ({ id: projectId, url }) => projectFile(deps, projectId, url),
  );
}
