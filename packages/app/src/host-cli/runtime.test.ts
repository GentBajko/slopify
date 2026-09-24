import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { CliOptions, RunCli } from "../adapters/llm/run-cli.js";
import { createHostRuntime } from "./runtime.js";

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

it("runs Claude on the host in a disposable private directory", async () => {
  const seen: { binary: string; args: readonly string[]; options: CliOptions | undefined }[] = [];
  const run: RunCli = (binary, args, _signal, options) => {
    seen.push({ binary, args, options });
    return {
      pid: 1,
      stdout: {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('{"type":"result","subtype":"success"}\n');
        },
      },
      stderr: () => "",
      ended: Promise.resolve({ code: 0, error: null }),
      kill: () => {},
    };
  };
  const ports = createHostRuntime({
    run,
    probe: async () => ({ ran: true, stdout: "2.1.263" }),
    env: { HOME: "/host/home" },
    now: () => 0,
    resolve: async () => "/host/claude",
    login: async () => "signed-in",
  });
  for await (const _ of ports.llm("claude-code").complete({
    model: "sonnet",
    messages: [{ role: "user", content: "hello" }],
    signal: AbortSignal.timeout(1000),
  })) {
  }
  expect(seen[0]?.binary).toBe("/host/claude");
  expect(seen[0]?.options?.env?.HOME).toBe("/host/home");
  expect(seen[0]?.options?.stdin).toBe("hello");
  expect(seen[0]?.args).toContain("--safe-mode");
  expect(seen[0]?.options?.cwd).not.toBe(process.cwd());
  expect(existsSync(seen[0]?.options?.cwd ?? "")).toBe(false);
});
it("blocks signed-out generation without spawning", async () => {
  let calls = 0;
  const ports = createHostRuntime({
    run: () => {
      calls++;
      throw new Error();
    },
    probe: async () => ({ ran: true, stdout: "0.149.1" }),
    env: {},
    now: () => 0,
    resolve: async () => "/host/codex",
    login: async () => "signed-out",
  });
  await expect(
    ports.image.generate({
      model: "codex-imagegen",
      prompt: "test",
      aspect: "16:9",
      signal: AbortSignal.timeout(1000),
    }),
  ).rejects.toMatchObject({ fault: { kind: "missing_key" } });
  expect(calls).toBe(0);
});
it("returns image bytes, never the host output path", async () => {
  const home = mkdtempSync(join(tmpdir(), "slopify-host-image-test-"));
  homes.push(home);
  const threadId = randomUUID();
  const imageDir = join(home, ".codex", "generated_images", threadId);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  let directory = "";
  const run: RunCli = (_binary, _args, _signal, options) => {
    directory = options?.cwd ?? "";
    mkdirSync(imageDir, { recursive: true });
    writeFileSync(join(imageDir, "exec-test.png"), bytes);
    return {
      pid: 1,
      stdout: {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(
            `${JSON.stringify({ type: "thread.started", thread_id: threadId })}\n{"type":"turn.completed"}\n`,
          );
        },
      },
      stderr: () => "",
      ended: Promise.resolve({ code: 0, error: null }),
      kill: () => {},
    };
  };
  const ports = createHostRuntime({
    run,
    probe: async () => ({ ran: true, stdout: "0.149.1" }),
    env: { HOME: home },
    now: () => 0,
    resolve: async () => "/host/codex",
    login: async () => "signed-in",
  });
  expect(
    await ports.image.generate({
      model: "codex-imagegen",
      prompt: "test",
      aspect: "16:9",
      signal: AbortSignal.timeout(1000),
    }),
  ).toEqual({ bytes, mime: "image/jpeg" });
  expect(existsSync(directory)).toBe(false);
  expect(existsSync(join(imageDir, "exec-test.png"))).toBe(true);
});
