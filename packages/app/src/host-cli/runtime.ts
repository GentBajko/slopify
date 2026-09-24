import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexImage } from "../adapters/image/codex.js";
import { claudeCodeLlm } from "../adapters/llm/claude-code.js";
import { nodeClaudeCodeModels } from "../adapters/llm/claude-code-models.js";
import { codexLlm } from "../adapters/llm/codex.js";
import { nodeCodexModels } from "../adapters/llm/codex-models.js";
import { geminiLlm } from "../adapters/llm/gemini.js";
import { nodeGeminiModels } from "../adapters/llm/gemini-models.js";
import type { RunCli } from "../adapters/llm/run-cli.js";
import type { HostCliId, HostCliPorts, HostLlmId } from "../kernel/ports/host-cli.js";
import { providerError } from "../kernel/ports/model.js";
import { createHostStatus, type HostStatusDeps } from "./status.js";

export function createHostRuntime(
  deps: HostStatusDeps & { readonly run: RunCli; readonly env: Readonly<NodeJS.ProcessEnv> },
): HostCliPorts {
  const status = createHostStatus(deps);
  async function command(id: HostCliId): Promise<string> {
    const ready = await status(id);
    if (ready.issue || !ready.installed)
      throw providerError({
        kind: ready.issueKind === "login" ? "missing_key" : "unavailable",
        message: ready.issue ?? "The host CLI is unavailable.",
      });
    return deps.resolve(id === "codex-image" ? "codex" : id);
  }
  const factories = { "claude-code": claudeCodeLlm, codex: codexLlm, gemini: geminiLlm };
  const models = async (id: HostLlmId) => {
    const binary = await deps.resolve(id);
    return id === "claude-code"
      ? nodeClaudeCodeModels(binary)
      : id === "codex"
        ? nodeCodexModels(deps.env, binary)
        : nodeGeminiModels(binary);
  };
  return {
    status,
    llm: (id) => ({
      id,
      capabilities: { streams: true, reportsUsage: true, webSearch: true },
      models: () => models(id),
      complete: async function* (request) {
        request.signal.throwIfAborted();
        const binary = await command(id);
        const directory =
          id === "claude-code" ? await mkdtemp(join(tmpdir(), "slopify-host-claude-")) : undefined;
        try {
          const run: RunCli = (file, args, signal, options) =>
            deps.run(file, args, signal, {
              ...(directory === undefined ? {} : { cwd: directory }),
              ...options,
              env: options?.env ?? {
                ...deps.env,
                ...(directory === undefined ? {} : { PWD: directory }),
              },
            });
          yield* factories[id]({
            run,
            binary,
            env: deps.env,
            readModels: () => models(id),
          }).complete({
            ...request,
            ...(id === "codex" && request.thinking !== undefined
              ? {
                  thinkingConfig: {
                    effort: request.thinking === "off" ? "none" : request.thinking,
                  },
                }
              : {}),
          });
        } finally {
          if (directory !== undefined) await rm(directory, { recursive: true, force: true });
        }
      },
    }),
    image: {
      id: "codex-image",
      models: () => codexImage({ run: deps.run }).models(),
      generate: async (request) => {
        const binary = await command("codex-image");
        return codexImage({ run: deps.run, binary, env: deps.env }).generate(request);
      },
    },
  };
}
