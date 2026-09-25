import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nodeClaudeCodeModels } from "./claude-code-models.js";

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fakeClaude(reply: string, linger = false, ignoreTerm = false): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "slopify-claude-model-test-"));
  directories.push(directory);
  const path = join(directory, "claude.mjs");
  await writeFile(
    path,
    [
      'import { writeFileSync } from "node:fs";',
      'let input = "";',
      'process.stdin.setEncoding("utf8");',
      'process.stdin.on("data", (piece) => {',
      "  input += piece;",
      '  if (!input.includes("\\n")) return;',
      '  const request = JSON.parse(input.split("\\n")[0]);',
      '  if (request.type !== "control_request" || request.request.subtype !== "initialize") process.exit(9);',
      '  writeFileSync(new URL("./cwd.txt", import.meta.url), process.cwd());',
      '  writeFileSync(new URL("./env.json", import.meta.url), JSON.stringify({config:process.env.CLAUDE_CONFIG_DIR ?? null,unrelated:process.env.SLOPIFY_PRIVATE_TEST ?? null}));',
      "  process.stdout.write(" +
        JSON.stringify(reply) +
        '.replaceAll("REQUEST_ID", request.request_id));',
      ignoreTerm ? '  process.on("SIGTERM", () => {});' : "",
      linger ? "  setInterval(() => {}, 1000);" : "  process.exit(0);",
      "});",
    ].join("\n"),
  );
  return path;
}

const success = `${JSON.stringify({
  type: "control_response",
  response: {
    request_id: "REQUEST_ID",
    subtype: "success",
    response: {
      models: [
        {
          value: "sonnet",
          resolvedModel: "claude-sonnet-5",
          displayName: "Claude Sonnet",
          supportedEffortLevels: ["low", "high"],
        },
        {
          value: "opus[1m]",
          resolvedModel: "claude-opus-5[1m]",
          displayName: "Claude Opus",
          supportedEffortLevels: ["max"],
        },
      ],
    },
  },
})}\n`;

describe("Claude Code model discovery", () => {
  it("keeps the host configuration directory without forwarding unrelated environment", async () => {
    const binary = await fakeClaude(success);
    const directory = join(dirname(binary), "custom-config");
    vi.stubEnv("CLAUDE_CONFIG_DIR", directory);
    vi.stubEnv("SLOPIFY_PRIVATE_TEST", "test-only-not-forwarded");
    await nodeClaudeCodeModels(binary, 1000);
    expect(JSON.parse(await readFile(join(dirname(binary), "env.json"), "utf8"))).toEqual({
      config: directory,
      unrelated: null,
    });
  });
  it("uses only a no-prompt initialize request and returns model/effort metadata", async () => {
    const binary = await fakeClaude(success);
    expect(await nodeClaudeCodeModels(binary, 1000)).toEqual([
      { id: "sonnet", name: "Sonnet 5", thinkingModes: ["low", "high"] },
      { id: "opus[1m]", name: "Opus 5 (1M context)" },
    ]);
    const privateCwd = await readFile(join(dirname(binary), "cwd.txt"), "utf8");
    expect(existsSync(privateCwd)).toBe(false);
  });

  it("deduplicates Default and Opus, labels versions, and preserves context in accepted IDs", async () => {
    const binary = await fakeClaude(
      `${JSON.stringify({
        type: "control_response",
        response: {
          request_id: "REQUEST_ID",
          subtype: "success",
          response: {
            models: [
              { value: "default", resolvedModel: "claude-opus-5", displayName: "Default" },
              { value: "opus", resolvedModel: "claude-opus-5", displayName: "Opus" },
              { value: "haiku", resolvedModel: "claude-haiku-4-5-20251001", displayName: "Haiku" },
              {
                value: "claude-fable-5-1[1m]",
                resolvedModel: "claude-fable-5-1",
                displayName: "Fable",
              },
              {
                value: "new-alias",
                displayName: "New alias",
                description: "Opus 5.5 · Advertised version",
              },
            ],
          },
        },
      })}\n`,
    );
    expect(await nodeClaudeCodeModels(binary, 1000)).toEqual([
      { id: "opus", name: "Opus 5" },
      { id: "haiku", name: "Haiku 4.5" },
      { id: "claude-fable-5-1[1m]", name: "Fable 5.1 (1M context)" },
      { id: "new-alias", name: "Opus 5.5" },
    ]);
  });

  it("rejects a mismatched control response", async () => {
    const binary = await fakeClaude(success.replace("REQUEST_ID", "wrong-id"));
    await expect(nodeClaudeCodeModels(binary, 1000)).rejects.toThrow(
      "could not get the model list from the Claude Code CLI",
    );
  });

  it("does not offer models the CLI marks disabled, including update-required models", async () => {
    const reply = JSON.parse(success);
    reply.response.response.models.push({
      value: "claude-opus-5-5",
      displayName: "Opus 5.5 (disabled)",
      description: "Update Claude Code to use this model",
      disabled: true,
    });
    const binary = await fakeClaude(`${JSON.stringify(reply)}\n`);
    expect(await nodeClaudeCodeModels(binary, 1000)).toEqual([
      { id: "sonnet", name: "Sonnet 5", thinkingModes: ["low", "high"] },
      { id: "opus[1m]", name: "Opus 5 (1M context)" },
    ]);
  });

  it("rejects malformed output without returning raw child text", async () => {
    const binary = await fakeClaude("not-json-with-a-private-path\n");
    await expect(nodeClaudeCodeModels(binary, 1000)).rejects.toThrow(
      "could not get the model list from the Claude Code CLI",
    );
  });

  it("rejects an empty advertised list", async () => {
    const binary = await fakeClaude(
      `${JSON.stringify({
        type: "control_response",
        response: {
          request_id: "REQUEST_ID",
          subtype: "success",
          response: { models: [] },
        },
      })}\n`,
    );
    await expect(nodeClaudeCodeModels(binary, 1000)).rejects.toThrow(
      "could not get the model list from the Claude Code CLI",
    );
  });

  it("bounds a child that never answers", async () => {
    const binary = await fakeClaude("", true);
    await expect(nodeClaudeCodeModels(binary, 50)).rejects.toThrow(
      "could not get the model list from the Claude Code CLI",
    );
  });

  it("force-stops a stalled child that ignores graceful termination", async () => {
    const binary = await fakeClaude("", true, true);
    await expect(nodeClaudeCodeModels(binary, 50)).rejects.toThrow(
      "could not get the model list from the Claude Code CLI",
    );
  });

  it("rejects an oversized control stream", async () => {
    const binary = await fakeClaude("x".repeat(1024 * 1024 + 1));
    await expect(nodeClaudeCodeModels(binary, 1000)).rejects.toThrow(
      "could not get the model list from the Claude Code CLI",
    );
  });
});
