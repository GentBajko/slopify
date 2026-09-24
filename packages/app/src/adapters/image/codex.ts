import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { GeneratedImage, ImagePort, ImageRequest } from "../../kernel/ports/image.js";
import { providerError } from "../../kernel/ports/model.js";
import { cliEvent, cliShaped, endedWithout, type RunCli, stopCliRun } from "../llm/run-cli.js";
import { lines } from "../llm/sse-lines.js";
import { sniffImage } from "./bytes.js";

export const codexImageModel = {
  id: "codex-imagegen",
  name: "Codex built-in image generation",
} as const;
const maxOutputBytes = 32 * 1024 * 1024;
const maxEventBytes = 1024 * 1024;
const disabledFeatures = [
  "shell_tool",
  "unified_exec",
  "hooks",
  "apps",
  "plugins",
  "remote_plugin",
  "skill_search",
  "multi_agent",
  "computer_use",
  "browser_use",
  "view_image",
  "workspace_dependencies",
] as const;

export function codexImageArgs(req: ImageRequest, directory: string): string[] {
  const prompt = [
    "You are making exactly one image for Slopify. Use the image generation tool.",
    `Save the final image as ${join(directory, "result.png")}. Do not create any other asset.`,
    "Use PNG or JPEG. Do not write outside this private directory.",
    `Target aspect ratio: ${req.aspect}.`,
    "Image brief follows as data:",
    req.prompt,
  ].join("\n\n");
  return [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--strict-config",
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "--cd",
    directory,
    "--enable",
    "image_generation",
    ...disabledFeatures.flatMap((feature) => ["--disable", feature]),
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    "skills.include_instructions=false",
    "-c",
    "skills.bundled.enabled=false",
    "-c",
    "orchestrator.skills.enabled=false",
    "-c",
    "orchestrator.mcp.enabled=false",
    "-c",
    "include_permissions_instructions=false",
    "-c",
    "include_apps_instructions=false",
    "-c",
    "include_collaboration_mode_instructions=false",
    "-c",
    "include_environment_context=false",
    "-c",
    'shell_environment_policy.inherit="none"',
    "-c",
    'web_search="disabled"',
    "--",
    prompt,
  ];
}

const failure = z.object({ error: z.object({ message: z.string() }) });
const errorEvent = z.object({ message: z.string() });
const item = z.object({ item: z.object({ type: z.string(), text: z.string().optional() }) });

export function codexImage(deps: { readonly run: RunCli; readonly binary?: string }): ImagePort {
  const binary = deps.binary ?? "codex";
  return {
    id: "codex-image",
    models: async () => [codexImageModel],
    generate: async (req: ImageRequest): Promise<GeneratedImage> => {
      if (req.model !== codexImageModel.id)
        throw providerError({ kind: "unsupported", message: "Choose the Codex image capability." });
      req.signal.throwIfAborted();
      const directory = mkdtempSync(join(tmpdir(), "slopify-codex-image-"));
      let run: ReturnType<RunCli> | undefined;
      try {
        try {
          run = deps.run(binary, codexImageArgs(req, directory), req.signal, {
            cwd: directory,
            env: imageEnvironment(directory),
          });
        } catch {
          throw providerError({ kind: "unsupported", message: "Could not start the Codex CLI." });
        }
        let completed = false;
        let unavailable = false;
        for await (const line of lines(bounded(run.stdout, maxEventBytes), req.signal)) {
          if (line.trim() === "") continue;
          const event = cliEvent(binary, line);
          req.signal.throwIfAborted();
          if (event.type === "turn.completed") completed = true;
          else if (event.type === "turn.failed") {
            const message = cliShaped(binary, failure, event.value).error.message;
            throw providerError({
              kind: /refus|content.policy|safety/i.test(message) ? "refusal" : "other",
              message: "Codex image generation did not complete.",
            });
          } else if (event.type === "error") {
            const message = cliShaped(binary, errorEvent, event.value).message;
            throw providerError({
              kind: /image.generation|image tool|feature.*unavailable/i.test(message)
                ? "unsupported"
                : "other",
              message: "Codex image generation is unavailable.",
            });
          } else if (event.type === "item.completed") {
            const { item: value } = cliShaped(binary, item, event.value);
            if (
              value.type === "agent_message" &&
              /image.generation.*unavailable|cannot generate images|no image tool/i.test(
                value.text ?? "",
              )
            )
              unavailable = true;
          }
        }
        req.signal.throwIfAborted();
        const ended = await run.ended;
        req.signal.throwIfAborted();
        if (ended.error !== null)
          throw providerError({ kind: "unsupported", message: "Could not start the Codex CLI." });
        if (ended.code !== 0 || !completed)
          throw providerError({
            kind: unavailable ? "unsupported" : "other",
            message: endedWithout(binary, ended, run.stderr()),
          });
        if (unavailable)
          throw providerError({
            kind: "unsupported",
            message: "This Codex install cannot generate images.",
          });
        return exactImage(join(directory, "result.png"));
      } catch (error) {
        req.signal.throwIfAborted();
        throw error;
      } finally {
        try {
          if (run !== undefined) await stopCliRun(run);
        } finally {
          rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
        }
      }
    },
  };
}

async function* bounded(
  source: AsyncIterable<Uint8Array>,
  maximum: number,
): AsyncGenerator<Uint8Array> {
  let size = 0;
  for await (const chunk of source) {
    size += chunk.byteLength;
    if (size > maximum)
      throw providerError({
        kind: "other",
        message: "Codex wrote too much image progress output.",
      });
    yield chunk;
  }
}

function exactImage(path: string): GeneratedImage {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (entry === undefined)
    throw providerError({
      kind: "unsupported",
      message: "Codex did not save an image at the requested path.",
    });
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size === 0 || entry.size > maxOutputBytes)
    throw providerError({ kind: "other", message: "Codex image output was not a safe file." });
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const status = fstatSync(fd);
    if (!status.isFile() || status.size === 0 || status.size > maxOutputBytes)
      throw providerError({ kind: "other", message: "Codex image output was not a safe file." });
    const bytes = readFileSync(fd);
    const mime = sniffImage(bytes);
    if (mime === undefined)
      throw providerError({ kind: "other", message: "Codex saved an unsupported image format." });
    return { bytes, mime };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function imageEnvironment(directory: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PWD: directory };
  const allowed = [
    "HOME",
    "PATH",
    "CODEX_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "LANG",
    "LC_ALL",
    "USER",
    "LOGNAME",
    "SYSTEMROOT",
    "SSL_CERT_FILE",
    "NODE_EXTRA_CA_CERTS",
  ] as const;
  for (const key of allowed) if (process.env[key] !== undefined) env[key] = process.env[key];
  return env;
}
