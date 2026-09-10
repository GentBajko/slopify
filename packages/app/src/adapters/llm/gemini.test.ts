import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LlmCompletion, LlmEvent } from "../../kernel/ports/llm.js";
import { geminiArgs, geminiLlm, geminiModels } from "./gemini.js";
import type { CliOptions, RunCli } from "./run-cli.js";

const request = (over: Partial<LlmCompletion> = {}): LlmCompletion => ({
  model: "gemini-2.5-flash",
  messages: [{ role: "user", content: "Write a poem." }],
  signal: new AbortController().signal,
  ...over,
});
// Shapes from Gemini CLI 0.16.0 nonInteractiveCli.js and stream-json-formatter.test.js.
const success = [
  { type: "init", session_id: "fixture", model: "gemini-2.5-flash" },
  { type: "message", role: "user", content: "Write a poem." },
  { type: "tool_use", tool_name: "google_web_search", parameters: { query: "private search" } },
  { type: "tool_result", tool_id: "fixture", status: "success", output: "private result" },
  { type: "message", role: "assistant", content: "Once ", delta: true },
  { type: "message", role: "assistant", content: "upon a time.", delta: true },
  { type: "result", status: "success", stats: { input_tokens: 10, output_tokens: 20 } },
];
function fake(events: readonly unknown[], inspect?: (options: CliOptions) => void) {
  let options: CliOptions | undefined;
  let killed = 0;
  const run: RunCli = (_binary, _args, _signal, given) => {
    options = given;
    if (given !== undefined) inspect?.(given);
    return {
      pid: 123,
      stdout: {
        async *[Symbol.asyncIterator]() {
          const bytes = new TextEncoder().encode(
            events.map((event) => JSON.stringify(event)).join("\n"),
          );
          for (let at = 0; at < bytes.length; at += 17) yield bytes.slice(at, at + 17);
        },
      },
      stderr: () => "",
      ended: Promise.resolve({ code: 0, error: null }),
      kill: () => {
        killed += 1;
      },
    };
  };
  return { run, options: () => options, killed: () => killed };
}
async function drain(run: RunCli, req = request()): Promise<LlmEvent[]> {
  const events: LlmEvent[] = [];
  for await (const event of geminiLlm({ run }).complete(req)) events.push(event);
  return events;
}
describe("Gemini CLI", () => {
  it("runs headless without broad tool approvals and treats prompt commands as text", () => {
    const args = geminiArgs(
      request({ messages: [{ role: "user", content: "/help @/etc/passwd `id`\nquoted" }] }),
      "no-mcp",
    );
    expect(args).toContain("stream-json");
    expect(args.at(-2)).toBe("-p");
    expect(args).toContain("none");
    expect(args).not.toContain("--yolo");
    expect(args).not.toContain("--allowed-tools");
    expect(args.at(-1)).toBe(
      "Produce the requested content from this conversation:\n\n/help \\@/etc/passwd `id`\nquoted",
    );
    expect(geminiArgs(request({ webSearch: true }), "no-mcp")).toContain("google_web_search");
  });
  it("streams only assistant prose and counts activity without leaking tool contents", async () => {
    const one = fake(success);
    const events = await drain(one.run);
    expect(events.filter((event) => event.type !== "activity")).toEqual([
      { type: "delta", text: "Once " },
      { type: "delta", text: "upon a time." },
      { type: "done", usage: { inputTokens: 10, outputTokens: 20 }, finishReason: null },
    ]);
    expect(events.filter((event) => event.type === "activity")).toHaveLength(success.length);
    expect(JSON.stringify(events)).not.toContain("private");
    expect(one.killed()).toBe(1);
    expect(existsSync(one.options()?.cwd ?? "")).toBe(false);
  });
  it.each([false, true])(
    "restricts tools and context per call, retaining login environment (search=%s)",
    async (search) => {
      const one = fake(success, (options) => {
        expect(options.env?.HOME).toBe(process.env.HOME);
        expect(options.env?.GEMINI_CLI_NO_RELAUNCH).toBe("true");
        const settings = JSON.parse(
          readFileSync(options.env?.GEMINI_CLI_SYSTEM_SETTINGS_PATH ?? "", "utf8"),
        );
        expect(settings.tools.core).toEqual(search ? ["google_web_search"] : []);
        expect(settings.context.includeDirectories).toEqual([]);
        const workspace = JSON.parse(
          readFileSync(join(options.cwd ?? "", ".gemini", "settings.json"), "utf8"),
        );
        expect(workspace.context).toBeNull();
        const trust = JSON.parse(
          readFileSync(options.env?.GEMINI_CLI_TRUSTED_FOLDERS_PATH ?? "", "utf8"),
        );
        expect(trust).toEqual({ [options.cwd ?? ""]: "TRUST_FOLDER" });
        expect(options.env?.NO_BROWSER).toBe("true");
        expect(settings.context.loadMemoryFromIncludeDirectories).toBe(false);
        expect(settings.tools.enableHooks).toBe(false);
        expect(settings.experimental.codebaseInvestigatorSettings.enabled).toBe(false);
        expect(settings.tools.discoveryCommand).toBe("");
        expect(settings.mcp.allowed).toHaveLength(1);
        expect(readFileSync(options.env?.GEMINI_SYSTEM_MD ?? "", "utf8")).toContain(
          "writing and research",
        );
      });
      await drain(one.run, request({ webSearch: search }));
    },
  );
  it("fails errors, cleans temporary settings, and redacts secret-looking text", async () => {
    const one = fake([
      { type: "result", status: "error", error: { message: "invalid sk-abcdefghijklmnopqrst" } },
    ]);
    await expect(drain(one.run)).rejects.toThrow("invalid [redacted]");
    expect(one.killed()).toBe(1);
    expect(existsSync(one.options()?.cwd ?? "")).toBe(false);
  });
  it("rejects broken events and leaves no workspace when spawn fails", async () => {
    await expect(drain(fake([{ type: "message", role: "assistant" }]).run)).rejects.toThrow(
      "could not read",
    );
    let directory = "";
    const run: RunCli = (_binary, _args, _signal, options) => {
      directory = options?.cwd ?? "";
      throw new Error("missing executable");
    };
    await expect(drain(run)).rejects.toThrow("missing executable");
    expect(existsSync(directory)).toBe(false);
  });
  it("does not start after abort and exposes the supported model list", async () => {
    const one = fake(success);
    await expect(
      drain(one.run, request({ signal: AbortSignal.abort(new Error("paused")) })),
    ).rejects.toThrow("paused");
    expect(one.options()).toBeUndefined();
    expect(await geminiLlm({ run: one.run }).models()).toBe(geminiModels);
  });
});

it("stops Gemini's non-newline OAuth prompt without exposing its URL or retrying login", async () => {
  let killed = false;
  const run: RunCli = () => ({
    pid: 123,
    stdout: {
      async *[Symbol.asyncIterator]() {
        yield new TextEncoder().encode("Enter the author");
        yield new TextEncoder().encode("ization code: ");
        throw new Error("the adapter must stop before reading more");
      },
    },
    stderr: () => "https://accounts.google.com/oauth?secret=private",
    ended: Promise.resolve({ code: 0, error: null }),
    kill: () => {
      killed = true;
    },
  });
  await expect(drain(run)).rejects.toMatchObject({
    fault: { kind: "missing_key" },
    message: expect.stringContaining("Gemini CLI needs sign-in"),
  });
  expect(killed).toBe(true);
});

it("makes Gemini's license denial terminal with actionable guidance", async () => {
  const one = fake([
    {
      type: "result",
      status: "error",
      error: {
        message:
          "You do not have a valid license of this product. Please contact your administrator to request a license. (#3501)",
      },
    },
  ]);
  await expect(drain(one.run)).rejects.toMatchObject({
    fault: { kind: "unsupported" },
    message:
      "Gemini CLI access was denied by Google's license check (#3501). Update Gemini CLI and sign in again. For a managed account, contact your administrator to request a license.",
  });
  expect(one.killed()).toBe(1);
  expect(existsSync(one.options()?.cwd ?? "")).toBe(false);
});
