import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import stripJsonComments from "strip-json-comments";
import { z } from "zod";
import type { LlmCompletion } from "../../kernel/ports/llm.js";
import { providerError } from "../../kernel/ports/model.js";
import { type DocumentWorkspace, documentServerName, documentTool } from "./document-workspace.js";
import type { CliOptions } from "./run-cli.js";

// Gemini 0.61 rejects non-root system settings and null context objects. Use a
// request-owned CLI home instead. OAuth reads the host's existing credential file
// through its supported ADC fallback; settings, hooks and memory are not inherited.
export function geminiWorkspace(
  webSearch: boolean,
  request?: LlmCompletion,
  documents?: DocumentWorkspace,
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): {
  readonly options: CliOptions;
  readonly mcpAllowlist: string;
  readonly remove: () => void;
} {
  const directory = mkdtempSync(join(tmpdir(), "slopify-gemini-"));
  try {
    const state = join(directory, ".gemini");
    mkdirSync(state, { mode: 0o700 });
    const settings = join(state, "settings.json");
    const originalState = join(
      env.GEMINI_CLI_HOME || env.HOME || env.USERPROFILE || homedir(),
      ".gemini",
    );
    let selectedType: string | undefined;
    const originalSettings = join(originalState, "settings.json");
    if (existsSync(originalSettings))
      try {
        selectedType = z
          .object({
            security: z
              .object({
                auth: z.object({ selectedType: z.string().max(128).optional() }).optional(),
              })
              .optional(),
          })
          .parse(JSON.parse(stripJsonComments(readFileSync(originalSettings, "utf8")))).security
          ?.auth?.selectedType;
      } catch {
        throw providerError({
          kind: "unavailable",
          message:
            "Gemini CLI login settings could not be read. Check its settings.json before retrying.",
        });
      }
    const oauth = join(originalState, "oauth_creds.json");
    const system = join(directory, "writing.md");
    const trust = join(directory, "trusted-folders.json");
    const mcpAllowlist = documents
      ? documentServerName
      : `slopify-disabled-${directory.split(/[\\/]/).at(-1)}`;
    writeFileSync(
      settings,
      JSON.stringify({
        ...(selectedType ? { security: { auth: { selectedType } } } : {}),
        ...(request?.thinkingConfig
          ? {
              modelConfigs: {
                customOverrides: [
                  {
                    match: { model: request.model },
                    modelConfig: {
                      generateContentConfig: {
                        thinkingConfig: {
                          ...(request.thinkingConfig.level === undefined
                            ? {}
                            : { thinkingLevel: request.thinkingConfig.level }),
                          ...(request.thinkingConfig.budget === undefined
                            ? {}
                            : { thinkingBudget: request.thinkingConfig.budget }),
                        },
                      },
                    },
                  },
                ],
              },
            }
          : {}),
        tools: {
          core: webSearch ? ["google_web_search"] : [],
          allowed: webSearch ? ["google_web_search"] : [],
          discoveryCommand: "",
          callCommand: "",
          enableHooks: false,
        },
        mcp: { allowed: [mcpAllowlist], serverCommand: "" },
        ...(documents
          ? {
              mcpServers: {
                [documentServerName]: {
                  command: documents.command,
                  args: documents.args,
                  trust: true,
                  includeTools: [documentTool],
                },
              },
            }
          : {}),
        context: {
          fileName: "SLOPIFY_NO_CONTEXT.md",
          includeDirectories: [],
          loadMemoryFromIncludeDirectories: false,
        },
        experimental: { codebaseInvestigatorSettings: { enabled: false } },
        hooks: {},
        hooksConfig: { enabled: false },
        skills: { enabled: false },
        ide: { enabled: false },
        telemetry: { enabled: false },
        privacy: { usageStatisticsEnabled: false },
        advanced: { autoConfigureMemory: false },
      }),
      { mode: 0o600 },
    );
    writeFileSync(
      system,
      "You are the writing and research component of Slopify, a video creation app. " +
        "Write the requested articles, narration, research notes or image prompts. " +
        "Follow the topic, language, tone, length and format. Return only the requested content. " +
        "Use web search only when available and useful. Never read or modify other local files. " +
        (documents ? "Use only the supplied research MCP tool to read request documents. " : "") +
        "A backslash immediately before @ escapes a literal @ in the supplied text.\n",
      { mode: 0o600 },
    );
    writeFileSync(trust, JSON.stringify({ [directory]: "TRUST_FOLDER" }), { mode: 0o600 });
    return {
      mcpAllowlist,
      options: {
        cwd: directory,
        env: {
          ...env,
          GEMINI_CLI_HOME: directory,
          ...(selectedType === "oauth-personal" && existsSync(oauth)
            ? { GOOGLE_APPLICATION_CREDENTIALS: oauth }
            : {}),
          GEMINI_CLI_TRUSTED_FOLDERS_PATH: trust,
          NO_BROWSER: "true",
          GEMINI_SYSTEM_MD: system,
          GEMINI_WRITE_SYSTEM_MD: "false",
          GEMINI_CLI_NO_RELAUNCH: "true",
        },
      },
      remove: () => rmSync(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
