import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import type { LlmCompletion, LlmEvent, Message } from "../../kernel/ports/llm.js";
import { isProviderError } from "../../kernel/ports/model.js";
import { claudeCodeArgs, claudeCodeLlm, claudeCodeModels } from "./claude-code.js";
import type { CliEnded, CliRun } from "./run-cli.js";
import { nodeRunCli } from "./run-cli.js";

// Fixture provenance: `fixtures/claude-code-*.jsonl` come from real `claude` 2.1.258 runs on
// this machine (spike 1), captured with claude -p "..." --output-format stream-json --verbose
// --model haiku [--tools ...] and abridged only where the capture carried this machine rather
// than the CLI: the init event's tool, MCP, plugin, skill and command lists, and the opaque
// signature on a thinking block. `claude-code-auth-failure.jsonl` and
// `claude-code-rate-limit.jsonl` are the recorded bad-model result event with its status and
// text changed - the shape is real, those two statuses were not provoked against a live
// account.

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

interface Recorded {
  readonly seen: { binary: string; args: readonly string[] }[];
  readonly killed: () => number;
}

// The recorded bytes handed back a few at a time, so the adapter meets the chunk
// boundaries a pipe really produces.
function replaying(
  text: string,
  ended: CliEnded = { code: 0, error: null },
  stderr = "",
): { readonly run: (b: string, a: readonly string[], s: AbortSignal) => CliRun } & Recorded {
  const seen: { binary: string; args: readonly string[] }[] = [];
  let killed = 0;
  return {
    seen,
    killed: (): number => killed,
    run: (binary, args): CliRun => {
      seen.push({ binary, args });
      const bytes = new TextEncoder().encode(text);
      return {
        pid: 4242,
        stdout: {
          async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
            for (let at = 0; at < bytes.length; at += 17) {
              yield bytes.slice(at, at + 17);
            }
          },
        },
        stderr: (): string => stderr,
        ended: Promise.resolve(ended),
        kill: (): void => {
          killed += 1;
        },
      };
    },
  };
}

const messages: readonly Message[] = [{ role: "user", content: "What is SSE?" }];

function request(over: Partial<LlmCompletion> = {}): LlmCompletion {
  return { model: "haiku", messages, signal: new AbortController().signal, ...over };
}

async function drain(text: string, ended?: CliEnded, stderr?: string): Promise<LlmEvent[]> {
  const fake = replaying(text, ended, stderr);
  const out: LlmEvent[] = [];
  for await (const event of claudeCodeLlm({ run: fake.run }).complete(request())) {
    out.push(event);
  }
  return out;
}

describe("claudeCodeArgs", () => {
  it("asks for the streamed JSON the adapter reads, with tools and MCP shut off", () => {
    expect(claudeCodeArgs(request())).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--strict-mcp-config",
      "--tools",
      "",
      "--model",
      "haiku",
      "--",
      "What is SSE?",
    ]);
  });

  it("opens only the web search when the caller asked to be grounded", () => {
    const args = claudeCodeArgs(request({ webSearch: true }));
    expect(args).toContain("--allowedTools");
    expect(args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2)).toEqual([
      "--tools",
      "WebSearch",
    ]);
  });

  it("leaves the model to the CLI's own default when none was chosen", () => {
    expect(claudeCodeArgs(request({ model: "" }))).not.toContain("--model");
  });

  it("puts the prompt after a separator, as one argument, whatever is in it", () => {
    const prompt = '-not a flag `id` $(rm -rf /) "quoted"\nsecond line';
    const args = claudeCodeArgs(request({ messages: [{ role: "user", content: prompt }] }));
    expect(args.at(-2)).toBe("--");
    expect(args.at(-1)).toBe(prompt);
  });
});

describe("claudeCodeLlm.complete", () => {
  it("replays a recorded run into the answer, its usage and its stop reason", async () => {
    const events = await drain(fixture("claude-code-success.jsonl"));
    expect(events).toEqual([
      {
        type: "delta",
        text:
          "Server-Sent Events (SSE) is a web technology that lets a server push real-time " +
          "updates to a client over a persistent HTTP connection. The client establishes " +
          "one connection and listens for events the server sends, rather than repeatedly " +
          "polling for new data.",
      },
      { type: "done", usage: { inputTokens: 10, outputTokens: 187 }, finishReason: "end_turn" },
    ]);
  });

  it("ignores the hook, init, thinking-token and rate-limit events around the answer", async () => {
    // Nine recorded lines, two of which say anything the port has a word for.
    expect(fixture("claude-code-success.jsonl").trim().split("\n")).toHaveLength(9);
    expect(await drain(fixture("claude-code-success.jsonl"))).toHaveLength(2);
  });

  it("yields the prose of a grounded run and none of its tool traffic", async () => {
    const events = await drain(fixture("claude-code-web-search.jsonl"));
    const deltas = events.filter((event) => event.type === "delta");
    expect(deltas).toHaveLength(1);
    const text = deltas[0]?.type === "delta" ? deltas[0].text : "";
    expect(text).toContain("Node.js 24 is the current Active LTS version");
    // The grounded answer ends in the sources it used.
    expect(text).toContain("\n\nSources:\n- ");
    expect(text).not.toContain("tool_use");
    expect(events.at(-1)).toEqual({
      type: "done",
      usage: { inputTokens: 11745, outputTokens: 775 },
      finishReason: "end_turn",
    });
  });

  it("fails a run the CLI marked is_error even though its subtype still reads success", async () => {
    // The trap in the recorded output: `subtype` is "success" on a 404 for the model.
    const error: unknown = await drain(fixture("claude-code-bad-model.jsonl")).catch(
      (thrown: unknown) => thrown,
    );
    expect(isProviderError(error) && error.fault.kind).toBe("other");
    expect(String(error)).toContain("There's an issue with the selected model");
  });

  it("names a 401 an auth failure and a 429 a rate limit", async () => {
    const auth: unknown = await drain(fixture("claude-code-auth-failure.jsonl")).catch(
      (thrown: unknown) => thrown,
    );
    expect(isProviderError(auth) && auth.fault.kind).toBe("auth");
    expect(String(auth)).toContain("Invalid API key");

    const limited: unknown = await drain(fixture("claude-code-rate-limit.jsonl")).catch(
      (thrown: unknown) => thrown,
    );
    expect(isProviderError(limited) && limited.fault.kind).toBe("rate_limit");
    expect(String(limited)).toContain("usage limit reached");
  });

  it("fails a stream cut off part-way rather than storing half an answer", async () => {
    const error: unknown = await drain(fixture("claude-code-truncated.jsonl")).catch(
      (thrown: unknown) => thrown,
    );
    expect(isProviderError(error) && error.fault.kind).toBe("other");
    expect(String(error)).toContain("could not read");
  });

  it("shows what the CLI wrote to stderr when it exits with no result at all", async () => {
    const error: unknown = await drain(
      "",
      { code: 1, error: null },
      '[claude-code:unrecognized_model] {"model":"definitely-not-a-model"}',
    ).catch((thrown: unknown) => thrown);
    expect(String(error)).toContain("the claude CLI exited 1 without answering");
    expect(String(error)).toContain("unrecognized_model");
  });

  it("says so plainly when the binary is not there at all", async () => {
    const error: unknown = await drain("", {
      code: null,
      error: new Error("spawn claude ENOENT"),
    }).catch((thrown: unknown) => thrown);
    expect(String(error)).toContain("could not be started (spawn claude ENOENT)");
  });

  it("kills the child whether the run answered, failed or was walked away from", async () => {
    const ok = replaying(fixture("claude-code-success.jsonl"));
    for await (const _event of claudeCodeLlm({ run: ok.run }).complete(request())) {
      // drained
    }
    expect(ok.killed()).toBe(1);

    const bad = replaying(fixture("claude-code-bad-model.jsonl"));
    await expect(
      (async () => {
        for await (const _event of claudeCodeLlm({ run: bad.run }).complete(request())) {
          // drained
        }
      })(),
    ).rejects.toThrow();
    expect(bad.killed()).toBe(1);

    const left = replaying(fixture("claude-code-success.jsonl"));
    for await (const _event of claudeCodeLlm({ run: left.run }).complete(request())) {
      break;
    }
    expect(left.killed()).toBe(1);
  });

  it("throws the cancel's own reason when the stage was aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("the user cancelled the project");
    const fake = replaying(fixture("claude-code-success.jsonl"));
    const stream = claudeCodeLlm({ run: fake.run }).complete(
      request({ signal: controller.signal }),
    );
    controller.abort(reason);
    await expect(
      (async () => {
        for await (const _event of stream) {
          // drained
        }
      })(),
    ).rejects.toBe(reason);
  });

  it("spawns the binary it was given rather than whatever is on PATH", async () => {
    const fake = replaying(fixture("claude-code-success.jsonl"));
    for await (const _event of claudeCodeLlm({
      run: fake.run,
      binary: "/opt/claude/bin/claude",
    }).complete(request())) {
      // drained
    }
    expect(fake.seen[0]?.binary).toBe("/opt/claude/bin/claude");
  });
});

describe("claudeCodeLlm against a real child process", () => {
  it("kills the process the stage's cancel aborted, leaving nothing behind", async () => {
    // A stand-in CLI that writes one assistant event and then never finishes its turn,
    // which is what a long agent run looks like from here.
    const dir = mkdtempSync(join(tmpdir(), "slopify-claude-"));
    const path = join(dir, "stubborn.mjs");
    writeFileSync(
      path,
      `process.stdout.write(JSON.stringify({type:"assistant",message:{content:[{type:"text",text:"working"}]}}) + "\\n");
setInterval(() => {}, 1000);\n`,
      { mode: 0o700 },
    );

    const controller = new AbortController();
    let started: CliRun | undefined;
    const port = claudeCodeLlm({
      binary: process.execPath,
      run: (binary, args, signal): CliRun => {
        started = nodeRunCli(binary, [path, ...args], signal);
        return started;
      },
    });

    const seen: LlmEvent[] = [];
    const reason = new Error("the user cancelled the project");
    await expect(
      (async () => {
        for await (const event of port.complete(request({ signal: controller.signal }))) {
          seen.push(event);
          controller.abort(reason);
        }
      })(),
    ).rejects.toBe(reason);
    expect(seen).toEqual([{ type: "delta", text: "working" }]);

    const pid = started?.pid;
    expect(pid).toBeDefined();
    await started?.ended;
    for (let tries = 0; tries < 50; tries += 1) {
      try {
        process.kill(pid ?? 0, 0);
      } catch {
        return;
      }
      await delay(20);
    }
    throw new Error(`the child ${String(pid)} survived the cancel`);
  });
});

describe("claudeCodeLlm surface", () => {
  it("declares what the CLI can do and the aliases it takes", async () => {
    const port = claudeCodeLlm({ run: replaying("").run });
    expect(port.id).toBe("claude-code");
    expect(port.capabilities).toEqual({ streams: true, reportsUsage: true, webSearch: true });
    expect(await port.models()).toBe(claudeCodeModels);
    expect(claudeCodeModels.map((model) => model.id)).toEqual(["fable", "opus", "sonnet", "haiku"]);
  });
});
