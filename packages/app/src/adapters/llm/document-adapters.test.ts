import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { hostLlmSchema } from "../../kernel/ports/host-cli.js";
import type { LlmCompletion } from "../../kernel/ports/llm.js";
import { claudeCodeLlm } from "./claude-code.js";
import { codexLlm } from "./codex.js";
import { geminiLlm } from "./gemini.js";
import type { RunCli } from "./run-cli.js";

const request = (): LlmCompletion => ({
  model: "fixture",
  messages: [{ role: "user", content: "Write." }],
  documents: [{ id: "research-1", title: "Report", content: "Evidence." }],
  signal: new AbortController().signal,
});
const providers = [
  ["claude", claudeCodeLlm, { type: "result", subtype: "success", result: "Ignored documents." }],
  ["codex", codexLlm, { type: "turn.completed" }],
  ["gemini", geminiLlm, { type: "result", status: "success" }],
] as const;
it.each(providers)(
  "%s refuses an unread report and cleans up on normal or failed spawn",
  async (name, factory, done) => {
    for (const spawnFails of [false, true]) {
      let directory = "";
      const run: RunCli = (_binary, args, _signal, options) => {
        expect(options?.stdin).toContain("Read each ID starting at offset 0");
        expect(args).not.toContain("Evidence.");
        if (name === "claude") {
          const configPath = args[args.indexOf("--mcp-config") + 1] ?? "";
          directory = dirname(configPath);
          expect(args).toContain("--strict-mcp-config");
          expect(args[args.indexOf("--tools") + 1]).toBe("");
          expect(args[args.indexOf("--allowedTools") + 1]).toBe(
            "mcp__slopify_research__read_document",
          );
        } else if (name === "codex") {
          const paths = JSON.parse(
            args
              .find((a) => a.startsWith("mcp_servers.slopify_research.args="))
              ?.split("=")
              .slice(1)
              .join("=") ?? "[]",
          );
          directory = paths[1];
          expect(args).toContain("--ignore-user-config");
          expect(args).toContain('mcp_servers.slopify_research.enabled_tools=["read_document"]');
          expect(args).toContain("mcp_servers.slopify_research.required=true");
        } else {
          const settings = JSON.parse(
            readFileSync(
              join(options?.env?.GEMINI_CLI_HOME ?? "", ".gemini", "settings.json"),
              "utf8",
            ),
          );
          directory = settings.mcpServers.slopify_research.args[1];
          expect(settings.mcp.allowed).toEqual(["slopify_research"]);
          expect(settings.tools.core).toEqual([]);
          expect(settings.mcpServers.slopify_research.includeTools).toEqual(["read_document"]);
          expect(settings.mcpServers.slopify_research.trust).toBe(true);
        }
        if (spawnFails) throw new Error("Failed to spawn fixture");
        return {
          pid: 1,
          stdout: {
            async *[Symbol.asyncIterator]() {
              yield Buffer.from(`${JSON.stringify(done)}\n`);
            },
          },
          stderr: () => "",
          ended: Promise.resolve({ code: 0, error: null }),
          kill: () => {},
        };
      };
      const collect = async () => {
        for await (const _ of factory({ run }).complete(request())) {
          /* drain */
        }
      };
      await expect(collect()).rejects.toThrow(
        spawnFails ? /Failed to spawn/ : /did not read every/,
      );
      expect(directory).not.toBe("");
      expect(existsSync(directory)).toBe(false);
    }
  },
);
it("host documents reject path fields and duplicate IDs, not silently stripping them", () => {
  const { signal: _, ...body } = request();
  expect(hostLlmSchema.safeParse(body).success).toBe(true);
  expect(
    hostLlmSchema.safeParse({
      ...body,
      documents: [{ ...body.documents?.[0], path: "/etc/passwd" }],
    }).success,
  ).toBe(false);
  expect(
    hostLlmSchema.safeParse({ ...body, documents: [body.documents?.[0], body.documents?.[0]] })
      .success,
  ).toBe(false);
});
