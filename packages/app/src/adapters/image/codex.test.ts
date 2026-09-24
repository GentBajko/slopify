import { randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import type { CliRun, RunCli } from "../llm/run-cli.js";
import { codexImage, codexImageArgs } from "./codex.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
  "base64",
);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function generatedRun(
  change: (path: string, directory: string) => void = (path) => writeFileSync(path, png),
  id?: string,
) {
  const home = mkdtempSync(join(tmpdir(), "slopify-codex-output-test-"));
  homes.push(home);
  const threadId = id ?? randomUUID();
  const directory = join(home, "generated_images", threadId);
  const path = join(directory, `exec-${randomUUID()}.png`);
  const fake = fakeRun(
    () => {
      if (id === undefined) {
        mkdirSync(directory, { recursive: true });
        change(path, directory);
      }
    },
    `${[
      JSON.stringify({ type: "thread.started", thread_id: threadId }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "item_0", type: "agent_message", text: "Image generated." },
      }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }),
    ].join("\n")}\n`,
  );
  return { ...fake, home, path, directory, env: { CODEX_HOME: home } };
}
it.each(["turn.failed", "error"])(
  "preserves actionable %s details and classifies missing login",
  async (type) => {
    for (const message of [
      "Not logged in. Run codex login",
      "Image tool unavailable for this account",
    ]) {
      const event = type === "error" ? { type, message } : { type, error: { message } };
      const fake = fakeRun(() => {}, `${JSON.stringify(event)}\n`);
      const result = codexImage({ run: fake.run }).generate(request());
      if (message.startsWith("Not"))
        await expect(result).rejects.toMatchObject({ fault: { kind: "missing_key" } });
      else await expect(result).rejects.toThrow(message);
    }
  },
);
const request = (signal = new AbortController().signal) => ({
  model: "codex-imagegen",
  prompt: "A moonlit castle",
  aspect: "16:9" as const,
  signal,
});

function fakeRun(write: (directory: string) => void, events = '{"type":"turn.completed"}\n') {
  const calls: {
    binary: string;
    args: readonly string[];
    directory: string;
    env: NodeJS.ProcessEnv | undefined;
  }[] = [];
  let kills = 0;
  const run: RunCli = (binary, args, _signal, options): CliRun => {
    const directory = options?.cwd ?? "";
    calls.push({ binary, args, directory, env: options?.env });
    write(directory);
    return {
      pid: 42,
      stdout: {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(events);
        },
      },
      stderr: () => "",
      ended: Promise.resolve({ code: 0, error: null }),
      kill: () => {
        kills++;
      },
    };
  };
  return { run, calls, kills: () => kills };
}

it("advertises one built-in capability and passes prompt/aspect as data to an isolated child", async () => {
  const fake = generatedRun();
  const port = codexImage({ run: fake.run, binary: "/configured/codex", env: fake.env });
  expect(await port.models()).toEqual([
    { id: "codex-imagegen", name: "Codex built-in image generation" },
  ]);
  expect(await port.generate(request())).toEqual({ bytes: png, mime: "image/png" });
  const call = fake.calls[0];
  expect(call?.binary).toBe("/configured/codex");
  expect(call?.directory).not.toBe(process.cwd());
  expect(call?.args).toEqual(codexImageArgs(request(), call?.directory ?? ""));
  expect(call?.args.at(-1)).toContain("A moonlit castle");
  expect(call?.args.at(-1)).toContain("16:9");
  expect(call?.args.at(-1)).not.toContain("result.png");
  expect(call?.args).toContain("shell_tool");
  expect(call?.env?.CODEX_HOME).toBe(fake.home);
  expect(call?.env?.OPENAI_API_KEY).toBeUndefined();
  expect(call?.env?.PWD).toBe(call?.directory);
  expect(existsSync(call?.directory ?? "")).toBe(false);
  expect(existsSync(fake.path)).toBe(true);
  expect(fake.kills()).toBe(1);
});

it("accepts JPEG bytes and uses a fresh private directory for concurrent images", async () => {
  const fake = generatedRun((path) => writeFileSync(path, jpeg));
  const second = generatedRun();
  const [one, two] = await Promise.all([
    codexImage({ run: fake.run, env: fake.env }).generate(request()),
    codexImage({ run: second.run, env: second.env }).generate(request()),
  ]);
  expect(one.mime).toBe("image/jpeg");
  expect(two.mime).toBe("image/png");
  expect(fake.calls[0]?.directory).not.toBe(second.calls[0]?.directory);
  expect(fake.calls.every((call) => !existsSync(call.directory))).toBe(true);
});

it.each([
  "missing",
  "symlink",
  "hardlink",
  "html",
  "oversized",
  "empty",
  "stale",
  "ambiguous",
  "directory",
] as const)("rejects %s output without leaking a project asset", async (kind) => {
  const fake = generatedRun((path, dir) => {
    if (kind === "missing") return;
    if (kind === "symlink") {
      symlinkSync(join(dir, "missing.png"), path);
      return;
    }
    if (kind === "directory") {
      mkdirSync(path);
      return;
    }
    writeFileSync(
      path,
      kind === "html"
        ? Buffer.from("<html>no image</html>")
        : kind === "oversized"
          ? Buffer.alloc(32 * 1024 * 1024 + 1)
          : kind === "empty"
            ? Buffer.alloc(0)
            : png,
    );
    if (kind === "hardlink") linkSync(path, join(dir, "..", "linked.png"));
    if (kind === "stale") utimesSync(path, new Date(0), new Date(0));
    if (kind === "ambiguous") writeFileSync(join(dir, "second.png"), png);
  });
  const error: unknown = await codexImage({ run: fake.run, env: fake.env })
    .generate(request())
    .catch((e: unknown) => e);
  expect(isProviderError(error)).toBe(true);
  expect(isProviderError(error) && error.fault.kind).toBe("unavailable");
  expect(fake.calls[0] && existsSync(fake.calls[0].directory)).toBe(false);
});

it("rejects an unrelated model before starting Codex", async () => {
  const fake = fakeRun(() => {});
  const error: unknown = await codexImage({ run: fake.run })
    .generate({
      ...request(),
      model: "api-model",
    })
    .catch((e: unknown) => e);
  expect(isProviderError(error) && error.fault.kind).toBe("unsupported");
  expect(fake.calls).toEqual([]);
});

it.each(["../other", "", "not-a-thread"])("rejects unsafe session identifier %s", async (id) => {
  const fake = generatedRun(undefined, id);
  await expect(
    codexImage({ run: fake.run, env: fake.env }).generate(request()),
  ).rejects.toMatchObject({ fault: { kind: "unavailable" } });
});

it("does not collect another session or an agent-named file", async () => {
  const fake = generatedRun(() => {});
  const other = join(fake.home, "generated_images", randomUUID());
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, "exec-other.png"), png);
  await expect(
    codexImage({ run: fake.run, env: fake.env }).generate(request()),
  ).rejects.toMatchObject({ fault: { kind: "unavailable" } });
});

it("rejects a linked session directory", async () => {
  const fake = generatedRun((path, dir) => {
    const target = join(dir, "..", "elsewhere");
    mkdirSync(target);
    rmSync(dir, { recursive: true });
    symlinkSync(target, dir, "junction");
    writeFileSync(path, png);
  });
  await expect(
    codexImage({ run: fake.run, env: fake.env }).generate(request()),
  ).rejects.toMatchObject({ fault: { kind: "unavailable" } });
});

it("requires a completed turn and cleans up refused or failed calls", async () => {
  const fake = fakeRun(() => {}, '{"type":"turn.failed","error":{"message":"refused"}}\n');
  const error: unknown = await codexImage({ run: fake.run })
    .generate(request())
    .catch((e: unknown) => e);
  expect(isProviderError(error) && error.fault.kind).toBe("refusal");
  expect(fake.calls[0] && existsSync(fake.calls[0].directory)).toBe(false);
});

it("does not scan an unrelated filename even if Codex wrote it", async () => {
  const fake = fakeRun((dir) => writeFileSync(join(dir, "other.png"), png));
  const error: unknown = await codexImage({ run: fake.run })
    .generate(request())
    .catch((e: unknown) => e);
  expect(isProviderError(error)).toBe(true);
  expect(fake.calls[0] && existsSync(fake.calls[0].directory)).toBe(false);
});

it("rejects duplicate session events rather than selecting an unrelated output", async () => {
  const id = randomUUID();
  const event = JSON.stringify({ type: "thread.started", thread_id: id });
  const fake = fakeRun(() => {}, `${event}\n${event}\n{"type":"turn.completed"}\n`);
  await expect(codexImage({ run: fake.run }).generate(request())).rejects.toMatchObject({
    fault: { kind: "unavailable" },
  });
});
