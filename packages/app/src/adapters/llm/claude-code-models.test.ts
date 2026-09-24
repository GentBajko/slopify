import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nodeClaudeCodeModels } from "./claude-code-models.js";

const directories: string[] = [];
afterEach(async () => {
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
  it("uses only a no-prompt initialize request and returns model/effort metadata", async () => {
    const binary = await fakeClaude(success);
    expect(await nodeClaudeCodeModels(binary, 1000)).toEqual([
      { id: "sonnet", name: "Claude Sonnet → claude-sonnet-5", thinkingModes: ["low", "high"] },
      {
        id: "claude-sonnet-5",
        name: "claude-sonnet-5 (exact model)",
        thinkingModes: ["low", "high"],
      },
      { id: "opus[1m]", name: "Claude Opus → claude-opus-5[1m]" },
      { id: "claude-opus-5[1m]", name: "claude-opus-5[1m] (exact model)" },
    ]);
    const privateCwd = await readFile(join(dirname(binary), "cwd.txt"), "utf8");
    expect(existsSync(privateCwd)).toBe(false);
  });

  it("keeps legacy aliases and deduplicates shared resolved model IDs", async () => {
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
              { value: "haiku", displayName: "Haiku" },
            ],
          },
        },
      })}\n`,
    );
    expect(await nodeClaudeCodeModels(binary, 1000)).toEqual([
      { id: "default", name: "Default → claude-opus-5" },
      { id: "claude-opus-5", name: "claude-opus-5 (exact model)" },
      { id: "opus", name: "Opus → claude-opus-5" },
      { id: "haiku", name: "Haiku" },
    ]);
  });

  it("rejects a mismatched control response", async () => {
    const binary = await fakeClaude(success.replace("REQUEST_ID", "wrong-id"));
    await expect(nodeClaudeCodeModels(binary, 1000)).rejects.toThrow(
      "Claude Code model discovery is unavailable",
    );
  });

  it("rejects malformed output without returning raw child text", async () => {
    const binary = await fakeClaude("not-json-with-a-private-path\n");
    await expect(nodeClaudeCodeModels(binary, 1000)).rejects.toThrow(
      "Claude Code model discovery is unavailable",
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
      "Claude Code model discovery is unavailable",
    );
  });

  it("bounds a child that never answers", async () => {
    const binary = await fakeClaude("", true);
    await expect(nodeClaudeCodeModels(binary, 50)).rejects.toThrow(
      "Claude Code model discovery is unavailable",
    );
  });

  it("force-stops a stalled child that ignores graceful termination", async () => {
    const binary = await fakeClaude("", true, true);
    await expect(nodeClaudeCodeModels(binary, 50)).rejects.toThrow(
      "Claude Code model discovery is unavailable",
    );
  });

  it("rejects an oversized control stream", async () => {
    const binary = await fakeClaude("x".repeat(1024 * 1024 + 1));
    await expect(nodeClaudeCodeModels(binary, 1000)).rejects.toThrow(
      "Claude Code model discovery is unavailable",
    );
  });
});
