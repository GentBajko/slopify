import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LlmCompletion, LlmEvent } from "../../kernel/ports/llm.js";
import { antigravityArgs, antigravityLlm } from "./antigravity.js";
import type { CliOptions, RunCli } from "./run-cli.js";

const request = (over: Partial<LlmCompletion> = {}): LlmCompletion => ({
  model: "gemini-3.8-flash-high",
  messages: [{ role: "user", content: "Write a poem." }],
  signal: new AbortController().signal,
  ...over,
});
// Shapes from antigravity.google/docs/cli/headless.md (stream-json output).
const result = (over: Record<string, unknown> = {}) => ({
  event: "result",
  result: {
    conversation_id: "fixture",
    status: "SUCCESS",
    response: "Once upon a time.",
    duration_seconds: 2,
    num_turns: 1,
    usage: {
      input_tokens: 10,
      output_tokens: 20,
      thinking_tokens: 3,
      cache_read_tokens: 0,
      total_tokens: 33,
    },
    ...over,
  },
});
const success = [
  {
    event: "init",
    init: { cwd: "/tmp/x", tools: ["read_file"], permission_mode: "request-review" },
  },
  {
    event: "step_update",
    step_update: {
      conversation_id: "fixture",
      step_index: 0,
      state: "DONE",
      step_type: "user_input",
    },
  },
  {
    event: "step_update",
    step_update: {
      conversation_id: "fixture",
      step_index: 1,
      state: "ACTIVE",
      step_type: "tool",
      tool_name: "read_file",
      tool_info: { path: "private path" },
    },
  },
  {
    event: "step_update",
    step_update: {
      conversation_id: "fixture",
      step_index: 2,
      state: "ACTIVE",
      step_type: "agent_response",
      text_delta: "Once upon a time.",
    },
  },
  result(),
];
function fake(
  events: readonly unknown[],
  over: {
    stderr?: string;
    code?: number;
    inspect?: (options: CliOptions, args: readonly string[]) => void;
  } = {},
) {
  let options: CliOptions | undefined;
  let args: readonly string[] = [];
  let binary = "";
  let killed = 0;
  const run: RunCli = (given, givenArgs, _signal, givenOptions) => {
    binary = given;
    args = givenArgs;
    options = givenOptions;
    if (givenOptions !== undefined) over.inspect?.(givenOptions, givenArgs);
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
      stderr: () => over.stderr ?? "",
      ended: Promise.resolve({ code: over.code ?? 0, error: null }),
      kill: () => {
        killed += 1;
      },
    };
  };
  return {
    run,
    options: () => options,
    args: () => args,
    binary: () => binary,
    killed: () => killed,
  };
}
async function drain(run: RunCli, req = request(), binary?: string): Promise<LlmEvent[]> {
  const events: LlmEvent[] = [];
  for await (const event of antigravityLlm({ run, binary }).complete(req)) events.push(event);
  return events;
}

describe("Antigravity CLI", () => {
  it("runs agy headless over stream-json with no broad approvals and no -p", () => {
    const args = antigravityArgs(request());
    expect(args).toEqual([
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--disable-slash-commands",
      "--model",
      "gemini-3.8-flash-high",
    ]);
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("-p");
    expect(antigravityArgs(request({ model: "" }))).not.toContain("--model");
    expect(antigravityArgs(request({ thinkingConfig: { level: "low" } }))).toEqual(
      expect.arrayContaining(["--effort", "low"]),
    );
    expect(antigravityArgs(request({ thinkingConfig: { level: "minimal" } }))).toEqual(
      expect.arrayContaining(["--effort", "low"]),
    );
  });

  it("sends the prompt as one stdin user event that can never be read as a slash command", async () => {
    const one = fake(success);
    await drain(one.run, request({ messages: [{ role: "user", content: "/model @/etc/passwd" }] }));
    expect(one.binary()).toBe("agy");
    const stdin = one.options()?.stdin ?? "";
    expect(stdin.endsWith("\n")).toBe(true);
    expect(stdin.trim().split("\n")).toHaveLength(1);
    const line = JSON.parse(stdin) as { event: string; message: { content: string } };
    expect(line.event).toBe("user");
    expect(line.message.content.startsWith("/")).toBe(false);
    expect(line.message.content).toContain("/model @/etc/passwd");
  });

  it("inlines research documents so no tool permission is needed to read them", async () => {
    const one = fake(success);
    await drain(
      one.run,
      request({ documents: [{ id: "doc-1", title: "Notes", content: "The secret ingredient." }] }),
    );
    expect(JSON.parse(one.options()?.stdin ?? "").message.content).toContain(
      "The secret ingredient.",
    );
  });

  it("returns the final response once, with usage, and never leaks tool details", async () => {
    const one = fake(success);
    const events = await drain(one.run);
    expect(events.filter((event) => event.type !== "activity")).toEqual([
      { type: "delta", text: "Once upon a time." },
      { type: "done", usage: { inputTokens: 10, outputTokens: 20 }, finishReason: null },
    ]);
    expect(events.filter((event) => event.type === "activity")).toHaveLength(success.length);
    expect(JSON.stringify(events)).not.toContain("private");
  });

  it("runs in an empty private folder it removes afterwards, keeping the login environment", async () => {
    let seen: string[] = [];
    const one = fake(success, {
      inspect: (options) => {
        seen = readdirSync(options.cwd ?? "");
        expect(options.env?.HOME).toBe(process.env.HOME);
        expect(options.env?.AGY_CLI_DISABLE_AUTO_UPDATE).toBe("true");
      },
    });
    await drain(one.run);
    expect(seen).toEqual(["AGENTS.md"]);
    expect(existsSync(one.options()?.cwd ?? "")).toBe(false);
    expect(one.killed()).toBe(1);
  });

  it("searches the web with search_web only, never opening pages it may not read", async () => {
    let rules = "";
    const one = fake(success, {
      inspect: (options) => {
        rules = readFileSync(join(options.cwd ?? "", "AGENTS.md"), "utf8");
      },
    });
    expect(antigravityLlm({ run: one.run }).capabilities.webSearch).toBe(true);
    await drain(one.run, request({ webSearch: true }));
    expect(rules).toContain("use only the search_web tool");
    expect(rules).toContain("Never open web pages");
    await drain(one.run, request());
    expect(rules).toContain("Do not search the web");
  });

  it("copies pictures into its folder and refuses an answer that skipped one", async () => {
    const source = mkdtempSync(join(tmpdir(), "slopify-agy-pictures-"));
    try {
      writeFileSync(join(source, "a.png"), "png");
      writeFileSync(join(source, "b.jpg"), "jpg");
      const images = [
        { path: join(source, "a.png"), name: "Scene 1" },
        { path: join(source, "b.jpg"), name: "Scene 2" },
      ];
      const viewed = (file: string) => ({
        event: "step_update",
        step_update: {
          step_index: 1,
          state: "DONE",
          step_type: "tool",
          tool_name: "view_file",
          tool_info: { name: "view_file", parameters: { AbsolutePath: `/somewhere/${file}` } },
        },
      });
      let files: string[] = [];
      let prompt = "";
      const both = fake([viewed("image-1.png"), viewed("image-2.jpg"), result()], {
        inspect: (options) => {
          files = readdirSync(options.cwd ?? "").toSorted();
          prompt = JSON.parse(options.stdin ?? "").message.content;
        },
      });
      const events = await drain(both.run, request({ images }));
      expect(files).toEqual(["AGENTS.md", "image-1.png", "image-2.jpg"]);
      expect(prompt).toContain("image-1.png: Scene 1");
      expect(events).toContainEqual({ type: "delta", text: "Once upon a time." });
      await expect(
        drain(fake([viewed("image-1.png"), result()]).run, request({ images })),
      ).rejects.toThrow("without opening every picture");
    } finally {
      rmSync(source, { recursive: true, force: true });
    }
  });

  it("treats an empty answer as a failure and explains a denied tool", async () => {
    // agy 1.3.6 ends a headless turn whose tool was refused with SUCCESS, no text and exit 0.
    const denied = fake([result({ response: "" })], {
      stderr:
        'jetski: no output produced — a tool required the "read_url" permission that headless mode cannot prompt for, so it was auto-denied.',
    });
    await expect(drain(denied.run)).rejects.toMatchObject({
      fault: { kind: "other" },
      message: expect.stringContaining("tried to use a tool Slopify does not allow"),
    });
    await expect(drain(fake([result({ response: "" })]).run)).rejects.toThrow(
      "answered with no text",
    );
  });

  it("reports a failed run with the CLI's words, redacted", async () => {
    const one = fake([
      result({ status: "ERROR", response: "", error: "boom sk-abcdefghijklmnopqrst" }),
    ]);
    await expect(drain(one.run)).rejects.toThrow("boom [redacted]");
    expect(existsSync(one.options()?.cwd ?? "")).toBe(false);
  });

  it("tells a signed-out user exactly how to sign in", async () => {
    // What agy 1.3.6 prints when it has no sign-in: an ERROR result and a stderr line.
    const one = fake(
      [result({ status: "ERROR", response: "", error: "authentication failed or timed out" })],
      {
        stderr:
          "Error: authentication required. Run 'agy' to log in, then retry.\nerror: authentication failed or timed out\n",
        code: 1,
      },
    );
    const message =
      'The Antigravity CLI is not signed in, or its sign-in has expired. Open a terminal on the computer running it, run "agy" and sign in with your Google account, then use Try again.';
    await expect(drain(one.run)).rejects.toMatchObject({ fault: { kind: "missing_key" }, message });
    const bare = fake([], { stderr: "Error: authentication required", code: 1 });
    await expect(drain(bare.run)).rejects.toMatchObject({
      fault: { kind: "missing_key" },
      message,
    });
  });

  it("turns an unknown model into a pick-another-model instruction", async () => {
    const one = fake([
      result({
        status: "ERROR",
        response: "",
        error: "invalid model selection gemini-2.5-pro. Available models: gemini-3.8-flash-high",
      }),
    ]);
    await expect(drain(one.run, request({ model: "gemini-2.5-pro" }))).rejects.toMatchObject({
      fault: { kind: "unsupported" },
      message: expect.stringContaining(
        'The Antigravity CLI does not offer the model "gemini-2.5-pro"',
      ),
    });
  });

  it("retries a short capacity limit soon and waits for a used-up allowance", async () => {
    // Captured from agy 1.3.6 when three calls ran at once.
    const capacity =
      "API error (attempt 1): RESOURCE_EXHAUSTED (code 429): You have exhausted your capacity on this model. Resets in 0s.";
    const fail = (error: string) => fake([result({ status: "ERROR", response: "partial", error })]);
    const port = (error: string) =>
      antigravityLlm({ run: fail(error).run, now: () => Date.parse("2026-10-15T12:00:00Z") });
    const take = async (error: string) => {
      for await (const _ of port(error).complete(request())) {
        /* drain */
      }
    };
    await expect(take(capacity)).rejects.toMatchObject({
      fault: { kind: "rate_limit", retryAfterMs: 1000 },
    });
    await expect(take(capacity)).rejects.not.toMatchObject({ fault: { planLimit: {} } });
    await expect(
      take(
        "RESOURCE_EXHAUSTED (code 429): You have exhausted your capacity on this model. Resets in 3h20m5s.",
      ),
    ).rejects.toMatchObject({
      fault: {
        kind: "rate_limit",
        planLimit: { account: "gemini", resetsAt: "2026-10-15T15:20:05.000Z" },
      },
    });
    await expect(take("You have exhausted your weekly quota.")).rejects.toMatchObject({
      fault: { kind: "rate_limit", planLimit: { account: "gemini", resetsAt: null } },
    });
  });

  it("stops at a saved path that still points at the discontinued Gemini CLI", async () => {
    const one = fake(success);
    await expect(drain(one.run, request(), "/usr/local/bin/gemini")).rejects.toMatchObject({
      fault: { kind: "unsupported" },
      message: expect.stringContaining("Settings → Providers"),
    });
    expect(one.options()).toBeUndefined();
    // The registry reads the saved path on every run.
    let saved = "agy";
    const port = antigravityLlm({ run: one.run, binary: () => saved });
    saved = "C:\\Tools\\gemini.cmd";
    const events: LlmEvent[] = [];
    await expect(
      (async () => {
        for await (const event of port.complete(request())) events.push(event);
      })(),
    ).rejects.toThrow("still points at the Gemini CLI");
  });

  it("explains a run that ended without an answer", async () => {
    const one = fake([success[0]], { stderr: "something odd", code: 1 });
    await expect(drain(one.run)).rejects.toThrow("something odd");
  });

  it("does not start after abort and exposes the injected model list", async () => {
    const one = fake(success);
    await expect(
      drain(one.run, request({ signal: AbortSignal.abort(new Error("paused")) })),
    ).rejects.toThrow("paused");
    expect(one.options()).toBeUndefined();
    const models = [{ id: "installed", name: "Installed" }];
    expect(await antigravityLlm({ run: one.run, readModels: async () => models }).models()).toBe(
      models,
    );
  });
});
