import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import type { CliRun, RunCli } from "../llm/run-cli.js";
import { codexImage, codexImageArgs } from "./codex.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
  "base64",
);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
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
  const fake = fakeRun((dir) => writeFileSync(join(dir, "result.png"), png));
  const port = codexImage({ run: fake.run, binary: "/configured/codex" });
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
  expect(call?.args.at(-1)).toContain("result.png");
  expect(call?.env?.OPENAI_API_KEY).toBeUndefined();
  expect(call?.env?.PWD).toBe(call?.directory);
  expect(existsSync(call?.directory ?? "")).toBe(false);
  expect(fake.kills()).toBe(1);
});

it("accepts JPEG bytes and uses a fresh private directory for concurrent images", async () => {
  const fake = fakeRun((dir) => writeFileSync(join(dir, "result.png"), jpeg));
  const port = codexImage({ run: fake.run });
  const [one, two] = await Promise.all([port.generate(request()), port.generate(request())]);
  expect(one.mime).toBe("image/jpeg");
  expect(two.mime).toBe("image/jpeg");
  expect(fake.calls[0]?.directory).not.toBe(fake.calls[1]?.directory);
  expect(fake.calls.every((call) => !existsSync(call.directory))).toBe(true);
});

it.each(["missing", "symlink", "html", "oversized"] as const)(
  "rejects %s output without leaking a project asset",
  async (kind) => {
    const fake = fakeRun((dir) => {
      if (kind === "symlink") symlinkSync(join(dir, "elsewhere.png"), join(dir, "result.png"));
      if (kind === "html") writeFileSync(join(dir, "result.png"), "<html>no image</html>");
      if (kind === "oversized")
        writeFileSync(join(dir, "result.png"), Buffer.alloc(32 * 1024 * 1024 + 1));
    });
    const error: unknown = await codexImage({ run: fake.run })
      .generate(request())
      .catch((e: unknown) => e);
    expect(isProviderError(error)).toBe(true);
    expect(fake.calls[0] && existsSync(fake.calls[0].directory)).toBe(false);
  },
);

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
