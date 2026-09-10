import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LlmCompletion } from "../../kernel/ports/llm.js";
import type { CliOptions } from "./run-cli.js";

// Gemini 0.16 supports stream-json and tools.core, but headless default mode still
// exposes file-reading tools. Isolate each writing call while retaining ~/.gemini
// authentication. Nothing is written into the user's settings or project.
export function geminiWorkspace(
  webSearch: boolean,
  request?: LlmCompletion,
): {
  readonly options: CliOptions;
  readonly mcpAllowlist: string;
  readonly remove: () => void;
} {
  const directory = mkdtempSync(join(tmpdir(), "slopify-gemini-"));
  try {
    const settings = join(directory, "settings.json");
    const system = join(directory, "writing.md");
    const trust = join(directory, "trusted-folders.json");
    const mcpAllowlist = `slopify-disabled-${directory.split(/[\\/]/).at(-1)}`;
    writeFileSync(
      settings,
      JSON.stringify({
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
        context: {
          fileName: "SLOPIFY_NO_CONTEXT.md",
          includeDirectories: [],
          loadMemoryFromIncludeDirectories: false,
        },
        experimental: { codebaseInvestigatorSettings: { enabled: false } },
        hooks: { enabled: false },
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
        "Use web search only when available and useful. Never read or modify local files. " +
        "A backslash immediately before @ escapes a literal @ in the supplied text.\n",
      { mode: 0o600 },
    );
    // Gemini CONCAT-merges includeDirectories (even a null value). Reset the
    // whole context object at workspace scope before the system context above.
    // Trust only this new private workspace, leaving the user's trust file untouched.
    mkdirSync(join(directory, ".gemini"), { mode: 0o700 });
    writeFileSync(join(directory, ".gemini", "settings.json"), JSON.stringify({ context: null }), {
      mode: 0o600,
    });
    writeFileSync(trust, JSON.stringify({ [directory]: "TRUST_FOLDER" }), { mode: 0o600 });
    return {
      mcpAllowlist,
      options: {
        cwd: directory,
        env: {
          ...process.env,
          GEMINI_CLI_SYSTEM_SETTINGS_PATH: settings,
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
