import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LlmCompletion, LlmEvent } from "../../kernel/ports/llm.js";
import { claudeCodeArgs, claudeCodeLlm } from "./claude-code.js";
import { codexArgs, codexLlm } from "./codex.js";
import { geminiLlm } from "./gemini.js";
import { imageWorkspace } from "./image-workspace.js";
import { openRouterLlm } from "./openrouter.js";
import type { CliRun, RunCli } from "./run-cli.js";

// How a review's pictures reach a CLI model. The streams below are written for these tests in
// the shape of the recorded fixtures beside this file (an assistant turn, then the result);
// no CLI is run.

const picture = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "slopify-review-"));
  const path = join(directory, "image-003.png");
  writeFileSync(path, Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
  return path;
};
const request = (path: string): LlmCompletion => ({
  model: "m",
  messages: [{ role: "user", content: "Review it." }],
  images: [{ path, name: "the image to review" }],
  signal: new AbortController().signal,
});

function streaming(lines: readonly unknown[]): {
  readonly run: RunCli;
  readonly seen: { args: readonly string[]; cwd: string | undefined; stdin: string }[];
} {
  const seen: { args: readonly string[]; cwd: string | undefined; stdin: string }[] = [];
  return {
    seen,
    run: (_binary, args, _signal, options): CliRun => {
      const at = { args, cwd: options?.cwd, stdin: "" };
      seen.push(at);
      const cwd = options?.cwd;
      const bytes = new TextEncoder().encode(
        `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
      );
      return {
        pid: 1,
        stdout: {
          async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
            // The copied pictures sit in the working directory while the CLI runs.
            if (cwd !== undefined) at.stdin = existsSync(join(cwd, "image-1.png")) ? "present" : "";
            yield bytes;
          },
        },
        stderr: () => "",
        ended: Promise.resolve({ code: 0, error: null }),
        kill: () => undefined,
        ...(options?.stdin === undefined ? {} : { inputWritten: Promise.resolve() }),
      } as CliRun;
    },
  };
}

async function drain(events: AsyncIterable<LlmEvent>): Promise<string> {
  let text = "";
  for await (const event of events) if (event.type === "delta") text += event.text;
  return text;
}

const result = {
  type: "result",
  subtype: "success",
  is_error: false,
  result: '{"verdict":"pass","reasons":[]}',
  stop_reason: "end_turn",
};

describe("Claude Code with pictures", () => {
  it("allows only the Read tool, confined to a private folder holding the copies", () => {
    const workspace = imageWorkspace([{ path: picture(), name: "the image" }]);
    if (workspace === undefined) throw new Error("no workspace");
    try {
      const args = claudeCodeArgs(request("unused"), undefined, workspace);
      expect(args).toContain("--restricted");
      expect(args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2)).toEqual([
        "--tools",
        "Read",
      ]);
      expect(
        args.slice(args.indexOf("--allowedTools"), args.indexOf("--allowedTools") + 2),
      ).toEqual(["--allowedTools", "Read"]);
      expect(args).toContain("dontAsk");
      expect(workspace.files.map((one) => one.file)).toEqual(["image-1.png"]);
    } finally {
      workspace.remove();
    }
  });

  it("uses the answer only once every picture was read, and removes the copies", async () => {
    const read = {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Let me look." },
          { type: "tool_use", name: "Read", input: { file_path: "/tmp/x/image-1.png" } },
        ],
      },
    };
    const fake = streaming([read, result]);
    const text = await drain(claudeCodeLlm({ run: fake.run }).complete(request(picture())));
    expect(text).toBe('{"verdict":"pass","reasons":[]}');
    expect(fake.seen[0]?.stdin).toBe("present");
    expect(existsSync(fake.seen[0]?.cwd ?? "/nonexistent")).toBe(false);

    const unread = streaming([result]);
    await expect(
      drain(claudeCodeLlm({ run: unread.run }).complete(request(picture()))),
    ).rejects.toMatchObject({ fault: { kind: "unavailable" } });
  });
});

describe("Codex with pictures", () => {
  it("attaches each picture with its own --image flag before the prompt marker", () => {
    const workspace = imageWorkspace([
      { path: picture(), name: "a" },
      { path: picture(), name: "b" },
    ]);
    if (workspace === undefined) throw new Error("no workspace");
    try {
      const args = codexArgs(request("unused"), "/tmp/work", undefined, workspace);
      const flags = args.flatMap((arg, index) => (arg === "--image" ? [args[index + 1]] : []));
      expect(flags).toEqual(workspace.files.map((one) => one.path));
      expect(args.indexOf("--image")).toBeLessThan(args.indexOf("--"));
      expect(args).toContain("view_image");
    } finally {
      workspace.remove();
    }
  });

  it("says it can see pictures", () => {
    expect(codexLlm({ run: streaming([]).run }).capabilities.images).toBe(true);
    expect(claudeCodeLlm({ run: streaming([]).run }).capabilities.images).toBe(true);
  });
});

describe("providers that can't be shown pictures", () => {
  it("refuses rather than answering blind", async () => {
    await expect(
      drain(geminiLlm({ run: streaming([]).run }).complete(request(picture()))),
    ).rejects.toMatchObject({ fault: { kind: "unsupported" } });
    await expect(
      drain(
        openRouterLlm({ fetch: () => Promise.reject(new Error("no")), key: () => "k" }).complete(
          request(picture()),
        ),
      ),
    ).rejects.toMatchObject({ fault: { kind: "unsupported" } });
  });

  it("refuses files that aren't pictures", () => {
    expect(() => imageWorkspace([{ path: "/tmp/notes.txt", name: "x" }])).toThrow(
      /PNG, JPEG or WebP/,
    );
  });
});
